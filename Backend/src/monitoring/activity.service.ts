import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Zona horaria con la que se cuentan los días en el monitor. */
export const REPORT_TZ = 'Europe/Madrid';

/** "2026-11-12" en la zona horaria del informe. */
export function dayKey(date: Date, tz = REPORT_TZ): string {
  // en-CA da el formato AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Apunta qué usuarios usan la app cada día (activos diarios, semanales y
 * mensuales en el monitor). Una fila por usuario y día: la primera petición
 * del día escribe, las demás solo miran un Set en memoria.
 */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);
  private day = '';
  private seen = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  /** Se llama en cada petición autenticada. No espera ni falla nunca. */
  touch(userId: string, now = new Date()): void {
    const day = dayKey(now);
    if (day !== this.day) {
      this.day = day;
      this.seen = new Set();
    }
    if (this.seen.has(userId)) return;
    this.seen.add(userId);
    this.prisma.dailyActive
      .createMany({
        data: [{ day: new Date(`${day}T00:00:00Z`), userId }],
        skipDuplicates: true,
      })
      .catch((err: unknown) => {
        // Si falla, se reintenta en la próxima petición.
        this.seen.delete(userId);
        this.logger.warn(
          `No se pudo apuntar la actividad: ${err instanceof Error ? err.name : 'error'}`,
        );
      });
  }
}
