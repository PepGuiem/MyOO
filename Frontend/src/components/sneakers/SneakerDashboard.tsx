import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { SneakerStats } from '../../api/types';
import { CONDITION } from '../../lib/sneakers';
import { money } from '../../lib/wishlist';
import { BarRow } from '../analytics/Charts';
import { Icon } from '../Icon';
import { CountUp } from '../street/Street';
import { LOCALE_TAG, t, tn } from '../../i18n';

/**
 * Dashboard de SNEAKER COLLECTION. Todo sale de tus pares, tus outfits
 * guardados y los días del calendario: sin datos, se dice y no se rellena.
 * Las barras son de un solo color (la marca o el estado van escritos al lado).
 */
export function SneakerDashboard({ stats: s }: { stats: SneakerStats }) {
  if (s.total === 0) {
    return (
      <div className="fits-empty snk-empty">
        <span className="fits-empty-tag">{t('Sin datos todavía')}</span>
        <p>{t('Cuando añadas zapatillas a tu colección, aquí verás tus marcas, colores, gasto y cuáles combinan con más outfits.')}</p>
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
          <dt>{t('Pares en la colección')}</dt>
          <dd>
            <CountUp value={s.total} />
          </dd>
          <span>
            {t('{totalUses} {v} en total{v2}', { totalUses: s.totalUses, v: s.totalUses === 1 ? t('uso') : t('usos'), v2: s.wishlist.count > 0 && t(' · {count} en la wishlist', { count: s.wishlist.count }) })}
          </span>
        </div>
        <div className="snk-kpi" style={{ '--i': 1 } as CSSProperties}>
          <dt>{t('Marca más repetida')}</dt>
          <dd className="is-text">{!s.topBrand ? '—' : s.topBrand.tie > 1 ? t('Empate') : s.topBrand.label}</dd>
          <span>
            {!s.topBrand
              ? ''
              : s.topBrand.tie > 1
                ? t('{tie} marcas con {count} {v}', { tie: s.topBrand.tie, count: s.topBrand.count, v: s.topBrand.count === 1 ? t('par') : t('pares') })
                : `${tn(s.topBrand.count, '{n} par', '{n} pares')} · ${s.topBrand.share.toLocaleString(LOCALE_TAG)} %`}
          </span>
        </div>
        <div className="snk-kpi" style={{ '--i': 2 } as CSSProperties}>
          <dt>{t('Color predominante')}</dt>
          <dd className="is-text">
            {s.topColor && s.topColor.tie === 1 && <i className="snk-kpi-swatch" style={{ background: s.topColor.hex }} aria-hidden="true" />}
            <span className="cap">{!s.topColor ? '—' : s.topColor.tie > 1 ? t('Empate') : s.topColor.name}</span>
          </dd>
          <span>
            {!s.topColor
              ? ''
              : s.topColor.tie > 1
                ? t('{join}: {count} {v} cada uno', { join: s.colors.slice(0, s.topColor.tie).map((c) => c.name).join(', '), count: s.topColor.count, v: s.topColor.count === 1 ? t('par') : t('pares') })
                : t('{count} de {total} pares', { count: s.topColor.count, total: s.total })}
          </span>
        </div>
        <div className="snk-kpi" style={{ '--i': 3 } as CSSProperties}>
          <dt>{t('Precio total de adquisición')}</dt>
          <dd className="is-text">{s.spent.length ? money(s.spent[0].total, s.spent[0].currency) : '—'}</dd>
          <span>
            {s.spent.slice(1).map((m) => `+ ${money(m.total, m.currency)}`).join(' ')}
            {s.unpriced > 0 && t(' {v}{unpriced} sin precio', { v: s.spent.length > 1 ? '· ' : '', unpriced: s.unpriced })}
          </span>
        </div>
        <div className="snk-kpi" style={{ '--i': 4 } as CSSProperties}>
          <dt>{t('Modelo más utilizado')}</dt>
          <dd className="is-text">{s.topModel ? `${s.topModel.label} ${s.topModel.model}` : '—'}</dd>
          <span>{s.topModel ? `${s.topModel.uses} usos${s.topModel.pairs > 1 ? ` · ${s.topModel.pairs} pares` : ''}` : t('Apunta usos para verlo')}</span>
        </div>
        <div className="snk-kpi" style={{ '--i': 5 } as CSSProperties}>
          <dt>{t('Menos utilizada')}</dt>
          <dd className="is-text">
            {s.leastUsed ? (
              <Link to={`/sneakers/${s.leastUsed.id}`}>
                {s.leastUsed.label} {s.leastUsed.model}
              </Link>
            ) : (
              '—'
            )}
          </dd>
          <span>{s.leastUsed ? (s.leastUsed.uses === 0 ? t('Sin estrenar todavía') : tn(s.leastUsed.uses, '{n} uso', '{n} usos')) : ''}</span>
        </div>
      </dl>

      <div className="snk-dash-grid">
        <section className="snk-panel" aria-labelledby="snk-brands-h">
          <h2 id="snk-brands-h">{t('Distribución por marcas')}</h2>
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
              {t('En «Otras»: {join}.', { join: s.brands.filter((b) => b.brand === 'OTHER').map((b) => `${b.label} (${b.count})`).join(', ') })}
            </p>
          )}
        </section>

        <section className="snk-panel" aria-labelledby="snk-combos-h">
          <h2 id="snk-combos-h">{t('Las que combinan con más outfits')}</h2>
          {s.combos.length === 0 ? (
            <p className="snk-panel-note">{t('Todavía no hay outfits guardados con tus zapatillas. Crea alguno en el vestidor y aquí verás cuáles combinan más.')}</p>
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
                      {t('{outfits} {v} · con {partners} {v2}', { outfits: c.outfits, v: c.outfits === 1 ? t('outfit') : t('outfits'), partners: c.partners, v2: c.partners === 1 ? t('prenda distinta') : t('prendas distintas') })}
                    </small>
                    <span className="snk-combo-bar" aria-hidden="true" />
                  </span>
                  <Link to={`/outfits?item=${c.id}`} className="snk-combo-go" title={t('Ver esos outfits')}>
                    <Icon name="forward" size={14} />
                    <span className="visually-hidden">{t('Ver outfits con {model}', { model: c.model })}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {s.neverCombined > 0 && (
            <p className="snk-panel-note">
              {t('{neverCombined} {v} en ningún outfit guardado.', { neverCombined: s.neverCombined, v: s.neverCombined === 1 ? t('par no sale') : t('pares no salen') })}
            </p>
          )}
        </section>

        <section className="snk-panel" aria-labelledby="snk-colors-h">
          <h2 id="snk-colors-h">{t('Colores')}</h2>
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
          <h2 id="snk-cond-h">{t('Estado de conservación')}</h2>
          <ul className="bar-list">
            {s.byCondition.map((c, i) => (
              <BarRow key={c.condition} index={i} label={CONDITION[c.condition].label} share={(c.count / maxCond) * 100} fill="#8c8a85" value={c.count} />
            ))}
          </ul>
          {s.wishlist.count > 0 && (
            <p className="snk-panel-note">
              <Icon name="heart" size={12} /> {t('Wishlist: {count} {v}{v2}', { count: s.wishlist.count, v: s.wishlist.count === 1 ? t('par') : t('pares'), v2: s.wishlist.value.length > 0 && ` · ${s.wishlist.value.map((v) => money(v.total, v.currency)).join(' + ')}` })}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
