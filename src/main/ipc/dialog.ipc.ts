import { z } from 'zod';
import { dialog } from 'electron';
import { IPC } from '@shared/ipc';
import { handle } from './helpers';
import { getMainWindow } from '../windows/mainWindow';

const FILTERS = [
  { name: 'Documents', extensions: ['pdf', 'docx', 'txt', 'md'] },
  { name: 'All files', extensions: ['*'] },
];

export function registerDialogIpc(): void {
  // Returns the selected absolute path (or null if cancelled). The renderer then
  // calls documents:import-file so extraction stays in the main process.
  handle(
    IPC.dialog.openFile,
    z.object({}).optional(),
    async (): Promise<{ filePath: string | null }> => {
      const win = getMainWindow();
      const res = win
        ? await dialog.showOpenDialog(win, { properties: ['openFile'], filters: FILTERS })
        : await dialog.showOpenDialog({ properties: ['openFile'], filters: FILTERS });
      return { filePath: res.canceled ? null : res.filePaths[0] ?? null };
    },
  );
}
