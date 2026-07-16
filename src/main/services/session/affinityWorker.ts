import { Worker } from 'worker_threads';
import { koffiModulePath, WDA_EXCLUDEFROMCAPTURE } from './displayAffinity';
import { log } from '../security/logger';

/** Max windows watched at once (dashboard, overlay, selector, anchor + spare).
 *  Sized generously; the app has ~4 top-level windows. */
const MAX_HWNDS = 16;

// SharedArrayBuffer control-block layout. The worker runs a blocking native
// loop (see below) and so cannot service postMessage, so ALL control state is
// shared memory it polls each iteration:
//   Int32 [0] = privacyOn (0/1)
//   Int32 [1] = hwnd count  (written LAST as the publish barrier)
//   BigInt64 [i] at byte 8+ = watched HWNDs
const CTRL_BYTES = 8;
const SAB_BYTES = CTRL_BYTES + MAX_HWNDS * 8;

/**
 * The worker body, embedded as a string so it bundles into the main chunk
 * (electron-vite/rollup won't pick up a referenced worker asset) — no separate
 * file to package. It requires koffi from the absolute path the main process
 * resolves and hands over via workerData.
 *
 * Why a worker + a native Sleep loop instead of setInterval: an external
 * screen-share / remote-desktop tool (e.g. DeskIn, measured stripping every
 * ~5.4s) clears `WDA_EXCLUDEFROMCAPTURE` on our windows behind our back. We can
 * only detect-and-restore, and the exposure between a strip and our heal is what
 * the user sees as a flash — so it must be as short as possible. Node's
 * setInterval on Windows is floored at ~15.6ms (the default timer granularity);
 * `timeBeginPeriod(1)` + `Sleep(1)` in a tight native loop instead heals within
 * ~2ms (measured), at ~0.5% of one core — well under one frame of any capture.
 * It runs OFF the UI thread so main-loop work during a live interview can never
 * delay it, and restores with the raw `SetWindowDisplayAffinity` (one DWM flag
 * flip), never Electron's heavier `setContentProtection` (which can itself
 * flash in a capture).
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('worker_threads');
const koffi = require(workerData.koffiPath);
const HWND_TYPE = workerData.hwndType;
const u32 = HWND_TYPE === 'uint32';
const user32 = koffi.load('user32.dll');
const GetWDA = user32.func('__stdcall', 'GetWindowDisplayAffinity', 'bool', [HWND_TYPE, 'void *']);
const SetWDA = user32.func('__stdcall', 'SetWindowDisplayAffinity', 'bool', [HWND_TYPE, 'uint32']);
const Sleep = koffi.load('kernel32.dll').func('__stdcall', 'Sleep', 'void', ['uint32']);
const winmm = koffi.load('winmm.dll');
const timeBeginPeriod = winmm.func('__stdcall', 'timeBeginPeriod', 'uint32', ['uint32']);
const TARGET = ${WDA_EXCLUDEFROMCAPTURE};
const ctrl = new Int32Array(workerData.sab, 0, 2);
const hwnds = new BigInt64Array(workerData.sab, ${CTRL_BYTES}, ${MAX_HWNDS});
const buf = Buffer.alloc(4);
const arg = (h) => (u32 ? Number(h) : h);
timeBeginPeriod(1); // raise this process's timer resolution so Sleep(1) ~= 1-2ms
let total = 0, lastPost = 0, lastAff = 0;
for (;;) {
  if (Atomics.load(ctrl, 0) === 1) {
    const count = Atomics.load(ctrl, 1);
    for (let i = 0; i < count; i++) {
      const h = hwnds[i];
      if (h === 0n) continue;
      if (!GetWDA(arg(h), buf)) continue;
      const aff = buf.readUInt32LE(0);
      if (aff !== TARGET) {
        SetWDA(arg(h), TARGET); // heal with the minimal raw call
        total++; lastAff = aff;
        const now = Date.now();
        if (now - lastPost > 1000) { lastPost = now; parentPort.postMessage({ total, prevAff: aff, t: now }); }
      }
    }
  }
  Sleep(1);
}
`;

export interface ObserverStats {
  breaches: number;
  lastBreachAt: number;
}

/**
 * Manages the off-thread detect-and-heal worker. Register each protected window
 * (`watch`), tell it when Privacy Mode toggles (`setPrivacy`), and it re-applies
 * `WDA_EXCLUDEFROMCAPTURE` — within ~2ms — to any window an external capturer
 * has wiped. All control state lives in a SharedArrayBuffer the worker polls, so
 * registration and the on/off toggle take effect without interrupting its loop.
 * Degrades to a no-op when koffi/worker is unavailable (privacy → set-once).
 */
export class AffinityObserver {
  private worker: Worker | null = null;
  private readonly sab = new SharedArrayBuffer(SAB_BYTES);
  private readonly ctrl = new Int32Array(this.sab, 0, 2);
  private readonly hwndView = new BigInt64Array(this.sab, CTRL_BYTES, MAX_HWNDS);
  private readonly watched: bigint[] = [];
  private readonly stats: ObserverStats = { breaches: 0, lastBreachAt: 0 };

  /** True once the worker is running (Windows + koffi present). */
  get active(): boolean {
    return this.worker !== null;
  }

  getStats(): ObserverStats {
    return { ...this.stats };
  }

  /** Spawn the worker. `privacyOn` seeds the initial state; already-registered
   *  windows are watched from the first iteration. No-op off win32/without koffi. */
  start(privacyOn: boolean): void {
    this.stop();
    Atomics.store(this.ctrl, 0, privacyOn ? 1 : 0);
    if (process.platform !== 'win32') return;
    const koffiPath = koffiModulePath();
    if (!koffiPath) {
      log.warn(
        '[privacy] protection observer unavailable (koffi not resolvable) — ' +
          'a wiped capture-exclusion cannot be healed on this machine',
      );
      return;
    }
    try {
      this.worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: {
          koffiPath,
          hwndType: process.arch === 'ia32' ? 'uint32' : 'uint64',
          sab: this.sab,
        },
      });
      this.worker.on('message', (m: { total: number; prevAff: number; t: number }) => {
        this.stats.breaches = m.total;
        this.stats.lastBreachAt = m.t;
        // The worker throttles to ~1 msg/sec; the heal already happened.
        log.warn(
          `[privacy] capture protection wiped (affinity 0x${m.prevAff.toString(16)}) — ` +
            `re-protected off-thread within ~2ms; ${m.total} total this session`,
        );
      });
      this.worker.on('error', (e) => {
        log.error('[privacy] protection observer worker error', e);
        this.worker = null;
      });
      this.worker.unref(); // never keep the app alive for this loop
      log.info('[privacy] protection observer active (off-thread, ~2ms heal)');
    } catch (e) {
      log.warn('[privacy] protection observer worker failed to start', e);
      this.worker = null;
    }
  }

  stop(): void {
    if (this.worker) {
      void this.worker.terminate();
      this.worker = null;
    }
  }

  /** Start watching a window's HWND (idempotent). */
  watch(hwnd: bigint): void {
    if (hwnd === 0n || this.watched.includes(hwnd)) return;
    if (this.watched.length >= MAX_HWNDS) {
      log.warn('[privacy] protection observer at capacity — window not watched');
      return;
    }
    this.watched.push(hwnd);
    this.publish();
  }

  /** Stop watching a window's HWND (on close). */
  unwatch(hwnd: bigint): void {
    const i = this.watched.indexOf(hwnd);
    if (i === -1) return;
    this.watched.splice(i, 1);
    this.publish();
  }

  /** Mirror Privacy Mode on/off so the worker stops healing when the user has
   *  deliberately made the windows capturable. */
  setPrivacy(on: boolean): void {
    Atomics.store(this.ctrl, 0, on ? 1 : 0);
  }

  /** Write the HWND list into shared memory, then publish the count last so the
   *  worker never reads a half-written list. */
  private publish(): void {
    for (let i = 0; i < this.watched.length; i++) this.hwndView[i] = this.watched[i];
    Atomics.store(this.ctrl, 1, this.watched.length);
  }
}
