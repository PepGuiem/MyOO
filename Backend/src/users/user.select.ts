import { Prisma } from '@prisma/client';

/**
 * Campos de User que SÍ se pueden devolver en la API.
 * Usar siempre este `select` evita filtrar `passwordHash` por accidente.
 */
export const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;
