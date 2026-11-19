import type { ButtonStyle, ColorSlot, DetailFont, DetailKind, DetailShape, MetalFinish, StitchStyle } from '../api/types';
import { t } from '../i18n';

/** Textos de la personalización (los mismos que en el backend). */
export const COLOR_SLOT_LABEL: Record<ColorSlot, string> = {
  buttons: t('Botones'),
  stitching: t('Pespuntes (costuras)'),
  zipper: t('Cremallera'),
  hardware: t('Herrajes (remaches, ojales, hebillas)'),
  trim: t('Ribetes (cuello, puños, cintura)'),
  lining: t('Forro'),
  secondary: t('Color secundario (paneles)'),
  sole: t('Suela'),
  laces: t('Cordones'),
  pattern: t('Estampado: color 1'),
  pattern2: t('Estampado: color 2'),
};

export const METAL_LABEL: Record<MetalFinish, string> = {
  silver: t('Plata'),
  gold: t('Dorado'),
  gunmetal: t('Pavonado'),
  brass: t('Latón'),
  copper: t('Cobre'),
  black: t('Negro mate'),
};

export const BUTTON_LABEL: Record<ButtonStyle, string> = {
  four_hole: t('Cuatro agujeros'),
  two_hole: t('Dos agujeros'),
  shank: t('De pie (metálico)'),
  snap: t('Automático (presión)'),
  toggle: t('Trenca (alamar)'),
  covered: t('Forrado de tela'),
};

export const STITCH_LABEL: Record<StitchStyle, string> = {
  single: t('Sencillo'),
  double: t('Doble'),
  none: t('Sin pespunte visible'),
};

export const DETAIL_KIND_LABEL: Record<DetailKind, string> = {
  patch: t('Parche'),
  embroidery: t('Bordado'),
  print: t('Estampado'),
  label: t('Etiqueta'),
  button: t('Botón'),
  rivet: t('Remache'),
  stud: t('Tachuela'),
  pin: t('Chapa'),
  pocket: t('Bolsillo de parche'),
  zipper: t('Cremallera decorativa'),
  drawing: t('Dibujo'),
};

/** Detalles que se colocan con un clic (el dibujo se hace con su propio modo). */
export const PLACEABLE_KINDS: DetailKind[] = ['patch', 'embroidery', 'print', 'label', 'button', 'rivet', 'stud', 'pin', 'pocket', 'zipper'];

export const DETAIL_SHAPE_LABEL: Record<DetailShape, string> = {
  cutout: t('Recortado (sin marco)'),
  rect: t('Rectangular'),
  rounded: t('Redondeada'),
  circle: t('Circular'),
  oval: t('Ovalada'),
  shield: t('Escudo'),
};

export const DETAIL_FONT_LABEL: Record<DetailFont, string> = {
  sans: t('Sans (moderna)'),
  serif: t('Serif (clásica)'),
  script: t('Caligráfica'),
  mono: t('Máquina de escribir'),
  college: t('Universitaria'),
};

/** Detalles que admiten texto o imagen. */
export const GRAPHIC_KINDS: DetailKind[] = ['patch', 'embroidery', 'print', 'label', 'pin'];

/** Lado mayor máximo (m): el dibujo puede cubrir media prenda; el resto, 50 cm. */
export const MAX_DETAIL_SIZE = 0.5;
export const MAX_DRAWING_SIZE = 1.0;

/** Tamaño inicial (metros) y colores por defecto de cada detalle nuevo. */
export const DETAIL_DEFAULTS: Record<DetailKind, { size: number; color: string; secondaryColor?: string; text?: string }> = {
  patch: { size: 0.07, color: '#1C1C1E', secondaryColor: '#E8E8E8', text: 'MYOO' },
  embroidery: { size: 0.05, color: '#E8E8E8', text: t('MyOO') },
  print: { size: 0.12, color: '#151517', text: 'MYOO' },
  label: { size: 0.035, color: '#151517', secondaryColor: '#E8E8E8', text: 'MO' },
  button: { size: 0.016, color: '#2E2E33' },
  rivet: { size: 0.007, color: '#B87333' },
  stud: { size: 0.008, color: '#CFCFD1' },
  pin: { size: 0.03, color: '#CFCFD1', secondaryColor: '#151517', text: '★' },
  pocket: { size: 0.12, color: '#8E8E93', secondaryColor: '#E8E8E8' },
  zipper: { size: 0.12, color: '#CFCFD1' },
  drawing: { size: 0.2, color: '#FFFFFF' },
};

export const MAX_DETAILS = 30;
