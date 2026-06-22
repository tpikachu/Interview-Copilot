import type { BrowserWindow } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { log } from '../services/security/logger';

export type RendererView = 'dashboard' | 'overlay' | 'selection';

/** Forward a window's renderer console + load failures to the main log so we can
 *  diagnose blank/broken windows from the terminal. */
export function attachDiagnostics(win: BrowserWindow, name: string): void {
  const wc = win.webContents;
  wc.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) log.warn(`[${name}] ${message} (${source}:${line})`);
  });
  wc.on('did-fail-load', (_e, code, desc, url) =>
    log.error(`[${name}] did-fail-load ${code} ${desc} ${url}`),
  );
  wc.on('preload-error', (_e, path, err) => log.error(`[${name}] preload-error ${path}`, err));
  wc.on('render-process-gone', (_e, details) =>
    log.error(`[${name}] render-process-gone: ${details.reason}`),
  );
}

/**
 * All windows load the SAME index.html and pick what to render via ?view=. This
 * is far more reliable than separate html entry files (which don't always serve
 * from the dev server). In dev we point at the electron-vite dev server and
 * retry until it answers; in production we load the bundled file with a query.
 */
export function loadRenderer(win: BrowserWindow, view: RendererView): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];

  if (is.dev && devUrl) {
    const base = devUrl.replace(/\/$/, '');
    const url = view === 'dashboard' ? `${base}/` : `${base}/?view=${view}`;
    const tryLoad = (attempt = 0): void => {
      if (win.isDestroyed()) return;
      win.loadURL(url).catch((err) => {
        if (attempt < 40) {
          if (attempt === 0) log.warn(`renderer dev server not ready at ${url}, retrying…`);
          setTimeout(() => tryLoad(attempt + 1), 300);
        } else {
          log.error(`gave up loading renderer ${url}`, err);
        }
      });
    };
    tryLoad();
  } else {
    const file = join(__dirname, '../renderer/index.html');
    if (view === 'dashboard') win.loadFile(file);
    else win.loadFile(file, { query: { view } });
  }
}
