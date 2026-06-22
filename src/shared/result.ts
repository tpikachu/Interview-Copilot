/** Standard envelope crossing the IPC boundary. Errors are never thrown across
 * the wire; the preload wrapper unwraps this and throws on the renderer side. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (error: string): Result<never> => ({ ok: false, error });
