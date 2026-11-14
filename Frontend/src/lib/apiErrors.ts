import { ApiError } from '../api/client';

/**
 * Cambia un error de la API por un texto claro en español si su `code` está
 * en `texts`; si no, lo deja como está (ErrorNote ya sabe enseñarlo).
 */
export function explain(err: unknown, texts: Record<string, string>): unknown {
  const code = err instanceof ApiError && typeof err.body?.code === 'string' ? err.body.code : null;
  return code && texts[code] ? new Error(texts[code]) : err;
}

/** Texto de un error para un aviso (toast). */
export function errorText(err: unknown, texts: Record<string, string>, fallback: string): string {
  const e = explain(err, texts);
  return e instanceof Error && e.message ? e.message : fallback;
}
