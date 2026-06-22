import { globalShortcut } from 'electron';
import { createOverlayWindow, getOverlayWindow } from './windows/overlayWindow';
import { togglePrivacy } from './services/session/privacy';
import { sessionManager } from './services/session/sessionManager';
import { openSelector } from './windows/selectionWindow';
import { quickSolveFromClipboard } from './services/capture/codingMode';
import { log } from './services/security/logger';

type ShortcutAction =
  | 'overlay:toggle'
  | 'session:toggle-pause'
  | 'capture:quick'
  | 'capture:region'
  | 'privacy:toggle'
  | 'overlay:toggle-clickthrough';

const BINDINGS: Record<string, ShortcutAction> = {
  'CommandOrControl+Shift+Space': 'overlay:toggle',
  'CommandOrControl+Shift+P': 'session:toggle-pause',
  'CommandOrControl+Shift+Enter': 'capture:quick', // read problem from screen + answer
  'CommandOrControl+Shift+S': 'capture:region', // precise region select (fallback)
  'CommandOrControl+Shift+H': 'privacy:toggle',
  'CommandOrControl+Shift+\\': 'overlay:toggle-clickthrough',
};

let clickthrough = false;

function handle(action: ShortcutAction): void {
  switch (action) {
    case 'overlay:toggle': {
      const w = createOverlayWindow();
      w.isVisible() ? w.hide() : w.show();
      break;
    }
    case 'overlay:toggle-clickthrough': {
      clickthrough = !clickthrough;
      getOverlayWindow()?.setIgnoreMouseEvents(clickthrough, { forward: true });
      break;
    }
    case 'privacy:toggle':
      togglePrivacy();
      break;
    case 'session:toggle-pause':
      sessionManager.togglePauseActive();
      break;
    case 'capture:quick':
      void quickSolveFromClipboard();
      break;
    case 'capture:region':
      void openSelector();
      break;
  }
}

export function registerGlobalShortcuts(): void {
  for (const [accel, action] of Object.entries(BINDINGS)) {
    const okReg = globalShortcut.register(accel, () => handle(action));
    if (!okReg) log.warn(`shortcut: failed to register ${accel}`);
  }
}

export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll();
}
