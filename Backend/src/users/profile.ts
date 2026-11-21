import {
  AuthProvider,
  Locale,
  MessagePolicy,
  Prisma,
  UserRole,
} from '@prisma/client';
import { readPreferences, type Preferences } from './preferences';

/**
 * Lo que la API devuelve del usuario: datos de la cuenta y del perfil.
 * Se construye SIEMPRE con `profileSelect` + `toProfileView`, que nunca
 * incluyen el hash de la contraseña ni los tokens de las cuentas conectadas.
 */
export const profileSelect = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  // Solo se lee para saber si hay contraseña (hasPassword); nunca se devuelve.
  passwordHash: true,
  displayName: true,
  username: true,
  bio: true,
  pronouns: true,
  location: true,
  website: true,
  instagramHandle: true,
  styleTags: true,
  favoriteColors: true,
  sizeTop: true,
  sizeBottom: true,
  sizeShoes: true,
  accentColor: true,
  avatarAssetId: true,
  coverAssetId: true,
  isPrivate: true,
  messagePolicy: true,
  locale: true,
  preferences: true,
  role: true,
  createdAt: true,
  authAccounts: {
    select: { provider: true, email: true, username: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.UserSelect;

type ProfileRow = Prisma.UserGetPayload<{ select: typeof profileSelect }>;

export interface ConnectedAccount {
  provider: AuthProvider;
  email: string | null;
  username: string | null;
  connectedAt: Date;
}

export interface ProfileView {
  id: string;
  email: string;
  emailVerified: boolean;
  hasPassword: boolean;
  displayName: string | null;
  username: string | null;
  bio: string | null;
  pronouns: string | null;
  location: string | null;
  website: string | null;
  instagramHandle: string | null;
  styleTags: string[];
  favoriteColors: string[];
  sizes: { top: string | null; bottom: string | null; shoes: string | null };
  accentColor: string | null;
  avatarAssetId: string | null;
  coverAssetId: string | null;
  /** Privacidad: cuenta privada y quién puede escribirte. */
  isPrivate: boolean;
  messagePolicy: MessagePolicy;
  /** Idioma de la web (ES o EN). */
  locale: Locale;
  /** Ajustes de «Personalizar» (null = los de por defecto). */
  preferences: Preferences | null;
  /** USER o ADMIN (el frontend enseña el panel de admin). */
  role: UserRole;
  createdAt: Date;
  accounts: ConnectedAccount[];
}

export function toProfileView(u: ProfileRow): ProfileView {
  return {
    id: u.id,
    email: u.email,
    emailVerified: u.emailVerifiedAt !== null,
    hasPassword: u.passwordHash !== null,
    displayName: u.displayName,
    username: u.username,
    bio: u.bio,
    pronouns: u.pronouns,
    location: u.location,
    website: u.website,
    instagramHandle: u.instagramHandle,
    styleTags: u.styleTags,
    favoriteColors: u.favoriteColors,
    sizes: { top: u.sizeTop, bottom: u.sizeBottom, shoes: u.sizeShoes },
    accentColor: u.accentColor,
    avatarAssetId: u.avatarAssetId,
    coverAssetId: u.coverAssetId,
    isPrivate: u.isPrivate,
    messagePolicy: u.messagePolicy,
    locale: u.locale,
    preferences: readPreferences(u.preferences),
    role: u.role,
    createdAt: u.createdAt,
    accounts: u.authAccounts.map((a) => ({
      provider: a.provider,
      email: a.email,
      username: a.username,
      connectedAt: a.createdAt,
    })),
  };
}

type Db = Pick<Prisma.TransactionClient, 'user'>;

export async function loadProfile(
  db: Db,
  userId: string,
): Promise<ProfileView | null> {
  const row = await db.user.findUnique({
    where: { id: userId },
    select: profileSelect,
  });
  return row ? toProfileView(row) : null;
}
