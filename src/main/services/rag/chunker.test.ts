import { describe, expect, it } from 'vitest';
import { chunkText } from './chunker';

describe('chunkText', () => {
  it('returns nothing for empty/whitespace input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  it('splits paragraphs and assigns sequential ords', () => {
    const chunks = chunkText('Para one.\n\nPara two.\n\nPara three.', 20);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => expect(c.ord).toBe(i));
  });

  it('keeps chunks within roughly maxChars', () => {
    const long = Array.from({ length: 50 }, (_, i) => `sentence number ${i}`).join('\n\n');
    const chunks = chunkText(long, 100);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(160);
  });

  it('preserves content (no dropped words)', () => {
    const chunks = chunkText('alpha beta\n\ngamma delta', 1000);
    const joined = chunks.map((c) => c.content).join(' ');
    for (const w of ['alpha', 'beta', 'gamma', 'delta']) expect(joined).toContain(w);
  });
});
