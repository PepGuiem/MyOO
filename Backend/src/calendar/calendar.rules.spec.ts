import {
  addDays,
  computeStats,
  diffDays,
  findRepeats,
  parseDay,
  seasonOfDay,
  suggestOutfits,
} from './calendar.rules';

describe('calendar rules', () => {
  it('fechas sin zona horaria', () => {
    expect(parseDay('2026-02-30')).toBe(null);
    expect(parseDay('2026-13-01')).toBe(null);
    expect(parseDay('hoy')).toBe(null);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2);
    expect(seasonOfDay('2026-12-05')).toBe('WINTER');
    expect(seasonOfDay('2026-07-05')).toBe('SUMMER');
    expect(seasonOfDay('2026-11-13')).toBe('AUTUMN');
  });

  it('avisa si un outfit se repite en menos de una semana', () => {
    const f = findRepeats([
      { id: 'a', outfitId: 'o1', date: '2026-11-01' },
      { id: 'b', outfitId: 'o1', date: '2026-11-03' },
      { id: 'c', outfitId: 'o1', date: '2026-11-20' },
      { id: 'd', outfitId: 'o2', date: '2026-11-02' },
    ]);
    expect(f.has('a')).toBe(false);
    expect(f.get('b')?.gapDays).toBe(2);
    expect(f.get('b')?.level).toBe('high');
    expect(f.has('c')).toBe(false);
    expect(f.has('d')).toBe(false);
  });

  it('avisa si se usa 4 veces o más en 30 días', () => {
    const days = ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22'];
    const f = findRepeats(
      days.map((date, i) => ({ id: `e${i}`, outfitId: 'o1', date })),
    );
    expect(f.has('e0')).toBe(false);
    expect(f.get('e1')?.uses30).toBe(4);
    expect(f.get('e1')?.text).toBe('4 veces en 30 días');
  });

  it('recomienda primero lo que no has usado y evita lo planificado cerca', () => {
    const s = suggestOutfits(
      [
        {
          id: 'used',
          season: null,
          ratingScore: 90,
          isFavorite: false,
          lastWorn: '2026-11-10',
          planned: [],
        },
        {
          id: 'new',
          season: null,
          ratingScore: 60,
          isFavorite: false,
          lastWorn: null,
          planned: [],
        },
        {
          id: 'busy',
          season: null,
          ratingScore: 99,
          isFavorite: false,
          lastWorn: null,
          planned: ['2026-11-14'],
        },
        {
          id: 'summer',
          season: 'SUMMER',
          ratingScore: 60,
          isFavorite: false,
          lastWorn: null,
          planned: [],
        },
      ],
      '2026-11-13',
    );
    expect(s.map((x) => x.id)).toEqual(['new', 'summer', 'used']);
    expect(s[0].reasons).toContain('Sin estrenar');
  });

  it('estadísticas: racha, últimos 30 días y nunca usados', () => {
    const st = computeStats(
      [
        { outfitId: 'a', date: '2026-11-13', worn: true, style: 'TRAP' },
        { outfitId: 'a', date: '2026-11-12', worn: true, style: 'TRAP' },
        { outfitId: 'b', date: '2026-11-11', worn: true, style: null },
        { outfitId: 'b', date: '2026-11-09', worn: false, style: null },
        { outfitId: 'a', date: '2026-11-20', worn: false, style: 'TRAP' },
        { outfitId: 'b', date: '2026-08-01', worn: true, style: null },
      ],
      ['a', 'b', 'c'],
      '2026-11-13',
    );
    expect(st.streak).toBe(3);
    expect(st.worn30).toBe(3);
    expect(st.wornTotal).toBe(4);
    expect(st.wearRate30).toBe(0.75);
    expect(st.upcoming30).toBe(2);
    expect(st.neverWorn).toBe(1);
    expect(st.topWorn[0]).toEqual({ outfitId: 'a', count: 2 });
    expect(st.byStyle[0]).toEqual({ style: 'TRAP', count: 2 });
    expect(st.byWeekday[4]).toBe(1);
  });
});
