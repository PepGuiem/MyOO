import { MailService, resendPayload } from './mail.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

function service(env: Record<string, string | undefined>) {
  const config = {
    get: (k: string) =>
      ({
        FRONTEND_URL: 'https://myout.vercel.app',
        OAUTH_PUBLIC_API_URL: 'https://myout.vercel.app/api',
        ...env,
      })[k],
  };
  const s = new MailService(config as any);
  const calls: { url: string; init: RequestInit }[] = [];
  s.fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ id: 'e1' }) } as Response;
  }) as any;
  return { s, calls };
}

const mail = { to: 'ana@example.com', subject: 'Hola', html: '<p>Hola</p>', text: 'Hola' };

describe('MailService', () => {
  it('sin RESEND_API_KEY o sin EMAIL_FROM está apagado y no llama a nadie', async () => {
    for (const env of [{}, { RESEND_API_KEY: 're_x' }, { EMAIL_FROM: 'MyOO <hola@myoo.dev>' }]) {
      const { s, calls } = service(env);
      expect(s.enabled).toBe(false);
      expect(await s.send(mail)).toBe(false);
      expect(calls).toHaveLength(0);
    }
  });

  it('con un remitente mal escrito queda apagado (la app no se cae)', () => {
    const { s } = service({ RESEND_API_KEY: 're_x', EMAIL_FROM: 'no es un correo' });
    expect(s.enabled).toBe(false);
    expect(s.problem).toBe('invalid_from');
  });

  it('envía con la API REST de Resend', async () => {
    const { s, calls } = service({ RESEND_API_KEY: 're_x', EMAIL_FROM: 'MyOO <hola@myoo.dev>' });
    expect(s.enabled).toBe(true);
    expect(await s.send({ ...mail, idempotencyKey: 'k1' })).toBe(true);
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer re_x');
    expect(headers['Idempotency-Key']).toBe('k1');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      from: 'MyOO <hola@myoo.dev>',
      to: ['ana@example.com'],
      subject: 'Hola',
      html: '<p>Hola</p>',
      text: 'Hola',
    });
  });

  it('si Resend falla devuelve false (no lanza)', async () => {
    const { s } = service({ RESEND_API_KEY: 're_x', EMAIL_FROM: 'hola@myoo.dev' });
    s.fetchImpl = (async () => ({ ok: false, status: 403, json: async () => ({ name: 'validation_error' }) })) as any;
    expect(await s.send(mail)).toBe(false);
    s.fetchImpl = (async () => {
      throw new Error('red');
    }) as any;
    expect(await s.send(mail)).toBe(false);
  });

  it('baja en un clic: cabeceras List-Unsubscribe', () => {
    const p = resendPayload('a@b.dev', { ...mail, oneClickUnsubscribeUrl: 'https://x.dev/api/mail/unsubscribe/one-click?token=t' });
    expect(p.headers).toEqual({
      'List-Unsubscribe': '<https://x.dev/api/mail/unsubscribe/one-click?token=t>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });
});
