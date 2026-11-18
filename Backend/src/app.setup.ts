import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { metricsMiddleware } from './monitoring/metrics.middleware';
import { MetricsService } from './monitoring/metrics.service';

/**
 * Configuración HTTP compartida entre main.ts y los tests e2e,
 * para que los tests prueben la app tal y como se ejecuta de verdad.
 */
export function setupApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  // En Vercel la petición llega a través de su proxy: la IP real del usuario
  // va en X-Forwarded-For (Vercel la sobrescribe, no la puede falsear el cliente).
  // Sin esto, el límite de intentos (ThrottlerGuard) contaría a todos como uno.
  if (process.env.VERCEL) {
    app.getHttpAdapter().getInstance().set('trust proxy', true);
  }
  // Métricas de cada petición para el monitor de admins (ruta, código, tiempo).
  app.use(metricsMiddleware(app.get(MetricsService)));
  // Cabeceras HTTP de seguridad (X-Content-Type-Options, etc.).
  app.use(helmet());
  // Solo el frontend configurado puede llamar a la API desde el navegador.
  app.enableCors({
    origin: config
      .getOrThrow<string>('CORS_ORIGIN')
      .split(',')
      .map((o) => o.trim()),
  });
  app.enableShutdownHooks();
}
