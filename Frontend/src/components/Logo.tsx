/**
 * Logo de MyOut: pieza de grafiti en cromo («my» en firma + «OUT» en letras
 * de burbuja, con la T hecha percha). Es un SVG estático en public/brand.
 */
const BASE = import.meta.env.BASE_URL;

export const LOGO_URL = `${BASE}brand/logo.svg`;
export const MARK_URL = `${BASE}brand/mark.svg`;

export function Logo({ className = '', decorative = false }: { className?: string; decorative?: boolean }) {
  return (
    <img
      className={`logo ${className}`}
      src={LOGO_URL}
      alt={decorative ? '' : 'MyOut'}
      width={1010}
      height={650}
      draggable={false}
      decoding="async"
    />
  );
}
