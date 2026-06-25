import { openai } from './client';
import { model, reasoningParam } from './models';
import { CODING_RULES } from './codingPrompt';
import type { AnswerEvent } from './answer';

const SYSTEM = `You solve a coding/technical problem given as plain text.\n${CODING_RULES}`;

/** Stream a coding-mode answer from clipboard/OCR'd problem text. Uses the dedicated
 *  'coding' model (a reasoning model by default) — the same solver as the screenshot
 *  path, so both stay consistently smart. */
export async function* solveFromOcr(
  text: string,
  signal?: AbortSignal,
): AsyncGenerator<AnswerEvent> {
  const stream = await openai().responses.stream(
    {
      model: model('coding'),
      ...reasoningParam('coding'),
      input: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: text.slice(0, 12_000) },
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
