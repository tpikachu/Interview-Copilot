import { Worker } from 'worker_threads';
import { koffiModulePath, WDA_EXCLUDEFROMCAPTURE } from './displayAffinity';
import { log } from '../security/logger';

/**
 * The worker's body, embedded as a string so it bundles into the main chunk
 * (electron-vite/rollup won't pick up a referenced worker asset) with NO
 * separate file to package. It requires koffi from the absolute path the main
 * process resolves and hands over via workerData.
 *
 * Why a worker thread: an external screen-share / remote-desktop tool clears
 * `WDA_EXCLUDEFROMCAPTURE` on our windows periodically. Detect-and-restore must
 * run on a tight interval to keep the exposure gap sub-frame — but on the main
 * thread a busy event loop (streaming an answer during a live interview) would
 * delay it. This loop is pure native reads/writes over a handful of HWNDs, so it
 * sits off the UI thread and heals within one tick regardless of main-thread
 * load. Restoring uses the raw `SetWindowDisplayAffinity` (one DWM flag flip),
 * never Electron's heavier `setContentProtection`.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('worker_threads');
const koffi = require(workerData.koffiPath);
const user32 = koffi.load('user32.dll');
const HWND_TYPE = workerData.hwndType;
const GetWDA = user32.func('__stdcall', 'GetWindowDisplayAffinity', 'bool', [HWND_TYPE, 'void *']);
const SetWDA = user32.func('__stdcall', 'SetWindowDisplayAffinity', 'bool', [HWND_TYPE, 'uint32']);
const TARGET = ${WDA_EXCLUDEFROMCAPTURE};
const buf = Buffer.alloc(4);
const arg = (h) => (HWND_TYPE === 'uint32' ? Number(h) : h);
let privacyOn = workerData.privacyOn;
const hwnds = new Map(); // idString -> BigInt
for (const id of workerData.hwnds) hwnds.set(id, BigInt(id));
parentPort.on('message', (m) => {
  if (m.type === 'watch') hwnds.set(m.hwnd, BigInt(m.hwnd));
  else if (m.type === 'unwatch') hwnds.delete(m.hwnd);
  else if (m.type === 'privacy') privacyOn = m.on;
});
setInterval(() => {
  if (!privacyOn) return;
  for (const [id, h] of hwnds) {
    if (!GetWDA(arg(h), buf)) continue;
    const aff = buf.readUInt32LE(0);
    if (aff !== TARGET) {
      SetWDA(arg(h), TARGET); // heal with the minimal raw call
      parentPort.postMessage({ hwnd: id, prevAff: aff, t: Date.now() });
    }
  }
}, workerData.intervalMs);
`;

export interface ObserverStats {
  breaches: number;
  lastBreachAt: number;
}

/**
 * Manages the off-thread detect-and-heal worker. Register each protected window
 * (`watch`), tell it when Privacy Mode toggles (`setPrivacy`), and it re-applies
 * `WDA_EXCLUDEFROMCAPTURE` to any window an external capturer has wiped, within
 * one poll interval. Falls through to a null object when koffi/worker is
 * unavailable (privacy degrades to set-once).
 */
export class AffinityObserver {
  private worker: Worker | null = null;
  private readonly watched = new Set<string>();
  private privacyOn = true;
  private readonly intervalMs: number;
  private readonly stats: ObserverStats = { breaches: 0, lastBreachAt: 0 };
  private lastLogAt = 0;

  constructor(intervalMs = Number(process.env.BRAINCUE_OBSERVER_MS) || 12) {
    this.intervalMs = intervalMs;
  }

  /** True once the worker is running (Windows + koffi present). */
  get active(): boolean {
    return this.worker !== null;
  }

  getStats(): ObserverStats {
    return { ...this.stats };
  }

  /** Spawn the worker. `privacyOn` seeds the initial state; already-registered
   *  windows are watched from the first tick. No-op off win32 or without koffi. */
  start(privacyOn: boolean): void {
    this.stop();
    this.privacyOn = privacyOn;
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
          hwnds: [...this.watched],
          privacyOn: this.privacyOn,
          intervalMs: this.intervalMs,
        },
      });
      this.worker.on('message', (m: { hwnd: string; prevAff: number; t: number }) => {
        this.stats.breaches++;
        this.stats.lastBreachAt = m.t;
        // Throttle logging: a stripping external tool can fire on every tick, and
        // the heal already happened — one line/sec is enough to prove it's live.
        if (m.t - this.lastLogAt > 1000) {
          this.lastLogAt = m.t;
          log.warn(
            `[privacy] capture protection wiped (affinity 0x${m.prevAff.toString(16)}) — ` +
              `re-protected off-thread; ${this.stats.breaches} total this session`,
          );
        }
      });
      this.worker.on('error', (e) => {
        log.error('[privacy] protection observer worker error', e);
        this.worker = null;
      });
      this.worker.unref(); // never keep the app alive for this loop
      log.info(`[privacy] protection observer active (worker, every ${this.intervalMs}ms)`);
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
    if (hwnd === 0n) return;
    const id = hwnd.toString();
    if (this.watched.has(id)) return;
    this.watched.add(id);
    this.worker?.postMessage({ type: 'watch', hwnd: id });
  }

  /** Stop watching a window's HWND (on close). */
  unwatch(hwnd: bigint): void {
    if (hwnd === 0n) return;
    const id = hwnd.toString();
    if (!this.watched.delete(id)) return;
    this.worker?.postMessage({ type: 'unwatch', hwnd: id });
  }

  /** Mirror Privacy Mode on/off so the worker stops healing when the user has
   *  deliberately made windows capturable. */
  setPrivacy(on: boolean): void {
    this.privacyOn = on;
    this.worker?.postMessage({ type: 'privacy', on });
  }
}
