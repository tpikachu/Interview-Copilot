import { registerDialogIpc } from './dialog.ipc';
import { registerSettingsIpc } from './settings.ipc';
import { registerProfilesIpc } from './profiles.ipc';
import { registerDocumentsIpc } from './documents.ipc';
import { registerJobsIpc } from './jobs.ipc';
import { registerNotesIpc } from './notes.ipc';
import { registerSessionIpc } from './session.ipc';
import { registerMockIpc } from './mock.ipc';
import { registerCaptureIpc } from './capture.ipc';
import { registerOverlayIpc } from './overlay.ipc';

/** Wire every IPC handler. Called once after the DB is initialized. */
export function registerIpc(): void {
  registerDialogIpc();
  registerSettingsIpc();
  registerProfilesIpc();
  registerDocumentsIpc();
  registerJobsIpc();
  registerNotesIpc();
  registerSessionIpc();
  registerMockIpc();
  registerCaptureIpc();
  registerOverlayIpc();
}
