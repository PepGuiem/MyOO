import type { OutfitStyle } from '../api/types';
import { t } from '../i18n';

export interface StyleMeta {
  label: string;
  /** Una frase corta para el filtro. */
  hint: string;
  /** Color de la pegatina y tinta del texto encima. */
  color: string;
  ink: string;
}

/** Estilos de outfit con su pegatina. Los colores son los únicos toques de color de la página. */
export const OUTFIT_STYLES: Record<OutfitStyle, StyleMeta> = {
  STREETWEAR: { label: t('Streetwear'), hint: t('Sudadera, cargo y zapas'), color: '#ff3b4a', ink: '#120708' },
  TECHWEAR: { label: t('Techwear'), hint: t('Técnico, negro y funcional'), color: '#c6ff2e', ink: '#0d1204' },
  OLD_MONEY: { label: t('Old Money'), hint: t('Clásico y sin logos'), color: '#e9dcc3', ink: '#17130c' },
  CASUAL: { label: t('Casual'), hint: t('Lo de todos los días'), color: '#bdbbb5', ink: '#121212' },
  SKATE: { label: t('Skate'), hint: t('Ancho, gastado y cómodo'), color: '#ff7a1a', ink: '#140a02' },
  GRUNGE: { label: t('Grunge'), hint: t('Capas, cuadros y botas'), color: '#8f9461', ink: '#0f100a' },
  Y2K: { label: 'Y2K', hint: t('Dosmil, brillo y baby tee'), color: '#ff5fd2', ink: '#16050f' },
  MINIMAL: { label: t('Minimal'), hint: t('Pocas piezas, bien hechas'), color: '#f2f0eb', ink: '#121212' },
  TRAP: { label: t('Trap'), hint: t('Chándal, joyas y actitud'), color: '#9b5cff', ink: '#ffffff' },
  LUXURY_STREETWEAR: { label: t('Luxury Street'), hint: t('Calle con precio de lujo'), color: '#e3b65a', ink: '#150f03' },
};

export const OUTFIT_STYLE_KEYS = Object.keys(OUTFIT_STYLES) as OutfitStyle[];
