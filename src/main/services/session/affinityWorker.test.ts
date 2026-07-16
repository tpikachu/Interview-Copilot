import { describe, it, expect, beforeEach, vi } from 'vitest';

// The AffinityObserver spawns a worker_threads Worker whose body runs a native
// koffi loop against real HWNDs — untestable in a unit. So we mock the Worker
// and assert the MAIN-thread class: it spawns on start (win32 + koffi), and
// drives the worker entirely through a SharedArrayBuffer control block (privacy
// flag at Int32[0], HWND count at Int32[1], HWNDs in a BigInt64 view). The
// worker body's detect-and-heal loop is covered end-to-end by
// scripts/privacy-affinity/drive.js.
const wt = vi.hoisted(() => ({ instances: [] as FakeWorkerT[] }));
const da = vi.hoisted(() => ({ koffiPath: 'koffi' as string | null }));

interface FakeWorkerT {
  workerData: { sab: SharedArrayBuffer };
  handlers: Record<string, (arg: unknown) => void>;
  terminated: boolean;
  unrefd: boolean;
  emit(ev: string, arg?: unknown): void;
}

vi.mock('worker_threads', () => {
  class FakeWorker {
    workerData: unknown;
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

/** Views into the worker's shared control block: [privacyOn, count] + HWNDs. */
function ctrlOf(w: FakeWorkerT) {
  const ctrl = new Int32Array(w.workerData.sab, 0, 2);
  const hwnds = new BigInt64Array(w.workerData.sab, 8, 16);
  return {
    get privacyOn() {
      return ctrl[0];
    },
    get count() {
      return ctrl[1];
    },
    list() {
      return Array.from({ length: ctrl[1] }, (_, i) => hwnds[i]);
    },
  };
}

beforeEach(() => {
  wt.instances.length = 0;
  da.koffiPath = 'koffi';
});

describe.runIf(process.platform === 'win32')('AffinityObserver', () => {
  it('spawns a worker on start, seeding the already-watched HWNDs + privacy into shared memory', () => {
    const o = new AffinityObserver();
    o.watch(5n);
    o.watch(9n);
    expect(o.active).toBe(false); // nothing spawned before start
    o.start(true);
    expect(wt.instances).toHaveLength(1);
    const c = ctrlOf(wt.instances[0]);
    expect(c.privacyOn).toBe(1);
    expect(new Set(c.list())).toEqual(new Set([5n, 9n]));
    expect(o.active).toBe(true);
  });

  it('publishes watch/unwatch into shared memory (count is the publish barrier)', () => {
    const o = new AffinityObserver();
    o.start(true);
    const c = ctrlOf(wt.instances[0]);
    o.watch(7n);
    expect(c.count).toBe(1);
    expect(c.list()).toEqual([7n]);
    o.watch(8n);
    expect(new Set(c.list())).toEqual(new Set([7n, 8n]));
    o.unwatch(7n);
    expect(c.list()).toEqual([8n]);
  });

  it('mirrors the privacy toggle into shared memory', () => {
    const o = new AffinityObserver();
    o.start(true);
    const c = ctrlOf(wt.instances[0]);
    expect(c.privacyOn).toBe(1);
    o.setPrivacy(false);
    expect(c.privacyOn).toBe(0);
    o.setPrivacy(true);
    expect(c.privacyOn).toBe(1);
  });

  it('ignores a null HWND and de-dupes repeat watches', () => {
    const o = new AffinityObserver();
    o.start(true);
    const c = ctrlOf(wt.instances[0]);
    o.watch(0n); // no valid handle
    o.watch(3n);
    o.watch(3n); // dup
    expect(c.list()).toEqual([3n]);
  });

  it('records breach totals from the worker (worker sends a running total)', () => {
    const o = new AffinityObserver();
    o.start(true);
    const w = wt.instances[0];
    expect(o.getStats().breaches).toBe(0);
    w.emit('message', { total: 4, prevAff: 0x0, t: 1000 });
    w.emit('message', { total: 9, prevAff: 0x0, t: 1200 });
    expect(o.getStats().breaches).toBe(9);
    expect(o.getStats().lastBreachAt).toBe(1200);
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
