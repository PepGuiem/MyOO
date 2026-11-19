/**
 * Logo de MyOO: pieza de grafiti en cromo: «OO» en letras de burbuja que
 * gotean, con un aro de neón dentro, colgadas de un gancho de percha, y «MY»
 * en una pegatina naranja. Es un SVG estático en public/brand (mark.svg es el
 * icono: solo las dos O).
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
      width={936}
      height={781}
      draggable={false}
      decoding="async"
    />
  );
}
