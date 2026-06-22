import { openai } from './client';
import { model } from './models';
import type { ParsedJd, ParsedResume } from '@shared/types';

// NOTE (skeleton): these use the Responses API with a JSON instruction. Swap to
// strict structured outputs (json_schema) when wiring M1. Output is parsed and
// defensively defaulted so a malformed model response can't crash callers.

const RESUME_PROMPT = `Extract a structured candidate profile as JSON with keys:
skills[], projects[{name,description,impact}], workHistory[{company,role,period,highlights[]}],
metrics[], education[], certifications[], techStack[], leadership[].
Only use information present in the resume. Return JSON only.`;

const JD_PROMPT = `Extract the job description as JSON with keys:
requirements[], responsibilities[], keywords[], focusAreas[]. Return JSON only.`;

async function extractJson<T>(systemPrompt: string, text: string): Promise<T> {
  const res = await openai().responses.create({
    model: model('parsing'),
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text.slice(0, 24_000) },
    ],
    text: { format: { type: 'json_object' } },
  });
  return JSON.parse(res.output_text) as T;
}

export async function parseResume(text: string): Promise<ParsedResume> {
  const raw = await extractJson<Partial<ParsedResume>>(RESUME_PROMPT, text);
  return {
    skills: raw.skills ?? [],
    projects: raw.projects ?? [],
    workHistory: raw.workHistory ?? [],
    metrics: raw.metrics ?? [],
    education: raw.education ?? [],
    certifications: raw.certifications ?? [],
    techStack: raw.techStack ?? [],
    leadership: raw.leadership ?? [],
  };
}

export async function parseJobDescription(text: string): Promise<ParsedJd> {
  const raw = await extractJson<Partial<ParsedJd>>(JD_PROMPT, text);
  return {
    requirements: raw.requirements ?? [],
    responsibilities: raw.responsibilities ?? [],
    keywords: raw.keywords ?? [],
    focusAreas: raw.focusAreas ?? [],
  };
}
