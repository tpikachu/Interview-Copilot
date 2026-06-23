import { IPC } from '@shared/ipc';
import { handle, NoInput } from './helpers';
import { checkForUpdates, getUpdateStatus, installUpdateNow } from '../services/update/updater';

export function registerUpdateIpc(): void {
  handle(IPC.update.getStatus, NoInput, () => getUpdateStatus());

  handle(IPC.update.check, NoInput, () => {
    checkForUpdates();
    return { ok: true as const };
  });

  // Quit + install a downloaded update (the renderer's "Restart to update" button).
  handle(IPC.update.install, NoInput, () => {
    installUpdateNow();
    return { ok: true as const };
  });
}
