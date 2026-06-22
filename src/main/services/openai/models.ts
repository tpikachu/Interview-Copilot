import { SETTINGS_KEYS, settingsRepo } from '../../db/repositories/settings.repo';

export const defaultModels = {
  answer: 'gpt-4.1',
  parsing: 'gpt-4.1-mini',
  classify: 'gpt-4.1-mini',
  embedding: 'text-embedding-3-small',
  transcription: 'gpt-4o-transcribe',
  tts: 'gpt-4o-mini-tts',
  mock: 'gpt-4.1',
  vision: 'gpt-4.1',
} as const;

export type ModelKey = keyof typeof defaultModels;

/** User overrides merged over defaults. Model ids are config, not contracts. */
export function model(key: ModelKey): string {
  const overrides = settingsRepo.getJson<Record<string, string>>(SETTINGS_KEYS.models, {});
  return overrides[key] || defaultModels[key];
}

export const EMBEDDING_DIM = 1536;
