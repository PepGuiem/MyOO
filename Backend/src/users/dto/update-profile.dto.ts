import { Locale, MessagePolicy } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  MAX_FAVORITE_COLORS,
  MAX_PROFILE_STYLE_TAGS,
  normalizeUsername,
  PROFILE_STYLE_TAGS,
  USERNAME_PATTERN,
} from '../profile-options';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
/** Texto vacío → null (borra el campo). */
const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};
const HEX = /^#[0-9a-fA-F]{6}$/;
const SIZE = /^[\p{L}\p{N} ,./-]{1,10}$/u;
/** Solo se valida si el valor no es null (null = borrar). */
const unlessNull = ValidateIf((_o: unknown, v: unknown) => v !== null);

/**
 * Campos del perfil que el usuario puede cambiar. Todos opcionales: solo se
 * cambia lo que llega. `null` (o texto vacío) borra el campo.
 * Email, contraseña, plan y cuentas conectadas NO se cambian por aquí
 * (así se evita la "asignación masiva" de campos sensibles).
 */
export class UpdateProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  displayName?: string;

  /** @usuario único (se guarda en minúsculas y sin la @). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeUsername(value) || null : value,
  )
  @unlessNull
  @IsString()
  @Matches(USERNAME_PATTERN, {
    message:
      'username must be 3-30 characters: lowercase letters, numbers, dot or underscore (no dot at the start or end)',
  })
  username?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @unlessNull
  @IsString()
  @MaxLength(300)
  bio?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @unlessNull
  @IsString()
  @MaxLength(30)
  pronouns?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @unlessNull
  @IsString()
  @MaxLength(60)
  location?: string | null;

  /** Web personal: solo http(s). */
  @IsOptional()
  @Transform(trimOrNull)
  @unlessNull
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'website must be a URL starting with http:// or https://' },
  )
  @MaxLength(200)
  website?: string | null;

  /** @usuario de Instagram escrito a mano (sin conectar la cuenta). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/^@/, '') || null : value,
  )
  @unlessNull
  @Matches(/^[A-Za-z0-9._]{1,30}$/, {
    message: 'instagramHandle must be a valid Instagram username',
  })
  instagramHandle?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PROFILE_STYLE_TAGS)
  @ArrayUnique()
  @IsIn(PROFILE_STYLE_TAGS, { each: true })
  styleTags?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_FAVORITE_COLORS)
  @Matches(HEX, {
    each: true,
    message: 'favoriteColors must be colors like #1A1A1A',
  })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((c: unknown) => (typeof c === 'string' ? c.toUpperCase() : c))
      : value,
  )
  favoriteColors?: string[];

  @IsOptional()
  @Transform(trimOrNull)
  @unlessNull
  @Matches(SIZE, { message: 'sizeTop must be at most 10 characters' })
  sizeTop?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @unlessNull
  @Matches(SIZE, { message: 'sizeBottom must be at most 10 characters' })
  sizeBottom?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @unlessNull
  @Matches(SIZE, { message: 'sizeShoes must be at most 10 characters' })
  sizeShoes?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @unlessNull
  @Matches(HEX, { message: 'accentColor must be a color like #FF5A1F' })
  accentColor?: string | null;

  /** Imagen subida con POST /assets (tiene que ser tuya). null = quitar. */
  @IsOptional()
  @unlessNull
  @IsUUID()
  avatarAssetId?: string | null;

  @IsOptional()
  @unlessNull
  @IsUUID()
  coverAssetId?: string | null;

  /** Cuenta privada: para seguirte hay que enviarte una solicitud. */
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  /** Quién puede escribirte: todos, personas a las que sigues, nadie. */
  @IsOptional()
  @IsEnum(MessagePolicy)
  messagePolicy?: MessagePolicy;

  /** Idioma de la web: ES (español) o EN (inglés). */
  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;
}
