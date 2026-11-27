import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/**
 * Variables de entorno que necesita la aplicación.
 * Si falta alguna obligatoria o tiene un formato incorrecto, la app NO arranca
 * y muestra un error claro (mejor fallar pronto que a mitad de una petición).
 */
export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  // Las variables de .env siempre llegan como texto: "3000" -> 3000.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters long' })
  JWT_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(60 * 60 * 24 * 7)
  JWT_EXPIRES_IN_SECONDS = 3600;

  @IsString()
  CORS_ORIGIN = 'http://localhost:5173';

  /**
   * Carpeta donde se guardan las imágenes subidas (almacenamiento local de
   * desarrollo). Relativa a la carpeta desde la que se arranca el backend.
   */
  @IsString()
  @IsNotEmpty()
  STORAGE_DIR = 'storage';

  // "true"/"false" llegan como texto desde el .env; Boolean("false") sería
  // true, así que lo convertimos a mano.
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    const raw = obj.ALLOW_SIMULATED_PLAN_CHANGE;
    return raw === true || raw === 'true';
  })
  @IsBoolean()
  ALLOW_SIMULATED_PLAN_CHANGE = false;

  // STREET MARKET: está terminado pero apagado («próximamente» en Novedades).
  // Con MARKET_ENABLED=true se abren sus rutas (/api/market).
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    const raw = obj.MARKET_ENABLED;
    return raw === true || raw === 'true';
  })
  @IsBoolean()
  MARKET_ENABLED = false;

  // --- Inicio de sesión con Google / Apple y conexión con Instagram ---------
  // Todas son opcionales: si faltan las de un proveedor, su botón no aparece.

  /** URL pública del frontend (a donde se vuelve después del login). */
  @IsString()
  @Matches(/^https?:\/\/[^/]+$/, {
    message:
      'FRONTEND_URL must be an origin like http://localhost:5173 (no trailing slash)',
  })
  FRONTEND_URL = 'http://localhost:5173';

  /**
   * URL pública de la API tal y como la ve el navegador. Con ella se forman
   * las "redirect URI" que se registran en Google, Apple e Instagram. En
   * desarrollo pasa por el proxy de Vite, así la cookie del flujo queda en el
   * mismo origen que la web.
   */
  @IsString()
  @Matches(/^https?:\/\/[^?#]+[^/]$/, {
    message: 'OAUTH_PUBLIC_API_URL must be a URL without trailing slash',
  })
  OAUTH_PUBLIC_API_URL = 'http://localhost:5173/api';

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_SECRET?: string;

  /** "Services ID" de Apple (p. ej. com.myout.web). */
  @IsOptional()
  @IsString()
  APPLE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  APPLE_TEAM_ID?: string;

  @IsOptional()
  @IsString()
  APPLE_KEY_ID?: string;

  /** Ruta al archivo .p8 de la clave de Apple (fuera del repositorio). */
  @IsOptional()
  @IsString()
  APPLE_PRIVATE_KEY_PATH?: string;

  @IsOptional()
  @IsString()
  INSTAGRAM_APP_ID?: string;

  @IsOptional()
  @IsString()
  INSTAGRAM_APP_SECRET?: string;

  /**
   * Clave para cifrar los tokens de Instagram en la base de datos: 32 bytes
   * en base64 (44 caracteres). Genera una con:
   *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   */
  @IsOptional()
  @Matches(/^[A-Za-z0-9+/]{43}=$/, {
    message: 'TOKEN_ENCRYPTION_KEY must be 32 bytes in base64 (44 characters)',
  })
  TOKEN_ENCRYPTION_KEY?: string;

  // --- Tiempo real con Ably (opcional) ---------------------------------------
  // Sin ella todo sigue igual (WebSocket en local, consultas periódicas en
  // Vercel). Una clave mal copiada no tumba la app: AblyService la ignora.

  /** Clave de la API de Ably: `appId.keyId:secret` (ver el README). */
  @IsOptional()
  @IsString()
  ABLY_API_KEY?: string;

  // --- Pagos con Stripe (SOLO modo prueba) -----------------------------------
  // Sin STRIPE_SECRET_KEY los pagos están apagados (la web lo indica). Una
  // clave real (sk_live_) o mal copiada NO tumba la app: BillingConfig la
  // ignora y el panel de admin avisa (AGENTS.md no permite cobros reales).

  /** Clave secreta de prueba (sk_test_… o restringida rk_test_…). */
  @IsOptional()
  @IsString()
  STRIPE_SECRET_KEY?: string;

  /** Secreto de firma del webhook (whsec_…), del endpoint /api/billing/webhook. */
  @IsOptional()
  @IsString()
  STRIPE_WEBHOOK_SECRET?: string;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  // Una variable vacía en el .env (GOOGLE_CLIENT_ID=) cuenta como no puesta.
  const present = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== ''),
  );
  const validated = plainToInstance(EnvironmentVariables, present, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('\n  - ');
    throw new Error(`Invalid environment variables:\n  - ${details}`);
  }
  return validated;
}

/** Atajo para tipar ConfigService: ConfigService<AppConfig, true>. */
export type AppConfig = EnvironmentVariables;
