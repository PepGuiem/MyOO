import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'node:crypto';
import { OidcVerifier } from './oidc';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: 'k1',
  alg: 'RS256',
  use: 'sig',
};
const privatePem = privateKey
  .export({ type: 'pkcs8', format: 'pem' })
  .toString();
const jwt = new JwtService();

const ISS = 'https://accounts.google.com';
const AUD = 'mi-client-id';

function token(
  claims: Record<string, unknown>,
  opts: { kid?: string; expiresIn?: number; key?: string } = {},
) {
  return jwt.sign(
    {
      sub: 'user-1',
      nonce: 'n-123',
      email: 'ana@example.com',
      email_verified: true,
      ...claims,
    },
    {
      privateKey: opts.key ?? privatePem,
      algorithm: 'RS256',
      keyid: opts.kid ?? 'k1',
      issuer: ISS,
      audience: AUD,
      expiresIn: opts.expiresIn ?? 300,
    },
  );
}

function verifier() {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
  };
  return { v: new OidcVerifier(fetchImpl), calls: () => calls };
}

const opts = {
  jwksUri: 'https://example.test/jwks',
  issuers: [ISS],
  audience: AUD,
  nonce: 'n-123',
};

describe('OidcVerifier', () => {
  it('acepta un ID token válido', async () => {
    const { v } = verifier();
    const c = await v.verify(token({}), opts);
    expect(c.sub).toBe('user-1');
    expect(c.email).toBe('ana@example.com');
  });

  it('guarda las claves públicas (no las pide en cada login)', async () => {
    const { v, calls } = verifier();
    await v.verify(token({}), opts);
    await v.verify(token({}), opts);
    expect(calls()).toBe(1);
  });

  it('rechaza otro nonce (token de otro login)', async () => {
    const { v } = verifier();
    await expect(v.verify(token({ nonce: 'otro' }), opts)).rejects.toThrow(
      'nonce',
    );
  });

  it('rechaza otro destinatario (aud)', async () => {
    const { v } = verifier();
    await expect(
      v.verify(token({}), { ...opts, audience: 'otra-app' }),
    ).rejects.toThrow();
  });

  it('rechaza otro emisor (iss)', async () => {
    const { v } = verifier();
    await expect(
      v.verify(token({}), { ...opts, issuers: ['https://appleid.apple.com'] }),
    ).rejects.toThrow();
  });

  it('rechaza un token caducado', async () => {
    const { v } = verifier();
    await expect(
      v.verify(token({}, { expiresIn: -120 }), opts),
    ).rejects.toThrow();
  });

  it('rechaza un token firmado con otra clave', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();
    const { v } = verifier();
    await expect(v.verify(token({}, { key: other }), opts)).rejects.toThrow();
  });

  it('rechaza una clave (kid) desconocida', async () => {
    const { v } = verifier();
    await expect(v.verify(token({}, { kid: 'nope' }), opts)).rejects.toThrow(
      'unknown signing key',
    );
  });

  it('rechaza tokens sin firma RSA (alg none / HS256)', async () => {
    const { v } = verifier();
    const hs = jwt.sign(
      { sub: 'x', nonce: 'n-123' },
      {
        secret: 'x'.repeat(32),
        algorithm: 'HS256',
        keyid: 'k1',
        issuer: ISS,
        audience: AUD,
      },
    );
    await expect(v.verify(hs, opts)).rejects.toThrow('unexpected header');
  });
});
