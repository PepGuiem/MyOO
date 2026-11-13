/**
 * Cliente HTTP mínimo sobre fetch.
 * - Añade el token JWT en la cabecera Authorization.
 * - Convierte las respuestas de error en ApiError con el mensaje del backend.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

/** Base de la API (para enlaces a los que el navegador navega, como el login con Google). */
export function apiBaseUrl(): string {
  return BASE_URL;
}
const TOKEN_KEY = 'myout.token';

export class ApiError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown> | null;

  constructor(status: number, message: string, body: Record<string, unknown> | null) {
    super(message);
    this.status = status;
    this.body = body;
  }

  /** true si el error es "has alcanzado el límite de tu plan". */
  get isPlanLimit(): boolean {
    return this.body?.error === 'PlanLimitReached';
  }
}

// El token vive en localStorage para sobrevivir a recargas. Es cómodo pero
// accesible desde JavaScript: por eso es importante no tener XSS. El acceso
// va en try/catch porque el navegador puede bloquear el almacenamiento.
export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null): void {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
  },
};

let onUnauthorized: (() => void) | null = null;

/** Datos de una suspensión (403 con `code: 'banned'`). */
export interface BanInfo {
  reason: string | null;
  until: string | null;
}

let onBanned: ((info: BanInfo) => void) | null = null;

/** El AuthContext registra aquí qué hacer si el token deja de valer. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/** ...y qué hacer si la cuenta ha sido suspendida (cerrar sesión y explicarlo). */
export function setBannedHandler(handler: ((info: BanInfo) => void) | null): void {
  onBanned = handler;
}

/** Si el error es "cuenta suspendida", devuelve el motivo y la fecha. */
export function banInfo(body: Record<string, unknown> | null): BanInfo | null {
  if (body?.code !== 'banned') return null;
  return {
    reason: typeof body.reason === 'string' ? body.reason : null,
    until: typeof body.until === 'string' ? body.until : null,
  };
}

function checkSession(status: number, body: Record<string, unknown> | null, hadToken: boolean): void {
  if (status === 401 && hadToken && onUnauthorized) onUnauthorized();
  const ban = status === 403 ? banInfo(body) : null;
  if (ban && hadToken && onBanned) onBanned(ban);
}

type Query = Record<string, string | number | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return `${BASE_URL}${path}${qs ? `?${qs}` : ''}`;
}

function messageFrom(body: Record<string, unknown> | null, status: number): string {
  const msg = body?.message;
  if (Array.isArray(msg)) return msg.join('. ');
  if (typeof msg === 'string') return msg;
  if (status === 0) return 'No se puede conectar con la API. ¿Está arrancado el backend?';
  return `Error ${status}`;
}

export async function api<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  options: { body?: unknown; query?: Query } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, messageFrom(null, 0), null);
  }

  if (response.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const errorBody =
      body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
    checkSession(response.status, errorBody, !!token);
    throw new ApiError(response.status, messageFrom(errorBody, response.status), errorBody);
  }
  return body as T;
}

async function errorFrom(response: Response, hadToken: boolean): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const errorBody = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  checkSession(response.status, errorBody, hadToken);
  if (response.status === 413) return new ApiError(413, 'El archivo es demasiado grande (máximo 2 MB).', errorBody);
  return new ApiError(response.status, messageFrom(errorBody, response.status), errorBody);
}

/** Sube un archivo como multipart/form-data (campo "file"). */
export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const token = tokenStore.get();
  const form = new FormData();
  form.append('file', file);
  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
  } catch {
    throw new ApiError(0, messageFrom(null, 0), null);
  }
  if (!response.ok) throw await errorFrom(response, !!token);
  return (await response.json()) as T;
}

/** Descarga un recurso protegido como Blob (p. ej. una imagen subida). */
export async function fetchBlob(path: string): Promise<Blob> {
  const token = tokenStore.get();
  let response: Response;
  try {
    response = await fetch(buildUrl(path), { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  } catch {
    throw new ApiError(0, messageFrom(null, 0), null);
  }
  if (!response.ok) throw await errorFrom(response, !!token);
  return response.blob();
}
