/** One hard word in the answer's pronunciation guide. */
export interface PronEntry {
  word: string;
  pos: string; // part of speech
  singular: string; // '' when n/a
  say: string; // phonetic respelling
}

const PLACEHOLDER = /^(—|–|-|n\/?a|none)$/i; // "no singular" markers a model might emit
// Trailing partial marker while streaming: '[[', '[[P', '[[PR', '[[PRO' (before '[[PRON').
const PARTIAL_MARKER = /\n*\[\[\s*(?:P(?:R(?:O)?)?)?\s*$/i;

/**
 * Split a streamed answer into its natural body and the optional trailing
 * pronunciation guide. The model emits a `[[PRONUNCIATION]]` line then one
 * pipe-delimited line per hard word: `word | part of speech | singular | respelling`.
 *
 * The parser is deliberately tolerant of model-output variance:
 * - marker match is case/space-insensitive and fires on the `[[PRON` prefix (so a
 *   half-streamed marker never shows in the body — and a bare partial `[[…` prefix is
 *   trimmed too);
 * - the respelling is taken as the LAST field, so a 2- or 3-field line (model dropped
 *   the optional singular) still yields a usable entry;
 * - common "no singular" placeholders (—, –, -, n/a) are normalized to empty.
 */
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Insert each hard word's respelling inline, right after the word's FIRST
 *  occurrence in the body — e.g. "regulations (reg-yuh-LAY-shunz)" — so the cue is
 *  visible in context while the underlying answer text stays clean (copy/persist
 *  keep the un-annotated body). Words not found in the body are skipped. */
export function injectPronunciations(body: string, entries: PronEntry[]): string {
  let out = body;
  for (const e of entries) {
    if (!e.word || !e.say) continue;
    // \b only exists next to a word character — for words ending in symbols
    // (e.g. "C++") a trailing \b would never match, so add boundaries conditionally.
    const start = /^\w/.test(e.word) ? '\\b' : '';
    const end = /\w$/.test(e.word) ? '\\b' : '';
    const re = new RegExp(`${start}${escapeRegExp(e.word)}${end}`, 'i');
    if (re.test(out)) out = out.replace(re, (m) => `${m} (${e.say})`);
  }
  return out;
}

export function splitPronunciation(answer: string): { body: string; entries: PronEntry[] } {
  const at = answer.search(/\[\[\s*PRON/i);
  if (at === -1) {
    // No full marker yet — hide any trailing partial-marker prefix so it never flickers.
    const m = answer.match(PARTIAL_MARKER);
    return { body: m ? answer.slice(0, m.index).trimEnd() : answer, entries: [] };
  }
  const body = answer.slice(0, at).trimEnd();
  const entries = answer
    .slice(at)
    .split('\n')
    .slice(1) // drop the marker line
    .map((l) => l.trim())
    .filter((l) => l.includes('|'))
    .map((l) => {
      const p = l.split('|').map((s) => s.trim());
      const word = p[0] ?? '';
      const say = p[p.length - 1] ?? ''; // respelling is always the LAST field
      const mid = p.slice(1, -1); // 0–2 fields between word and respelling
      const singular = mid[1] ?? '';
      return {
        word,
        pos: mid[0] ?? '',
        singular: PLACEHOLDER.test(singular) ? '' : singular,
        say,
      };
    })
    .filter((e) => e.word && e.say && e.word !== e.say);
  return { body, entries };
}
