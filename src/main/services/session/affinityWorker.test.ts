import { describe, it, expect, beforeEach, vi } from 'vitest';

// The AffinityObserver spawns a worker_threads Worker whose body runs koffi
// against real HWNDs — untestable in a unit. So we mock the Worker and assert the
// MAIN-thread class: it spawns on start (win32 + koffi), seeds/streams the
// watched HWNDs + privacy state, and counts breach messages. The worker body's
// detect-and-heal loop is covered end-to-end by scripts/privacy-affinity/drive.js.
const wt = vi.hoisted(() => ({ instances: [] as FakeWorkerT[] }));
const da = vi.hoisted(() => ({ koffiPath: 'koffi' as string | null }));

interface FakeWorkerT {
  workerData: { hwnds: string[]; privacyOn: boolean; intervalMs: number };
  posts: unknown[];
  handlers: Record<string, (arg: unknown) => void>;
  terminated: boolean;
  unrefd: boolean;
  emit(ev: string, arg?: unknown): void;
}

vi.mock('worker_threads', () => {
  class FakeWorker {
    workerData: unknown;
    posts: unknown[] = [];
    handlers: Record<string, (arg: unknown) => void> = {};
    terminated = false;
    unrefd = false;
    constructor(_src: string, opts: { workerData: unknown }) {
      this.workerData = opts?.workerData;
      wt.instances.push(this as unknown as FakeWorkerT);
    }
    on(ev: string, fn: (arg: unknown) => void) {
      this.handlers[ev] = fn;
      return this;
    }
    postMessage(m: unknown) {
      this.posts.push(m);
    }
    terminate() {
      this.terminated = true;
      return Promise.resolve(0);
    }
    unref() {
      this.unrefd = true;
    }
    emit(ev: string, arg: unknown) {
      this.handlers[ev]?.(arg);
    }
  }
  return { Worker: FakeWorker };
});
vi.mock('./displayAffinity', () => ({ WDA_EXCLUDEFROMCAPTURE: 0x11, koffiModulePath: () => da.koffiPath }));
vi.mock('../security/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { AffinityObserver } from './affinityWorker';

beforeEach(() => {
  wt.instances.length = 0;
  da.koffiPath = 'koffi';
});

describe.runIf(process.platform === 'win32')('AffinityObserver', () => {
  it('spawns a worker on start, seeding the already-watched HWNDs + privacy + interval', () => {
    const o = new AffinityObserver(20);
    o.watch(5n);
    o.watch(9n);
    expect(o.active).toBe(false); // nothing spawned before start
    o.start(true);
    expect(wt.instances).toHaveLength(1);
    const w = wt.instances[0];
    expect(new Set(w.workerData.hwnds)).toEqual(new Set(['5', '9']));
    expect(w.workerData.privacyOn).toBe(true);
    expect(w.workerData.intervalMs).toBe(20);
    expect(o.active).toBe(true);
  });

  it('streams watch/unwatch/privacy to the running worker', () => {
    const o = new AffinityObserver();
    o.start(true);
    const w = wt.instances[0];
    o.watch(7n);
    o.unwatch(7n);
    o.setPrivacy(false);
    expect(w.posts).toEqual([
      { type: 'watch', hwnd: '7' },
      { type: 'unwatch', hwnd: '7' },
      { type: 'privacy', on: false },
    ]);
  });

  it('ignores a null HWND and de-dupes repeat watches', () => {
    const o = new AffinityObserver();
    o.start(true);
    const w = wt.instances[0];
    o.watch(0n); // no valid handle
    o.watch(3n);
    o.watch(3n); // dup
    expect(w.posts).toEqual([{ type: 'watch', hwnd: '3' }]);
  });

  it('counts breach messages from the worker', () => {
    const o = new AffinityObserver();
    o.start(true);
    const w = wt.instances[0];
    expect(o.getStats().breaches).toBe(0);
    w.emit('message', { hwnd: '5', prevAff: 0x0, t: 1000 });
    w.emit('message', { hwnd: '5', prevAff: 0x0, t: 1001 });
    expect(o.getStats().breaches).toBe(2);
    expect(o.getStats().lastBreachAt).toBe(1001);
  });

  it('terminates the worker on stop', () => {
    const o = new AffinityObserver();
    o.start(true);
    const w = wt.instances[0];
    o.stop();
    expect(w.terminated).toBe(true);
    expect(o.active).toBe(false);
  });

  it('does not spawn a worker when koffi is unavailable (degrades to set-once)', () => {
    da.koffiPath = null;
    const o = new AffinityObserver();
    o.start(true);
    expect(wt.instances).toHaveLength(0);
    expect(o.active).toBe(false);
  });
});
