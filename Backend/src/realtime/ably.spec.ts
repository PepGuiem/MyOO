import { createHmac } from 'node:crypto';
import {
  ABLY_TOKEN_TTL_MS,
  basicAuthHeader,
  parseAblyKey,
  signTokenRequest,
  toAblyEvent,
  userCapability,
  userChannel,
  userTokenRequest,
} from './ably';
import { AblyService } from './ably.service';
import { RealtimeService } from './realtime.service';

// Clave inventada solo para las pruebas (no es de ninguna cuenta real).
const RAW_KEY = 'app123.key456:c2VjcmV0LWRlLXBydWViYQ';
const KEY = { keyName: 'app123.key456', secret: 'c2VjcmV0LWRlLXBydWViYQ' };
const USER = '7b0c1c1e-1111-4222-8333-944445555666';

function service(raw: string | undefined): AblyService {
  const config = { get: () => raw };
  return new AblyService(config as never);
}

function okResponse(body: unknown = {}) {
  return { ok: true, status: 201, json: () => Promise.resolve(body) };
}

describe('Ably: clave', () => {
  it('lee appId.keyId:secret', () => {
    expect(parseAblyKey(RAW_KEY)).toEqual(KEY);
    expect(parseAblyKey(`  ${RAW_KEY}\n`)).toEqual(KEY);
  });

  it('ignora una clave vacía o con otro formato', () => {
    expect(parseAblyKey(undefined)).toBeNull();
    expect(parseAblyKey('')).toBeNull();
    expect(parseAblyKey('sin-dos-puntos')).toBeNull();
    expect(parseAblyKey('app.key:')).toBeNull();
    expect(parseAblyKey('appkey:secret')).toBeNull();
    expect(parseAblyKey('app.key:sec ret')).toBeNull();
  });

  it('autenticación básica con la clave completa', () => {
    expect(basicAuthHeader(KEY)).toBe(
      `Basic ${Buffer.from(RAW_KEY).toString('base64')}`,
    );
  });
});

describe('Ably: token del navegador', () => {
  it('capacidad: SOLO escuchar su propio canal', () => {
    expect(userChannel(USER)).toBe(`user:${USER}`);
    expect(userCapability(USER)).toBe(`{"user:${USER}":["subscribe"]}`);
    expect(JSON.parse(userCapability(USER))).toEqual({
      [`user:${USER}`]: ['subscribe'],
    });
  });

  it('firma HMAC-SHA256 de keyName, ttl, capability, clientId, timestamp y nonce', () => {
    const req = signTokenRequest(KEY, {
      clientId: 'u1',
      capability: '{"user:u1":["subscribe"]}',
      ttl: 60_000,
      timestamp: 1_700_000_000_000,
      nonce: 'abcdefghijklmnop',
    });
    const text =
      'app123.key456\n60000\n{"user:u1":["subscribe"]}\nu1\n1700000000000\nabcdefghijklmnop\n';
    const expected = createHmac('sha256', KEY.secret)
      .update(text)
      .digest('base64');
    expect(req.mac).toBe(expected);
    expect(req).toMatchObject({
      keyName: 'app123.key456',
      ttl: 60_000,
      clientId: 'u1',
      timestamp: 1_700_000_000_000,
      nonce: 'abcdefghijklmnop',
    });
  });

  it('otro secreto o un dato cambiado dan otra firma', () => {
    const base = {
      clientId: 'u1',
      capability: userCapability('u1'),
      ttl: 60_000,
      timestamp: 1,
      nonce: 'abcdefghijklmnop',
    };
    const a = signTokenRequest(KEY, base).mac;
    expect(signTokenRequest({ ...KEY, secret: 'otro' }, base).mac).not.toBe(a);
    expect(signTokenRequest(KEY, { ...base, clientId: 'u2' }).mac).not.toBe(a);
    expect(
      signTokenRequest(KEY, { ...base, capability: '{"*":["*"]}' }).mac,
    ).not.toBe(a);
  });

  it('token de usuario: clientId = su id, caducidad ≤ 1 h, nonce nuevo y sin el secreto', () => {
    const a = userTokenRequest(KEY, USER, 1000);
    const b = userTokenRequest(KEY, USER, 1000);
    expect(a.clientId).toBe(USER);
    expect(a.capability).toBe(userCapability(USER));
    expect(a.ttl).toBe(ABLY_TOKEN_TTL_MS);
    expect(a.ttl).toBeLessThanOrEqual(60 * 60 * 1000);
    expect(a.timestamp).toBe(1000);
    expect(a.nonce.length).toBeGreaterThanOrEqual(16);
    expect(a.nonce).not.toBe(b.nonce);
    expect(JSON.stringify(a)).not.toContain(KEY.secret);
  });
});

describe('Ably: formato del evento (solo tipo e ids)', () => {
  it('mensaje: sin texto ni outfit', () => {
    const e = toAblyEvent({
      type: 'message',
      message: {
        id: 'm1',
        conversationId: 'c1',
        kind: 'TEXT',
        body: 'texto privado',
        outfit: { name: 'secreto' },
        sender: { id: 's1', displayName: 'Ana' },
      },
    });
    expect(e).toEqual({
      type: 'message',
      conversationId: 'c1',
      messageId: 'm1',
      senderId: 's1',
    });
    expect(JSON.stringify(e)).not.toContain('privado');
    expect(JSON.stringify(e)).not.toContain('Ana');
  });

  it('mensaje de sistema sin remitente: sin senderId', () => {
    expect(
      toAblyEvent({
        type: 'message',
        message: { id: 'm1', conversationId: 'c1', sender: null },
      }),
    ).toEqual({ type: 'message', conversationId: 'c1', messageId: 'm1' });
  });

  it('borrado, leído, cambios de conversación y escribiendo', () => {
    expect(
      toAblyEvent({
        type: 'message_deleted',
        conversationId: 'c1',
        messageId: 'm1',
      }),
    ).toEqual({
      type: 'message_deleted',
      conversationId: 'c1',
      messageId: 'm1',
    });
    const at = new Date('2026-11-27T10:00:00.000Z');
    expect(
      toAblyEvent({ type: 'read', conversationId: 'c1', userId: 'u1', at }),
    ).toEqual({
      type: 'read',
      conversationId: 'c1',
      userId: 'u1',
      at: '2026-11-27T10:00:00.000Z',
    });
    expect(
      toAblyEvent({ type: 'conversation', conversationId: 'c1', extra: 'x' }),
    ).toEqual({ type: 'conversation', conversationId: 'c1' });
    expect(
      toAblyEvent({ type: 'typing', conversationId: 'c1', userId: 'u1' }),
    ).toEqual({ type: 'typing', conversationId: 'c1', userId: 'u1' });
  });

  it('seguidores y avisos: sin nombres ni títulos', () => {
    expect(
      toAblyEvent({
        type: 'follow_request',
        user: { id: 'u2', displayName: 'Ana', avatarUrl: 'x' },
      }),
    ).toEqual({ type: 'follow_request', userId: 'u2' });
    expect(
      toAblyEvent({
        type: 'notification',
        notificationType: 'IDEA_REPLY',
        title: 'Título privado',
        link: '/ideas/1',
      }),
    ).toEqual({ type: 'notification', notificationType: 'IDEA_REPLY' });
  });

  it('lo desconocido o incompleto no se publica', () => {
    expect(toAblyEvent({ type: 'ready' })).toBeNull();
    expect(toAblyEvent({ type: 'algo', secret: 'x' })).toBeNull();
    expect(toAblyEvent({ type: 'message', message: { id: 'm1' } })).toBeNull();
    expect(toAblyEvent({ type: 'conversation' })).toBeNull();
    expect(
      toAblyEvent({
        type: 'message_deleted',
        conversationId: 1,
        messageId: 'm',
      }),
    ).toBeNull();
  });
});

describe('AblyService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('sin clave no hace nada', async () => {
    const ably = service(undefined);
    expect(ably.enabled).toBe(false);
    await ably.publish(['u1'], { type: 'conversation', conversationId: 'c1' });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(ably.requestToken('u1')).rejects.toThrow();
  });

  it('con una clave mal copiada queda apagado', () => {
    expect(service('no-es-una-clave').enabled).toBe(false);
  });

  it('publica en el canal de cada destinatario con autenticación básica', async () => {
    fetchMock.mockResolvedValue(okResponse() as never);
    const ably = service(RAW_KEY);
    await ably.publish(['u1', 'u2', 'u1'], {
      type: 'message',
      message: {
        id: 'm1',
        conversationId: 'c1',
        body: 'hola',
        sender: { id: 'u1' },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://rest.ably.io/channels/user%3Au1/messages');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      basicAuthHeader(KEY),
    );
    const body = JSON.parse(String(init.body)) as {
      name: string;
      data: string;
    };
    expect(body.name).toBe('message');
    expect(JSON.parse(body.data)).toEqual({
      type: 'message',
      conversationId: 'c1',
      messageId: 'm1',
      senderId: 'u1',
    });
    expect(String(init.body)).not.toContain('hola');
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://rest.ably.io/channels/user%3Au2/messages',
    );
  });

  it('si Ably falla no lanza error (el envío sigue)', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('red caída'))
      .mockResolvedValueOnce({ ok: false, status: 500 } as never);
    const ably = service(RAW_KEY);
    await expect(
      ably.publish(['u1', 'u2'], {
        type: 'conversation',
        conversationId: 'c1',
      }),
    ).resolves.toBeUndefined();
    expect(ably.stats()).toEqual({ enabled: true, published: 0, failed: 2 });
  });

  it('pide el token con una petición firmada (sin mandar el secreto)', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ token: 'tok', expires: 123, capability: 'x' }) as never,
    );
    const ably = service(RAW_KEY);
    await expect(ably.requestToken(USER)).resolves.toEqual({
      token: 'tok',
      expires: 123,
      expiresIn: 0,
      channel: `user:${USER}`,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://rest.ably.io/keys/app123.key456/requestToken');
    const sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(sent.clientId).toBe(USER);
    expect(sent.capability).toBe(userCapability(USER));
    expect(typeof sent.mac).toBe('string');
    expect(String(init.body)).not.toContain(KEY.secret);
    expect(JSON.stringify(init.headers)).not.toContain(KEY.secret);
  });

  it('respuesta rara de Ably: error', async () => {
    fetchMock.mockResolvedValue(okResponse({ nope: true }) as never);
    await expect(service(RAW_KEY).requestToken('u1')).rejects.toThrow();
  });
});

describe('RealtimeService + Ably', () => {
  it('cada evento emitido también se publica en Ably', async () => {
    const publish = jest.fn().mockResolvedValue(undefined);
    const rt = new RealtimeService({ enabled: true, publish } as never);
    await rt.emit(['a', 'b', 'a'], {
      type: 'conversation',
      conversationId: 'c',
    });
    expect(publish).toHaveBeenCalledWith(['a', 'b'], {
      type: 'conversation',
      conversationId: 'c',
    });
  });

  it('sin Ably (o apagado) no publica', async () => {
    const publish = jest.fn();
    await new RealtimeService().emit(['a'], { type: 'conversation' });
    await new RealtimeService({ enabled: false, publish } as never).emit(
      ['a'],
      {
        type: 'conversation',
      },
    );
    expect(publish).not.toHaveBeenCalled();
  });
});
