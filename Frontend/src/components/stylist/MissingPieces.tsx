import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { wishlistApi } from '../../api/endpoints';
import type { StylistInsights, StylistSuggestion } from '../../api/types';
import { t, tn } from '../../i18n';
import { burstAt } from '../../lib/motion';
import { CountUp } from '../street/Street';
import { useToast } from '../fx/Toast';
import { Icon, type IconName } from '../Icon';

type Insight = StylistInsights['insights'][number];

/** Nombre de la prenda sugerida para cada aviso del motor. */
const PIECE_NAME: Record<string, string> = {
  no_shoes: t('Calzado básico'),
  neutral_shoes: t('Zapatillas blancas o negras'),
  no_tops: t('Camiseta básica'),
  basic_tee: t('Camiseta básica neutra'),
  no_bottoms: t('Pantalón o falda'),
  more_bottoms: t('Otro pantalón'),
  no_outerwear: t('Chaqueta ligera'),
  no_coat: t('Abrigo recto'),
  smart_piece: t('Americana o camisa'),
  no_accessory: t('Gorra, gorro o bufanda'),
  add_color: t('Una prenda de color'),
  add_neutrals: t('Básicos neutros'),
};

const SLOT_ICON: Record<StylistSuggestion['slot'], IconName> = {
  top: 'tshirt',
  bottom: 'pants',
  shoes: 'shoe',
  outer: 'jacket',
  accessory: 'cap',
};

const PRIORITY: Record<1 | 2 | 3, string> = {
  1: t('Imprescindible'),
  2: t('Recomendable'),
  3: t('Extra'),
};

/** Con qué prendas tuyas se combinaría (recuento real por categoría). */
function pairsWith(slot: StylistSuggestion['slot'], by: Record<string, number>): string | null {
  const tops = by.TOP ?? 0;
  const bottoms = by.BOTTOM ?? 0;
  if (slot === 'bottom') return tops ? tn(tops, 'Combina con tu parte de arriba', 'Combina con tus {n} partes de arriba') : null;
  if (slot === 'top') return bottoms ? tn(bottoms, 'Combina con tu prenda de abajo', 'Combina con tus {n} prendas de abajo') : null;
  if (slot === 'shoes') return tops + bottoms ? t('Cierra los outfits de tus {n} prendas', { n: tops + bottoms }) : null;
  if (slot === 'outer') return tops ? t('Va encima de tus {n} partes de arriba', { n: tops }) : null;
  return null;
}

/**
 * «Le falta a tu armario»: avisos del motor con la prenda que los resolvería,
 * su prioridad y lo que ganaría tu armario (combinaciones posibles antes y
 * después, contadas con tus prendas). Se pueden llevar a la wishlist.
 */
export function MissingPieces({ data }: { data: StylistInsights }) {
  const toast = useToast();
  const [added, setAdded] = useState<Record<string, 'busy' | 'done'>>({});
  const pieces = data.insights.filter((i) => i.suggestion && PIECE_NAME[i.code]).slice(0, 6);
  const notes = data.insights.filter((i) => !i.suggestion || !PIECE_NAME[i.code]).slice(0, 4);
  const combos = data.stats.combinations;

  async function toWishlist(ins: Insight, el: HTMLElement) {
    const sug = ins.suggestion;
    if (!sug || added[ins.code]) return;
    setAdded((a) => ({ ...a, [ins.code]: 'busy' }));
    try {
      await wishlistApi.create({
        name: PIECE_NAME[ins.code].slice(0, 80),
        category: sug.wishlistCategory,
        color: sug.color,
        status: 'WANT',
        notes: ins.text.slice(0, 500),
      });
      setAdded((a) => ({ ...a, [ins.code]: 'done' }));
      burstAt(el, { count: 12, spread: 50 });
      toast.show(t('«{name}» en tu wishlist', { name: PIECE_NAME[ins.code] }), { tone: 'ok', icon: 'heart', sound: 'success' });
    } catch {
      setAdded((a) => {
        const next = { ...a };
        delete next[ins.code];
        return next;
      });
      toast.show(t('No se ha podido añadir a la wishlist.'), { tone: 'danger' });
    }
  }

  if (!pieces.length && !notes.length) return null;

  return (
    <section className="st-missing" aria-labelledby="st-missing-title">
      <header className="st-missing-head">
        <div>
          <p className="st-eyebrow">{t('Wardrobe check')}</p>
          <h2 id="st-missing-title" className="st-h2">
            {t('Le falta a tu armario')}
          </h2>
        </div>
        {typeof combos === 'number' && (
          <div className="st-combos" title={t('Parte de arriba + abajo (o vestido) + calzado, con o sin una prenda de abrigo encima')}>
            <strong>
              <CountUp value={combos} />
            </strong>
            <span>{t('outfits completos posibles hoy')}</span>
          </div>
        )}
      </header>

      {pieces.length > 0 && (
        <ul className="st-pieces-grid">
          {pieces.map((ins, i) => {
            const sug = ins.suggestion!;
            const gain = sug.gain;
            const more = gain ? gain.after - gain.before : 0;
            const pct = gain && gain.before > 0 ? Math.round((more / gain.before) * 100) : null;
            const pairs = pairsWith(sug.slot, data.stats.byCategory);
            const state = added[ins.code];
            return (
              <li key={ins.code} className={`st-miss p${ins.priority}`} style={{ '--i': i, '--c': sug.color } as CSSProperties}>
                <div className="st-miss-top">
                  <span className="st-miss-art" aria-hidden="true">
                    <Icon name={SLOT_ICON[sug.slot]} size={30} />
                  </span>
                  <span className={`st-prio p${ins.priority}`}>{PRIORITY[ins.priority]}</span>
                </div>
                <h3>{PIECE_NAME[ins.code]}</h3>
                <p>{ins.text}</p>
                {gain && more > 0 && (
                  <div className="st-gain">
                    <div className="st-gain-row">
                      <span>{t('Versatilidad')}</span>
                      <b>{pct !== null ? `+${pct}%` : t('Desbloquea')}</b>
                    </div>
                    <span className="st-gain-bar" aria-hidden="true">
                      <i className="before" style={{ width: `${gain.after ? (gain.before / gain.after) * 100 : 0}%` }} />
                      <i className="after" />
                    </span>
                    <small>{tn(more, '+{n} outfit completo nuevo', '+{n} outfits completos nuevos')}</small>
                  </div>
                )}
                {pairs && (
                  <small className="st-pairs">
                    <Icon name="layers" size={12} /> {pairs}
                  </small>
                )}
                {state === 'done' ? (
                  <Link to="/wishlist" className="btn st-btn-line st-miss-btn is-done">
                    <Icon name="check" size={13} /> {t('En tu wishlist')}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="btn st-btn-line st-miss-btn"
                    disabled={state === 'busy'}
                    onClick={(e) => void toWishlist(ins, e.currentTarget)}
                  >
                    <Icon name="heart" size={13} /> {state === 'busy' ? t('Añadiendo…') : t('Añadir a la wishlist')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {notes.length > 0 && (
        <div className="tape-notes st-tape-notes">
          {notes.map((n, i) => (
            <p key={n.code} className={`tape-note p${n.priority}`} style={{ ['--tilt' as string]: `${((i * 37) % 7) - 3}deg` }}>
              {n.text}
            </p>
          ))}
        </div>
      )}

      {data.stats.styles.length > 0 && (
        <p className="muted small st-summary">
          {t('Tu armario es sobre todo: {styles}. Colores que más tienes: {colors}.', {
            styles: data.stats.styles
              .slice(0, 3)
              .map((s) => t(s.label).toLowerCase())
              .join(', '),
            colors: data.stats.topColors
              .slice(0, 3)
              .map((c) => t(c.name))
              .join(', '),
          })}
        </p>
      )}
    </section>
  );
}
