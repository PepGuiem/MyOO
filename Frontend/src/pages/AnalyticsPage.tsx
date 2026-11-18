import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { analyticsApi } from '../api/endpoints';
import type { GarmentCategory, OutfitStyle, StyleAnalytics } from '../api/types';
import { BarRow, ColumnChart, OTHER, SERIES, StackedShare, type Series } from '../components/analytics/Charts';
import { ErrorNote } from '../components/ErrorNote';
import { SprayLoader } from '../components/fx/SprayLoader';
import { Icon, type IconName } from '../components/Icon';
import { EmptyStage } from '../components/street/EmptyStage';
import { CountUp, stickerTilt } from '../components/street/Street';
import { OUTFIT_STYLES } from '../lib/outfitStyles';
import { play } from '../lib/sfx';
import { withTransition } from '../lib/motion';
import { LOCALE_TAG, t, tn } from '../i18n';

const CATEGORY_LABEL: Record<GarmentCategory, string> = {
  TOP: t('Arriba'),
  BOTTOM: t('Abajo'),
  FULL_BODY: t('Vestidos y monos'),
  OUTERWEAR: t('Chaquetas y abrigos'),
  FOOTWEAR: t('Calzado'),
  ACCESSORY: t('Accesorios'),
};

const TONE: Record<StyleAnalytics['insights'][number]['tone'], { icon: IconName; label: string }> = {
  warn: { icon: 'flag', label: t('Ojo') },
  tip: { icon: 'bulb', label: t('Idea') },
  praise: { icon: 'star', label: t('Bien') },
  info: { icon: 'pulse', label: t('Dato') },
};

function StyleSticker({ style }: { style: OutfitStyle }) {
  const m = OUTFIT_STYLES[style];
  return (
    <span className="style-sticker" style={{ '--c': m.color, '--ink': m.ink, '--tilt': `${stickerTilt(style)}deg` } as CSSProperties}>
      {m.label}
    </span>
  );
}

/**
 * STYLE ANALYTICS: tus hábitos de vestir con tus prendas, outfits y días
 * usados del calendario. Se calcula en el backend al entrar (o al pulsar
 * «Actualizar»), así que refleja lo último que has creado, cambiado o borrado.
 */
export function AnalyticsPage() {
  const [data, setData] = useState<StyleAnalytics | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const [stamp, setStamp] = useState<Date | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    analyticsApi
      .overview()
      .then((d) => {
        setData(d);
        setError(null);
        setStamp(new Date());
      })
      .catch((e: unknown) => setError(e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    // Al volver a la pestaña, por si has cambiado algo en otra.
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  // Series del gráfico de mezcla de estilos: los 4 más usados en total + «Otros».
  const mixSeries = useMemo<Series[]>(() => {
    if (!data) return [];
    const top = data.styles.filter((s) => s.count > 0).slice(0, 4);
    const out: Series[] = top.map((s, i) => ({ key: s.style, label: OUTFIT_STYLES[s.style].label, color: SERIES[i] }));
    if (data.styles.filter((s) => s.count > 0).length > 4) out.push({ key: 'OTHER', label: t('Otros'), color: OTHER });
    return out;
  }, [data]);

  if (!data) {
    return (
      <section className="page an ux at">
        <AnHero onRefresh={load} loading={loading} stamp={stamp} />
        <ErrorNote error={error} />
        {!error && <SprayLoader label={t('Analizando tu armario…')} />}
      </section>
    );
  }

  const tot = data.totals;
  const h = data.highlights;
  const empty = tot.items === 0 && tot.outfits === 0;
  const delta = tot.outfitsThisMonth - tot.outfitsLastMonth;
  const evo = data.evolution[period];
  const maxColor = Math.max(1, ...data.colors.ranking.map((c) => c.uses));
  const styled = data.styles.reduce((a, s) => a + s.count, 0);

  return (
    <section className="page an ux at">
      <AnHero onRefresh={load} loading={loading} stamp={stamp} />
      <ErrorNote error={error} />

      {empty ? (
        <EmptyStage
          icon="pulse"
          pieces={['tshirt', 'palette', 'layers', 'pants', 'star', 'shoe']}
          kicker={t('Style data')}
          kickerIcon="pulse"
          title={t('Sin datos todavía')}
          text={t('Cuando tengas prendas y outfits, aquí verás tus estilos, colores y cómo evolucionas. Nada de datos inventados: todo sale de lo que guardas.')}
        >
          <Link to="/armario" className="btn wd-add wd-add-big">
            <Icon name="plus" size={16} /> <span>{t('Añadir prendas')}</span>
          </Link>
        </EmptyStage>
      ) : (
        <>
          {/* 1. Cifras */}
          <dl className="an-kpis">
            <Kpi label={t('Prendas')} value={tot.items} sub={tot.itemsThisMonth ? t('+{n} este mes', { n: tot.itemsThisMonth }) : t('{usedItemsShare}% en algún outfit', { usedItemsShare: tot.usedItemsShare })} i={0} />
            <Kpi label={t('Outfits')} value={tot.outfits} sub={tn(tot.favorites, '{n} favorito', '{n} favoritos')} i={1} />
            <Kpi
              label={t('Outfits este mes')}
              value={tot.outfitsThisMonth}
              sub={delta === 0 ? t('Igual que el mes pasado') : t('{v} {abs} frente al mes pasado', { v: delta > 0 ? '▲' : '▼', abs: Math.abs(delta) })}
              tone={delta > 0 ? 'up' : delta < 0 ? 'down' : undefined}
              i={2}
            />
            <Kpi label={t('Usados (30 días)')} value={tot.worn30} sub={t('Marcados en el calendario')} i={3} />
            <Kpi label={t('Nota media')} value={tot.avgRating} sub={t('OUTFIT RATING')} i={4} />
          </dl>

          <div className="an-highlights">
            <article className="an-hl" style={{ '--i': 0 } as CSSProperties}>
              <span className="an-hl-label">{t('Estilo más usado')}</span>
              {h.topStyle ? (
                <>
                  <StyleSticker style={h.topStyle.style} />
                  <p>
                    <b>{h.topStyle.share}%</b> {t('de tus outfits{v}', { v: h.topStyle.inferred ? t(' (deducido por las prendas)') : '' })}
                  </p>
                </>
              ) : (
                <p className="muted">{t('Sin outfits todavía')}</p>
              )}
            </article>
            <article className="an-hl" style={{ '--i': 1 } as CSSProperties}>
              <span className="an-hl-label">{t('Color más usado')}</span>
              {h.topColor ? (
                <>
                  <span className="an-swatch-big" style={{ background: h.topColor.hex }} aria-hidden="true" />
                  <p>
                    <b className="cap">{h.topColor.name}</b> {t('· {share}% de lo que combinas', { share: h.topColor.share })}
                  </p>
                </>
              ) : (
                <p className="muted">{t('Combina prendas para verlo')}</p>
              )}
            </article>
            <article className="an-hl" style={{ '--i': 2 } as CSSProperties}>
              <span className="an-hl-label">{t('Marca más frecuente')}</span>
              {h.topBrand ? (
                <>
                  <span className="an-brand">{h.topBrand.name}</span>
                  <p>
                    {t('{count} {v} · marca puesta en el {brandCoverage}% del armario', { count: h.topBrand.count, v: h.topBrand.count === 1 ? t('prenda') : t('prendas'), brandCoverage: h.brandCoverage })}
                  </p>
                </>
              ) : (
                <p className="muted">{t('Ninguna prenda tiene marca. Añádela al editar la prenda.')}</p>
              )}
            </article>
            <article className="an-hl" style={{ '--i': 3 } as CSSProperties}>
              <span className="an-hl-label">{t('Prenda más combinada')}</span>
              {h.mostCombined ? (
                <>
                  <span className="an-item">
                    <span className="piece-swatch" style={{ background: h.mostCombined.color }} aria-hidden="true" />
                    <b>{h.mostCombined.name}</b>
                  </span>
                  <p>
                    {t('En {count} {v} ({share}%)', { count: h.mostCombined.count, v: h.mostCombined.count === 1 ? t('outfit') : t('outfits'), share: h.mostCombined.share })}
                  </p>
                </>
              ) : (
                <p className="muted">{t('Aún no hay outfits')}</p>
              )}
            </article>
          </div>

          {/* 5. STYLE INSIGHTS */}
          {data.insights.length > 0 && (
            <section className="an-card an-insights">
              <h2 className="an-h2">
                {t('Style')} <span>{t('Insights')}</span>
              </h2>
              <ul>
                {data.insights.map((ins, i) => (
                  <li key={ins.code + i} className={`ins is-${ins.tone}`} style={{ '--i': i } as CSSProperties}>
                    <span className="ins-icon" aria-hidden="true">
                      <Icon name={TONE[ins.tone].icon} size={16} />
                    </span>
                    <div>
                      <span className="ins-tag">{TONE[ins.tone].label}</span>
                      <h3>{ins.title}</h3>
                      <p>{ins.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="an-grid">
            {/* 2. Estilos */}
            <section className="an-card">
              <h2 className="an-h2">{t('Estilos')}</h2>
              <p className="an-sub">
                {t('Porcentaje de tus {styled} outfits. Rayado: estilo deducido por las prendas (no lo marcaste).', { styled })}
              </p>
              <ul className="bar-list">
                {data.styles.map((s, i) => (
                  <BarRow
                    key={s.style}
                    index={i}
                    label={OUTFIT_STYLES[s.style].label}
                    share={s.share}
                    hatch={s.count ? (s.inferred / s.count) * 100 : 0}
                    value={
                      <>
                        <b>{s.share}%</b> <small>{s.count}</small>
                      </>
                    }
                    title={t('{declared} marcados, {inferred} deducidos', { declared: s.declared, inferred: s.inferred })}
                  />
                ))}
              </ul>
            </section>

            {/* 3. Colores */}
            <section className="an-card">
              <h2 className="an-h2">{t('Colores')}</h2>
              <p className="an-sub">{t('Cuántas veces sale cada color en tus outfits (cada prenda cuenta una vez por outfit).')}</p>
              {data.colors.ranking.length ? (
                <>
                  <div className="fam-strip" role="img" aria-label={t('Neutros {neutral}%, tierras {earth}%, colores {color}%', { neutral: data.colors.families.neutral, earth: data.colors.families.earth, color: data.colors.families.color })}>
                    {(['neutral', 'earth', 'color'] as const).map((k) =>
                      data.colors.families[k] ? (
                        <span key={k} className={`fam fam-${k}`} style={{ flexGrow: data.colors.families[k] }}>
                          {data.colors.families[k] >= 12 && (
                            <>
                              {k === 'neutral' ? t('Neutros') : k === 'earth' ? t('Tierras') : t('Color')} {Math.round(data.colors.families[k])}%
                            </>
                          )}
                        </span>
                      ) : null,
                    )}
                  </div>
                  <ol className="bar-list color-rank">
                    {data.colors.ranking.map((c, i) => (
                      <BarRow
                        key={c.name}
                        index={i}
                        label={
                          <span className="color-label">
                            <span className="rank">{i + 1}</span>
                            <span className="dot" style={{ background: c.hex }} aria-hidden="true" />
                            <span className="cap">{c.name}</span>
                          </span>
                        }
                        share={(c.uses / maxColor) * 100}
                        fill={c.hex}
                        value={
                          <>
                            <b>{c.share}%</b> <small>{c.uses}</small>
                          </>
                        }
                        title={t('{uses} usos en outfits · {items} {v}', { uses: c.uses, items: c.items, v: c.items === 1 ? t('prenda') : t('prendas') })}
                      />
                    ))}
                  </ol>
                </>
              ) : (
                <p className="muted small">{t('Combina prendas en outfits para ver tus colores.')}</p>
              )}

              {data.colors.pairs.length > 0 && (
                <>
                  <h3 className="an-h3">{t('Combinaciones que más repites')}</h3>
                  <ul className="pairs">
                    {data.colors.pairs.map((p, i) => (
                      <li key={`${p.a.name}-${p.b.name}`} style={{ '--i': i } as CSSProperties}>
                        <span className="pair-dots" aria-hidden="true">
                          <i style={{ background: p.a.hex }} />
                          <i style={{ background: p.b.hex }} />
                        </span>
                        <span className="cap">
                          {p.a.name} + {p.b.name}
                        </span>
                        <b>×{p.count}</b>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {data.colors.least.length > 0 && (
                <>
                  <h3 className="an-h3">{t('Los que menos usas')}</h3>
                  <ul className="least">
                    {data.colors.least.map((c) => (
                      <li key={c.name}>
                        <i style={{ background: c.hex }} aria-hidden="true" />
                        <span className="cap">{c.name}</span>
                        <small>
                          {c.uses ? tn(c.uses, '{n} uso', '{n} usos') : t('sin usar')} · {tn(c.items, '{n} prenda', '{n} prendas')}
                        </small>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>

          {/* 4. Evolución */}
          <section className="an-card an-evo">
            <div className="an-card-head">
              <h2 className="an-h2">{t('Evolución')}</h2>
              <div className={`tab-switch is-${period === 'weekly' ? 'all' : 'fav'} an-period`} role="tablist" aria-label={t('Periodo')}>
                <span className="tab-thumb" aria-hidden="true" />
                <button
                  type="button"
                  role="tab"
                  aria-selected={period === 'weekly'}
                  onClick={() => {
                    play('click');
                    withTransition(() => setPeriod('weekly'));
                  }}
                >
                  {t('Semanal')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={period === 'monthly'}
                  onClick={() => {
                    play('click');
                    withTransition(() => setPeriod('monthly'));
                  }}
                >
                  {t('Mensual')}
                </button>
              </div>
            </div>
            <p className="an-sub">
              {t('{v} Outfits creados, prendas añadidas y outfits marcados como usados en el calendario.', { v: period === 'weekly' ? t('Últimas 12 semanas.') : t('Últimos 12 meses.') })}
            </p>
            <ColumnChart
              key={period}
              label={t('Actividad por periodo')}
              data={evo.map((d) => ({ key: d.key, label: d.label, values: { outfits: d.outfits, items: d.items, worn: d.worn } }))}
              series={[
                { key: 'outfits', label: t('Outfits creados'), color: SERIES[0] },
                { key: 'items', label: t('Prendas añadidas'), color: SERIES[1] },
                { key: 'worn', label: t('Usados'), color: SERIES[2] },
              ]}
            />
            {mixSeries.length > 0 && (
              <>
                <h3 className="an-h3">{t('Cómo cambia tu estilo (por mes)')}</h3>
                <StackedShare
                  label={t('Mezcla de estilos por mes')}
                  data={data.evolution.monthly.map((m) => {
                    const values: Record<string, number> = {};
                    let other = 0;
                    for (const [k, v] of Object.entries(m.styles)) {
                      if (mixSeries.some((s) => s.key === k)) values[k] = v;
                      else other += v;
                    }
                    if (other) values.OTHER = other;
                    return { key: m.key, label: m.label, values };
                  })}
                  series={mixSeries}
                />
              </>
            )}
          </section>

          <div className="an-grid">
            <section className="an-card">
              <h2 className="an-h2">{t('Uso de tu armario')}</h2>
              <p className="an-sub">{t('Prendas de cada tipo que han salido en algún outfit.')}</p>
              <ul className="bar-list">
                {data.categories.map((c, i) => (
                  <BarRow
                    key={c.category}
                    index={i}
                    label={CATEGORY_LABEL[c.category]}
                    share={c.usedShare}
                    fill={c.usedShare < 34 ? 'var(--fx-orange)' : 'var(--fx-acid)'}
                    value={
                      <>
                        <b>{c.used}</b>
                        <small>/{c.items}</small>
                      </>
                    }
                  />
                ))}
              </ul>
            </section>

            <section className="an-card">
              <h2 className="an-h2">{t('Sin combinar')}</h2>
              {data.unused.count ? (
                <>
                  <p className="an-sub">
                    {t('{count} {v} en ningún outfit.', { count: data.unused.count, v: data.unused.count === 1 ? t('prenda no ha salido') : t('prendas no han salido') })}
                  </p>
                  <ul className="unused">
                    {data.unused.sample.map((u, i) => (
                      <li key={u.id} style={{ '--i': i } as CSSProperties}>
                        <span className="piece-swatch" style={{ background: u.color }} aria-hidden="true" />
                        <span>{u.name}</span>
                        <small>{CATEGORY_LABEL[u.category]}</small>
                      </li>
                    ))}
                  </ul>
                  <Link to="/outfits/new" className="btn wd-add">
                    <Icon name="plus" size={14} /> <span>{t('Combinarlas en un outfit')}</span>
                  </Link>
                </>
              ) : (
                <p className="an-sub">{t('Todas tus prendas salen en algún outfit.')}</p>
              )}
              {data.brands.length > 1 && (
                <>
                  <h3 className="an-h3">{t('Marcas')}</h3>
                  <ul className="bar-list">
                    {data.brands.map((b, i) => (
                      <BarRow key={b.name} index={i} label={b.name} share={(b.count / data.brands[0].count) * 100} fill="var(--fx-bone)" value={<b>{b.count}</b>} />
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}

function AnHero({ onRefresh, loading, stamp }: { onRefresh: () => void; loading: boolean; stamp: Date | null }) {
  return (
    <header className="an-hero ux-head">
      <div>
        <span className="wd-kicker">
          <Icon name="pulse" size={12} /> {t('Style data')}
        </span>
        <h1 className="wd-title ux-title" data-text={`${t('Style')} ${t('Analytics')}`}>
          {t('Style')} <em>{t('Analytics')}</em>
        </h1>
        <p className="ux-lede">{t('Tus datos · solo tuyos')}</p>
      </div>
      <div className="an-refresh wd-head-actions">
        {stamp && <small>{t('Actualizado a las {toLocaleTimeString}', { toLocaleTimeString: stamp.toLocaleTimeString(LOCALE_TAG, { hour: '2-digit', minute: '2-digit' }) })}</small>}
        <button
          type="button"
          className="btn wd-btn-line"
          onClick={() => {
            play('click');
            onRefresh();
          }}
          disabled={loading}
        >
          <Icon name="refresh" size={14} className={loading ? 'spin' : ''} /> {t('Actualizar')}
        </button>
      </div>
    </header>
  );
}

function Kpi({ label, value, sub, tone, i }: { label: string; value: number | null; sub: string; tone?: 'up' | 'down'; i: number }) {
  return (
    <div className="an-kpi" style={{ '--i': i } as CSSProperties}>
      <dt>{label}</dt>
      <dd>{value === null ? '—' : <CountUp value={value} delay={i * 80} />}</dd>
      <span className={`an-kpi-sub${tone ? ` is-${tone}` : ''}`}>{sub}</span>
    </div>
  );
}
