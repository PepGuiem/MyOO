import { useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { availableNavItems, NAV_GROUP_META } from '../components/navCatalog';
import { SectionHead } from '../components/street/SectionHead';
import { t } from '../i18n';
import {
  ACCENT_PRESETS,
  accentTones,
  customTones,
  usePreferences,
  type AccentId,
  type NavGroupId,
  type NavItemId,
  type Preferences,
} from '../lib/preferences';

/**
 * «Personalizar»: la web a tu gusto. Cada cambio se ve al momento y se guarda
 * en tu cuenta (mismos ajustes en el ordenador, el móvil y la app).
 */
export function PersonalizePage() {
  const { prefs, update, reset, saveState } = usePreferences();
  const [confirmReset, setConfirmReset] = useState(false);

  const setMenu = (patch: Partial<Preferences['menu']>) => update((p) => ({ ...p, menu: { ...p.menu, ...patch } }));

  return (
    <section className="page ux pz">
      <header className="ux-head pz-head">
        <div>
          <span className="wd-kicker">
            <Icon name="palette" size={12} /> {t('A tu gusto')}
          </span>
          <h1 className="wd-title ux-title" data-text={t('Personalizar')}>
            {t('Personalizar')}
          </h1>
          <p className="ux-lede">{t('Color neón, menú, efectos y lectura. Se aplica al momento y se guarda en tu cuenta.')}</p>
        </div>
        <p className={`pz-save is-${saveState}`} role="status" aria-live="polite">
          {saveState === 'saving' && t('Guardando…')}
          {saveState === 'saved' && (
            <>
              <Icon name="check" size={13} /> {t('Guardado en tu cuenta')}
            </>
          )}
          {saveState === 'error' && t('No se ha podido guardar. Se aplica en este dispositivo; vuelve a intentarlo.')}
        </p>
      </header>

      {/* 01 · Color neón */}
      <section className="pz-section" aria-labelledby="pz-accent">
        <SectionHead n={1} title={t('Color neón')} id="pz-accent" />
        <div className="pz-card">
          <div className="pz-swatches" role="radiogroup" aria-label={t('Color neón')}>
            {(Object.keys(ACCENT_PRESETS) as Exclude<AccentId, 'custom'>[]).map((id) => (
              <Swatch
                key={id}
                tones={ACCENT_PRESETS[id].tones}
                label={ACCENT_PRESETS[id].label}
                checked={prefs.accent === id}
                onPick={() => update({ accent: id })}
              />
            ))}
            <label className={`pz-swatch pz-custom${prefs.accent === 'custom' ? ' is-on' : ''}`}>
              <span className="pz-swatch-dot" style={swatchStyle(customTones(prefs.customAccent ?? '#00c2ff'))} aria-hidden="true">
                <Icon name="plus" size={14} />
              </span>
              <span className="pz-swatch-name">{t('Tu color')}</span>
              <input
                type="color"
                className="pz-color-input"
                value={prefs.customAccent ?? '#00c2ff'}
                aria-label={t('Elegir tu propio color')}
                onChange={(e) => update({ accent: 'custom', customAccent: e.target.value })}
              />
            </label>
          </div>
          {prefs.accent === 'custom' && (
            <p className="muted small pz-note">{t('Si el color es muy claro, se oscurece un poco para que el texto blanco encima se lea bien.')}</p>
          )}
          <AccentPreview prefs={prefs} />
        </div>
      </section>

      {/* 02 · Menú */}
      <section className="pz-section" aria-labelledby="pz-menu">
        <SectionHead n={2} title={t('Menú')} id="pz-menu" />
        <div className="pz-card">
          <Toggle
            label={t('Menú compacto')}
            hint={t('En el ordenador, el menú lateral muestra solo los iconos (el nombre sale al pasar el ratón).')}
            checked={prefs.menu.compact}
            onChange={(on) => setMenu({ compact: on })}
          />
          <MenuEditor prefs={prefs} setMenu={setMenu} />
        </div>
      </section>

      {/* 03 · Efectos y fondo */}
      <section className="pz-section" aria-labelledby="pz-fx">
        <SectionHead n={3} title={t('Efectos y fondo')} id="pz-fx" />
        <div className="pz-card pz-rows">
          <Choice
            label={t('Brillo neón')}
            hint={t('Los resplandores de textos, botones y tubos.')}
            value={prefs.neon}
            options={[
              ['full', t('Completo')],
              ['soft', t('Suave')],
              ['off', t('Apagado')],
            ]}
            onChange={(v) => update({ neon: v })}
          />
          <Choice
            label={t('Fondo')}
            hint={t('La pared de grafitis con tubos de neón que hay detrás de todo.')}
            value={prefs.background}
            options={[
              ['animated', t('Animado')],
              ['still', t('Quieto')],
              ['off', t('Liso')],
            ]}
            onChange={(v) => update({ background: v })}
          />
          <Choice
            label={t('Animaciones')}
            hint={t('Transiciones, apariciones y giros. Si tu sistema pide reducirlas, se reducen igual.')}
            value={prefs.motion}
            options={[
              ['full', t('Todas')],
              ['reduced', t('Reducidas')],
            ]}
            onChange={(v) => update({ motion: v })}
          />
        </div>
      </section>

      {/* 04 · Lectura y 3D */}
      <section className="pz-section" aria-labelledby="pz-read">
        <SectionHead n={4} title={t('Lectura y 3D')} id="pz-read" />
        <div className="pz-card pz-rows">
          <Choice
            label={t('Tamaño del texto')}
            value={prefs.textSize}
            options={[
              ['small', t('Pequeño')],
              ['normal', t('Normal')],
              ['large', t('Grande')],
            ]}
            onChange={(v) => update({ textSize: v })}
          />
          <Choice
            label={t('Densidad')}
            hint={t('Compacta: menos aire entre tarjetas y más prendas por fila.')}
            value={prefs.density}
            options={[
              ['comfortable', t('Cómoda')],
              ['compact', t('Compacta')],
            ]}
            onChange={(v) => update({ density: v })}
          />
          <Choice
            label={t('Calidad 3D')}
            hint={t('Ahorro de batería: menos resolución y sin suavizado de bordes en las miniaturas 3D.')}
            value={prefs.quality3d}
            options={[
              ['high', t('Alta')],
              ['saver', t('Ahorro de batería')],
            ]}
            onChange={(v) => update({ quality3d: v })}
          />
        </div>
      </section>

      <footer className="pz-foot">
        {confirmReset ? (
          <div className="pz-confirm" role="group" aria-label={t('Restablecer')}>
            <span>{t('¿Volver a los ajustes de fábrica?')}</span>
            <button
              type="button"
              className="btn wd-add"
              onClick={() => {
                reset();
                setConfirmReset(false);
              }}
            >
              {t('Sí, restablecer')}
            </button>
            <button type="button" className="btn wd-btn-line" onClick={() => setConfirmReset(false)}>
              {t('Cancelar')}
            </button>
          </div>
        ) : (
          <button type="button" className="btn wd-btn-line" onClick={() => setConfirmReset(true)}>
            <Icon name="undo" size={14} /> <span>{t('Restablecer todo')}</span>
          </button>
        )}
      </footer>
    </section>
  );
}

function swatchStyle(tones: string[]) {
  return { background: `linear-gradient(135deg, ${tones[0]}, ${tones[1]} 60%, ${tones[3]})`, boxShadow: `0 0 16px ${tones[0]}66` };
}

function Swatch({ tones, label, checked, onPick }: { tones: string[]; label: string; checked: boolean; onPick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={checked} className={`pz-swatch${checked ? ' is-on' : ''}`} onClick={onPick}>
      <span className="pz-swatch-dot" style={swatchStyle(tones)} aria-hidden="true">
        {checked && <Icon name="check" size={14} />}
      </span>
      <span className="pz-swatch-name">{label}</span>
    </button>
  );
}

/** Muestra en pequeño cómo quedan botón, chip, aviso y título con el color elegido. */
function AccentPreview({ prefs }: { prefs: Preferences }) {
  const tones = accentTones(prefs);
  return (
    <div className="pz-preview" aria-hidden="true">
      <span className="pz-prev-title">{t('Así se ve')}</span>
      <span className="btn wd-add pz-prev-btn">
        <Icon name="plus" size={14} /> {t('Añadir prenda')}
      </span>
      <span className="pz-prev-chip">{t('Streetwear')}</span>
      <span className="badge">3</span>
      <span className="pz-prev-bar" style={{ background: `linear-gradient(90deg, ${tones.join(', ')})` }} />
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="pz-toggle">
      <span className="pz-toggle-text">
        <strong>{label}</strong>
        {hint && <span className="muted small">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="pz-switch" aria-hidden="true" />
    </label>
  );
}

function Choice<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="pz-choice">
      <div className="pz-choice-text">
        <strong>{label}</strong>
        {hint && <span className="muted small">{hint}</span>}
      </div>
      <div className="pz-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'is-on' : ''} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Orden de los grupos, entradas fijadas (con su orden) y entradas ocultas. */
function MenuEditor({ prefs, setMenu }: { prefs: Preferences; setMenu: (patch: Partial<Preferences['menu']>) => void }) {
  const { hidden, pinned, groupOrder } = prefs.menu;
  const items = availableNavItems();
  const byId = new Map(items.map((i) => [i.id, i]));

  const move = <T,>(list: T[], i: number, d: -1 | 1): T[] => {
    const next = [...list];
    const j = i + d;
    if (j < 0 || j >= next.length) return list;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };
  const togglePin = (id: NavItemId) => setMenu({ pinned: pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id] });
  const toggleHide = (id: NavItemId) =>
    setMenu(
      hidden.includes(id)
        ? { hidden: hidden.filter((x) => x !== id) }
        : { hidden: [...hidden, id], pinned: pinned.filter((x) => x !== id) },
    );

  const pinnedItems = pinned.map((id) => byId.get(id)).filter((i): i is NonNullable<typeof i> => !!i);

  return (
    <div className="pz-menu">
      <div className="pz-menu-col">
        <h3 className="pz-sub">{t('Fijadas arriba')}</h3>
        {pinnedItems.length === 0 ? (
          <p className="muted small">{t('Fija tus favoritas con la chincheta: saldrán justo debajo de Inicio y Armario.')}</p>
        ) : (
          <ol className="pz-order">
            {pinnedItems.map((i, idx) => (
              <li key={i.id}>
                <Icon name={i.icon} size={15} />
                <span className="pz-order-name">{i.label()}</span>
                <OrderButtons
                  label={i.label()}
                  first={idx === 0}
                  last={idx === pinnedItems.length - 1}
                  onMove={(d) => setMenu({ pinned: move(pinned, pinned.indexOf(i.id), d) })}
                />
              </li>
            ))}
          </ol>
        )}

        <h3 className="pz-sub">{t('Orden de los grupos')}</h3>
        <ol className="pz-order">
          {groupOrder.map((g: NavGroupId, idx) => (
            <li key={g}>
              <Icon name={NAV_GROUP_META[g].icon} size={15} />
              <span className="pz-order-name">{NAV_GROUP_META[g].label()}</span>
              <OrderButtons label={NAV_GROUP_META[g].label()} first={idx === 0} last={idx === groupOrder.length - 1} onMove={(d) => setMenu({ groupOrder: move(groupOrder, idx, d) })} />
            </li>
          ))}
        </ol>
      </div>

      <div className="pz-menu-col">
        <h3 className="pz-sub">{t('Entradas')}</h3>
        <ul className="pz-items">
          {items.map((i) => {
            const isHidden = hidden.includes(i.id);
            const isPinned = pinned.includes(i.id);
            return (
              <li key={i.id} className={isHidden ? 'is-hidden' : ''}>
                <Icon name={i.icon} size={15} />
                <span className="pz-item-name">
                  {i.label()}
                  <span className="pz-item-group">{NAV_GROUP_META[i.group].label()}</span>
                </span>
                <IconToggle
                  icon="pin"
                  on={isPinned}
                  disabled={isHidden}
                  label={isPinned ? t('Quitar «{name}» de fijadas', { name: i.label() }) : t('Fijar «{name}» arriba', { name: i.label() })}
                  onClick={() => togglePin(i.id)}
                />
                <IconToggle
                  icon={isHidden ? 'eyeOff' : 'eye'}
                  on={!isHidden}
                  label={isHidden ? t('Mostrar «{name}» en el menú', { name: i.label() }) : t('Ocultar «{name}» del menú', { name: i.label() })}
                  onClick={() => toggleHide(i.id)}
                />
              </li>
            );
          })}
        </ul>
        <p className="muted small">{t('Inicio, Armario y tu perfil siempre están en el menú.')}</p>
      </div>
    </div>
  );
}

function OrderButtons({ label, first, last, onMove }: { label: string; first: boolean; last: boolean; onMove: (d: -1 | 1) => void }) {
  return (
    <span className="pz-order-btns">
      <button type="button" className="pz-icon-btn" disabled={first} aria-label={t('Subir «{name}»', { name: label })} onClick={() => onMove(-1)}>
        <Icon name="up" size={14} />
      </button>
      <button type="button" className="pz-icon-btn" disabled={last} aria-label={t('Bajar «{name}»', { name: label })} onClick={() => onMove(1)}>
        <Icon name="down" size={14} />
      </button>
    </span>
  );
}

function IconToggle({ icon, on, disabled, label, onClick }: { icon: IconName; on: boolean; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className={`pz-icon-btn${on ? ' is-on' : ''}`} aria-pressed={on} disabled={disabled} aria-label={label} title={label} onClick={onClick}>
      <Icon name={icon} size={15} />
    </button>
  );
}
