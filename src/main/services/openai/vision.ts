import { openai } from './client';
import { model, reasoningParam } from './models';
import { CODING_RULES } from './codingPrompt';
import type { AnswerEvent } from './answer';

const SYSTEM = `You are shown a screenshot containing a coding/technical interview problem (and possibly code). Read it carefully, transcribe the problem accurately, then solve it.\n${CODING_RULES}`;

/**
 * Solve a problem directly from an image using the 'coding' model (multimodal,
 * a reasoning model by default). Replaces local Tesseract OCR for the region
 * selector — runs over the network so it never blocks the main process, reads
 * code/diagrams far more reliably, and shares the same solver as the text path.
 */
export async function* solveFromImage(
  dataUrl: string,
  signal?: AbortSignal,
): AsyncGenerator<AnswerEvent> {
  const stream = await openai().responses.stream(
    {
      model: model('coding'),
      ...reasoningParam('coding'),
      input: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Solve the problem shown in this screenshot.' },
            { type: 'input_image', image_url: dataUrl, detail: 'auto' },
          ],
        },
      ],
    },
    { signal },
  );

  for await (const event of stream) {
    if (event.type === 'response.output_text.delta') {
      yield { type: 'delta', token: event.delta };
    }
  }
  yield {
    type: 'meta',
    talkingPoints: [],
    resumeMatch: null,
    star: null,
    clarifyingQuestion: null,
    riskWarning: null,
    followupQuestion: null,
  };
}
