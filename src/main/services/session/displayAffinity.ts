import type { BrowserWindow } from 'electron';
import { log } from '../security/logger';

/** `SetWindowDisplayAffinity` values (WinUser.h). `WDA_EXCLUDEFROMCAPTURE` is
 *  what `setContentProtection(true)` sets — the window is invisible to screen
 *  capture (Zoom/Meet/Teams, recorders). `WDA_NONE` means capturable. */
export const WDA_NONE = 0x0;
export const WDA_EXCLUDEFROMCAPTURE = 0x11;

const HWND_TYPE = process.arch === 'ia32' ? 'uint32' : 'uint64';
const toHandleArg = (hwnd: bigint): bigint | number =>
  process.arch === 'ia32' ? Number(hwnd) : hwnd;

interface Affinity {
  get(hwnd: bigint): number | null;
  set(hwnd: bigint, value: number): boolean;
}

/**
 * Bind `user32!GetWindowDisplayAffinity` / `SetWindowDisplayAffinity` via koffi
 * (N-API — no rebuild needed for Electron).
 *
 * GetWindowDisplayAffinity is the ground-truth oracle for Privacy Mode: Electron
 * has no getter for content protection, and the OS wipes the affinity behind our
 * back (an external screen share / remote-desktop tool clears it periodically),
 * so the only faithful way to know a window's REAL capture-exclusion state is to
 * ask the OS.
 *
 * SetWindowDisplayAffinity is the minimal way to RESTORE it — a single DWM flag
 * flip, cheaper than Electron's `setContentProtection` (which also drives
 * Chromium window bookkeeping). Reading is side-effect-free; even the raw write
 * is far lighter than the Electron wrapper. That asymmetry is why the protection
 * observer polls the getter and heals with the raw setter only when the OS has
 * actually wiped a window (see privacy.ts / affinityWorker).
 */
function bind(): Affinity | null {
  if (process.platform !== 'win32') return null;
  try {
    // Runtime require: koffi is a native module — keep its load failure
    // survivable (privacy degrades to set-once instead of crashing the app).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const getFn = user32.func('__stdcall', 'GetWindowDisplayAffinity', 'bool', [HWND_TYPE, 'void *']);
    const setFn = user32.func('__stdcall', 'SetWindowDisplayAffinity', 'bool', [HWND_TYPE, 'uint32']);
    const out = Buffer.alloc(4);
    return {
      get(hwnd) {
        if (hwnd === 0n) return null;
        if (!getFn(toHandleArg(hwnd), out)) return null;
        return out.readUInt32LE(0);
      },
      set(hwnd, value) {
        if (hwnd === 0n) return false;
        return setFn(toHandleArg(hwnd), value);
      },
    };
  } catch (e) {
    log.warn('display-affinity binding unavailable (koffi failed to load)', e);
    return null;
  }
}

let api: Affinity | null | undefined;
const affinity = (): Affinity | null => {
  if (api === undefined) api = bind();
  return api;
};

/** The window's HWND as a BigInt (0n if none/destroyed). */
export function hwndOf(win: BrowserWindow): bigint {
  if (win.isDestroyed()) return 0n;
  const h = win.getNativeWindowHandle();
  return h.length === 8 ? h.readBigUInt64LE(0) : BigInt(h.readUInt32LE(0));
}

/** Whether the ground-truth affinity oracle is available on this machine. */
export function affinityReadable(): boolean {
  return affinity() !== null;
}

/** The window's REAL, OS-level display affinity right now (0x11 = excluded from
 *  capture, 0x0 = visible to capture), or null when unreadable (non-Windows,
 *  koffi missing, or the window has no valid HWND). */
export function readWindowAffinity(win: BrowserWindow): number | null {
  const a = affinity();
  if (!a || win.isDestroyed()) return null;
  try {
    return a.get(hwndOf(win));
  } catch {
    return null;
  }
}

/** Restore/set a window's display affinity with the raw Win32 call (no Electron
 *  recomposition). Returns false when unavailable. */
export function setWindowAffinity(win: BrowserWindow, value: number): boolean {
  const a = affinity();
  if (!a || win.isDestroyed()) return false;
  try {
    return a.set(hwndOf(win), value);
  } catch {
    return false;
  }
}

/** Absolute path to koffi's entry, resolved in the main process so a worker
 *  thread (which has no reliable module-resolution root under eval) can
 *  `require()` it directly. Null if koffi can't be resolved. */
export function koffiModulePath(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require.resolve('koffi');
  } catch {
    return null;
  }
}
