import type { OutfitStyle } from '../api/types';

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
  STREETWEAR: { label: 'Streetwear', hint: 'Sudadera, cargo y zapas', color: '#ff3b4a', ink: '#120708' },
  TECHWEAR: { label: 'Techwear', hint: 'Técnico, negro y funcional', color: '#c6ff2e', ink: '#0d1204' },
  OLD_MONEY: { label: 'Old Money', hint: 'Clásico y sin logos', color: '#e9dcc3', ink: '#17130c' },
  CASUAL: { label: 'Casual', hint: 'Lo de todos los días', color: '#bdbbb5', ink: '#121212' },
  SKATE: { label: 'Skate', hint: 'Ancho, gastado y cómodo', color: '#ff7a1a', ink: '#140a02' },
  GRUNGE: { label: 'Grunge', hint: 'Capas, cuadros y botas', color: '#8f9461', ink: '#0f100a' },
  Y2K: { label: 'Y2K', hint: 'Dosmil, brillo y baby tee', color: '#ff5fd2', ink: '#16050f' },
  MINIMAL: { label: 'Minimal', hint: 'Pocas piezas, bien hechas', color: '#f2f0eb', ink: '#121212' },
  TRAP: { label: 'Trap', hint: 'Chándal, joyas y actitud', color: '#9b5cff', ink: '#ffffff' },
  LUXURY_STREETWEAR: { label: 'Luxury Street', hint: 'Calle con precio de lujo', color: '#e3b65a', ink: '#150f03' },
};

export const OUTFIT_STYLE_KEYS = Object.keys(OUTFIT_STYLES) as OutfitStyle[];
