import { FollowStatus, Prisma } from '@prisma/client';

/** Lo mínimo de otra persona que se puede enseñar en listas, chats y búsquedas. */
export const userBriefSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarAssetId: true,
  isPrivate: true,
} satisfies Prisma.UserSelect;

export type UserBriefRow = Prisma.UserGetPayload<{
  select: typeof userBriefSelect;
}>;

export interface UserBrief {
  id: string;
  username: string | null;
  displayName: string | null;
  /** Cambia cuando cambia la foto (sirve de clave de caché); null sin foto. */
  avatar: string | null;
  isPrivate: boolean;
}

export function toBrief(u: UserBriefRow): UserBrief {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatar: u.avatarAssetId,
    isPrivate: u.isPrivate,
  };
}

export type FollowState = 'none' | 'pending' | 'accepted';

export function followState(
  status: FollowStatus | null | undefined,
): FollowState {
  return status === FollowStatus.ACCEPTED
    ? 'accepted'
    : status === FollowStatus.PENDING
      ? 'pending'
      : 'none';
}
