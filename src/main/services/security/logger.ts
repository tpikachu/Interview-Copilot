// Minimal logger that redacts anything resembling an OpenAI key before output.
const KEY_PATTERN = /sk-[A-Za-z0-9_\-]{8,}/g;

function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(KEY_PATTERN, 'sk-***REDACTED***');
  if (value instanceof Error) return redact(value.message);
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
  }
  return value;
}

export const log = {
  info: (...args: unknown[]) => console.log('[info]', ...args.map(redact)),
  warn: (...args: unknown[]) => console.warn('[warn]', ...args.map(redact)),
  error: (...args: unknown[]) => console.error('[error]', ...args.map(redact)),
};
