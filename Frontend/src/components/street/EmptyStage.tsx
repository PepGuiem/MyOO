import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from '../Icon';

export type EmptyPiece = { icon: IconName; x: number; y: number; r: number; d: number };

/** Piezas flotando alrededor del centro (las mismas posiciones que el armario). */
const SPOTS: Omit<EmptyPiece, 'icon'>[] = [
  { x: 14, y: 22, r: -12, d: 0 },
  { x: 78, y: 16, r: 14, d: 0.6 },
  { x: 84, y: 66, r: -8, d: 1.2 },
  { x: 10, y: 70, r: 10, d: 0.3 },
  { x: 60, y: 82, r: 6, d: 0.9 },
  { x: 34, y: 86, r: -6, d: 1.5 },
];

/**
 * Estado vacío con la composición del armario: aro de neón, barra, icono
 * central meciéndose y piezas flotando; debajo, pegatina, título grande,
 * texto y la acción principal. Reutiliza las clases `.wd-empty-*`.
 */
export function EmptyStage({
  icon,
  pieces,
  kicker,
  kickerIcon = 'sparkles',
  title,
  text,
  children,
  className = '',
}: {
  icon: IconName;
  pieces: IconName[];
  kicker: string;
  kickerIcon?: IconName;
  title: string;
  text: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`wd-empty ux-empty ${className}`}>
      <div className="wd-empty-art" aria-hidden="true">
        <span className="wd-empty-ring" />
        <span className="wd-empty-rail" />
        <span className="wd-empty-hanger">
          <Icon name={icon} size={88} />
        </span>
        {pieces.slice(0, SPOTS.length).map((p, i) => {
          const s = SPOTS[i];
          return (
            <span
              key={i}
              className="wd-empty-piece"
              style={{ left: `${s.x}%`, top: `${s.y}%`, '--r': `${s.r}deg`, '--d': `${s.d}s` } as CSSProperties}
            >
              <Icon name={p} size={30} />
            </span>
          );
        })}
      </div>
      <span className="wd-kicker">
        <Icon name={kickerIcon} size={12} /> {kicker}
      </span>
      <h2 className="wd-empty-title">{title}</h2>
      <p className="muted">{text}</p>
      {children}
    </div>
  );
}

/** Sin resultados para los filtros: icono, título y cómo salir. */
export function NoMatch({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="wd-nomatch ux-nomatch">
      <Icon name="search" size={28} />
      <h2>{title}</h2>
      <p className="muted">{text}</p>
      {children}
    </div>
  );
}
