import { openai } from './client';
import { model } from './models';
import type { AnswerStyle, InterviewType, Profile, RetrievedChunk } from '@shared/types';

export interface AnswerInput {
  question: string;
  contextChunks: RetrievedChunk[];
  profile: Profile;
  style: AnswerStyle;
  interviewType: InterviewType;
  signal?: AbortSignal;
}

export type AnswerEvent =
  | { type: 'delta'; token: string }
  | {
      type: 'meta';
      talkingPoints: string[];
      resumeMatch: string | null;
      star: { situation: string; task: string; action: string; result: string } | null;
      clarifyingQuestion: string | null;
      riskWarning: string | null;
      followupQuestion: string | null;
    }
  | { type: 'usage'; prompt: number; completion: number };

const SYSTEM = `You are an interview answer assistant.
Rules:
- Ground every answer ONLY in the provided context (resume, job description, notes).
- NEVER invent experience, employers, or metrics the candidate does not have.
- If the context lacks relevant experience, say so via a riskWarning and offer a
  safe transferable-skills framing instead of fabricating.
- Match the requested answer style and interview type.
- Format for fast skimming while speaking: a short opening line, then 2-4 concise
  bullet points for the key things to say. Use **bold** for key terms only. Keep
  it tight — this is read live during an interview.`;

function buildContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '(no relevant profile context found)';
  return chunks.map((c, i) => `[${i + 1}] (${c.sourceType}) ${c.content}`).join('\n\n');
}

/**
 * Streams the direct answer as deltas, then yields a structured meta event.
 * Skeleton: streams the prose answer; meta is requested as a final JSON pass.
 */
export async function* streamAnswer(input: AnswerInput): AsyncGenerator<AnswerEvent> {
  const userPrompt = [
    `Interview type: ${input.interviewType}`,
    `Desired style: ${input.style}`,
    `Candidate role target: ${input.profile.targetRole} @ ${input.profile.targetCompany ?? 'n/a'}`,
    '',
    'CONTEXT:',
    buildContext(input.contextChunks),
    '',
    `QUESTION: ${input.question}`,
    '',
    'Write the direct spoken answer now.',
  ].join('\n');

  const stream = await openai().responses.stream(
    {
      model: model('answer'),
      input: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userPrompt },
      ],
    },
    { signal: input.signal },
  );

  for await (const event of stream) {
    if (event.type === 'response.output_text.delta') {
      yield { type: 'delta', token: event.delta };
    }
  }

  const final = await stream.finalResponse();
  const usage = final.usage;
  if (usage) {
    yield {
      type: 'usage',
      prompt: usage.input_tokens ?? 0,
      completion: usage.output_tokens ?? 0,
    };
  }

  // M2: a second cheap structured pass produces talking points / STAR / warnings.
  // Stubbed here so the contract is in place.
  yield {
    type: 'meta',
    talkingPoints: [],
    resumeMatch: null,
    star: null,
    clarifyingQuestion: null,
    riskWarning: input.contextChunks.length === 0 ? 'No matching profile experience found.' : null,
    followupQuestion: null,
  };
}
