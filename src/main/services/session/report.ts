import { openai } from '../openai/client';
import { model } from '../openai/models';
import { sessionsRepo } from '../../db/repositories/sessions.repo';
import type { SessionReport } from '@shared/types';

const PROMPT = `You are an interview coach. Given the transcript and Q/A pairs,
produce JSON: { summary, strengths[], improvements[], perQuestion[{question,assessment}] }.
Be specific and constructive. Return JSON only.`;

/** Generate (and persist) a coaching report for a finished session. */
export async function generateReport(sessionId: string): Promise<SessionReport> {
  const detail = sessionsRepo.detail(sessionId);
  if (!detail) throw new Error('Session not found');

  const transcript = detail.transcript.map((t) => `${t.speaker}: ${t.text}`).join('\n');
  const qa = detail.questions
    .map((q) => `Q: ${q.text}\nA: ${q.answer?.directAnswer ?? '(no answer)'}`)
    .join('\n\n');

  const res = await openai().responses.create({
    model: model('answer'),
    input: [
      { role: 'system', content: PROMPT },
      { role: 'user', content: `TRANSCRIPT:\n${transcript}\n\nQ/A:\n${qa}`.slice(0, 24_000) },
    ],
    text: { format: { type: 'json_object' } },
  });

  const raw = JSON.parse(res.output_text) as Partial<SessionReport>;
  return sessionsRepo.saveReport({
    sessionId,
    summary: raw.summary ?? '',
    strengths: raw.strengths ?? [],
    improvements: raw.improvements ?? [],
    perQuestion: raw.perQuestion ?? [],
  });
}
