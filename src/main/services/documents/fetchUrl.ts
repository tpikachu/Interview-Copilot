// Best-effort extraction of readable text from a job-posting URL. Many job
// boards render content client-side or block bots, so this is intentionally a
// "best effort": on failure the user just pastes the JD manually. All fetching
// happens in the main process; only the resulting text is later sent to OpenAI.

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 3_000_000; // 3 MB — guard against huge pages
const MAX_TEXT_CHARS = 50_000; // plenty for a JD; keeps parsing/embeds bounded
// A real browser UA reduces (does not eliminate) bot-blocking on some sites.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    '#39': "'",
  };
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const cp = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return named[code.toLowerCase()] ?? m;
  });
}

/** Strip scripts/styles/markup from an HTML string into plain readable text. */
function htmlToText(html: string): string {
  return decodeEntities(
    html
      // Drop non-content elements wholesale.
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      // Turn block-level boundaries into newlines so structure survives.
      .replace(/<\/(p|div|li|ul|ol|tr|h[1-6]|section|article|header|footer)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      // Drop all remaining tags.
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

/** Fetch a URL and return its readable text. Throws on network/HTTP failure. */
export async function fetchUrlText(rawUrl: string): Promise<{ text: string; title: string | null }> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error('That doesn’t look like a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http(s) links are supported.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
    });
  } catch (e) {
    throw new Error(
      (e as Error).name === 'AbortError'
        ? 'The link took too long to respond.'
        : `Could not reach the link: ${(e as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`The link returned HTTP ${res.status}.`);

  const contentType = res.headers.get('content-type') ?? '';
  const buf = Buffer.from(await res.arrayBuffer()).subarray(0, MAX_BYTES);
  const body = buf.toString('utf8');

  const isHtml = contentType.includes('html') || /<\/?[a-z][\s\S]*>/i.test(body.slice(0, 2000));
  const titleMatch = isHtml ? body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) : null;
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : null;

  const text = (isHtml ? htmlToText(body) : body.trim()).slice(0, MAX_TEXT_CHARS);
  if (!text) {
    throw new Error('No readable text found at that link — paste the description manually.');
  }
  return { text, title };
}
