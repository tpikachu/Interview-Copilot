import OpenAI from 'openai';
import { apiKeyStore } from '../security/apiKey';

let _client: OpenAI | null = null;
let _keyFingerprint = '';

/** Returns a cached OpenAI client, rebuilding it if the key changed.
 *  Throws a user-safe error when no key is configured. */
export function openai(): OpenAI {
  const key = apiKeyStore.getDecrypted();
  if (!key) {
    throw new Error('No OpenAI API key configured. Add one in Settings.');
  }
  // Cheap fingerprint so we rebuild when the key changes without storing it.
  const fp = `${key.length}:${key.slice(-4)}`;
  if (!_client || fp !== _keyFingerprint) {
    _client = new OpenAI({ apiKey: key, maxRetries: 2, timeout: 60_000 });
    _keyFingerprint = fp;
  }
  return _client;
}

/** Convert SDK errors into a short, user-safe message (never leaks the key). */
export function normalizeOpenAIError(e: unknown): string {
  if (e instanceof OpenAI.APIError) {
    if (e.status === 401) return 'OpenAI rejected the API key (401). Check your key in Settings.';
    if (e.status === 429) return 'OpenAI rate limit / quota reached (429). Try again shortly.';
    return `OpenAI error ${e.status ?? ''}: ${e.message}`;
  }
  if (e instanceof Error) return e.message;
  return 'Unknown error calling OpenAI.';
}

/** Cheap call used by settings:test-api-key. */
export async function testApiKey(): Promise<{ ok: boolean; model?: string; error?: string }> {
  try {
    const res = await openai().models.list();
    return { ok: true, model: res.data[0]?.id };
  } catch (e) {
    return { ok: false, error: normalizeOpenAIError(e) };
  }
}

/** List available model ids for the configured key (sorted). */
export async function listModels(): Promise<string[]> {
  const res = await openai().models.list();
  return res.data.map((m) => m.id).sort();
}
