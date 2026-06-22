import { app } from 'electron';
import { join } from 'path';

export const isDev = !app.isPackaged;

/** Absolute paths the app uses for local storage. */
export const paths = {
  userData: () => app.getPath('userData'),
  db: () => join(app.getPath('userData'), 'app.db'),
  documents: () => join(app.getPath('userData'), 'documents'),
  vectors: () => join(app.getPath('userData'), 'vectors'),
};

/** Dev-only environment key. In production this is undefined and the stored,
 *  safeStorage-encrypted key is used instead. */
export const envApiKey = (): string | null =>
  process.env.OPENAI_API_KEY?.trim() || null;
