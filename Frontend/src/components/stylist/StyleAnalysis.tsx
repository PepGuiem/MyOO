import { useEffect, useState, type CSSProperties } from 'react';
import { ratingsApi } from '../../api/endpoints';
import type { OutfitStyle, RatingCategory, RatingCheck, RatingResult, Season, Styling } from '../../api/types';
import { t } from '../../i18n';
import { OUTFIT_STYLES } from '../../lib/outfitStyles';
import { barTone, tierOf } from '../../lib/rating';
import { Icon, type IconName } from '../Icon';
import { ScoreRing } from '../rating/RatingGauge';

/** Estilos del estilista que tienen equivalente en la nota de outfits. */
const STYLE_TO_OUTFIT: Record<string, OutfitStyle> = {
  streetwear: 'STREETWEAR',
  minimalist: 'MINIMAL',
  old_money: 'OLD_MONEY',
  casual: 'CASUAL',
  y2k: 'Y2K',
};

export function seasonForWeather(weather: string): Season | undefined {
  return weather === 'hot' ? 'SUMMER' : weather === 'cold' ? 'WINTER' : undefined;
}

const METERS: { key: RatingCategory; label: string; icon: IconName }[] = [
  { key: 'colors', label: t('Color y compatibilidad'), icon: 'palette' },
  { key: 'balance', label: t('Equilibrio visual'), icon: 'scale' },
  { key: 'style', label: t('Adecuación al estilo'), icon: 'target' },
  { key: 'details', label: t('Detalles'), icon: 'gem' },
];

const OCCASION_CODES = ['style.occasion', 'style.occasion_off'];
const WEATHER_CODES = ['balance.season', 'balance.summer_layer', 'balance.winter_no_layer', 'balance.layer'];

/** Un color por nombre (el outfit puede repetir negro en varias prendas), con cuántas lo llevan. */
function uniquePalette(palette: { color: string; name: string }[]) {
  const out: { color: string; name: string; count: number }[] = [];
  for (const p of palette) {
    const hit = out.find((x) => x.name === p.name);
    if (hit) hit.count++;
    else out.push({ ...p, count: 1 });
  }
  return out;
}

/** La comprobación que mejor resume una categoría: el peor fallo o, si no hay, el mejor acierto. */
function headline(checks: RatingCheck[]): RatingCheck | null {
  const bad = checks.filter((c) => c.points < 0).sort((a, b) => a.points - b.points)[0];
  if (bad) return bad;
  return checks.filter((c) => c.points > 0).sort((a, b) => b.points - a.points)[0] ?? null;
}

/**
 * Análisis del outfit como el de un estilista: paleta, por qué combina, y
 * los indicadores de la nota automática (motor de reglas del backend) sobre
 * las prendas que lleva puestas ahora mismo el maniquí.
 */
export function StyleAnalysis({
  picks,
  palette,
  reasons,
  style,
  occasion,
  occasionLabel,
  weather,
  weatherLabel,
}: {
  picks: { itemId: string; styling?: Styling }[];
  palette: { color: string; name: string }[];
  reasons: string[];
  style: string;
  occasion: string;
  /** Texto de la ocasión en español (el motor la reconoce por el texto). */
  occasionLabel: string;
  weather: string;
  weatherLabel: string;
}) {
  const [rating, setRating] = useState<RatingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const key = picks.map((p) => `${p.itemId}:${JSON.stringify(p.styling ?? {})}`).join('|');

  // Se recalcula al cambiar las prendas o el contexto (con una pequeña espera).
  useEffect(() => {
    if (!picks.length) return;
    let alive = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      ratingsApi
        .preview({
          items: picks.map((p, i) => ({ wardrobeItemId: p.itemId, position: i, styling: p.styling })),
          style: STYLE_TO_OUTFIT[style] ?? null,
          occasion: occasion ? occasionLabel : null,
          season: seasonForWeather(weather) ?? null,
        })
        .then((r) => alive && setRating(r))
        .catch(() => alive && setRating(null))
        .finally(() => alive && setLoading(false));
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, style, occasion, weather]);

  const all = rating ? Object.values(rating.categories).flatMap((c) => c.checks) : [];
  const occ = all.find((c) => OCCASION_CODES.includes(c.code));
  const wea = all.filter((c) => WEATHER_CODES.includes(c.code)).sort((a, b) => a.points - b.points)[0];
  const tier = rating ? tierOf(rating.total) : null;
  const detected = rating?.detectedStyle ? OUTFIT_STYLES[rating.detectedStyle]?.label : null;

  return (
    <section className={`st-analysis${loading ? ' is-loading' : ''}`} aria-labelledby="st-analysis-title">
      <header className="st-analysis-head">
        <div>
          <p className="st-eyebrow">{t('Análisis de estilo')}</p>
          <h2 id="st-analysis-title">{t('Por qué funciona')}</h2>
        </div>
        <div className="st-score">
          <ScoreRing value={rating?.total} size={54} />
          {tier && (
            <span className="st-tier" style={{ '--c': tier.color } as CSSProperties}>
              {tier.label}
            </span>
          )}
        </div>
      </header>

      <div className="st-block">
        <span className="st-block-label">
          <Icon name="palette" size={13} /> {t('Paleta')}
        </span>
        <ul className="st-palette">
          {uniquePalette(palette).map((p, i) => (
            <li key={p.name} style={{ '--c': p.color, '--i': i } as CSSProperties} title={p.count > 1 ? t('{n} prendas', { n: p.count }) : undefined}>
              <span className="st-chip" aria-hidden="true">
                {p.count > 1 && <b>×{p.count}</b>}
              </span>
              <small>{t(p.name)}</small>
            </li>
          ))}
        </ul>
      </div>

      {reasons.length > 0 && (
        <div className="st-block">
          <span className="st-block-label">
            <Icon name="sparkles" size={13} /> {t('La combinación')}
          </span>
          <ul className="st-reasons">
            {reasons.slice(0, 4).map((r) => (
              <li key={r}>
                <Icon name="check" size={12} /> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="st-block">
        <span className="st-block-label">
          <Icon name="pulse" size={13} /> {t('Indicadores')}
          {detected && <em className="st-detected">{t('Estilo detectado: {style}', { style: detected })}</em>}
        </span>
        <ul className="st-meters">
          {METERS.map((m, i) => {
            const c = rating?.categories[m.key];
            const pct = c ? Math.max(0, Math.min(100, (c.score / c.max) * 100)) : 0;
            const h = c ? headline(c.checks) : null;
            return (
              <li key={m.key} className={c ? `tone-${barTone(c.score, c.max)}` : 'is-empty'} style={{ '--i': i } as CSSProperties}>
                <div className="st-meter-top">
                  <span>
                    <Icon name={m.icon} size={13} /> {m.label}
                  </span>
                  <b>{c ? `${c.score}/${c.max}` : '—'}</b>
                </div>
                <span className="st-bar" aria-hidden="true">
                  <i style={{ width: `${pct}%` }} />
                </span>
                {h && <small className={h.points < 0 ? 'is-bad' : undefined}>{h.text}</small>}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="st-fit">
        <FitTag
          icon="pin"
          label={t('Ocasión')}
          state={!occasion ? 'none' : occ ? (occ.points < 0 ? 'bad' : 'ok') : 'neutral'}
          text={
            !occasion
              ? t('Elige una ocasión para valorarla')
              : occ
                ? occ.text
                : t('Nada que objetar para «{occasion}».', { occasion: t(occasionLabel) })
          }
        />
        <FitTag
          icon="sun"
          label={t('Tiempo')}
          state={!weather ? 'none' : wea ? (wea.points < 0 ? 'bad' : 'ok') : 'ok'}
          text={!weather ? t('Elige el tiempo para valorarlo') : wea ? wea.text : t('Sin choques con «{weather}».', { weather: weatherLabel })}
        />
      </div>
    </section>
  );
}

function FitTag({ icon, label, state, text }: { icon: IconName; label: string; state: 'ok' | 'bad' | 'neutral' | 'none'; text: string }) {
  return (
    <div className={`st-fit-tag is-${state}`}>
      <span className="st-fit-icon">
        <Icon name={state === 'bad' ? 'flag' : state === 'ok' ? 'check' : icon} size={13} />
      </span>
      <div>
        <strong>{label}</strong>
        <small>{text}</small>
      </div>
    </div>
  );
}
