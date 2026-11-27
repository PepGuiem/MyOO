import {
  chatMessageMail,
  cleanName,
  escapeHtml,
  oauthOnlyMail,
  paymentReceivedMail,
  resetPasswordMail,
  verifyEmailMail,
} from './templates';

const opts = { frontendUrl: 'https://myout.vercel.app' };

describe('plantillas de correo', () => {
  it('escapa el HTML', () => {
    expect(escapeHtml('<b>"Ana" & \'Luis\'</b>')).toBe('&lt;b&gt;&quot;Ana&quot; &amp; &#39;Luis&#39;&lt;/b&gt;');
  });

  it('cleanName: una línea, sin caracteres de control y corta', () => {
    expect(cleanName('  Ana\n\tLópez  ')).toBe('Ana López');
    expect(cleanName('a'.repeat(100), 10)).toHaveLength(10);
    expect(cleanName(null)).toBe('');
  });

  it('español e inglés, con HTML y texto, logo público y enlace', () => {
    const url = 'https://myout.vercel.app/reset-password?token=abc';
    const es = resetPasswordMail('ES', url, opts);
    const en = resetPasswordMail('EN', url, opts);
    expect(es.subject).toContain('contraseña');
    expect(en.subject).toContain('password');
    for (const m of [es, en]) {
      expect(m.html).toContain('https://myout.vercel.app/brand/icons/icon-192.png');
      expect(m.html).toContain(url);
      expect(m.text).toContain(url);
      expect(m.html.startsWith('<!DOCTYPE html>')).toBe(true);
    }
  });

  it('un nombre de usuario con HTML no se cuela en el correo', () => {
    const m = chatMessageMail('ES', { from: '<script>alert(1)</script>', group: null, url: 'https://x.dev/mensajes/1' }, opts);
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
  });

  it('el aviso de chat no lleva el texto de ningún mensaje y sí el enlace de baja', () => {
    const m = chatMessageMail(
      'EN',
      { from: 'Ana', group: null, url: 'https://x.dev/mensajes/1' },
      { ...opts, unsubscribeUrl: 'https://x.dev/email-preferences?token=t' },
    );
    expect(m.subject).toContain('Ana');
    expect(m.html).toContain('https://x.dev/email-preferences?token=t');
    expect(m.text).toContain('https://x.dev/email-preferences?token=t');
  });

  it('cuenta solo con Google/Apple: explica cómo entrar, sin enlace de contraseña', () => {
    const m = oauthOnlyMail('ES', ['APPLE'], 'https://myout.vercel.app/login', opts);
    expect(m.text).toContain('Continuar con Apple');
    expect(m.text).not.toContain('reset-password');
  });

  it('pago recibido y verificar email', () => {
    expect(paymentReceivedMail('ES', { amount: '4,99 €', plan: 'Plus', accountUrl: 'u' }, opts).text).toContain('4,99 € por Plus');
    expect(verifyEmailMail('EN', 'https://v', opts).subject).toContain('Confirm');
  });
});
