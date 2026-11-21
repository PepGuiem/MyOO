/**
 * Logo de MyOO: throw-up de grafiti, «MYOO» en letras de burbuja cromadas
 * que gotean, con borde naranja-rojo. Es un SVG estático en public/brand
 * (mark.svg es el icono: solo las dos O, en el mismo estilo).
 * El borde y el halo toman el color neón de «Personalizar» (lib/brandColors).
 */
import { useEffect } from 'react';
import { useBrandSvg } from '../lib/brandColors';

const BASE = import.meta.env.BASE_URL;

export const LOGO_URL = `${BASE}brand/logo.svg`;
export const MARK_URL = `${BASE}brand/mark.svg`;

export function Logo({ className = '', decorative = false }: { className?: string; decorative?: boolean }) {
  const src = useBrandSvg(LOGO_URL);
  return (
    <img
      className={`logo ${className}`}
      src={src}
      alt={decorative ? '' : 'MyOO'}
      width={944}
      height={451}
      draggable={false}
      decoding="async"
    />
  );
}

/**
 * Icono de la pestaña con el color neón elegido (los <link rel="icon"> de
 * index.html). Con el naranja de siempre se dejan los archivos originales.
 */
export function BrandFavicon() {
  const href = useBrandSvg(MARK_URL);
  useEffect(() => {
    const links = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]');
    links.forEach((l) => {
      if (!l.dataset.href) {
        l.dataset.href = l.getAttribute('href') ?? '';
        l.dataset.type = l.getAttribute('type') ?? '';
      }
      if (href === MARK_URL) {
        l.setAttribute('href', l.dataset.href);
        if (l.dataset.type) l.setAttribute('type', l.dataset.type);
      } else {
        l.setAttribute('href', href);
        l.setAttribute('type', 'image/svg+xml');
      }
    });
  }, [href]);
  return null;
}
