import type { IconName } from '../components/Icon';
import { t } from '../i18n';

/**
 * Funciones terminadas pero apagadas hasta su lanzamiento. Para encender el
 * market hay que poner `market: true` aquí y MARKET_ENABLED=true en el backend.
 */
export const FEATURES = {
  market: false,
} as const;

/** Lo que viene: se enseña en Novedades → «Próximamente». */
export interface Upcoming {
  id: string;
  icon: IconName;
  title: string;
  body: string;
  points: string[];
}

export const UPCOMING: Upcoming[] = FEATURES.market
  ? []
  : [
      {
        id: 'street-market',
        icon: 'store',
        title: t('Street Market'),
        body: t('Compra, vende e intercambia ropa y zapatillas con la comunidad de MyOut.'),
        points: [
          t('Anuncios con fotos, precio, talla, estado y ciudad.'),
          t('«Vender» directamente desde una prenda de tu armario o tus zapatillas.'),
          t('Habla con quien vende por el chat de la app; sin pagos dentro de MyOut.'),
          t('Favoritos, filtros por categoría, talla y precio.'),
        ],
      },
    ];
