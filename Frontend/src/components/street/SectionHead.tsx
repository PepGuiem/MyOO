import type { ReactNode } from 'react';

/** Cabecera de sección numerada (la del inicio): pegatina naranja, título y línea roja. */
export function SectionHead({ n, title, id, children }: { n: number; title: string; id?: string; children?: ReactNode }) {
  return (
    <div className="hm-section-head">
      <span className="hm-section-n" aria-hidden="true">
        {String(n).padStart(2, '0')}
      </span>
      <h2 id={id}>{title}</h2>
      {children}
    </div>
  );
}
