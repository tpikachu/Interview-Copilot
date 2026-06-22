import { describe, expect, it } from 'vitest';
import { floatTo16BitPCM, rms } from './pcm';

describe('floatTo16BitPCM', () => {
  it('maps full-scale samples to int16 extremes', () => {
    const pcm = floatTo16BitPCM(Float32Array.from([0, 1, -1]));
    expect(pcm[0]).toBe(0);
    expect(pcm[1]).toBe(32767);
    expect(pcm[2]).toBe(-32768);
  });

  it('clamps out-of-range samples', () => {
    const pcm = floatTo16BitPCM(Float32Array.from([2, -2]));
    expect(pcm[0]).toBe(32767);
    expect(pcm[1]).toBe(-32768);
  });

  it('produces a buffer of the right byte length (16-bit mono)', () => {
    const pcm = floatTo16BitPCM(new Float32Array(480));
    expect(pcm.buffer.byteLength).toBe(480 * 2);
  });
});

describe('rms', () => {
  it('is 0 for silence and empty', () => {
    expect(rms(new Float32Array(256))).toBe(0);
    expect(rms(new Float32Array(0))).toBe(0);
  });

  it('rises with signal level', () => {
    const quiet = rms(Float32Array.from([0.01, -0.01, 0.01]));
    const loud = rms(Float32Array.from([0.5, -0.5, 0.5]));
    expect(loud).toBeGreaterThan(quiet);
  });
});
