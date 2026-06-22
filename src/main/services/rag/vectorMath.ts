// Pure vector helpers for RAG (no electron/db imports → unit-testable).

/** Cosine similarity between two equal-length vectors. Returns ~[-1, 1]. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

/** Serialize a vector to a Buffer for SQLite BLOB storage. */
export function vectorToBuffer(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

/** Deserialize a BLOB Buffer back into a Float32Array.
 *  Copies to a fresh buffer so it's always 4-byte aligned and independent. */
export function bufferToVector(buf: Buffer): Float32Array {
  const copy = Buffer.from(buf); // ensures alignment + ownership
  return new Float32Array(copy.buffer, copy.byteOffset, Math.floor(copy.byteLength / 4));
}
