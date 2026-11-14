import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { SneakerStats } from '../../api/types';
import { CONDITION } from '../../lib/sneakers';
import { money } from '../../lib/wishlist';
import { BarRow } from '../analytics/Charts';
import { Icon } from '../Icon';
import { CountUp } from '../street/Street';
import { LOCALE_TAG } from '../../i18n';

/**
 * Dashboard de SNEAKER COLLECTION. Todo sale de tus pares, tus outfits
 * guardados y los días del calendario: sin datos, se dice y no se rellena.
 * Las barras son de un solo color (la marca o el estado van escritos al lado).
 */
export function SneakerDashboard({ stats: s }: { stats: SneakerStats }) {
  if (s.total === 0) {
    return (
      <div className="fits-empty snk-empty">
        <span className="fits-empty-tag">Sin datos todavía</span>
        <p>Cuando añadas zapatillas a tu colección, aquí verás tus marcas, colores, gasto y cuáles combinan con más outfits.</p>
      </div>
    );
  }
  const maxBrand = Math.max(...s.byBrand.map((b) => b.count), 1);
  const maxCond = Math.max(...s.byCondition.map((c) => c.count), 1);
  const maxCombo = Math.max(...s.combos.map((c) => c.outfits), 1);

  return (
    <div className="snk-dash">
      <dl className="snk-kpis">
        <div className="snk-kpi is-hero" style={{ '--i': 0 } as CSSProperties}>
          <dt>Pares en la colección</dt>
          <dd>
            <CountUp value={s.total} />
          </dd>
          <span>
            {s.totalUses} {s.totalUses === 1 ? 'uso' : 'usos'} en total
            {s.wishlist.count > 0 && ` · ${s.wishlist.count} en la wishlist`}
          </span>
        </div>
        <div className="snk-kpi" style={{ '--i': 1 } as CSSProperties}>
          <dt>Marca más repetida</dt>
          <dd className="is-text">{!s.topBrand ? '—' : s.topBrand.tie > 1 ? 'Empate' : s.topBrand.label}</dd>
          <span>
            {!s.topBrand
              ? ''
              : s.topBrand.tie > 1
                ? `${s.topBrand.tie} marcas con ${s.topBrand.count} ${s.topBrand.count === 1 ? 'par' : 'pares'}`
                : `${s.topBrand.count} ${s.topBrand.count === 1 ? 'par' : 'pares'} · ${s.topBrand.share.toLocaleString(LOCALE_TAG)} %`}
          </span>
        </div>
        <div className="snk-kpi" style={{ '--i': 2 } as CSSProperties}>
          <dt>Color predominante</dt>
          <dd className="is-text">
            {s.topColor && s.topColor.tie === 1 && <i className="snk-kpi-swatch" style={{ background: s.topColor.hex }} aria-hidden="true" />}
            <span className="cap">{!s.topColor ? '—' : s.topColor.tie > 1 ? 'Empate' : s.topColor.name}</span>
          </dd>
          <span>
            {!s.topColor
              ? ''
              : s.topColor.tie > 1
                ? `${s.colors.slice(0, s.topColor.tie).map((c) => c.name).join(', ')}: ${s.topColor.count} ${s.topColor.count === 1 ? 'par' : 'pares'} cada uno`
                : `${s.topColor.count} de ${s.total} pares`}
          </span>
        </div>
        <div className="snk-kpi" style={{ '--i': 3 } as CSSProperties}>
          <dt>Precio total de adquisición</dt>
          <dd className="is-text">{s.spent.length ? money(s.spent[0].total, s.spent[0].currency) : '—'}</dd>
          <span>
            {s.spent.slice(1).map((m) => `+ ${money(m.total, m.currency)}`).join(' ')}
            {s.unpriced > 0 && ` ${s.spent.length > 1 ? '· ' : ''}${s.unpriced} sin precio`}
          </span>
        </div>
        <div className="snk-kpi" style={{ '--i': 4 } as CSSProperties}>
          <dt>Modelo más utilizado</dt>
          <dd className="is-text">{s.topModel ? `${s.topModel.label} ${s.topModel.model}` : '—'}</dd>
          <span>{s.topModel ? `${s.topModel.uses} usos${s.topModel.pairs > 1 ? ` · ${s.topModel.pairs} pares` : ''}` : 'Apunta usos para verlo'}</span>
        </div>
        <div className="snk-kpi" style={{ '--i': 5 } as CSSProperties}>
          <dt>Menos utilizada</dt>
          <dd className="is-text">
            {s.leastUsed ? (
              <Link to={`/sneakers/${s.leastUsed.id}`}>
                {s.leastUsed.label} {s.leastUsed.model}
              </Link>
            ) : (
              '—'
            )}
          </dd>
          <span>{s.leastUsed ? (s.leastUsed.uses === 0 ? 'Sin estrenar todavía' : `${s.leastUsed.uses} ${s.leastUsed.uses === 1 ? 'uso' : 'usos'}`) : ''}</span>
        </div>
      </dl>

      <div className="snk-dash-grid">
        <section className="snk-panel" aria-labelledby="snk-brands-h">
          <h2 id="snk-brands-h">Distribución por marcas</h2>
          <ul className="bar-list">
            {s.byBrand.map((b, i) => (
              <BarRow
                key={b.brand}
                index={i}
                label={b.label}
                share={(b.count / maxBrand) * 100}
                fill="var(--fx-bone)"
                value={
                  <>
                    {b.count} <small>{b.share.toLocaleString(LOCALE_TAG)} %</small>
                  </>
                }
              />
            ))}
          </ul>
          {s.brands.some((b) => b.brand === 'OTHER') && (
            <p className="snk-panel-note">
              En «Otras»: {s.brands.filter((b) => b.brand === 'OTHER').map((b) => `${b.label} (${b.count})`).join(', ')}.
            </p>
          )}
        </section>

        <section className="snk-panel" aria-labelledby="snk-combos-h">
          <h2 id="snk-combos-h">Las que combinan con más outfits</h2>
          {s.combos.length === 0 ? (
            <p className="snk-panel-note">Todavía no hay outfits guardados con tus zapatillas. Crea alguno en el vestidor y aquí verás cuáles combinan más.</p>
          ) : (
            <ol className="snk-combos">
              {s.combos.map((c, i) => (
                <li key={c.id} style={{ '--i': i, '--sw': c.color, '--w': `${(c.outfits / maxCombo) * 100}%` } as CSSProperties}>
                  <span className="snk-combo-rank">{String(i + 1).padStart(2, '0')}</span>
                  <i className="snk-swatch" aria-hidden="true" />
                  <span className="snk-combo-name">
                    <Link to={`/sneakers/${c.id}`}>
                      {c.label} {c.model}
                    </Link>
                    <small>
                      {c.outfits} {c.outfits === 1 ? 'outfit' : 'outfits'} · con {c.partners} {c.partners === 1 ? 'prenda distinta' : 'prendas distintas'}
                    </small>
                    <span className="snk-combo-bar" aria-hidden="true" />
                  </span>
                  <Link to={`/outfits?item=${c.id}`} className="snk-combo-go" title="Ver esos outfits">
                    <Icon name="forward" size={14} />
                    <span className="visually-hidden">Ver outfits con {c.model}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {s.neverCombined > 0 && (
            <p className="snk-panel-note">
              {s.neverCombined} {s.neverCombined === 1 ? 'par no sale' : 'pares no salen'} en ningún outfit guardado.
            </p>
          )}
        </section>

        <section className="snk-panel" aria-labelledby="snk-colors-h">
          <h2 id="snk-colors-h">Colores</h2>
          <ul className="snk-colors">
            {s.colors.slice(0, 10).map((c, i) => (
              <li key={c.name} style={{ '--i': i } as CSSProperties}>
                <i style={{ background: c.hex }} aria-hidden="true" />
                <span className="cap">{c.name}</span>
                <b>{c.count}</b>
              </li>
            ))}
          </ul>
        </section>

        <section className="snk-panel" aria-labelledby="snk-cond-h">
          <h2 id="snk-cond-h">Estado de conservación</h2>
          <ul className="bar-list">
            {s.byCondition.map((c, i) => (
              <BarRow key={c.condition} index={i} label={CONDITION[c.condition].label} share={(c.count / maxCond) * 100} fill="#8c8a85" value={c.count} />
            ))}
          </ul>
          {s.wishlist.count > 0 && (
            <p className="snk-panel-note">
              <Icon name="heart" size={12} /> Wishlist: {s.wishlist.count} {s.wishlist.count === 1 ? 'par' : 'pares'}
              {s.wishlist.value.length > 0 && ` · ${s.wishlist.value.map((v) => money(v.total, v.currency)).join(' + ')}`}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
