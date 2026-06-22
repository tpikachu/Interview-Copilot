import { BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { attachDiagnostics, loadRenderer } from './loadRenderer';
import { applyPrivacyToWindow } from '../services/session/privacy';

let win: BrowserWindow | null = null;

export function createMainWindow(): BrowserWindow {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Hide from screen capture when Privacy Mode is on (default). Re-apply on show:
  // on Windows, display affinity is most reliable once the window is realized.
  applyPrivacyToWindow(win);

  win.on('ready-to-show', () => {
    applyPrivacyToWindow(win!);
    win?.show();
  });
  win.on('show', () => applyPrivacyToWindow(win!));

  // Open external links in the OS browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  attachDiagnostics(win, 'dashboard');
  loadRenderer(win, 'dashboard');

  win.on('closed', () => (win = null));
  return win;
}

export function getMainWindow(): BrowserWindow | null {
  return win;
}
