import type { UserBrief } from '../../api/types';
import { usePersonImage } from '../../lib/personImage';
import { t } from '../../i18n';

export function personName(p: Pick<UserBrief, 'displayName' | 'username'> | null | undefined): string {
  if (!p) return t('Usuario eliminado');
  return p.displayName?.trim() || (p.username ? `@${p.username}` : t('Sin nombre'));
}

/** Ruta del perfil de alguien (por @usuario si lo tiene). */
export function profilePath(p: Pick<UserBrief, 'id' | 'username'>): string {
  return `/u/${encodeURIComponent(p.username ?? p.id)}`;
}

export function PersonAvatar({ person, size = 40, className = '' }: { person: UserBrief | null; size?: number; className?: string }) {
  const url = usePersonImage(person?.id, person?.avatar, 'avatar');
  const initial = personName(person).replace('@', '').charAt(0).toUpperCase() || '?';
  return (
    <span
      className={`avatar person-avatar${url ? ' has-image' : ''} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" /> : initial}
    </span>
  );
}
