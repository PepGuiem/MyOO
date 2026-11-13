import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { mannequinsApi, plansApi } from '../api/endpoints';
import type { GarmentLike, Mannequin } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { mannequinSelectionId, useBodyShape } from '../lib/bodyPref';
import { isNative } from '../lib/native';
import { useAsync } from '../lib/useAsync';
import { BODY_SHAPES } from '../three/body';
import {
  MEASURE_KEYS,
  MEASURE_LIMITS,
  clampMeasures,
  defaultMeasures,
  measuresFromShape,
  shapeFromMeasures,
  type MeasureKey,
  type Measures,
  type Sex,
} from '../three/bodyMeasures';
import { OutfitStage } from '../three/OutfitMannequin';
import { Busy } from '../components/Spinner';

/** Ropa de prueba para ver cómo queda en el maniquí (no viene de la API). */
const SAMPLE: Record<Sex, GarmentLike[]> = {
  male: [
    { color: '#E2E0DB', attributes: { sleeve: 'short' }, garmentType: { modelKey: 'tshirt', category: 'TOP' } },
    { color: '#2B3445', attributes: { fit: 'slim' }, garmentType: { modelKey: 'pants', category: 'BOTTOM' } },
    { color: '#e8e6e1', attributes: {}, garmentType: { modelKey: 'sneakers', category: 'FOOTWEAR' } },
  ],
  female: [
    { color: '#5a3d46', attributes: {}, garmentType: { modelKey: 'dress', category: 'FULL_BODY' } },
    { color: '#e8e6e1', attributes: {}, garmentType: { modelKey: 'sneakers', category: 'FOOTWEAR' } },
  ],
};

interface Draft {
  id: string | null;
  name: string;
  sex: Sex;
  measures: Measures;
  isDefault: boolean;
}

const newDraft = (sex: Sex, n: number): Draft => ({
  id: null,
  name: n === 0 ? 'Mis medidas' : `Maniquí ${n + 1}`,
  sex,
  measures: defaultMeasures(sex),
  isDefault: n === 0,
});

const fromMannequin = (m: Mannequin): Draft => ({
  id: m.id,
  name: m.name,
  sex: m.sex,
  measures: { ...m.measures },
  isDefault: m.isDefault,
});

const summary = (m: Measures) => `${m.heightCm} cm · ${m.chestCm} / ${m.waistCm} / ${m.hipCm}`;

export function MannequinsPage() {
  const { mannequins, mannequinsLoaded, reloadMannequins, selectedId, setShapeId } = useBodyShape();
  const mine = useAsync(() => plansApi.mine(), []);
  const [draft, setDraft] = useState<Draft | null>(null);

  const usage = mine.data?.usage.find((u) => u.resource === 'MANNEQUINS');
  const atLimit = !!usage && !usage.isUnlimited && usage.used >= (usage.max ?? 0);
  const planName = mine.data?.plan.name ?? '';

  // Sin maniquíes: se abre directamente el editor del primero.
  useEffect(() => {
    if (mannequinsLoaded && mannequins.length === 0 && !draft) setDraft(newDraft('male', 0));
  }, [mannequinsLoaded, mannequins.length, draft]);

  async function afterSave(saved: Mannequin | null) {
    await Promise.all([reloadMannequins(), mine.reload()]);
    if (saved) {
      setShapeId(mannequinSelectionId(saved.id));
      setDraft(fromMannequin(saved));
    } else setDraft(null);
  }

  return (
    <section className="page mannequins">
      <header className="page-head">
        <div>
          <h1>Maniquíes</h1>
          <p className="muted">
            Tu maniquí con tus medidas reales: la ropa se ajusta a él en el armario, el visor y tus outfits.
          </p>
        </div>
        <div className="head-actions">
          {usage && (
            <span className="muted small mq-usage">
              {usage.used} de {usage.isUnlimited ? '∞' : usage.max} · plan {planName}
            </span>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={atLimit || (draft !== null && draft.id === null)}
            onClick={() => setDraft(newDraft(draft?.sex ?? 'male', mannequins.length))}
          >
            <Icon name="plus" /> Nuevo maniquí
          </button>
        </div>
      </header>

      {atLimit && (
        <p className="note mq-limit">
          Tu plan {planName} permite {usage?.max === 1 ? 'un maniquí' : `${usage?.max} maniquíes`}.{' '}
          {isNative ? (
            'Con un plan superior podrás tener más.'
          ) : (
            <>
              <Link to="/account">Mejora tu plan</Link> para tener más (para tu pareja, tu familia o distintas tallas).
            </>
          )}
        </p>
      )}

      <div className="mq-layout">
        <aside className="mq-list" aria-label="Tus maniquíes">
          {mannequins.map((m) => {
            const active = draft?.id === m.id;
            const inUse = selectedId === mannequinSelectionId(m.id);
            return (
              <button
                key={m.id}
                type="button"
                className={`mq-card${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => setDraft(fromMannequin(m))}
              >
                <span className="mq-card-name">{m.name}</span>
                <span className="mq-card-meta">
                  {m.sex === 'male' ? 'Hombre' : 'Mujer'} · {summary(m.measures)}
                </span>
                {(m.isDefault || inUse) && <span className="mq-badge">{inUse ? 'En uso' : 'Predeterminado'}</span>}
              </button>
            );
          })}
          {mannequinsLoaded && mannequins.length === 0 && (
            <p className="muted small">Aún no tienes maniquíes propios: crea el primero con tus medidas.</p>
          )}
        </aside>

        {draft ? (
          <MannequinEditor
            key={draft.id ?? 'nuevo'}
            draft={draft}
            onChange={setDraft}
            onSaved={afterSave}
            onCancel={() => setDraft(null)}
            canCancel={mannequins.length > 0}
          />
        ) : (
          <div className="mq-empty panel">
            <p>Elige un maniquí para cambiar sus medidas o crea uno nuevo.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function MannequinEditor({
  draft,
  onChange,
  onSaved,
  onCancel,
  canCancel,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onSaved: (m: Mannequin | null) => Promise<void>;
  onCancel: () => void;
  canCancel: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [withClothes, setWithClothes] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Texto de los campos numéricos mientras se escribe (se valida al salir).
  const [typing, setTyping] = useState<Partial<Record<MeasureKey, string>>>({});

  // El 3D se recalcula con un pequeño retraso mientras se arrastra (no bloquea el deslizador).
  const deferred = useDeferredValue(draft);
  const shape = useMemo(() => shapeFromMeasures(deferred.sex, deferred.measures), [deferred.sex, deferred.measures]);

  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const setMeasure = (key: MeasureKey, value: number) => set({ measures: { ...draft.measures, [key]: value } });

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      name: draft.name.trim(),
      sex: draft.sex,
      measures: clampMeasures(draft.measures),
      isDefault: draft.isDefault,
    };
    try {
      const saved = draft.id ? await mannequinsApi.update(draft.id, body) : await mannequinsApi.create(body);
      await onSaved(saved);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft.id) return;
    setBusy(true);
    setError(null);
    try {
      await mannequinsApi.remove(draft.id);
      await onSaved(null);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const presets = BODY_SHAPES.filter((b) => b.sex === draft.sex);

  return (
    <div className="mq-editor">
      <div className="mq-stage">
        <OutfitStage garments={withClothes ? SAMPLE[draft.sex] : []} shape={shape} distance={3.9} />
        <label className="check mq-stage-toggle">
          <input type="checkbox" checked={withClothes} onChange={(e) => setWithClothes(e.target.checked)} />
          Con ropa de prueba
        </label>
      </div>

      <form className="mq-form panel" onSubmit={save}>
        <label className="field">
          <span>Nombre</span>
          <input required maxLength={60} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
        </label>

        <div className="field">
          <span className="field-label">Cuerpo</span>
          <div className="segmented" role="group" aria-label="Hombre o mujer">
            {(['male', 'female'] as Sex[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={draft.sex === s}
                onClick={() => draft.sex !== s && set({ sex: s, measures: defaultMeasures(s) })}
              >
                {s === 'male' ? 'Hombre' : 'Mujer'}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">Partir de una silueta</span>
          <div className="chips chips-small">
            {presets.map((p) => (
              <button key={p.id} type="button" className="chip" onClick={() => set({ measures: clampMeasures(measuresFromShape(p)) })}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <fieldset className="mq-measures">
          <legend>Medidas reales · arrastra para estirar o escribe en cm</legend>
          {MEASURE_KEYS.map((key) => {
            const lim = MEASURE_LIMITS[key];
            const value = draft.measures[key];
            const id = `mq-${key}`;
            return (
              <div key={key} className="mq-measure">
                <label htmlFor={id} className="mq-measure-label">
                  {lim.label}
                  <small>{lim.hint}</small>
                </label>
                <input
                  id={id}
                  type="range"
                  min={lim.min}
                  max={lim.max}
                  step={0.5}
                  value={value}
                  onChange={(e) => setMeasure(key, Number(e.target.value))}
                />
                <span className="mq-measure-num">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={lim.min}
                    max={lim.max}
                    step={0.5}
                    aria-label={`${lim.label} en centímetros`}
                    value={typing[key] ?? String(value)}
                    onChange={(e) => {
                      setTyping({ ...typing, [key]: e.target.value });
                      const n = Number(e.target.value.replace(',', '.'));
                      if (Number.isFinite(n) && n >= lim.min && n <= lim.max) setMeasure(key, n);
                    }}
                    onBlur={() => {
                      setTyping({ ...typing, [key]: undefined });
                      setMeasure(key, clampMeasures(draft.measures)[key]);
                    }}
                  />
                  cm
                </span>
              </div>
            );
          })}
        </fieldset>

        <label className="check">
          <input type="checkbox" checked={draft.isDefault} onChange={(e) => set({ isDefault: e.target.checked })} />
          Usarlo por defecto en la cuenta
        </label>

        <ErrorNote error={error} />

        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={busy || !draft.name.trim()}>
            {busy ? <Busy text="Guardando…" /> : draft.id ? 'Guardar cambios' : 'Crear maniquí'}
          </button>
          {canCancel && (
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
              Cerrar
            </button>
          )}
          {draft.id &&
            (confirmDelete ? (
              <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
                Sí, eliminar
              </button>
            ) : (
              <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                Eliminar
              </button>
            ))}
        </div>
      </form>
    </div>
  );
}
