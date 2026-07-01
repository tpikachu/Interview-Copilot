import { openai } from './client';
import { model, reasoningParam } from './models';
import { codingRules } from './codingPrompt';
import type { AnswerEvent } from './answer';

/** Stream a coding-mode answer from clipboard/OCR'd problem text. Uses the dedicated
 *  'coding' model (a reasoning model by default) — the same solver as the screenshot
 *  path, so both stay consistently smart. Solution written in `language`. */
export async function* solveFromOcr(
  text: string,
  language: string,
  signal?: AbortSignal,
): AsyncGenerator<AnswerEvent> {
  const system = `You solve a coding/technical problem given as plain text.\n${codingRules(language)}`;
  const stream = await openai().responses.stream(
    {
      model: model('coding'),
      ...reasoningParam('coding'),
      input: [
        { role: 'system', content: system },
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
