import { Locale } from '@prisma/client';

/**
 * Plantillas de los correos (HTML + texto plano), en español o inglés.
 * Estilo de la web: fondo gris oscuro, texto claro y el naranja neón como
 * acento. Todo con estilos en línea y tablas, que es lo que entienden los
 * programas de correo. Funciones puras, con tests en templates.spec.ts.
 *
 * Regla: nunca llevan datos sensibles (ni contraseñas, ni el texto de los
 * mensajes del chat, ni datos de la tarjeta). Solo lo justo y un enlace a la web.
 */

export interface MailContent {
  subject: string;
  html: string;
  text: string;
}

export interface LayoutOptions {
  /** Origen público de la web (FRONTEND_URL): logo y enlaces. */
  frontendUrl: string;
  /** Enlace para dejar de recibir este tipo de aviso (solo en avisos). */
  unsubscribeUrl?: string;
}

const COLORS = {
  page: '#111113',
  card: '#19191b',
  line: '#2e2e33',
  text: '#e6e4df',
  muted: '#a8a6a1',
  accent: '#ff4d00',
};

/** Escapa texto para meterlo en HTML (nombres de usuario, títulos de grupo...). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Texto que viene de usuarios: una línea, sin caracteres de control y corto. */
export function cleanName(value: string | null | undefined, max = 60): string {
  const s = (value ?? '').replace(/\p{Cc}+/gu, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

interface Body {
  /** Texto corto que se ve en la bandeja de entrada antes de abrir el correo. */
  preheader: string;
  title: string;
  /** Párrafos en texto plano (se escapan). */
  paragraphs: string[];
  button?: { label: string; url: string };
  /** Nota pequeña bajo el botón (p. ej. «si no lo pediste tú, ignóralo»). */
  note?: string;
}

const FOOTER = {
  ES: {
    why: 'Recibes este correo por tu cuenta de MyOO.',
    unsubscribe: 'Dejar de recibir estos avisos',
    copy: 'Si el botón no funciona, copia este enlace en el navegador:',
  },
  EN: {
    why: 'You are receiving this email because of your MyOO account.',
    unsubscribe: 'Stop these notifications',
    copy: 'If the button does not work, paste this link into your browser:',
  },
} as const;

function render(locale: Locale, subject: string, body: Body, opts: LayoutOptions): MailContent {
  const f = FOOTER[locale];
  const logo = `${opts.frontendUrl}/brand/icons/icon-192.png`;
  const paragraphs = body.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${COLORS.text};">${escapeHtml(p)}</p>`,
    )
    .join('');
  const button = body.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px;"><tr><td style="border-radius:999px;background:${COLORS.accent};">` +
      `<a href="${escapeHtml(body.button.url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#111113;text-decoration:none;border-radius:999px;">${escapeHtml(body.button.label)}</a>` +
      `</td></tr></table>` +
      `<p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:${COLORS.muted};">${escapeHtml(f.copy)}<br><a href="${escapeHtml(body.button.url)}" style="color:${COLORS.muted};word-break:break-all;">${escapeHtml(body.button.url)}</a></p>`
    : '';
  const note = body.note
    ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:${COLORS.muted};">${escapeHtml(body.note)}</p>`
    : '';
  const unsubscribe = opts.unsubscribeUrl
    ? ` · <a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:${COLORS.muted};">${escapeHtml(f.unsubscribe)}</a>`
    : '';

  const html =
    `<!DOCTYPE html><html lang="${locale === 'EN' ? 'en' : 'es'}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light">` +
    `<title>${escapeHtml(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${COLORS.page};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(body.preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};"><tr><td align="center" style="padding:28px 14px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">` +
    `<tr><td style="padding:0 4px 16px;"><img src="${escapeHtml(logo)}" width="40" height="40" alt="MyOO" style="display:block;border:0;border-radius:10px;"></td></tr>` +
    `<tr><td style="background:${COLORS.card};border:1px solid ${COLORS.line};border-radius:16px;padding:28px 26px;">` +
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:${COLORS.text};">${escapeHtml(body.title)}</h1>` +
    paragraphs +
    button +
    note +
    `</td></tr>` +
    `<tr><td style="padding:16px 4px 0;font-size:12px;line-height:1.5;color:${COLORS.muted};">${escapeHtml(f.why)}${unsubscribe}</td></tr>` +
    `</table></td></tr></table></body></html>`;

  const text = [
    body.title,
    '',
    ...body.paragraphs.flatMap((p) => [p, '']),
    ...(body.button ? [`${body.button.label}: ${body.button.url}`, ''] : []),
    ...(body.note ? [body.note, ''] : []),
    '—',
    f.why,
    ...(opts.unsubscribeUrl ? [`${f.unsubscribe}: ${opts.unsubscribeUrl}`] : []),
  ].join('\n');

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Acceso a la cuenta
// ---------------------------------------------------------------------------

export function verifyEmailMail(locale: Locale, url: string, opts: LayoutOptions): MailContent {
  if (locale === 'EN')
    return render(locale, 'Confirm your email · MyOO', {
      preheader: 'One click to confirm this email is yours.',
      title: 'Confirm your email',
      paragraphs: ['Confirm that this email address belongs to your MyOO account. The link works for 24 hours and only once.'],
      button: { label: 'Confirm email', url },
      note: 'If you did not create a MyOO account, you can ignore this email.',
    }, opts);
  return render(locale, 'Confirma tu email · MyOO', {
    preheader: 'Un clic para confirmar que este email es tuyo.',
    title: 'Confirma tu email',
    paragraphs: ['Confirma que esta dirección es la de tu cuenta de MyOO. El enlace vale 24 horas y una sola vez.'],
    button: { label: 'Confirmar email', url },
    note: 'Si no has creado una cuenta en MyOO, ignora este correo.',
  }, opts);
}

export function resetPasswordMail(locale: Locale, url: string, opts: LayoutOptions): MailContent {
  if (locale === 'EN')
    return render(locale, 'Reset your password · MyOO', {
      preheader: 'Choose a new password for MyOO.',
      title: 'Choose a new password',
      paragraphs: [
        'Someone (hopefully you) asked to reset the password of your MyOO account.',
        'The link works for 1 hour and only once. When you change it, every open session is signed out.',
      ],
      button: { label: 'Choose a new password', url },
      note: 'If it was not you, ignore this email: your password stays the same.',
    }, opts);
  return render(locale, 'Cambia tu contraseña · MyOO', {
    preheader: 'Elige una contraseña nueva para MyOO.',
    title: 'Elige una contraseña nueva',
    paragraphs: [
      'Alguien (esperamos que tú) ha pedido cambiar la contraseña de tu cuenta de MyOO.',
      'El enlace vale 1 hora y una sola vez. Al cambiarla se cierran todas las sesiones abiertas.',
    ],
    button: { label: 'Elegir contraseña nueva', url },
    note: 'Si no has sido tú, ignora este correo: tu contraseña no cambia.',
  }, opts);
}

const PROVIDER_NAME = { GOOGLE: 'Google', APPLE: 'Apple' } as const;

/** Contraseña olvidada en una cuenta que entra con Google/Apple (no tiene contraseña). */
export function oauthOnlyMail(
  locale: Locale,
  providers: ('GOOGLE' | 'APPLE')[],
  loginUrl: string,
  opts: LayoutOptions,
): MailContent {
  const names = providers.map((p) => PROVIDER_NAME[p]);
  if (locale === 'EN') {
    const list = names.length ? names.join(' or ') : 'Google or Apple';
    return render(locale, 'How to sign in · MyOO', {
      preheader: `Your account signs in with ${list}.`,
      title: 'Your account has no password',
      paragraphs: [
        `Someone asked to reset the password of your MyOO account, but it was created with ${list} and has no password.`,
        `To sign in, use the “Continue with ${names[0] ?? 'Google'}” button. Once inside you can create a password from your profile if you want one.`,
      ],
      button: { label: 'Go to sign in', url: loginUrl },
      note: 'If it was not you, ignore this email.',
    }, opts);
  }
  const list = names.length ? names.join(' o ') : 'Google o Apple';
  return render(locale, 'Cómo entrar · MyOO', {
    preheader: `Tu cuenta entra con ${list}.`,
    title: 'Tu cuenta no tiene contraseña',
    paragraphs: [
      `Alguien ha pedido cambiar la contraseña de tu cuenta de MyOO, pero se creó con ${list} y no tiene contraseña.`,
      `Para entrar, usa el botón «Continuar con ${names[0] ?? 'Google'}». Ya dentro, si quieres, puedes crear una contraseña desde tu perfil.`,
    ],
    button: { label: 'Ir a entrar', url: loginUrl },
    note: 'Si no has sido tú, ignora este correo.',
  }, opts);
}

// ---------------------------------------------------------------------------
// Avisos de pagos
// ---------------------------------------------------------------------------

export function paymentReceivedMail(
  locale: Locale,
  d: { amount: string; plan: string | null; accountUrl: string },
  opts: LayoutOptions,
): MailContent {
  const plan = cleanName(d.plan);
  if (locale === 'EN')
    return render(locale, 'Payment received · MyOO', {
      preheader: `We have received ${d.amount}.`,
      title: 'Payment received',
      paragraphs: [
        plan ? `We have received your payment of ${d.amount} for ${plan}. Thank you!` : `We have received your payment of ${d.amount}. Thank you!`,
        'You can see your payments and invoices in your account.',
      ],
      button: { label: 'View my account', url: d.accountUrl },
    }, opts);
  return render(locale, 'Pago recibido · MyOO', {
    preheader: `Hemos recibido ${d.amount}.`,
    title: 'Pago recibido',
    paragraphs: [
      plan ? `Hemos recibido tu pago de ${d.amount} por ${plan}. ¡Gracias!` : `Hemos recibido tu pago de ${d.amount}. ¡Gracias!`,
      'Puedes ver tus pagos y facturas en tu cuenta.',
    ],
    button: { label: 'Ver mi cuenta', url: d.accountUrl },
  }, opts);
}

export function paymentFailedMail(
  locale: Locale,
  d: { amount: string; plan: string | null; accountUrl: string },
  opts: LayoutOptions,
): MailContent {
  const plan = cleanName(d.plan);
  if (locale === 'EN')
    return render(locale, 'We could not charge your payment · MyOO', {
      preheader: 'Check your card to keep your plan.',
      title: 'Payment failed',
      paragraphs: [
        plan ? `We could not charge ${d.amount} for ${plan}.` : `We could not charge ${d.amount}.`,
        'Stripe will try again over the next few days. Check your card in your account so you do not lose your plan.',
      ],
      button: { label: 'Review payment', url: d.accountUrl },
    }, opts);
  return render(locale, 'No hemos podido cobrar tu pago · MyOO', {
    preheader: 'Revisa tu tarjeta para mantener tu plan.',
    title: 'El cobro ha fallado',
    paragraphs: [
      plan ? `No hemos podido cobrar ${d.amount} por ${plan}.` : `No hemos podido cobrar ${d.amount}.`,
      'Stripe lo volverá a intentar en los próximos días. Revisa tu tarjeta desde tu cuenta para no perder tu plan.',
    ],
    button: { label: 'Revisar el pago', url: d.accountUrl },
  }, opts);
}

export function subscriptionEndingMail(
  locale: Locale,
  d: { plan: string | null; date: string | null; accountUrl: string },
  opts: LayoutOptions,
): MailContent {
  const plan = cleanName(d.plan) || (locale === 'EN' ? 'your plan' : 'tu plan');
  if (locale === 'EN')
    return render(locale, 'Your subscription will not renew · MyOO', {
      preheader: d.date ? `You keep ${plan} until ${d.date}.` : `You keep ${plan} until the end of the period.`,
      title: 'Subscription canceled',
      paragraphs: [
        d.date
          ? `Your subscription will not renew. You keep ${plan} until ${d.date}; after that you move to the free plan and nothing is deleted.`
          : `Your subscription will not renew. You keep ${plan} until the end of the paid period; after that you move to the free plan and nothing is deleted.`,
        'Changed your mind? You can resume it from your account before that date.',
      ],
      button: { label: 'View my account', url: d.accountUrl },
    }, opts);
  return render(locale, 'Tu suscripción no se renovará · MyOO', {
    preheader: d.date ? `Mantienes ${plan} hasta el ${d.date}.` : `Mantienes ${plan} hasta el final del periodo.`,
    title: 'Suscripción cancelada',
    paragraphs: [
      d.date
        ? `Tu suscripción no se renovará. Mantienes ${plan} hasta el ${d.date}; después pasas al plan gratuito y no se borra nada.`
        : `Tu suscripción no se renovará. Mantienes ${plan} hasta el final del periodo pagado; después pasas al plan gratuito y no se borra nada.`,
      '¿Has cambiado de idea? Puedes reanudarla desde tu cuenta antes de esa fecha.',
    ],
    button: { label: 'Ver mi cuenta', url: d.accountUrl },
  }, opts);
}

export function subscriptionEndedMail(
  locale: Locale,
  d: { plan: string | null; accountUrl: string },
  opts: LayoutOptions,
): MailContent {
  const plan = cleanName(d.plan) || (locale === 'EN' ? 'your plan' : 'tu plan');
  if (locale === 'EN')
    return render(locale, 'Your subscription has ended · MyOO', {
      preheader: 'You are now on the free plan.',
      title: 'Subscription ended',
      paragraphs: [
        `Your ${plan} subscription has ended and you are now on the free plan. Nothing has been deleted: you can see and remove everything you have.`,
        'You can subscribe again whenever you like.',
      ],
      button: { label: 'View plans', url: d.accountUrl },
    }, opts);
  return render(locale, 'Tu suscripción ha terminado · MyOO', {
    preheader: 'Ahora estás en el plan gratuito.',
    title: 'Suscripción terminada',
    paragraphs: [
      `Tu suscripción a ${plan} ha terminado y ahora estás en el plan gratuito. No se ha borrado nada: puedes ver y eliminar todo lo que tienes.`,
      'Puedes volver a suscribirte cuando quieras.',
    ],
    button: { label: 'Ver planes', url: d.accountUrl },
  }, opts);
}

// ---------------------------------------------------------------------------
// Avisos del chat
// ---------------------------------------------------------------------------

/**
 * Mensajes nuevos. Nunca lleva el texto del mensaje: solo quién escribe (o el
 * nombre del grupo) y un enlace a la conversación.
 */
export function chatMessageMail(
  locale: Locale,
  d: { from: string | null; group: string | null; url: string },
  opts: LayoutOptions,
): MailContent {
  const from = cleanName(d.from, 40);
  const group = cleanName(d.group, 60);
  if (locale === 'EN') {
    const title = group ? `New messages in “${group}”` : from ? `${from} sent you a message` : 'You have new messages';
    return render(locale, `${title} · MyOO`, {
      preheader: 'Open MyOO to read and reply.',
      title,
      paragraphs: ['Open the conversation in MyOO to read it and reply.'],
      button: { label: 'Open the chat', url: d.url },
      note: 'At most one email every few hours per conversation, and only while you are away.',
    }, opts);
  }
  const title = group ? `Mensajes nuevos en «${group}»` : from ? `${from} te ha escrito` : 'Tienes mensajes nuevos';
  return render(locale, `${title} · MyOO`, {
    preheader: 'Abre MyOO para leerlo y contestar.',
    title,
    paragraphs: ['Abre la conversación en MyOO para leerla y contestar.'],
    button: { label: 'Abrir el chat', url: d.url },
    note: 'Como mucho un correo cada pocas horas por conversación, y solo si llevas un rato sin entrar.',
  }, opts);
}
