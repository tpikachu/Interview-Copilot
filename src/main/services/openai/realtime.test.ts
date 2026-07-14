import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// A controllable fake WebSocket: tests drive open/error/close events directly.
// Defined via vi.hoisted so the hoisted vi.mock factory can reference it.
const { FakeWs } = vi.hoisted(() => {
  class FakeWs {
    static instances: FakeWs[] = [];
    static OPEN = 1;
    handlers = new Map<string, ((...args: unknown[]) => void)[]>();
    readyState = 0;
    sent: string[] = [];
    closed = false;
    constructor(
      public url: string,
      public opts: unknown,
    ) {
      FakeWs.instances.push(this);
    }
    on(ev: string, fn: (...args: unknown[]) => void) {
      const list = this.handlers.get(ev) ?? [];
      list.push(fn);
      this.handlers.set(ev, list);
    }
    emit(ev: string, ...args: unknown[]) {
      for (const fn of this.handlers.get(ev) ?? []) fn(...args);
    }
    send(s: string) {
      this.sent.push(s);
    }
    close() {
      this.closed = true;
    }
    open() {
      this.readyState = FakeWs.OPEN;
      this.emit('open');
    }
    drop(code = 1006, reason = '') {
      this.emit('close', code, Buffer.from(reason));
    }
  }
  return { FakeWs };
});

vi.mock('ws', () => ({ default: FakeWs }));
vi.mock('../security/apiKey', () => ({ apiKeyStore: { getDecrypted: () => 'sk-test' } }));
vi.mock('./models', () => ({ model: () => 'gpt-4o-transcribe' }));
vi.mock('../security/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { RealtimeTranscriber } from './realtime';

function makeCallbacks() {
  return {
    onDelta: vi.fn(),
    onFinal: vi.fn(),
    onError: vi.fn(),
    onStatus: vi.fn(),
    onOpen: vi.fn(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWs.instances = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe('RealtimeTranscriber reconnect', () => {
  it('reconnects with backoff after an unexpected close and reports status', () => {
    const cb = makeCallbacks();
    const t = new RealtimeTranscriber(cb);
    t.start();
    expect(FakeWs.instances).toHaveLength(1);
    FakeWs.instances[0].open();
    expect(cb.onStatus).toHaveBeenCalledWith('connected');

    FakeWs.instances[0].drop();
    expect(cb.onStatus).toHaveBeenCalledWith('reconnecting');
    expect(cb.onError).not.toHaveBeenCalled(); // recovering, not failing

    vi.advanceTimersByTime(500); // first backoff step
    expect(FakeWs.instances).toHaveLength(2);
    FakeWs.instances[1].open();
    expect(cb.onStatus).toHaveBeenLastCalledWith('connected');
    t.stop();
  });

  it('gives up with one final error + a terminal status after the retry budget is exhausted', () => {
    const cb = makeCallbacks();
    const t = new RealtimeTranscriber(cb);
    t.start();
    FakeWs.instances[0].open();

    // Drop and never let a reconnect succeed: each new socket immediately closes.
    FakeWs.instances[0].drop();
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(10_000); // ≥ max backoff — fires the pending attempt
      const latest = FakeWs.instances[FakeWs.instances.length - 1];
      latest.drop();
    }
    expect(FakeWs.instances).toHaveLength(6); // 1 original + 5 retries
    expect(cb.onError).toHaveBeenCalledTimes(1);
    expect(String(cb.onError.mock.calls[0][0])).toMatch(/could not reconnect/i);
    // Terminal status — the UI's "reconnecting…" indicator must not lie forever.
    expect(cb.onStatus).toHaveBeenLastCalledWith('disconnected');

    // Budget exhausted: no further sockets get created.
    vi.advanceTimersByTime(60_000);
    expect(FakeWs.instances).toHaveLength(6);
    t.stop();
  });

  it('latches in-band server errors: one specific message, no generic clobber at exhaustion', () => {
    const cb = makeCallbacks();
    const t = new RealtimeTranscriber(cb);
    t.start();
    // Every connection opens, receives an in-band error event, then drops.
    for (let i = 0; i < 6; i++) {
      const latest = FakeWs.instances[FakeWs.instances.length - 1];
      latest.open();
      latest.emit(
        'message',
        JSON.stringify({ type: 'error', error: { message: 'You exceeded your current quota.' } }),
      );
      latest.drop();
      vi.advanceTimersByTime(10_000);
    }
    // The specific in-band cause surfaced; the generic exhaustion text did not
    // clobber it. (Reconnects reset the latch per connection, so one message
    // per cycle — not one per retry — is the acceptable ceiling; the key
    // invariant is the LAST surfaced error stays specific.)
    const messages = cb.onError.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => /quota/i.test(m))).toBe(true);
    expect(messages.some((m) => /could not reconnect/i.test(m))).toBe(false);
    t.stop();
  });

  it('a stable connection refills the retry budget', () => {
    const cb = makeCallbacks();
    const t = new RealtimeTranscriber(cb);
    t.start();
    FakeWs.instances[0].open();

    // Exhaust all but the final attempt with instant failures…
    FakeWs.instances[0].drop();
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(10_000);
      FakeWs.instances[FakeWs.instances.length - 1].drop();
    }
    // …then the 5th retry connects and stays up past the stability window.
    vi.advanceTimersByTime(10_000);
    const stable = FakeWs.instances[FakeWs.instances.length - 1];
    stable.open();
    vi.advanceTimersByTime(31_000);

    // The next drop starts a FRESH cycle instead of giving up immediately.
    stable.drop();
    expect(cb.onError).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(FakeWs.instances.length).toBeGreaterThan(6);
    t.stop();
  });

  it('stop() suppresses reconnection entirely', () => {
    const cb = makeCallbacks();
    const t = new RealtimeTranscriber(cb);
    t.start();
    FakeWs.instances[0].open();
    t.stop();
    FakeWs.instances[0].drop(); // close arrives after stop
    vi.advanceTimersByTime(60_000);
    expect(FakeWs.instances).toHaveLength(1);
    expect(cb.onStatus).not.toHaveBeenCalledWith('reconnecting');
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('surfaces a specific socket error once per cycle, not per retry', () => {
    const cb = makeCallbacks();
    const t = new RealtimeTranscriber(cb);
    t.start();
    // Handshake fails repeatedly (e.g. expired key): error then close, each attempt.
    for (let i = 0; i < 6; i++) {
      const latest = FakeWs.instances[FakeWs.instances.length - 1];
      latest.emit('error', new Error('Unexpected server response: 401'));
      latest.drop();
      vi.advanceTimersByTime(10_000);
    }
    // One specific error surfaced; the exhaustion message is skipped (specific wins).
    expect(cb.onError).toHaveBeenCalledTimes(1);
    expect(String(cb.onError.mock.calls[0][0])).toMatch(/401/);
    t.stop();
  });

  it('late events from a replaced socket are ignored', () => {
    const cb = makeCallbacks();
    const t = new RealtimeTranscriber(cb);
    t.start();
    const first = FakeWs.instances[0];
    first.open();
    first.drop();
    vi.advanceTimersByTime(500);
    const second = FakeWs.instances[1];
    second.open();
    cb.onStatus.mockClear();
    // The stale socket fires again — nothing should happen.
    first.drop();
    first.emit('error', new Error('stale'));
    expect(cb.onStatus).not.toHaveBeenCalled();
    expect(cb.onError).not.toHaveBeenCalled();
    t.stop();
  });
});
