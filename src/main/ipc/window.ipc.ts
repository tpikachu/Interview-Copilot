import { IPC, EVENTS } from '@shared/ipc';
import { handle, NoInput } from './helpers';
import { getMainWindow } from '../windows/mainWindow';

/** Window controls for the dashboard's custom (frameless) titlebar. The window
 *  uses titleBarStyle: 'hidden', so min/maximize/close are driven from the
 *  renderer. Closing reuses the window's own `close` handler (hide-to-tray). */
export function registerWindowIpc(): void {
  handle(IPC.window.minimize, NoInput, () => {
    getMainWindow()?.minimize();
    return { ok: true as const };
  });

  handle(IPC.window.maximizeToggle, NoInput, () => {
    const w = getMainWindow();
    if (!w) return { maximized: false };
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
    return { maximized: w.isMaximized() };
  });

  // Close = the OS close button: the window's `close` handler hides it to the
  // tray (a real quit goes through the tray "Exit" / app.quit).
  handle(IPC.window.close, NoInput, () => {
    getMainWindow()?.close();
    return { ok: true as const };
  });

  handle(IPC.window.isMaximized, NoInput, () => ({
    maximized: getMainWindow()?.isMaximized() ?? false,
  }));
}

/** Wire a window's maximize/unmaximize state to a renderer push event so the
 *  titlebar's maximize/restore icon stays correct. Called once per window. */
export function broadcastMaximizeState(win: Electron.BrowserWindow): void {
  const send = (maximized: boolean): void => {
    if (!win.isDestroyed()) win.webContents.send(EVENTS.windowMaximized, { maximized });
  };
  win.on('maximize', () => send(true));
  win.on('unmaximize', () => send(false));
}
