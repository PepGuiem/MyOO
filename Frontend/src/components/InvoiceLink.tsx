import { t } from '../i18n';
import { safeInvoiceUrl } from '../lib/legal';
import { Icon } from './Icon';

/** «Ver factura» (Stripe, en pestaña nueva); nada si no hay enlace válido. */
export function InvoiceLink({ url }: { url: string | null | undefined }) {
  const href = safeInvoiceUrl(url);
  if (!href) return <span className="muted">—</span>;
  return (
    <a className="invoice-link" href={href} target="_blank" rel="noopener noreferrer">
      <span>{t('Ver factura')}</span>
      <Icon name="external" size={13} />
      <span className="visually-hidden">{t('(se abre en una pestaña nueva)')}</span>
    </a>
  );
}
