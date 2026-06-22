// Best-effort "research" of a company website: fetch the homepage plus a few
// common informational sub-pages, merge their readable text, and hand it to the
// parser. Like JD fetching this is intentionally best-effort — sites that block
// bots or render client-side simply yield less (or no) text.
import { fetchUrlText } from './fetchUrl';

const MAX_RESEARCH_CHARS = 40_000; // bounds the parse + embed cost
// Pages most likely to describe the company in interview-relevant terms.
const CANDIDATE_PATHS = ['', '/about', '/about-us', '/company', '/careers'];

export interface CompanySite {
  siteName: string | null;
  pagesFetched: string[];
  text: string;
}

/** Fetch a company site's readable text across a few common pages. Throws only
 *  if the base URL is unusable or every page failed to load. */
export async function fetchCompanySite(rawUrl: string): Promise<CompanySite> {
  let origin: string;
  let base: URL;
  try {
    base = new URL(rawUrl.trim());
    origin = base.origin;
  } catch {
    throw new Error('That doesn’t look like a valid company URL.');
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new Error('Only http(s) company links are supported.');
  }

  // Always include the exact URL the user gave; add common sub-pages on its origin.
  const urls = Array.from(
    new Set([base.href, ...CANDIDATE_PATHS.map((p) => `${origin}${p}`)]),
  );

  const sections: string[] = [];
  const pagesFetched: string[] = [];
  let siteName: string | null = null;

  for (const url of urls) {
    try {
      const { text, title } = await fetchUrlText(url);
      if (!text) continue;
      if (!siteName && title) siteName = title;
      pagesFetched.push(url);
      sections.push(`# ${title ?? url}\n${text}`);
      if (sections.join('\n\n').length >= MAX_RESEARCH_CHARS) break;
    } catch {
      // Ignore individual page failures; a 404 on /about is expected for many sites.
    }
  }

  if (pagesFetched.length === 0) {
    throw new Error('Could not read the company website — it may block automated access.');
  }

  return {
    siteName,
    pagesFetched,
    text: sections.join('\n\n').slice(0, MAX_RESEARCH_CHARS),
  };
}
