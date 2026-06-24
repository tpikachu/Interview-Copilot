import { SETTINGS_KEYS, settingsRepo } from '../../db/repositories/settings.repo';

// Cost-effective defaults: the mini/nano tiers are plenty for grounded,
// short interview answers and keep per-session cost low. Power users can upgrade
// any task to gpt-4.1 in Settings → OpenAI Models. Transcription stays on the full
// model since accuracy there drives every downstream answer.
export const defaultModels = {
  answer: 'gpt-4.1-mini', // the live copilot answer — good quality, ~5× cheaper than gpt-4.1
  parsing: 'gpt-4.1-mini', // one-off resume/JD parsing
  classify: 'gpt-4.1-nano', // high-frequency "is this a question?" — cheapest tier
  embedding: 'text-embedding-3-small',
  transcription: 'gpt-4o-transcribe', // accuracy here is the core input — keep it strong
  tts: 'gpt-4o-mini-tts',
  mock: 'gpt-4.1-mini', // mock interviewer questions
  // Coding-problem solver — used by BOTH the clipboard/text path (coding.ts) and
  // the screenshot path (vision.ts). The one task where a reasoning model earns its
  // cost: it's latency-tolerant (the user waits a beat) and correctness is the whole
  // point. Default to the cost-effective reasoning tier; verify the exact id against
  // the live model list (Settings → Load my models) and override per problem in the
  // Cue Card if needed.
  coding: 'gpt-5-mini',
} as const;

export type ModelKey = keyof typeof defaultModels;

/** User overrides merged over defaults. Model ids are config, not contracts. */
export function model(key: ModelKey): string {
  const overrides = settingsRepo.getJson<Record<string, string>>(SETTINGS_KEYS.models, {});
  return overrides[key] || defaultModels[key];
}

/** Reasoning effort for GPT-5 / o-series models. Higher = better quality but more
 *  hidden reasoning tokens + longer total completion (time-to-first-token stays
 *  flat). Non-reasoning models (gpt-4.1 / gpt-4o family) REJECT this param, so it's
 *  only ever sent to a reasoning model — see reasoningParam(). */
export type ReasoningEffort = 'low' | 'medium' | 'high';

/** Built-in effort per task. Only the latency-tolerant coding solver reasons by
 *  default; the live answer/classify paths stay on fast non-reasoning models. */
export const defaultEfforts: Partial<Record<ModelKey, ReasoningEffort>> = {
  coding: 'low',
};

/** Effective effort for a task (user override → built-in default → none). */
export function reasoningEffort(key: ModelKey): ReasoningEffort | null {
  const overrides = settingsRepo.getJson<Record<string, string>>(
    SETTINGS_KEYS.reasoningEfforts,
    {},
  );
  return (overrides[key] as ReasoningEffort) || defaultEfforts[key] || null;
}

/** GPT-5 family + o-series accept reasoning.effort; gpt-4.1 / gpt-4o reject it. */
export function isReasoningModel(id: string): boolean {
  return /^(gpt-5|o\d)/i.test(id);
}

/** Responses-API reasoning param for a task — empty unless the resolved model is a
 *  reasoning model AND an effort is configured, so we never send `reasoning` to a
 *  model that would reject it. Spread into the responses.create/stream request. */
export function reasoningParam(
  key: ModelKey,
): { reasoning: { effort: ReasoningEffort } } | Record<string, never> {
  const effort = reasoningEffort(key);
  if (effort && isReasoningModel(model(key))) return { reasoning: { effort } };
  return {};
}

export const EMBEDDING_DIM = 1536;
