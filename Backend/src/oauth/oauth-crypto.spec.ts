import {
  pkceChallenge,
  readCookie,
  safeEqual,
  sha256,
  TokenCipher,
} from './oauth-crypto';

describe('oauth-crypto', () => {
  it('PKCE S256: base64url(SHA-256(verifier)), sin relleno', async () => {
    const verifier = 'un-verifier-de-prueba-con-43-caracteres-o-mas';
    const digest = Buffer.from(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
    );
    const expected = digest
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(pkceChallenge(verifier)).toBe(expected);
    expect(pkceChallenge(verifier)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('sha256 da 64 caracteres hexadecimales', () => {
    expect(sha256('hola')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('safeEqual compara textos', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('readCookie encuentra la cookie entre otras', () => {
    expect(readCookie('a=1; myout_oauth=xyz; b=2', 'myout_oauth')).toBe('xyz');
    expect(readCookie('a=1', 'myout_oauth')).toBeNull();
    expect(readCookie(undefined, 'myout_oauth')).toBeNull();
  });

  describe('TokenCipher', () => {
    const key = Buffer.alloc(32, 7).toString('base64');

    it('cifra y descifra', () => {
      const c = new TokenCipher(key);
      const enc = c.encrypt('token-secreto');
      expect(enc).not.toContain('token-secreto');
      expect(c.decrypt(enc)).toBe('token-secreto');
    });

    it('cada cifrado es distinto (IV aleatorio)', () => {
      const c = new TokenCipher(key);
      expect(c.encrypt('x')).not.toBe(c.encrypt('x'));
    });

    it('detecta un texto cifrado manipulado', () => {
      const c = new TokenCipher(key);
      const [v, iv, tag, data] = c.encrypt('token').split(':');
      const tampered = [
        v,
        iv,
        tag,
        Buffer.from('otro').toString('base64url') + data,
      ].join(':');
      expect(() => c.decrypt(tampered)).toThrow();
    });

    it('no descifra con otra clave', () => {
      const enc = new TokenCipher(key).encrypt('token');
      expect(() =>
        new TokenCipher(Buffer.alloc(32, 9).toString('base64')).decrypt(enc),
      ).toThrow();
    });

    it('rechaza claves que no son de 32 bytes', () => {
      expect(
        () => new TokenCipher(Buffer.alloc(16).toString('base64')),
      ).toThrow();
    });
  });
});
