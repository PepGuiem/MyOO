import type { Battle, BattleSide, BattleStatus, BattleTab, UserBrief } from '../api/types';
import type { IconName } from '../components/Icon';
import { personName } from '../components/social/PersonAvatar';
import { t } from '../i18n';

/** STREETWEAR BATTLES: textos y ayudas de presentación. */
export const BATTLE_TABS: { id: BattleTab; label: string; icon: IconName; empty: string }[] = [
  { id: 'live', label: t('En juego'), icon: 'bolt', empty: t('No hay batallas votándose ahora. ¡Lanza un reto!') },
  { id: 'open', label: t('Retos abiertos'), icon: 'flag', empty: t('Nadie ha dejado un reto abierto. Sé el primero.') },
  { id: 'challenges', label: t('Te retan'), icon: 'bell', empty: t('No tienes retos pendientes.') },
  { id: 'mine', label: t('Mis batallas'), icon: 'users', empty: t('Todavía no has participado en ninguna batalla.') },
  { id: 'finished', label: t('Resultados'), icon: 'trophy', empty: t('Aún no ha terminado ninguna batalla.') },
];

export const BATTLE_STATUS: Record<BattleStatus, { label: string; tone: 'live' | 'wait' | 'done' | 'off' }> = {
  PENDING: { label: t('Esperando rival'), tone: 'wait' },
  ACTIVE: { label: t('Votación abierta'), tone: 'live' },
  FINISHED: { label: t('Terminada'), tone: 'done' },
  DECLINED: { label: t('Rechazada'), tone: 'off' },
  CANCELLED: { label: t('Retirada'), tone: 'off' },
  EXPIRED: { label: t('Caducada'), tone: 'off' },
};

export function sidePerson(b: Battle, side: BattleSide): UserBrief | null {
  return side === 'A' ? b.challenger : b.opponent;
}

export function sideName(b: Battle, side: BattleSide): string {
  const p = sidePerson(b, side);
  return p ? personName(p) : t('Rival por llegar');
}

/** «quedan 5 h 20 min», «quedan 2 días»… (o null si ya pasó). */
export function timeLeft(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return null;
  const min = Math.floor(ms / 60_000);
  if (min < 60) return t('quedan {n} min', { n: Math.max(1, min) });
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 ? t('quedan {h} h {m} min', { h, m: min % 60 }) : t('quedan {h} h', { h });
  return t('quedan {floor} días', { floor: Math.floor(h / 24) });
}

/** Progreso (0-1) del plazo de votación, para la barra de tiempo. */
export function timeProgress(start: string | null, end: string | null, now = Date.now()): number {
  if (!start || !end) return 0;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  return Math.min(1, Math.max(0, (now - a) / (b - a)));
}

/** Mensaje de por qué no puedes votar. */
export function voteBlockText(b: Battle): string | null {
  switch (b.voteBlock) {
    case 'own_battle':
      return t('Es tu batalla: no puedes votar en ella.');
    case 'already_voted':
      return t('Ya has votado. Tu voto no se puede cambiar.');
    case 'not_active':
      return b.status === 'FINISHED' ? t('La votación ha terminado.') : t('La votación aún no ha empezado.');
    default:
      return null;
  }
}

/** Texto de un error de la API de batallas (por su `code`). */
export const BATTLE_ERRORS: Record<string, string> = {
  too_many_pending: t('Tienes demasiados retos esperando respuesta. Espera a que te contesten o retira alguno.'),
  already_challenged: t('Ya tienes un reto pendiente con esta persona.'),
  cannot_challenge: t('No puedes retar a esta persona (su perfil es privado o hay un bloqueo).'),
  not_available: t('Este reto ya no está disponible: alguien lo aceptó antes o ha caducado.'),
  already_voted: t('Ya habías votado en esta batalla.'),
  own_battle: t('No puedes votar ni aceptar tu propia batalla.'),
  empty_outfit: t('Ese outfit no tiene prendas.'),
};
