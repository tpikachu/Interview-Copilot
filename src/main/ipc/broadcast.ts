import { getMainWindow } from '../windows/mainWindow';
import { getOverlayWindow } from '../windows/overlayWindow';
import type { IpcEventChannel } from '@shared/ipc';

/** Push an event to a set of renderer windows. Safe if a window is absent. */
export function broadcast(
  channel: IpcEventChannel,
  payload: unknown,
  targets: ('main' | 'overlay')[] = ['main', 'overlay'],
): void {
  if (targets.includes('main')) getMainWindow()?.webContents.send(channel, payload);
  if (targets.includes('overlay')) getOverlayWindow()?.webContents.send(channel, payload);
}
