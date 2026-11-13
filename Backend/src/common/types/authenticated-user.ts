import type { Request } from 'express';

/** Identidad del usuario autenticado, obtenida del token JWT verificado. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  /** Rol leído de la base de datos en cada petición (no del token). */
  role: 'USER' | 'ADMIN';
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/** Contenido (payload) que firmamos dentro del JWT. */
export interface JwtPayload {
  sub: string;
  email: string;
}
