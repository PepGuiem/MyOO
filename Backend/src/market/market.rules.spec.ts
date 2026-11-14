import {
  categoryForGarment,
  contactMessage,
  listingProblem,
  MAX_PHOTOS,
} from './market.rules';

describe('market.rules', () => {
  it('categoría a partir del tipo de prenda', () => {
    expect(categoryForGarment('SNEAKERS', 'FOOTWEAR')).toBe('SNEAKERS');
    expect(categoryForGarment('BOOTS', 'FOOTWEAR')).toBe('OTHER');
    expect(categoryForGarment('SWEATER', 'TOP')).toBe('HOODIES');
    expect(categoryForGarment('T_SHIRT', 'TOP')).toBe('TSHIRTS');
    expect(categoryForGarment('SHORTS', 'BOTTOM')).toBe('PANTS');
    expect(categoryForGarment('COAT', 'OUTERWEAR')).toBe('JACKETS');
    expect(categoryForGarment('CAP', 'ACCESSORY')).toBe('ACCESSORIES');
    expect(categoryForGarment('ALGO_NUEVO', 'OUTERWEAR')).toBe('JACKETS');
    expect(categoryForGarment(null, null)).toBe('OTHER');
  });

  it('vender exige precio; las fotos tienen límite y no se repiten', () => {
    expect(listingProblem({ kind: 'SELL', price: null })).toBe(
      'price_required',
    );
    expect(listingProblem({ kind: 'SELL', price: 0 })).toBe(null);
    expect(listingProblem({ kind: 'SWAP', price: null })).toBe(null);
    const ids = Array.from({ length: MAX_PHOTOS + 1 }, (_, i) => `p${i}`);
    expect(listingProblem({ kind: 'SWAP', price: null, photoIds: ids })).toBe(
      'too_many_photos',
    );
    expect(
      listingProblem({ kind: 'SWAP', price: null, photoIds: ['a', 'a'] }),
    ).toBe('duplicate_photos');
  });

  it('el primer mensaje dice de qué anuncio se habla', () => {
    const l = { id: 'abc', title: 'Hoodie negra', kind: 'SELL' as const };
    expect(contactMessage(l)).toBe(
      'Street Market · Me interesa tu anuncio «Hoodie negra» (/market/abc)\n\n¿Sigue disponible?',
    );
    expect(
      contactMessage({ ...l, kind: 'SWAP' }, '  ¿La cambias por unas zapas?  '),
    ).toBe(
      'Street Market · Me interesa tu intercambio «Hoodie negra» (/market/abc)\n\n¿La cambias por unas zapas?',
    );
  });
});
