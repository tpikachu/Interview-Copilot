import { openai } from './client';
import { model } from './models';
import type { QuestionType } from '@shared/types';

export interface ClassifiedQuestion {
  isQuestion: boolean;
  text: string;
  type: QuestionType;
  confidence: number;
  strategy: string;
}

const PROMPT = `Classify the interviewer utterance. Return JSON:
{ "isQuestion": boolean, "type": one of
  ["behavioral","resume_project","technical_concept","coding","system_design","product","followup","salary_availability","clarification"],
  "confidence": 0..1, "strategy": short answer-strategy hint }.
If it is not actually a question, set isQuestion=false.`;

export async function classifyQuestion(text: string): Promise<ClassifiedQuestion> {
  const res = await openai().responses.create({
    model: model('classify'),
    input: [
      { role: 'system', content: PROMPT },
      { role: 'user', content: text },
    ],
    text: { format: { type: 'json_object' } },
  });
  const raw = JSON.parse(res.output_text) as Partial<ClassifiedQuestion>;
  return {
    isQuestion: raw.isQuestion ?? false,
    text,
    type: (raw.type as QuestionType) ?? 'behavioral',
    confidence: raw.confidence ?? 0,
    strategy: raw.strategy ?? '',
  };
}
