import { z } from 'zod';
import { IPC } from '@shared/ipc';
import { handle, NoInput } from './helpers';
import { captureScreen } from '../services/capture/screenshot';
import {
  quickSolveFromClipboard,
  runCodingSolve,
  runCodingSolveFromImage,
} from '../services/capture/codingMode';
import { closeSelector, getPendingFrame, openSelector } from '../windows/selectionWindow';

export function registerCaptureIpc(): void {
  // Returns a full-screen image (used for ad-hoc capture / debugging).
  handle(IPC.capture.region, NoInput, async () => {
    const { dataUrl } = await captureScreen();
    return { image: dataUrl };
  });

  // Open the full-screen region selector overlay.
  handle(IPC.capture.openSelector, NoInput, async () => {
    await openSelector();
    return { opened: true as const };
  });

  // The selection renderer fetches the frozen screenshot to draw + crop against.
  handle(IPC.capture.getFrame, NoInput, () => ({ image: getPendingFrame() }));

  handle(IPC.capture.closeSelector, NoInput, () => {
    closeSelector();
    return { closed: true as const };
  });

  // Stream a coding solution from plain text.
  handle(IPC.capture.solve, z.object({ text: z.string().min(1) }), async ({ text }) => {
    void runCodingSolve(text);
    return { started: true as const };
  });

  // Stream a coding solution from a region/screenshot image (OpenAI vision).
  handle(IPC.capture.solveImage, z.object({ image: z.string().min(1) }), async ({ image }) => {
    void runCodingSolveFromImage(image);
    return { started: true as const };
  });

  // Quick: answer from the clipboard text (hotkey/button).
  handle(IPC.capture.quickSolve, NoInput, async () => {
    void quickSolveFromClipboard();
    return { started: true as const };
  });
}
