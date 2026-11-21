import { BadRequestException } from '@nestjs/common';
import { DEFAULT_PREFERENCES, NAV_GROUPS, parsePreferences, readPreferences } from './preferences';

describe('preferences', () => {
  it('rellena con los valores por defecto lo que no llega', () => {
    expect(parsePreferences({})).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences({ accent: 'pink' }).accent).toBe('pink');
  });

  it('acepta un ajuste completo', () => {
    const p = parsePreferences({
      accent: 'custom',
      customAccent: '#12AB34',
      neon: 'soft',
      background: 'still',
      motion: 'reduced',
      textSize: 'large',
      density: 'compact',
      quality3d: 'saver',
      menu: { compact: true, hidden: ['market'], pinned: ['messages', 'outfits'], groupOrder: ['community'] },
    });
    expect(p.customAccent).toBe('#12ab34');
    expect(p.menu.pinned).toEqual(['messages', 'outfits']);
    // Los grupos que faltan se añaden al final.
    expect(p.menu.groupOrder).toEqual(['community', 'style', 'collection']);
    expect(p.menu.groupOrder).toHaveLength(NAV_GROUPS.length);
  });

  it('una entrada oculta no queda fijada y no hay repetidas', () => {
    const p = parsePreferences({ menu: { hidden: ['ideas'], pinned: ['ideas', 'news', 'news'] } });
    expect(p.menu.pinned).toEqual(['news']);
  });

  it('rechaza claves y valores desconocidos', () => {
    expect(() => parsePreferences({ theme: 'dark' })).toThrow(BadRequestException);
    expect(() => parsePreferences({ accent: 'gold' })).toThrow(BadRequestException);
    expect(() => parsePreferences({ accent: 'custom' })).toThrow(BadRequestException);
    expect(() => parsePreferences({ customAccent: 'red' })).toThrow(BadRequestException);
    expect(() => parsePreferences({ menu: { hidden: ['admin'] } })).toThrow(BadRequestException);
    expect(() => parsePreferences({ menu: { compact: 'yes' } })).toThrow(BadRequestException);
    expect(() => parsePreferences({ menu: { extra: 1 } })).toThrow(BadRequestException);
    expect(() => parsePreferences([])).toThrow(BadRequestException);
  });

  it('al leer de la base de datos, lo que no se entiende vuelve a su valor por defecto', () => {
    expect(readPreferences(null)).toBeNull();
    const p = readPreferences({ accent: 'gold', neon: 'off', menu: { hidden: ['admin', 'market'] } });
    expect(p?.accent).toBe('orange');
    expect(p?.neon).toBe('off');
    expect(p?.menu.hidden).toEqual(['market']);
  });
});
