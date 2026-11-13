import { ActivityService, dayKey } from './activity.service';
import { lastDays, utcStamp } from './monitoring.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('días del monitor (hora de Madrid)', () => {
  it('dayKey usa la zona horaria de Madrid', () => {
    // 23:30 UTC del 12 = 00:30 del 13 en Madrid (invierno, UTC+1).
    expect(dayKey(new Date('2026-11-12T23:30:00Z'))).toBe('2026-11-13');
    expect(dayKey(new Date('2026-11-12T22:59:00Z'))).toBe('2026-11-12');
    // En verano (UTC+2).
    expect(dayKey(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
  });

  it('lastDays: del más antiguo a hoy, sin huecos ni repetidos (también con cambio de hora)', () => {
    expect(lastDays(3, new Date('2026-11-12T10:00:00Z'))).toEqual([
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
    ]);
    const d = lastDays(30, new Date('2026-11-05T10:00:00Z')); // cruza el cambio de hora del 25-10
    expect(new Set(d).size).toBe(30);
    expect(d[0]).toBe('2026-10-07');
    expect(d[29]).toBe('2026-11-05');
  });

  it('utcStamp', () => {
    expect(utcStamp(new Date('2026-11-12T08:30:15.123Z'))).toBe(
      '2026-11-12 08:30:15',
    );
  });
});

describe('ActivityService', () => {
  function setup(fail = false) {
    const calls: any[] = [];
    const prisma = {
      dailyActive: {
        createMany: (args: any) => {
          calls.push(args);
          return fail
            ? Promise.reject(new Error('db down'))
            : Promise.resolve({ count: 1 });
        },
      },
    };
    return { service: new ActivityService(prisma as any), calls };
  }

  it('una escritura por usuario y día', () => {
    const { service, calls } = setup();
    const now = new Date('2026-11-12T10:00:00Z');
    service.touch('ana', now);
    service.touch('ana', now);
    service.touch('bob', now);
    service.touch('ana', new Date('2026-11-13T10:00:00Z'));
    expect(
      calls.map((c) => [
        c.data[0].userId,
        c.data[0].day.toISOString().slice(0, 10),
      ]),
    ).toEqual([
      ['ana', '2026-11-12'],
      ['bob', '2026-11-12'],
      ['ana', '2026-11-13'],
    ]);
    expect(calls[0].skipDuplicates).toBe(true);
  });

  it('si falla, lo vuelve a intentar en la siguiente petición', async () => {
    const { service, calls } = setup(true);
    const now = new Date('2026-11-12T10:00:00Z');
    service.touch('ana', now);
    await new Promise((r) => setTimeout(r, 0));
    service.touch('ana', now);
    expect(calls).toHaveLength(2);
  });
});
