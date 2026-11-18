import type { Outfit } from '../../api/types';
import { slotOf } from '../../lib/wardrobeSlots';
import { t } from '../../i18n';

const SKIN = '#9b968f';
const EDGE = 'rgba(0,0,0,0.55)';

/**
 * Miniatura plana de un outfit: una figura pintada con el color de cada
 * prenda en su sitio (gorra, parte de arriba, capa, abajo, calzado...).
 * Es ligera (SVG), así que el mes entero puede llevar una en cada día; la
 * vista 3D se reserva para la semana, el día y el detalle.
 */
export function OutfitGlyph({ outfit, height = 64, className = '' }: { outfit: Outfit; height?: number; className?: string }) {
  const items = outfit.items.map((i) => i.wardrobeItem);
  const pick = (slot: ReturnType<typeof slotOf>) => items.filter((i) => slotOf(i) === slot);
  const top = pick('top');
  const outer = pick('outer')[0];
  const full = pick('full')[0];
  const bottom = pick('bottom')[0];
  const shoes = pick('shoes')[0];
  const head = pick('head')[0];
  const acc = pick('acc');
  const scarf = acc.find((a) => a.garmentType.modelKey === 'scarf');
  const bag = acc.find((a) => a.garmentType.modelKey !== 'scarf');
  const upper = top[top.length - 1] ?? top[0];
  const key = bottom?.garmentType.modelKey;
  const shortLegs = key === 'shorts';
  const skirt = key === 'skirt';

  return (
    <svg
      className={`outfit-glyph ${className}`}
      viewBox="0 0 40 90"
      height={height}
      width={(height * 40) / 90}
      role="img"
      aria-label={t('Miniatura de {name}', { name: outfit.name })}
      strokeLinejoin="round"
    >
      {/* Piernas y brazos (la base del maniquí) */}
      <rect x="12.5" y="44" width="6.5" height="38" rx="2.5" fill={SKIN} />
      <rect x="21" y="44" width="6.5" height="38" rx="2.5" fill={SKIN} />
      <rect x="5.5" y="19" width="5" height="24" rx="2.4" fill={SKIN} />
      <rect x="29.5" y="19" width="5" height="24" rx="2.4" fill={SKIN} />
      <rect x="11" y="17" width="18" height="29" rx="3" fill={SKIN} />

      {/* Abajo */}
      {bottom && !full &&
        (skirt ? (
          <path d="M11.5 44h17l3 22h-23z" fill={bottom.color} stroke={EDGE} strokeWidth="0.6" />
        ) : (
          <g fill={bottom.color} stroke={EDGE} strokeWidth="0.6">
            <rect x="11.8" y="43" width="8" height={shortLegs ? 16 : 39} rx="2" />
            <rect x="20.2" y="43" width="8" height={shortLegs ? 16 : 39} rx="2" />
          </g>
        ))}

      {/* Vestido o mono */}
      {full && <path d="M12 17h16l5 50H7z" fill={full.color} stroke={EDGE} strokeWidth="0.6" />}

      {/* Arriba (con mangas) */}
      {upper && !full && (
        <g fill={upper.color} stroke={EDGE} strokeWidth="0.6">
          <rect x="5" y="18" width="6" height="18" rx="2.6" />
          <rect x="29" y="18" width="6" height="18" rx="2.6" />
          <rect x="10.5" y="16.5" width="19" height="30" rx="3.2" />
        </g>
      )}

      {/* Capa exterior: abierta por delante */}
      {outer && (
        <g fill={outer.color} stroke={EDGE} strokeWidth="0.6">
          <rect x="4.3" y="17.5" width="6.8" height="25" rx="2.8" />
          <rect x="28.9" y="17.5" width="6.8" height="25" rx="2.8" />
          <path d="M10 16.5h7.5v33H10z" />
          <path d="M22.5 16.5H30v33h-7.5z" />
        </g>
      )}

      {/* Bufanda */}
      {scarf && <path d="M13 15.5h14v4H13zM22 18.5h4v12h-4z" fill={scarf.color} stroke={EDGE} strokeWidth="0.5" />}

      {/* Cabeza y gorra/gorro */}
      <circle cx="20" cy="9" r="5.6" fill={SKIN} />
      {head &&
        (head.garmentType.modelKey === 'beanie' ? (
          <path d="M14.2 9a5.8 5.8 0 0 1 11.6 0z" fill={head.color} stroke={EDGE} strokeWidth="0.6" />
        ) : (
          <g fill={head.color} stroke={EDGE} strokeWidth="0.6">
            <path d="M14.4 8.6a5.6 5.6 0 0 1 11.2 0z" />
            <path d="M24.5 8.4h6.5c0 1.2-1 1.8-2.4 1.8h-4.1z" />
          </g>
        ))}

      {/* Calzado */}
      {shoes && (
        <g fill={shoes.color} stroke={EDGE} strokeWidth="0.6">
          <path d={shoes.garmentType.modelKey === 'boots' ? 'M11.5 76h8v7.5h-10z' : 'M11.5 80h8v4h-10z'} />
          <path d={shoes.garmentType.modelKey === 'boots' ? 'M20.5 76h8l2 7.5h-10z' : 'M20.5 80h8l2 4h-10z'} />
        </g>
      )}

      {/* Bolso u otro complemento */}
      {bag && <rect x="31" y="38" width="6" height="7" rx="1.2" fill={bag.color} stroke={EDGE} strokeWidth="0.6" />}
    </svg>
  );
}
