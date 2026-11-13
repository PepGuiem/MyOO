import type { NextFunction, Request, Response } from 'express';
import type { MetricsService } from './metrics.service';

/**
 * Mide cada petición HTTP: cuánto tarda, con qué código acaba y a qué ruta
 * corresponde. Se usa el PATRÓN de la ruta (`/api/ideas/:id`), que Express
 * deja en `req.route` al encontrar el endpoint; nunca la URL real.
 */
export function metricsMiddleware(metrics: MetricsService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const route = req.route
        ? `${req.baseUrl ?? ''}${String((req.route as { path: unknown }).path)}`
        : null;
      const errorName =
        typeof res.locals.errorName === 'string' ? res.locals.errorName : null;
      metrics.record(req.method, route, res.statusCode, ms, errorName);
    });
    next();
  };
}
