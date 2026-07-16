import { BrowserWindow, dialog } from 'electron';
import { SETTINGS_KEYS, settingsRepo } from '../../db/repositories/settings.repo';
import { broadcast } from '../../ipc/broadcast';
import { EVENTS } from '@shared/ipc';
import { appEvents, APP_EVENT } from '../../appEvents';

/** Whether setContentProtection actually works on this platform. On Linux
 *  (X11/Wayland) it is a silent no-op — the app IS visible in screen shares no
 *  matter what the toggle says, so the UI must say so instead of promising
 *  invisibility it can't deliver. Windows (WDA_EXCLUDEFROMCAPTURE) and macOS
 *  (NSWindowSharingNone) both honor it. */
export const privacySupported = process.platform !== 'linux';

/** Privacy Mode excludes ALL app windows (dashboard, overlay, region selector,
 *  any future modal/window) from OS screen capture, so nothing appears when the
 *  user shares their screen in Zoom/Meet/Teams or records. Defaults to ON: an
 *  unset value is treated as enabled; only an explicit '0' disables it. */
export function getPrivacy(): boolean {
  return settingsRepo.get(SETTINGS_KEYS.privacyMode) !== '0';
}

/** Apply the given protection state to every open window. New windows should
 *  also call `applyPrivacyToWindow` on creation so they inherit current state. */
export function applyContentProtectionToAll(enabled: boolean): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.setContentProtection(enabled);
  }
}

/** Apply the current privacy setting to a single (freshly created) window. */
export function applyPrivacyToWindow(win: BrowserWindow): void {
  if (!win.isDestroyed()) win.setContentProtection(getPrivacy());
}

/**
 * Apply Privacy Mode to a window and keep it excluded from screen capture
 * across the operations that silently drop the exclusion on Windows.
 *
 * What ground-truth capture testing (separate-process WGC/DXGI oracle + real
 * SendInput clicks/drags) plus the reporter's live Meet/Zoom testing established
 * about WDA_EXCLUDEFROMCAPTURE here (Win 11 26200):
 *  - The drop is triggered by window ACTIVATION. A window that ACTIVATES on
 *    interaction (a normal, focusable window) loses the capture exclusion on
 *    the click that activates it — and Windows reports it as still excluded
 *    (GetWindowDisplayAffinity stays 0x11), so the drop can't be detected, only
 *    healed by re-CALLING setContentProtection.
 *  - A NON-ACTIVATING window (`focusable: false` → WS_EX_NOACTIVATE) never
 *    activates, so it NEVER drops the exclusion: verified 0 leak frames through
 *    thousands of real clicks, format-button spam, dropdown toggling, window
 *    drags, and z-order churn — with NO re-assertion at all. This is the basis
 *    of the Cue Card's `static` mode below: protect once, never re-assert.
 *  - CRUCIAL: each `setContentProtection` re-call itself costs a composition
 *    pass that surfaces to a WGC capturer (Zoom/Meet) as a one-frame flicker
 *    (invisible to the desktop-capturer harness, which samples steady state,
 *    but plainly visible to the reporter). So re-asserting is NOT free: a
 *    periodic re-assert (any watchdog) produces steady flicker at its cadence —
 *    the "interval flashing" the reporter saw. Therefore: non-activating
 *    windows get ZERO re-assertion, and activating windows re-assert ONLY on a
 *    real drop-causing event (never on a timer), coalesced so one interaction
 *    is a few re-calls, not dozens.
 *
 * `opts.static` (used for the Cue Card overlay): apply protection at
 * creation/show and NEVER re-assert. Correct only for a non-activating window
 * — it can't drop, and skipping re-assertion means it can't flicker either.
 *
 * Default (used for the focusable dashboard / region selector, which DO
 * activate): on any drop-trigger signal, (re)schedule ONE coalesced cascade of
 * a few re-asserts over ~120ms — the drop lands a frame or two after the event.
 * A burst of messages from one click collapses to a single cascade.
 * `applyPrivacyToWindow` respects the on/off state, so this clears protection
 * too when Privacy Mode is off. Call once per window at creation.
 */
export function keepContentProtected(win: BrowserWindow, opts: { static?: boolean } = {}): void {
  const reassert = (): void => applyPrivacyToWindow(win);
  reassert(); // protect once, now, at creation
  win.on('show', reassert); // (re)establish protection when the window becomes visible

  // Non-activating windows never drop the exclusion, so they need no healing —
  // and healing would re-call setContentProtection on every click, which itself
  // flickers in a live screen share. Protect-once is both sufficient and
  // flicker-free.
  if (opts.static) return;

  // Coalesced cascade for windows that CAN activate (and thus drop): 0 = next
  // tick (collapses a click's message burst into one re-assert), then a couple
  // more to cover the drop that lands a frame or two later.
  const TAPS = [0, 16, 48, 120];
  let taps: ReturnType<typeof setTimeout>[] = [];
  const clearTaps = (): void => {
    for (const t of taps) clearTimeout(t);
    taps = [];
  };
  const reassertSoon = (): void => {
    clearTaps(); // coalesce: a burst of signals schedules ONE cascade, not many
    taps = TAPS.map((ms) => setTimeout(reassert, ms));
  };
  if (process.platform === 'win32') {
    //   WM_MOUSEACTIVATE 0x0021 — click on an inactive window (activation)
    //   WM_ACTIVATE 0x0006 · WM_NCACTIVATE 0x0086 · WM_SETFOCUS 0x0007 — activation
    //   WM_PARENTNOTIFY 0x0210 — button-down inside child HWNDs (click on an
    //     ALREADY-active window, which fires no activation message)
    //   WM_WINDOWPOSCHANGED 0x0047 — move/size/Z-ORDER change (no Electron event)
    //   WM_NCLBUTTONDOWN 0x00A1 · WM_ENTERSIZEMOVE 0x0231 — drag/modal-loop start
    //   WM_EXITSIZEMOVE 0x0232 · WM_CAPTURECHANGED 0x0215 — drag/loop end
    for (const msg of [0x0021, 0x0006, 0x0086, 0x0007, 0x0210, 0x0047, 0x00a1, 0x0231, 0x0232, 0x0215]) {
      // hookWindowMessage is Windows-only; guarded above.
      (win as unknown as { hookWindowMessage: (m: number, cb: () => void) => void }).hookWindowMessage(
        msg,
        reassertSoon,
      );
    }
  }
  win.webContents.on('input-event', (_e, input) => {
    if (input.type === 'mouseDown') reassertSoon();
  });
  win.on('move', reassertSoon);
  win.on('resize', reassertSoon);
  win.on('restore', reassertSoon);
  win.on('focus', reassertSoon);
  win.on('closed', clearTaps);
}

export function setPrivacy(enabled: boolean): boolean {
  settingsRepo.set(SETTINGS_KEYS.privacyMode, enabled ? '1' : '0');
  applyContentProtectionToAll(enabled);
  // Notify all renderer windows so their indicators stay in sync regardless of
  // who triggered the change (global shortcut, overlay button, or Settings).
  broadcast(EVENTS.privacyChanged, { enabled });
  // ...and the tray menu (main-process, not a renderer) so its checkbox matches.
  appEvents.emit(APP_EVENT.privacyChanged, enabled);
  return enabled;
}

export function togglePrivacy(): boolean {
  return setPrivacy(!getPrivacy());
}

let confirming = false;

/** Privacy Mode is ON by default and recommended. Enabling it needs no prompt,
 *  but DISABLING it asks for confirmation first (a single shared gate for the
 *  tray, Settings, and the global shortcut). Returns the effective state — if the
 *  user cancels, privacy stays on. */
export async function requestPrivacy(enabled: boolean): Promise<boolean> {
  if (!enabled && getPrivacy()) {
    if (confirming) return getPrivacy(); // a dialog is already open
    confirming = true;
    const parent =
      BrowserWindow.getFocusedWindow() ??
      BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    const opts = {
      type: 'warning' as const,
      buttons: ['Turn off Privacy Mode', 'Keep it on'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      title: 'Turn off Privacy Mode?',
      message: 'Turn off Privacy Mode?',
      detail:
        'BrainCue will become visible to screen sharing and recording — anyone you share your screen with (Zoom, Meet, Teams) could see it. Leave it on unless you are sure.',
    };
    try {
      const { response } = parent
        ? await dialog.showMessageBox(parent, opts)
        : await dialog.showMessageBox(opts);
      if (response !== 0) return getPrivacy(); // cancelled — unchanged
    } finally {
      confirming = false;
    }
  }
  return setPrivacy(enabled);
}

/** Toggle, routing a disable through the confirmation gate. */
export async function togglePrivacyGuarded(): Promise<boolean> {
  return requestPrivacy(!getPrivacy());
}
