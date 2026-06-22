import { describe, expect, it } from 'vitest';
import { bufferToVector, cosineSimilarity, vectorToBuffer } from './vectorMath';

describe('cosineSimilarity', () => {
  it('is 1 for identical direction', () => {
    const a = Float32Array.from([1, 2, 3]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 5);
  });

  it('is ~0 for orthogonal vectors', () => {
    expect(cosineSimilarity(Float32Array.from([1, 0]), Float32Array.from([0, 1]))).toBeCloseTo(0, 5);
  });

  it('is ~-1 for opposite vectors', () => {
    expect(cosineSimilarity(Float32Array.from([1, 1]), Float32Array.from([-1, -1]))).toBeCloseTo(
      -1,
      5,
    );
  });

  it('does not throw on zero vectors', () => {
    expect(cosineSimilarity(Float32Array.from([0, 0]), Float32Array.from([0, 0]))).toBe(0);
  });
});

describe('vector BLOB roundtrip', () => {
  it('serializes and restores values exactly', () => {
    const v = Float32Array.from([0.1, -0.25, 3.5, 1536.0, -0.0001]);
    const restored = bufferToVector(vectorToBuffer(v));
    expect(restored.length).toBe(v.length);
    for (let i = 0; i < v.length; i++) expect(restored[i]).toBeCloseTo(v[i], 6);
  });

  it('survives a non-zero byteOffset (sliced buffer)', () => {
    const v = Float32Array.from([1, 2, 3, 4]);
    const buf = vectorToBuffer(v.subarray(1)); // offset into the underlying buffer
    const restored = bufferToVector(buf);
    expect(Array.from(restored)).toEqual([2, 3, 4]);
  });
});
