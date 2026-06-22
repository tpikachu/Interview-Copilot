import { clipboard } from 'electron';
import { EVENTS } from '@shared/ipc';
import { broadcast } from '../../ipc/broadcast';
import { solveFromOcr } from '../openai/coding';
import { solveFromImage } from '../openai/vision';
import type { AnswerEvent } from '../openai/answer';
import { showOverlay } from '../../windows/overlayWindow';

async function streamToOverlay(gen: AsyncGenerator<AnswerEvent>, label: string): Promise<void> {
  const questionId = crypto.randomUUID();
  showOverlay();
  broadcast(EVENTS.questionDetected, { id: questionId, text: label, type: 'coding' }, ['overlay']);
  try {
    for await (const ev of gen) {
      if (ev.type === 'delta') {
        broadcast(EVENTS.answerDelta, { questionId, token: ev.token }, ['overlay']);
      } else if (ev.type === 'meta') {
        broadcast(EVENTS.answerMeta, { questionId, ...ev }, ['overlay']);
      }
    }
  } catch (e) {
    broadcast(EVENTS.sessionError, { message: String(e) }, ['overlay', 'main']);
  } finally {
    broadcast(EVENTS.answerDone, { questionId }, ['overlay']);
  }
}

/** Stream a coding solution from plain text (clipboard). */
export function runCodingSolve(text: string): Promise<void> {
  return streamToOverlay(solveFromOcr(text), 'Coding problem (from clipboard)');
}

/** Stream a coding solution from a screenshot/region image (OpenAI vision). */
export function runCodingSolveFromImage(dataUrl: string): Promise<void> {
  return streamToOverlay(solveFromImage(dataUrl), 'Coding problem (from screenshot)');
}

/**
 * Quick coding help from the clipboard: the user copies the problem text and
 * presses the hotkey; we answer from that text. Reliable, no OCR.
 */
export async function quickSolveFromClipboard(): Promise<void> {
  const text = clipboard.readText().trim();
  if (!text) {
    const questionId = crypto.randomUUID();
    showOverlay();
    broadcast(EVENTS.questionDetected, { id: questionId, text: 'Coding help', type: 'coding' }, [
      'overlay',
    ]);
    broadcast(
      EVENTS.sessionError,
      { message: 'Clipboard is empty. Copy the problem text first, then press the hotkey.' },
      ['overlay'],
    );
    broadcast(EVENTS.answerDone, { questionId }, ['overlay']);
    return;
  }
  await runCodingSolve(text);
}
