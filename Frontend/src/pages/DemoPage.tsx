import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { BodySelector } from '../components/BodySelector';
import { ColorRow } from '../components/ColorRow';
import { Icon } from '../components/Icon';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { Logo } from '../components/Logo';
import { LoadingOverlay } from '../components/Spinner';
import { useBodyShape } from '../lib/bodyPref';
import { DEMO_GARMENTS, DEMO_MAX_ITEMS, DEMO_START, demoDraft, demoGarmentLike, demoPending, type DemoGarment, type DemoPick } from '../lib/demoOutfit';
import { play } from '../lib/sfx';
import { SLOTS, SLOT_BY_ID, slotOf, type SlotId } from '../lib/wardrobeSlots';
import { t } from '../i18n';
import './DemoPage.css';

// El escenario 3D (three.js) se descarga aparte: el burro y los botones
// aparecen enseguida y el maniquí llega después, con su aviso de carga.
const OutfitStage = lazy(() => import('../three/OutfitMannequin').then((m) => ({ default: m.OutfitStage })));

// Todas tienen modelo en la biblioteca 3D (ver lib/demoOutfit.ts). No se
// filtra aquí con libraryModel: libraryCatalog arrastra three.js y esta página
// debe pintarse antes de que llegue el motor 3D.
const GARMENTS: DemoGarment[] = DEMO_GARMENTS;
const BY_ID = new Map(GARMENTS.map((g) => [g.id, g]));

/** Huecos en los que solo cabe una prenda: elegir otra la cambia. */
const SINGLE: SlotId[] = ['head', 'bottom', 'shoes'];

interface Pulse {
  n: number;
  kind: 'on' | 'off' | 'mix';
  text: string;
}

/**
 * MODO DEMO: el vestidor sin cuenta. Mismo maniquí (OutfitStage), mismo
 * selector de silueta y mismos colores que el vestidor real, con un armario
 * de ejemplo que solo existe en el navegador. No llama a la API: «Guardar
 * este outfit» lleva al registro y, ya dentro, DemoImportOffer lo crea.
 */
export function DemoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { shape } = useBodyShape();
  const [picks, setPicks] = useState<DemoPick[]>(() => (demoDraft.read() ?? DEMO_START).filter((p) => BY_ID.has(p.id)));
  const [slot, setSlot] = useState<SlotId | 'all'>('all');
  const [openColor, setOpenColor] = useState<string | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const flash = (kind: Pulse['kind'], text: string) => setPulse((p) => ({ n: (p?.n ?? 0) + 1, kind, text }));

  // El borrador se recuerda en esta pestaña (ir al registro y volver no lo pierde).
  useEffect(() => demoDraft.write(picks), [picks]);

  const garments = useMemo(() => picks.map(demoGarmentLike).filter((g): g is NonNullable<typeof g> => g !== null), [picks]);
  const slotOfId = (id: string): SlotId => {
    const g = BY_ID.get(id);
    return g ? slotOf({ garmentType: { category: g.category, modelKey: g.modelKey } }) : 'acc';
  };
  const slots = SLOTS.filter((s) => GARMENTS.some((g) => slotOfId(g.id) === s.id));
  const countBySlot = (s: SlotId) => GARMENTS.filter((g) => slotOfId(g.id) === s).length;
  const wornIn = (s: SlotId) => picks.filter((p) => slotOfId(p.id) === s);
  const visible = GARMENTS.filter((g) => slot === 'all' || slotOfId(g.id) === slot);

  function toggle(g: DemoGarment) {
    const on = picks.some((p) => p.id === g.id);
    if (on) {
      setPicks((prev) => prev.filter((p) => p.id !== g.id));
      play('swoosh');
      flash('off', t('Fuera: {name}', { name: g.name }));
      return;
    }
    const s = slotOfId(g.id);
    const replaced = SINGLE.includes(s) ? picks.filter((p) => slotOfId(p.id) === s) : [];
    const next = [...picks.filter((p) => !replaced.includes(p)), { id: g.id, color: g.color }];
    if (next.length > DEMO_MAX_ITEMS) {
      flash('off', t('Máximo {n} prendas en la demo.', { n: DEMO_MAX_ITEMS }));
      play('error');
      return;
    }
    setPicks(next);
    play('pop');
    flash(replaced.length ? 'mix' : 'on', replaced.length ? t('Cambio: {v}', { v: g.name }) : t('Puesto: {name}', { name: g.name }));
  }

  function setColor(id: string, color: string | null) {
    if (!color) return;
    setPicks((prev) => prev.map((p) => (p.id === id ? { ...p, color: color.toUpperCase() } : p)));
  }

  /** «Sorpréndeme»: arriba + abajo + calzado y, a veces, capa y cabeza. */
  function surprise() {
    const pick = (s: SlotId) => {
      const pool = GARMENTS.filter((g) => slotOfId(g.id) === s);
      return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    };
    const chosen = [Math.random() < 0.4 ? pick('head') : null, pick('top'), Math.random() < 0.55 ? pick('outer') : null, pick('bottom'), pick('shoes')].filter(
      (g): g is DemoGarment => g !== null,
    );
    setPicks(chosen.map((g) => ({ id: g.id, color: g.color })));
    setOpenColor(null);
    play('spray');
    flash('mix', t('Look al azar. ¿Te convence?'));
  }

  function clearAll() {
    if (!picks.length) return;
    setPicks([]);
    setOpenColor(null);
    play('swoosh');
    flash('off', t('Maniquí vacío.'));
  }

  /** Guarda la selección para crearla en la cuenta tras registrarse (o ya, si hay sesión). */
  function save() {
    if (!picks.length) return;
    demoPending.write(picks);
    play('click');
    navigate(user ? '/' : '/register');
  }

  return (
    <div className="demo-shell">
      <header className="demo-bar">
        <Link to="/login" className="demo-brand" aria-label={t('MyOO, inicio')}>
          <Logo decorative />
        </Link>
        <span className="demo-badge">
          <Icon name="eye" size={12} /> {t('Modo demo')}
        </span>
        <span className="spacer" />
        <LanguageSwitch compact />
        {user ? (
          <Link to="/" className="btn wd-btn-line demo-bar-btn">
            {t('Ir a mi armario')}
          </Link>
        ) : (
          <>
            <Link to="/login" className="btn wd-btn-line demo-bar-btn">
              {t('Entrar')}
            </Link>
            <Link to="/register" className="btn btn-primary demo-bar-btn">
              {t('Crear cuenta')}
            </Link>
          </>
        )}
      </header>

      <main className="main demo-main">
        <section className="dressing ux dr demo">
          <header className="dress-head ux-head">
            <div className="dress-title">
              <span className="wd-kicker">
                <Icon name="hanger" size={12} /> {t('Dressing room')}
              </span>
              <h1 className="wd-title ux-title" data-text={t('Pruébalo sin cuenta')}>
                {t('Pruébalo sin cuenta')}
              </h1>
              <p className="ux-lede demo-lede">{t('Elige prendas, cambia colores y míralas en el maniquí 3D. Nada se guarda hasta que crees tu cuenta.')}</p>
            </div>
            <div className="dress-tools">
              <button type="button" className="btn wd-btn-line" onClick={surprise}>
                <Icon name="shuffle" size={14} /> {t('Sorpréndeme')}
              </button>
              <button type="button" className="btn wd-btn-line" onClick={clearAll} disabled={!picks.length}>
                <Icon name="undo" size={14} /> {t('Vaciar')}
              </button>
            </div>
          </header>

          <div className="dress-grid">
            {/* Burro con el armario de ejemplo */}
            <aside className="dress-rail" aria-label={t('Armario de ejemplo')}>
              <div className="slot-tabs" role="tablist" aria-label={t('Hueco')}>
                <button type="button" role="tab" aria-selected={slot === 'all'} className="slot-tab" onClick={() => setSlot('all')}>
                  <Icon name="hanger" size={16} />
                  <span className="slot-tab-label">{t('Todo')}</span>
                  <span className="count">{GARMENTS.length}</span>
                </button>
                {slots.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={slot === s.id}
                    className={`slot-tab${wornIn(s.id).length ? ' is-worn' : ''}`}
                    title={s.label}
                    onClick={() => {
                      play('click');
                      setSlot(s.id);
                    }}
                  >
                    <Icon name={s.icon} size={16} />
                    <span className="slot-tab-label">{s.short}</span>
                    <span className="count">{countBySlot(s.id)}</span>
                  </button>
                ))}
              </div>

              <div className="rack-head">
                <h2>{slot === 'all' ? t('Armario de ejemplo') : SLOT_BY_ID[slot].label}</h2>
              </div>

              <ul key={slot} className="rack">
                {visible.map((g, i) => {
                  const pick = picks.find((p) => p.id === g.id);
                  const on = !!pick;
                  return (
                    <li key={g.id} style={{ '--i': Math.min(i, 14) } as CSSProperties}>
                      <button
                        type="button"
                        className={`rack-item${on ? ' is-on' : ''}`}
                        aria-pressed={on}
                        onClick={() => toggle(g)}
                        title={on ? t('Quitar {name}', { name: g.name }) : t('Ponerle {name}', { name: g.name })}
                      >
                        <span className="rack-swatch" style={{ '--sw': pick?.color ?? g.color } as CSSProperties} aria-hidden="true">
                          <Icon name={SLOT_BY_ID[slotOfId(g.id)].icon} size={26} />
                        </span>
                        <span className="rack-name">{g.name}</span>
                        <span className="rack-state" aria-hidden="true">
                          <Icon name={on ? 'check' : 'plus'} size={13} />
                        </span>
                        {on && <span className="rack-stamp">{t('Puesto')}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            {/* Escenario */}
            <div className="dress-stage">
              <div className="stage-frame">
                <span className="stage-neon" aria-hidden="true" />
                <Suspense fallback={<LoadingOverlay show label={t('Vistiendo el maniquí…')} />}>
                  <OutfitStage garments={garments} shape={shape} />
                </Suspense>
                {pulse && <span key={pulse.n} className={`stage-flash is-${pulse.kind}`} aria-hidden="true" />}
                {pulse && (
                  <span key={`t${pulse.n}`} className={`stage-toast is-${pulse.kind}`} role="status">
                    {pulse.text}
                  </span>
                )}
                {picks.length === 0 && <p className="stage-empty">{t('Elige prendas del burro para vestir el maniquí.')}</p>}
              </div>
              <BodySelector className="dress-body" measures={false} />
            </div>

            {/* Lo puesto, sus colores y la llamada a la acción */}
            <div className="dress-panel">
              <h2 className="panel-title">
                {t('Puesto##sección')} <span className="count">{picks.length}</span>
              </h2>
              {picks.length === 0 ? (
                <p className="muted small">{t('Nada todavía. Toca una prenda del burro para ponérsela.')}</p>
              ) : (
                <ol className="picked demo-picked">
                  {picks.map((p) => {
                    const g = BY_ID.get(p.id);
                    if (!g) return null;
                    return (
                      <li key={p.id}>
                        <div className="demo-picked-row">
                          <ColorRow
                            label={g.name}
                            value={p.color}
                            required
                            open={openColor === p.id}
                            onToggle={() => setOpenColor((cur) => (cur === p.id ? null : p.id))}
                            onChange={(c) => setColor(p.id, c)}
                          />
                          <button type="button" className="icon-btn demo-remove" onClick={() => toggle(g)} aria-label={t('Quitar {name}', { name: g.name })} title={t('Quitar del outfit')}>
                            <Icon name="close" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              <div className="demo-cta">
                <button type="button" className="btn wd-add btn-save demo-save" onClick={save} disabled={!picks.length}>
                  <Icon name="spark" size={15} /> {user ? t('Guardar en mi cuenta') : t('Guardar este outfit')}
                </button>
                <p className="muted small">
                  {user
                    ? t('Lo crearemos en tu armario con estas prendas y colores.')
                    : t('Crea tu cuenta gratis y te ofreceremos guardarlo en tu armario con estas prendas y colores.')}
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
