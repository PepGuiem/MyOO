import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca un endpoint como público (no requiere token).
 * Por defecto TODOS los endpoints están protegidos por el AuthGuard global.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
