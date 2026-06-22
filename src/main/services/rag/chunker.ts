// Naive but adequate chunker for resume/JD/notes. Splits on blank lines and
// packs paragraphs into ~max-char windows. Replace with a token-aware splitter
// if needed; the interface stays the same.

export interface TextChunk {
  ord: number;
  content: string;
}

export function chunkText(text: string, maxChars = 800): TextChunk[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const chunks: TextChunk[] = [];
  let buffer = '';
  let ord = 0;

  const flush = () => {
    if (buffer.trim()) chunks.push({ ord: ord++, content: buffer.trim() });
    buffer = '';
  };

  for (const p of paragraphs) {
    if ((buffer + ' ' + p).length > maxChars) flush();
    buffer = buffer ? `${buffer} ${p}` : p;
    if (buffer.length >= maxChars) flush();
  }
  flush();
  return chunks;
}
