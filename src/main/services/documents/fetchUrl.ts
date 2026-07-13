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

/** True for hostnames that point at the local machine or a private network —
 *  loopback, RFC-1918/4193 ranges, link-local (incl. cloud metadata). A literal
 *  check only (no DNS resolution), which is enough to stop a redirect from
 *  disguising an internal target behind an innocent-looking public link. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, ''); // [::1] → ::1
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(host) ||
    host === '::1' ||
    /^(fe80:|fc|fd)/.test(host)
  );
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

  // ONE deadline covers headers AND the body read — clearing it as soon as the
  // headers arrive would leave the body download unbounded in time.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  let buf: Buffer;
  try {
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
    }

    if (!res.ok) throw new Error(`The link returned HTTP ${res.status}.`);

    // Redirects are followed, so re-check where we actually LANDED: a typed
    // private/intranet URL is the user's own choice, but a public link must not
    // 3xx into local services whose content would then be embedded into prompts.
    if (res.redirected) {
      let landed: URL | null = null;
      try {
        landed = new URL(res.url);
      } catch {
        /* no final URL to judge — fall through */
      }
      if (landed && (isPrivateHost(landed.hostname) || (landed.protocol !== 'http:' && landed.protocol !== 'https:'))) {
        throw new Error('The link redirected to a local or private address — not supported.');
      }
    }

    // Enforce MAX_BYTES while STREAMING — a huge or endless body must never sit
    // fully in main-process memory (an OOM here takes down the whole app).
    try {
      const chunks: Buffer[] = [];
      let total = 0;
      if (res.body) {
        for await (const chunk of res.body) {
          const c = Buffer.from(chunk);
          chunks.push(c);
          total += c.length;
          if (total >= MAX_BYTES) break; // early exit cancels the rest of the stream
        }
      }
      buf = Buffer.concat(chunks).subarray(0, MAX_BYTES);
    } catch (e) {
      throw new Error(
        (e as Error).name === 'AbortError'
          ? 'The page took too long to load.'
          : `Could not read the page: ${(e as Error).message}`,
      );
    }
  } finally {
    clearTimeout(timer);
  }

  const contentType = res.headers.get('content-type') ?? '';
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
