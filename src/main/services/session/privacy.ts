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
 * Apply Privacy Mode to a window AND keep it applied across the operations that
 * silently drop it on Windows. `setContentProtection` maps to
 * SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE); on Windows that affinity is
 * cleared by the window entering the modal move/resize loop — i.e. the user
 * DRAGGING or resizing the window — after which the "hidden" window reappears in
 * screen capture until something re-asserts it. We re-assert on every
 * move/resize (these fire continuously through a drag on Windows) plus
 * restore/focus/show, so protection survives a drag. `applyPrivacyToWindow`
 * respects the current on/off state, so this correctly clears protection too
 * when Privacy Mode is off. Call once per window at creation.
 */
export function keepContentProtected(win: BrowserWindow): void {
  const reassert = (): void => applyPrivacyToWindow(win);
  reassert();
  // The trigger is FOCUS/ACTIVATION — clicking the window drops the capture
  // exclusion on Windows and it reappears in a screen share until re-asserted.
  // The JS 'focus' event fires AFTER Windows has already activated the window,
  // so a live 30fps share (Meet/Zoom) can catch a frame or two before we
  // re-hide — a brief flash. To close that gap we ALSO re-assert inside the
  // native activation messages themselves (Windows-only), which run
  // synchronously the instant the click lands, before the un-excluded frame is
  // presented:
  //   WM_MOUSEACTIVATE (0x0021) — a click on an inactive window (earliest)
  //   WM_ACTIVATE      (0x0006) — activation state change
  //   WM_NCACTIVATE    (0x0086) — non-client activation (title/border)
  //   WM_SETFOCUS      (0x0007) — keyboard focus gained
  if (process.platform === 'win32') {
    for (const msg of [0x0021, 0x0006, 0x0086, 0x0007]) {
      // hookWindowMessage is Windows-only; guarded above.
      (win as unknown as { hookWindowMessage: (m: number, cb: () => void) => void }).hookWindowMessage(
        msg,
        reassert,
      );
    }
  }
  win.on('show', reassert);
  win.on('move', reassert);
  win.on('resize', reassert);
  win.on('restore', reassert);
  win.on('focus', reassert);
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
