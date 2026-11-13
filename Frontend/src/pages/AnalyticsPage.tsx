import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { analyticsApi } from '../api/endpoints';
import type { GarmentCategory, OutfitStyle, StyleAnalytics } from '../api/types';
import { BarRow, ColumnChart, OTHER, SERIES, StackedShare, type Series } from '../components/analytics/Charts';
import { ErrorNote } from '../components/ErrorNote';
import { NeonScene } from '../components/fx/NeonScene';
import { SprayLoader } from '../components/fx/SprayLoader';
import { Icon, type IconName } from '../components/Icon';
import { CountUp, stickerTilt } from '../components/street/Street';
import { OUTFIT_STYLES } from '../lib/outfitStyles';
import { play } from '../lib/sfx';

const CATEGORY_LABEL: Record<GarmentCategory, string> = {
  TOP: 'Arriba',
  BOTTOM: 'Abajo',
  FULL_BODY: 'Vestidos y monos',
  OUTERWEAR: 'Chaquetas y abrigos',
  FOOTWEAR: 'Calzado',
  ACCESSORY: 'Accesorios',
};

const TONE: Record<StyleAnalytics['insights'][number]['tone'], { icon: IconName; label: string }> = {
  warn: { icon: 'flag', label: 'Ojo' },
  tip: { icon: 'bulb', label: 'Idea' },
  praise: { icon: 'star', label: 'Bien' },
  info: { icon: 'pulse', label: 'Dato' },
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
    if (data.styles.filter((s) => s.count > 0).length > 4) out.push({ key: 'OTHER', label: 'Otros', color: OTHER });
    return out;
  }, [data]);

  if (!data) {
    return (
      <section className="page an">
        <NeonScene />
        <AnHero onRefresh={load} loading={loading} stamp={stamp} />
        <ErrorNote error={error} />
        {!error && <SprayLoader label="Analizando tu armario…" />}
      </section>
    );
  }

  const t = data.totals;
  const h = data.highlights;
  const empty = t.items === 0 && t.outfits === 0;
  const delta = t.outfitsThisMonth - t.outfitsLastMonth;
  const evo = data.evolution[period];
  const maxColor = Math.max(1, ...data.colors.ranking.map((c) => c.uses));
  const styled = data.styles.reduce((a, s) => a + s.count, 0);

  return (
    <section className="page an">
      <NeonScene />
      <AnHero onRefresh={load} loading={loading} stamp={stamp} />
      <ErrorNote error={error} />

      {empty ? (
        <div className="fits-empty">
          <span className="fits-empty-tag">Sin datos todavía</span>
          <p>Cuando tengas prendas y outfits, aquí verás tus estilos, colores y cómo evolucionas. Nada de datos inventados: todo sale de lo que guardas.</p>
          <Link to="/armario" className="btn btn-primary btn-street btn-new">
            <Icon name="plus" size={16} /> Añadir prendas
          </Link>
        </div>
      ) : (
        <>
          {/* 1. Cifras */}
          <dl className="an-kpis">
            <Kpi label="Prendas" value={t.items} sub={t.itemsThisMonth ? `+${t.itemsThisMonth} este mes` : `${t.usedItemsShare}% en algún outfit`} i={0} />
            <Kpi label="Outfits" value={t.outfits} sub={`${t.favorites} favoritos`} i={1} />
            <Kpi
              label="Outfits este mes"
              value={t.outfitsThisMonth}
              sub={delta === 0 ? 'Igual que el mes pasado' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} frente al mes pasado`}
              tone={delta > 0 ? 'up' : delta < 0 ? 'down' : undefined}
              i={2}
            />
            <Kpi label="Usados (30 días)" value={t.worn30} sub="Marcados en el calendario" i={3} />
            <Kpi label="Nota media" value={t.avgRating} sub="OUTFIT RATING" i={4} />
          </dl>

          <div className="an-highlights">
            <article className="an-hl" style={{ '--i': 0 } as CSSProperties}>
              <span className="an-hl-label">Estilo más usado</span>
              {h.topStyle ? (
                <>
                  <StyleSticker style={h.topStyle.style} />
                  <p>
                    <b>{h.topStyle.share}%</b> de tus outfits{h.topStyle.inferred ? ' (deducido por las prendas)' : ''}
                  </p>
                </>
              ) : (
                <p className="muted">Sin outfits todavía</p>
              )}
            </article>
            <article className="an-hl" style={{ '--i': 1 } as CSSProperties}>
              <span className="an-hl-label">Color más usado</span>
              {h.topColor ? (
                <>
                  <span className="an-swatch-big" style={{ background: h.topColor.hex }} aria-hidden="true" />
                  <p>
                    <b className="cap">{h.topColor.name}</b> · {h.topColor.share}% de lo que combinas
                  </p>
                </>
              ) : (
                <p className="muted">Combina prendas para verlo</p>
              )}
            </article>
            <article className="an-hl" style={{ '--i': 2 } as CSSProperties}>
              <span className="an-hl-label">Marca más frecuente</span>
              {h.topBrand ? (
                <>
                  <span className="an-brand">{h.topBrand.name}</span>
                  <p>
                    {h.topBrand.count} {h.topBrand.count === 1 ? 'prenda' : 'prendas'} · marca puesta en el {h.brandCoverage}% del armario
                  </p>
                </>
              ) : (
                <p className="muted">Ninguna prenda tiene marca. Añádela al editar la prenda.</p>
              )}
            </article>
            <article className="an-hl" style={{ '--i': 3 } as CSSProperties}>
              <span className="an-hl-label">Prenda más combinada</span>
              {h.mostCombined ? (
                <>
                  <span className="an-item">
                    <span className="piece-swatch" style={{ background: h.mostCombined.color }} aria-hidden="true" />
                    <b>{h.mostCombined.name}</b>
                  </span>
                  <p>
                    En {h.mostCombined.count} {h.mostCombined.count === 1 ? 'outfit' : 'outfits'} ({h.mostCombined.share}%)
                  </p>
                </>
              ) : (
                <p className="muted">Aún no hay outfits</p>
              )}
            </article>
          </div>

          {/* 5. STYLE INSIGHTS */}
          {data.insights.length > 0 && (
            <section className="an-card an-insights">
              <h2 className="an-h2">
                Style <span>Insights</span>
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
              <h2 className="an-h2">Estilos</h2>
              <p className="an-sub">
                Porcentaje de tus {styled} outfits. Rayado: estilo deducido por las prendas (no lo marcaste).
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
                    title={`${s.declared} marcados, ${s.inferred} deducidos`}
                  />
                ))}
              </ul>
            </section>

            {/* 3. Colores */}
            <section className="an-card">
              <h2 className="an-h2">Colores</h2>
              <p className="an-sub">Cuántas veces sale cada color en tus outfits (cada prenda cuenta una vez por outfit).</p>
              {data.colors.ranking.length ? (
                <>
                  <div className="fam-strip" role="img" aria-label={`Neutros ${data.colors.families.neutral}%, tierras ${data.colors.families.earth}%, colores ${data.colors.families.color}%`}>
                    {(['neutral', 'earth', 'color'] as const).map((k) =>
                      data.colors.families[k] ? (
                        <span key={k} className={`fam fam-${k}`} style={{ flexGrow: data.colors.families[k] }}>
                          {data.colors.families[k] >= 12 && (
                            <>
                              {k === 'neutral' ? 'Neutros' : k === 'earth' ? 'Tierras' : 'Color'} {Math.round(data.colors.families[k])}%
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
                        title={`${c.uses} usos en outfits · ${c.items} ${c.items === 1 ? 'prenda' : 'prendas'}`}
                      />
                    ))}
                  </ol>
                </>
              ) : (
                <p className="muted small">Combina prendas en outfits para ver tus colores.</p>
              )}

              {data.colors.pairs.length > 0 && (
                <>
                  <h3 className="an-h3">Combinaciones que más repites</h3>
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
                  <h3 className="an-h3">Los que menos usas</h3>
                  <ul className="least">
                    {data.colors.least.map((c) => (
                      <li key={c.name}>
                        <i style={{ background: c.hex }} aria-hidden="true" />
                        <span className="cap">{c.name}</span>
                        <small>
                          {c.uses ? `${c.uses} ${c.uses === 1 ? 'uso' : 'usos'}` : 'sin usar'} · {c.items} {c.items === 1 ? 'prenda' : 'prendas'}
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
              <h2 className="an-h2">Evolución</h2>
              <div className={`tab-switch is-${period === 'weekly' ? 'all' : 'fav'} an-period`} role="tablist" aria-label="Periodo">
                <span className="tab-thumb" aria-hidden="true" />
                <button
                  type="button"
                  role="tab"
                  aria-selected={period === 'weekly'}
                  onClick={() => {
                    play('click');
                    setPeriod('weekly');
                  }}
                >
                  Semanal
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={period === 'monthly'}
                  onClick={() => {
                    play('click');
                    setPeriod('monthly');
                  }}
                >
                  Mensual
                </button>
              </div>
            </div>
            <p className="an-sub">
              {period === 'weekly' ? 'Últimas 12 semanas.' : 'Últimos 12 meses.'} Outfits creados, prendas añadidas y outfits marcados como usados en el calendario.
            </p>
            <ColumnChart
              key={period}
              label="Actividad por periodo"
              data={evo.map((d) => ({ key: d.key, label: d.label, values: { outfits: d.outfits, items: d.items, worn: d.worn } }))}
              series={[
                { key: 'outfits', label: 'Outfits creados', color: SERIES[0] },
                { key: 'items', label: 'Prendas añadidas', color: SERIES[1] },
                { key: 'worn', label: 'Usados', color: SERIES[2] },
              ]}
            />
            {mixSeries.length > 0 && (
              <>
                <h3 className="an-h3">Cómo cambia tu estilo (por mes)</h3>
                <StackedShare
                  label="Mezcla de estilos por mes"
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
              <h2 className="an-h2">Uso de tu armario</h2>
              <p className="an-sub">Prendas de cada tipo que han salido en algún outfit.</p>
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
              <h2 className="an-h2">Sin combinar</h2>
              {data.unused.count ? (
                <>
                  <p className="an-sub">
                    {data.unused.count} {data.unused.count === 1 ? 'prenda no ha salido' : 'prendas no han salido'} en ningún outfit.
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
                  <Link to="/outfits/new" className="btn btn-primary btn-street">
                    <Icon name="plus" size={14} /> Combinarlas en un outfit
                  </Link>
                </>
              ) : (
                <p className="an-sub">Todas tus prendas salen en algún outfit.</p>
              )}
              {data.brands.length > 1 && (
                <>
                  <h3 className="an-h3">Marcas</h3>
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
    <header className="an-hero">
      <div>
        <span className="fits-kicker">
          <span className="rec-dot" aria-hidden="true" /> Tus datos · solo tuyos
        </span>
        <h1 className="cal-h1">
          Style <span>Analytics</span>
        </h1>
      </div>
      <div className="an-refresh">
        {stamp && <small>Actualizado a las {stamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</small>}
        <button
          type="button"
          className="btn btn-street btn-ghost"
          onClick={() => {
            play('click');
            onRefresh();
          }}
          disabled={loading}
        >
          <Icon name="refresh" size={14} className={loading ? 'spin' : ''} /> Actualizar
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
