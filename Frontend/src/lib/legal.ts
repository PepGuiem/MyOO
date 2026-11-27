import { t } from '../i18n';

/**
 * Páginas legales públicas (/legal/...). De momento solo existe la estructura:
 * los textos legales están pendientes de redactar y NO se inventan aquí.
 */
export type LegalDoc = 'terminos' | 'privacidad' | 'cookies';

export const LEGAL_DOCS: LegalDoc[] = ['terminos', 'privacidad', 'cookies'];

export function isLegalDoc(value: string | undefined): value is LegalDoc {
  return !!value && (LEGAL_DOCS as string[]).includes(value);
}

export function legalPath(doc: LegalDoc): string {
  return `/legal/${doc}`;
}

/** Título completo de cada página. */
export function legalTitle(doc: LegalDoc): string {
  return { terminos: t('Términos y condiciones'), privacidad: t('Política de privacidad'), cookies: t('Política de cookies') }[doc];
}

/** Nombre corto para los enlaces del pie y del menú. */
export function legalShortTitle(doc: LegalDoc): string {
  return { terminos: t('Términos'), privacidad: t('Privacidad'), cookies: t('Cookies') }[doc];
}

/** Dominios desde los que Stripe sirve las facturas (igual que en el backend). */
const INVOICE_HOSTS = ['invoice.stripe.com', 'pay.stripe.com'];

/**
 * Enlace «Ver factura» solo si es https y de un dominio de facturas de
 * Stripe. El backend ya lo filtra; aquí se vuelve a comprobar por si acaso.
 */
export function safeInvoiceUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    return INVOICE_HOSTS.includes(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}
