import type { ButtonStyle, ColorSlot, DetailFont, DetailKind, DetailShape, MetalFinish, StitchStyle } from '../api/types';

/** Textos de la personalización (los mismos que en el backend). */
export const COLOR_SLOT_LABEL: Record<ColorSlot, string> = {
  buttons: 'Botones',
  stitching: 'Pespuntes (costuras)',
  zipper: 'Cremallera',
  hardware: 'Herrajes (remaches, ojales, hebillas)',
  trim: 'Ribetes (cuello, puños, cintura)',
  lining: 'Forro',
  secondary: 'Color secundario (paneles)',
  sole: 'Suela',
  laces: 'Cordones',
  pattern: 'Estampado: color 1',
  pattern2: 'Estampado: color 2',
};

export const METAL_LABEL: Record<MetalFinish, string> = {
  silver: 'Plata',
  gold: 'Dorado',
  gunmetal: 'Pavonado',
  brass: 'Latón',
  copper: 'Cobre',
  black: 'Negro mate',
};

export const BUTTON_LABEL: Record<ButtonStyle, string> = {
  four_hole: 'Cuatro agujeros',
  two_hole: 'Dos agujeros',
  shank: 'De pie (metálico)',
  snap: 'Automático (presión)',
  toggle: 'Trenca (alamar)',
  covered: 'Forrado de tela',
};

export const STITCH_LABEL: Record<StitchStyle, string> = {
  single: 'Sencillo',
  double: 'Doble',
  none: 'Sin pespunte visible',
};

export const DETAIL_KIND_LABEL: Record<DetailKind, string> = {
  patch: 'Parche',
  embroidery: 'Bordado',
  print: 'Estampado',
  label: 'Etiqueta',
  button: 'Botón',
  rivet: 'Remache',
  stud: 'Tachuela',
  pin: 'Chapa',
  pocket: 'Bolsillo de parche',
  zipper: 'Cremallera decorativa',
  drawing: 'Dibujo',
};

/** Detalles que se colocan con un clic (el dibujo se hace con su propio modo). */
export const PLACEABLE_KINDS: DetailKind[] = ['patch', 'embroidery', 'print', 'label', 'button', 'rivet', 'stud', 'pin', 'pocket', 'zipper'];

export const DETAIL_SHAPE_LABEL: Record<DetailShape, string> = {
  cutout: 'Recortado (sin marco)',
  rect: 'Rectangular',
  rounded: 'Redondeada',
  circle: 'Circular',
  oval: 'Ovalada',
  shield: 'Escudo',
};

export const DETAIL_FONT_LABEL: Record<DetailFont, string> = {
  sans: 'Sans (moderna)',
  serif: 'Serif (clásica)',
  script: 'Caligráfica',
  mono: 'Máquina de escribir',
  college: 'Universitaria',
};

/** Detalles que admiten texto o imagen. */
export const GRAPHIC_KINDS: DetailKind[] = ['patch', 'embroidery', 'print', 'label', 'pin'];

/** Lado mayor máximo (m): el dibujo puede cubrir media prenda; el resto, 50 cm. */
export const MAX_DETAIL_SIZE = 0.5;
export const MAX_DRAWING_SIZE = 1.0;

/** Tamaño inicial (metros) y colores por defecto de cada detalle nuevo. */
export const DETAIL_DEFAULTS: Record<DetailKind, { size: number; color: string; secondaryColor?: string; text?: string }> = {
  patch: { size: 0.07, color: '#1C1C1E', secondaryColor: '#E8E8E8', text: 'MYOUT' },
  embroidery: { size: 0.05, color: '#E8E8E8', text: 'MyOut' },
  print: { size: 0.12, color: '#151517', text: 'MYOUT' },
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
