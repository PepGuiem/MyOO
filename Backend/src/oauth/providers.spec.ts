import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'node:crypto';
import {
  AppleProvider,
  appleName,
  GoogleProvider,
  InstagramClient,
} from './providers';
import { OidcVerifier } from './oidc';

describe('appleName', () => {
  it('lee nombre y apellido', () => {
    expect(
      appleName(
        JSON.stringify({ name: { firstName: 'Ana', lastName: 'Ruiz' } }),
      ),
    ).toBe('Ana Ruiz');
  });
  it('sin datos o con JSON roto → null', () => {
    expect(appleName(undefined)).toBeNull();
    expect(appleName('{roto')).toBeNull();
    expect(appleName(JSON.stringify({ email: 'a@b.c' }))).toBeNull();
  });
});

describe('GoogleProvider.authorizeUrl', () => {
  it('pide openid/email/profile con PKCE S256, state y nonce', () => {
    const g = new GoogleProvider(
      { clientId: 'cid', clientSecret: 's' },
      'http://localhost:5173/api/auth/oauth/google/callback',
      new OidcVerifier(),
    );
    const url = new URL(
      g.authorizeUrl({ state: 'st', nonce: 'nn', codeChallenge: 'cc' }),
    );
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('nonce')).toBe('nn');
    // El secreto nunca va en la URL.
    expect(url.toString()).not.toContain('client_secret');
  });
});

describe('AppleProvider', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  });
  const apple = new AppleProvider(
    {
      clientId: 'com.myout.web',
      teamId: 'TEAM123456',
      keyId: 'KEY1234567',
      privateKey: privateKey
        .export({ type: 'pkcs8', format: 'pem' })
        .toString(),
    },
    'https://myout.test/api/auth/oauth/apple/callback',
    new OidcVerifier(),
  );

  it('firma el client secret con ES256 y los datos que pide Apple', () => {
    const secret = apple.clientSecret();
    const jwt = new JwtService();
    const decoded = jwt.decode<{ header: { alg: string; kid: string } }>(
      secret,
      { complete: true },
    );
    expect(decoded.header).toMatchObject({ alg: 'ES256', kid: 'KEY1234567' });
    const claims = jwt.verify<{
      iss: string;
      sub: string;
      aud: string;
      exp: number;
      iat: number;
    }>(secret, {
      publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      algorithms: ['ES256'],
    });
    expect(claims).toMatchObject({
      iss: 'TEAM123456',
      sub: 'com.myout.web',
      aud: 'https://appleid.apple.com',
    });
    expect(claims.exp - claims.iat).toBe(300);
  });

  it('pide form_post con nombre y email', () => {
    const url = new URL(apple.authorizeUrl({ state: 's', nonce: 'n' }));
    expect(url.searchParams.get('response_mode')).toBe('form_post');
    expect(url.searchParams.get('scope')).toBe('name email');
  });
});

describe('InstagramClient.connect', () => {
  function client(tokenBody: unknown) {
    const seen: string[] = [];
    const fetchImpl = async (url: string) => {
      seen.push(url.split('?')[0]);
      if (url.startsWith('https://api.instagram.com/oauth/access_token'))
        return new Response(JSON.stringify(tokenBody), { status: 200 });
      return new Response(
        JSON.stringify({
          access_token: 'LONG',
          token_type: 'bearer',
          expires_in: 5183944,
        }),
        { status: 200 },
      );
    };
    return {
      ig: new InstagramClient(
        { appId: 'a', appSecret: 's' },
        'https://x.test/cb',
        fetchImpl,
      ),
      seen,
    };
  }

  it('acepta la respuesta con data:[...] (documentación) y la plana', async () => {
    for (const body of [
      {
        data: [
          {
            access_token: 'SHORT',
            user_id: 123,
            permissions: 'instagram_business_basic',
          },
        ],
      },
      { access_token: 'SHORT', user_id: 123 },
    ]) {
      const { ig, seen } = client(body);
      const r = await ig.connect('codigo#_');
      expect(r).toEqual({
        userId: '123',
        token: { accessToken: 'LONG', expiresIn: 5183944 },
      });
      expect(seen).toEqual([
        'https://api.instagram.com/oauth/access_token',
        'https://graph.instagram.com/access_token',
      ]);
    }
  });

  it('una respuesta inesperada es un error', async () => {
    const { ig } = client({ nada: true });
    await expect(ig.connect('c')).rejects.toThrow('unexpected response');
  });
});
