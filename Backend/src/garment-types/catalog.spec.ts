import { GARMENT_TYPE_SEEDS } from '../../prisma/garment-catalog';
import { DEMO_ITEMS, DEMO_OUTFITS } from '../../prisma/seed-data';
import { validateStyling } from '../outfits/styling';
import { validateCustomization } from '../customization/customization';
import { validateAttributes } from './attribute-schema';

describe('Catálogo de tipos de prenda y cortes', () => {
  it('no repite códigos de tipo de prenda', () => {
    const codes = GARMENT_TYPE_SEEDS.map((g) => g.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it.each(GARMENT_TYPE_SEEDS.map((g) => [g.code, g] as const))(
    '%s: las opciones de cada lista no se repiten',
    (_code, g) => {
      for (const field of Object.values(g.attributeSchema.fields)) {
        if (field.type !== 'enum') continue;
        const values = field.options.map((o) => o.value);
        expect(new Set(values).size).toBe(values.length);
        expect(values.length).toBeGreaterThan(1);
      }
    },
  );

  it('todas las prendas que no son calzado, gorra ni ropa interior tienen "Corte"', () => {
    const withoutFit = GARMENT_TYPE_SEEDS.filter(
      (g) => !g.attributeSchema.fields.fit && !['FOOTWEAR', 'ACCESSORY'].includes(g.category) && g.code !== 'UNDERWEAR',
    );
    expect(withoutFit.map((g) => g.code)).toEqual([]);
  });

  it('las prendas de demostración usan valores válidos del catálogo', () => {
    for (const item of DEMO_ITEMS) {
      const type = GARMENT_TYPE_SEEDS.find((g) => g.code === item.type);
      expect(type).toBeDefined();
      const result = validateAttributes(type!.attributeSchema, item.attributes ?? {});
      expect({ item: item.name, errors: result.errors }).toEqual({ item: item.name, errors: [] });
    }
  });

  it('las personalizaciones de demostración son válidas', () => {
    for (const item of DEMO_ITEMS) {
      const type = GARMENT_TYPE_SEEDS.find((g) => g.code === item.type)!;
      const result = validateCustomization(item.customization ?? {}, type.modelKey);
      expect({ item: item.name, errors: result.ok ? [] : result.errors }).toEqual({ item: item.name, errors: [] });
    }
  });

  it('los estilos de los outfits de demostración son válidos', () => {
    for (const outfit of DEMO_OUTFITS) {
      for (const [itemId, styling] of Object.entries(outfit.styling ?? {})) {
        expect(outfit.items).toContain(itemId);
        const item = DEMO_ITEMS.find((i) => i.id === itemId)!;
        const type = GARMENT_TYPE_SEEDS.find((g) => g.code === item.type)!;
        const result = validateStyling(styling, type.modelKey);
        expect({ outfit: outfit.name, errors: result.ok ? [] : result.errors }).toEqual({ outfit: outfit.name, errors: [] });
      }
    }
  });
});
