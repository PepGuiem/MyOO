/**
 * Logo de MyOO: throw-up de grafiti, «MYOO» en letras de burbuja cromadas
 * que gotean, con borde naranja-rojo. Es un SVG estático en public/brand
 * (mark.svg es el icono: solo las dos O, en el mismo estilo).
 */
const BASE = import.meta.env.BASE_URL;

export const LOGO_URL = `${BASE}brand/logo.svg`;
export const MARK_URL = `${BASE}brand/mark.svg`;

export function Logo({ className = '', decorative = false }: { className?: string; decorative?: boolean }) {
  return (
    <img
      className={`logo ${className}`}
      src={LOGO_URL}
      alt={decorative ? '' : 'MyOO'}
      width={944}
      height={451}
      draggable={false}
      decoding="async"
    />
  );
}
