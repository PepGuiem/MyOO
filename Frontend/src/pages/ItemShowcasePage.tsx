import { libraryModel } from '../three/libraryCatalog';
import { useProgress } from '@react-three/drei';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { assetsApi, itemsApi } from '../api/endpoints';
import type { AttributeField, AttributeValue, CustomDetail, Customization, WardrobeItem } from '../api/types';
import { CustomizationPanel, newDetail, type CustomTab, type PlacementState } from '../components/CustomizationPanel';
import { DetailList, detailTitle } from '../components/DetailList';
import { DrawPad, type DrawResult } from '../components/DrawPad';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { ItemEditor } from '../components/ItemEditor';
import { useAppData } from '../components/Layout';
import { useBodyShape } from '../lib/bodyPref';
import { hasWebGL, useOnScreen, usePrefersReducedMotion } from '../lib/device';
import { SEASON_LABEL, formatDate } from '../lib/labels';
import { PURCHASE_PLATFORMS, STYLE_TAGS, formatMoney, hostOf, labelOf, safeHttpUrl } from '../lib/stylist';
import { useAsync } from '../lib/useAsync';
import { FABRIC_LABEL, fabricFor } from '../three/fabric';
import type { DrawProjector } from '../three/DrawBridge';
import { MAX_DRAWING_SIZE } from '../lib/customLabels';
import { patternScaleFor } from '../lib/patterns';
import type { StageMode } from '../three/showcase/ShowcaseStage';
import { Busy, Spinner } from '../components/Spinner';
import { t } from '../i18n';
import { FEATURES } from '../lib/features';

// El escenario 3D va en su propio trozo de código: se descarga al abrir el visor.
const ShowcaseStage = lazy(() => import('../three/showcase/ShowcaseStage').then((m) => ({ default: m.ShowcaseStage })));

/** Variantes de color para previsualizar (además del color guardado). */
const VARIANTS = ['#E8E8E8', '#8E8E93', '#2E2E33', '#151517', '#2B3445', '#8FA6C1', '#C8B79A', '#3B2F2A', '#5F6B52', '#8C3B3B'];

type ModelState = 'none' | 'loading' | 'ready' | 'failed';

/**
 * Visor de una prenda a pantalla completa: 3D interactivo con materiales PBR,
 * iluminación de estudio, movimiento de tela opcional y variantes de color.
 */
export default function ItemShowcasePage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { wardrobes, garmentTypes } = useAppData();
  const { shape } = useBodyShape();
  const reduced = usePrefersReducedMotion();
  const backTo = (location.state as { from?: string } | null)?.from ?? '/armario';

  const { data: item, error, loading, reload, setData } = useAsync(() => itemsApi.get(id), [id]);

  const [preview, setPreview] = useState<string | null>(null);
  const [mode, setMode] = useState<StageMode>('garment');
  const [wind, setWind] = useState(!reduced);
  const [autoRotate, setAutoRotate] = useState(!reduced);
  const [resetSignal, setResetSignal] = useState(0);
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [savingColor, setSavingColor] = useState(false);
  const [modelState, setModelState] = useState<ModelState>('none');
  const [tintable, setTintable] = useState(true);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  // Personalización: borrador que se ve en vivo y se guarda al pulsar "Guardar".
  const [customizing, setCustomizing] = useState(false);
  const [draft, setDraft] = useState<Customization | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null);
  const [placement, setPlacement] = useState<PlacementState['mode']>(null);
  const [savingCustom, setSavingCustom] = useState(false);
  const [customError, setCustomError] = useState<unknown>(null);
  // Pestaña con la que se abre «Personalizar» (la lista de detalles abre «Detalles»)
  const [customTab, setCustomTab] = useState<CustomTab | undefined>(undefined);
  // Quitar un detalle desde la lista del visor (se guarda al momento, con «Deshacer»)
  const [removed, setRemoved] = useState<{ detail: CustomDetail; index: number } | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<unknown>(null);
  // Dibujo a mano alzada: capa 2D encima del visor que se estampa en la prenda.
  const [drawing, setDrawing] = useState(false);
  const [drawBusy, setDrawBusy] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);
  const projector = useRef<DrawProjector | null>(null);
  const onDrawProjector = useCallback((p: DrawProjector | null) => {
    projector.current = p;
  }, []);
  const onScreen = useOnScreen(stageEl);
  const webgl = useMemo(hasWebGL, []);

  // Si el sistema pide menos movimiento, apagamos viento y giro.
  useEffect(() => {
    if (reduced) {
      setWind(false);
      setAutoRotate(false);
    }
  }, [reduced]);

  // Cada prenda empieza con su color y su modelo.
  useEffect(() => {
    setPreview(null);
    setSaveError(null);
    setModelState(item?.modelUrl ? 'loading' : 'none');
    setTintable(true);
    if (item?.modelUrl) setMode('garment');
    setCustomizing(false);
    setDraft(null);
    setSelectedDetail(null);
    setPlacement(null);
    setDrawing(false);
  }, [item?.id, item?.modelUrl]);

  // Recién creada con «Añadir y poner detalles»: se abre directamente la
  // personalización (una sola vez: se limpia la marca del historial).
  const openCustomize = (location.state as { customize?: boolean } | null)?.customize === true;
  useEffect(() => {
    if (!item || !openCustomize) return;
    setDraft(structuredClone(item.customization ?? {}));
    setCustomTab('details');
    setCustomizing(true);
    setMode('garment');
    setCustomError(null);
    navigate(location.pathname + location.search, { replace: true, state: { from: backTo } });
  }, [item, openCustomize, navigate, location.pathname, location.search, backTo]);

  // Clic en la prenda: coloca un detalle nuevo o mueve el seleccionado.
  const onPick = useCallback(
    (point: [number, number, number], normal: [number, number, number]) => {
      if (!placement) return;
      // El detalle nuevo se crea fuera del "updater" (React puede llamarlo dos veces).
      const created = placement === 'move' ? null : newDetail(placement, point, normal);
      setDraft((d) => {
        const current = d ?? {};
        const details = current.details ?? [];
        if (!created) {
          return { ...current, details: details.map((x) => (x.id === selectedDetail ? { ...x, position: point, normal } : x)) };
        }
        return { ...current, details: [...details, created] };
      });
      if (created) setSelectedDetail(created.id);
      setPlacement(null);
    },
    [placement, selectedDetail],
  );

  // Arrastrar un detalle por la prenda: al soltarlo queda en su sitio nuevo.
  const onMoveDetail = useCallback((id: string, point: [number, number, number], normal: [number, number, number]) => {
    setDraft((d) => {
      const current = d ?? {};
      return { ...current, details: (current.details ?? []).map((x) => (x.id === id ? { ...x, position: point, normal } : x)) };
    });
  }, []);
  const onSelectDetail = useCallback((id: string) => {
    setSelectedDetail(id);
    setPlacement(null);
  }, []);

  // Aplicar el dibujo: se proyecta desde la cámara, se guarda la imagen
  // (almacenamiento de imágenes; la prenda solo guarda su id) y se añade como detalle.
  const applyDrawing = useCallback(async ({ blob, footprint }: DrawResult) => {
    const project = projector.current;
    const placed = project?.(footprint) ?? null;
    if (!placed) {
      setDrawError(t('El dibujo no cae sobre la prenda: dibuja encima de ella.'));
      return;
    }
    if (placed.size > MAX_DRAWING_SIZE) {
      setDrawError(t('El dibujo es demasiado grande (más de {v} cm). Acerca la cámara o dibuja más pequeño.', { v: MAX_DRAWING_SIZE * 100 }));
      return;
    }
    setDrawBusy(true);
    setDrawError(null);
    try {
      const asset = await assetsApi.upload(new File([blob], 'dibujo.png', { type: 'image/png' }));
      const created = { ...newDetail('drawing', placed.position, placed.normal), size: Math.max(0.01, placed.size), rotation: placed.rotation, assetId: asset.id };
      setDraft((d) => {
        const current = d ?? {};
        return { ...current, details: [...(current.details ?? []), created] };
      });
      setSelectedDetail(created.id);
      setDrawing(false);
    } catch (err) {
      setDrawError(err instanceof Error ? err.message : t('No se pudo guardar el dibujo.'));
    } finally {
      setDrawBusy(false);
    }
  }, []);

  const onModelLoaded = useCallback((info: { tintable: boolean }) => {
    setModelState('ready');
    setTintable(info.tintable);
  }, []);
  const onModelError = useCallback(() => setModelState('failed'), []);

  if (loading && !item) {
    return (
      <section className="showcase ux sc">
        <div className="showcase-stage is-loading" aria-busy="true">
          <p className="stage-status"><Spinner size={30} label={t('Cargando prenda…')} /></p>
        </div>
      </section>
    );
  }

  if (!item) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <section className="page ux sc">
        <Link to={backTo} className="back-link"><Icon name="back" size={14} /> {t('Volver')}</Link>
        {notFound ? <p className="note">{t('Esta prenda no existe o no es tuya.')}</p> : <ErrorNote error={error} />}
        {!notFound && (
          <button type="button" className="btn wd-btn-line" onClick={() => void reload()}>
            {t('Reintentar')}
          </button>
        )}
      </section>
    );
  }

  const color = preview ?? item.color;
  const type = garmentTypes.find((t) => t.id === item.garmentType.id);
  const fabric = fabricFor(item.garmentType.modelKey, item.attributes);
  const useGlb = !!item.modelUrl && modelState !== 'failed';
  const libraryEntry = libraryModel(item.garmentType.modelKey, item.attributes ?? {}, item.customization?.parts);
  const canTint = !useGlb || tintable;
  const canDress = !item.modelUrl || modelState === 'failed';

  const customDirty = customizing && draft !== null && JSON.stringify(draft) !== JSON.stringify(item.customization ?? {});

  function startCustomizing(tab?: CustomTab, detailId?: string) {
    if (!item) return;
    setDraft(structuredClone(item.customization ?? {}));
    setCustomTab(tab);
    setSelectedDetail(detailId ?? null);
    setPlacement(null);
    setRemoved(null);
    setCustomizing(true);
    setMode('garment');
    setCustomError(null);
  }

  /** Guarda la lista de detalles tal cual (quitar o deshacer desde el visor). */
  async function saveDetails(details: CustomDetail[]) {
    if (!item) return false;
    setDetailBusy(true);
    setDetailError(null);
    try {
      const saved = await itemsApi.update(item.id, { customization: { ...(item.customization ?? {}), details } });
      setData(saved);
      return true;
    } catch (err) {
      setDetailError(err);
      return false;
    } finally {
      setDetailBusy(false);
    }
  }

  async function removeDetailNow(id: string) {
    const list = item?.customization?.details ?? [];
    const index = list.findIndex((d) => d.id === id);
    if (index < 0) return;
    if (selectedDetail === id) setSelectedDetail(null);
    if (await saveDetails(list.filter((d) => d.id !== id))) setRemoved({ detail: list[index], index });
  }

  async function undoRemove() {
    if (!removed) return;
    const list = [...(item?.customization?.details ?? [])];
    list.splice(Math.min(removed.index, list.length), 0, removed.detail);
    if (await saveDetails(list)) setRemoved(null);
  }

  function stopCustomizing() {
    setCustomizing(false);
    setDrawing(false);
    setDraft(null);
    setSelectedDetail(null);
    setPlacement(null);
  }

  async function saveCustomization() {
    if (!item || !draft) return;
    setSavingCustom(true);
    setCustomError(null);
    try {
      const saved = await itemsApi.update(item.id, { customization: draft });
      setData(saved);
      setDraft(structuredClone(saved.customization ?? {}));
    } catch (err) {
      setCustomError(err);
    } finally {
      setSavingCustom(false);
    }
  }

  const stageGarment = customizing && draft ? { ...item, customization: draft } : item;

  async function saveColor() {
    if (!item || !preview) return;
    setSavingColor(true);
    setSaveError(null);
    try {
      const saved = await itemsApi.update(item.id, { color: preview });
      setData(saved);
      setPreview(null);
    } catch (err) {
      setSaveError(err);
    } finally {
      setSavingColor(false);
    }
  }

  return (
    <section className="showcase ux sc">
      <header className="showcase-head ux-head">
        <Link to={backTo} className="back-link"><Icon name="back" size={14} /> {backTo === '/' ? t('Inicio') : backTo.startsWith('/outfits') ? t('Outfits') : t('Armario')}</Link>
        <div className="showcase-title">
          <span className="wd-kicker">
            <Icon name="tag" size={12} /> {t('Item file')}
          </span>
          <h1 className="wd-title ux-title" data-text={item.name}>
            {item.name}
          </h1>
          <p className="ux-lede sc-path">
            {item.garmentType.name} <i aria-hidden="true">/</i> {item.wardrobe.name}
          </p>
        </div>
        <div className="head-actions wd-head-actions">
          {!customizing && (
            <button type="button" className="btn wd-add" onClick={() => startCustomizing()} disabled={useGlb}>
              <Icon name="palette" size={15} /> <span>{t('Personalizar')}</span>
            </button>
          )}
          <button type="button" className="btn wd-btn-line" onClick={() => setEditing(true)}>
            <Icon name="edit" size={14} /> {t('Editar')}
          </button>
          {FEATURES.market && !item.wishlistStatus && (
            <Link to={`/market?sell=${item.id}`} className="btn wd-btn-line" title={t('Publicarla en Street Market')}>
              <Icon name="store" size={14} /> {t('Vender')}
            </Link>
          )}
        </div>
      </header>

      <div className="showcase-body">
        <div className={`showcase-stage${placement ? ' is-placing' : ''}${drawing ? ' is-drawing' : ''}`} ref={setStageEl}>
          {webgl ? (
            <Suspense fallback={<p className="stage-status"><Spinner size={30} label={t('Preparando el visor 3D…')} /></p>}>
              <ShowcaseStage
                garment={stageGarment}
                modelUrl={useGlb ? item.modelUrl : null}
                color={color}
                mode={canDress ? mode : 'garment'}
                shape={shape}
                wind={wind}
                autoRotate={autoRotate && !customizing}
                reduced={reduced}
                active={onScreen}
                resetSignal={resetSignal}
                onModelLoaded={onModelLoaded}
                onModelError={onModelError}
                onPick={customizing && placement ? onPick : undefined}
                selectedDetailId={selectedDetail}
                onSelectDetail={onSelectDetail}
                onMoveDetail={customizing && !drawing ? onMoveDetail : undefined}
                onDrawProjector={customizing ? onDrawProjector : undefined}
              />
            </Suspense>
          ) : (
            <NoWebGL item={item} />
          )}

          {webgl && modelState === 'loading' && <ModelProgress />}
          {modelState === 'failed' && (
            <p className="stage-note" role="status">
              {t('No se pudo cargar el modelo 3D de esta prenda. Se muestra el modelo generado.')}
            </p>
          )}

          {webgl && drawing && (
            <DrawPad
              busy={drawBusy}
              error={drawError}
              onApply={(r) => void applyDrawing(r)}
              onCancel={() => setDrawing(false)}
            />
          )}

          {webgl && !drawing && (
            <>
              <p className="stage-hint showcase-hint" aria-hidden="true">
                <span className="hint-pointer">{t('Arrastra para girar · Rueda para acercar')}</span>
                <span className="hint-touch">{t('Desliza en horizontal para girar · Pellizca para acercar')}</span>
              </p>
              <div className="stage-controls" role="toolbar" aria-label={t('Controles del visor')}>
                {canDress && !customizing && (
                  <div className="segmented" role="group" aria-label={t('Presentación')}>
                    <button type="button" aria-pressed={mode === 'garment'} onClick={() => setMode('garment')}>
                      {t('Prenda')}
                    </button>
                    <button type="button" aria-pressed={mode === 'mannequin'} onClick={() => setMode('mannequin')}>
                      {t('En maniquí')}
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="ctl"
                  aria-pressed={wind}
                  onClick={() => setWind((w) => !w)}
                  title={t('Movimiento de la tela (aproximación visual, no simulación física)')}
                >
                  {t('Viento {v}', { v: wind ? t('sí') : t('no') })}
                </button>
                <button
                  type="button"
                  className="ctl"
                  aria-pressed={autoRotate}
                  onClick={() => setAutoRotate((a) => !a)}
                  disabled={reduced}
                  title={reduced ? t('Desactivado: tu sistema pide reducir el movimiento') : t('Giro lento cuando no tocas la prenda')}
                >
                  {t('Giro {v}', { v: autoRotate ? t('sí') : t('no') })}
                </button>
                <button
                  type="button"
                  className="ctl"
                  aria-label={t('Restablecer vista')}
                  title={t('Volver a la vista inicial')}
                  onClick={() => setResetSignal((n) => n + 1)}
                >
                  {t('Restablecer')}
                </button>
              </div>
            </>
          )}
        </div>

        <aside className={`showcase-panel${customizing ? ' is-customizing' : ''}`}>
          {customizing && !type?.customizationOptions && (
            <section aria-labelledby="custom-title" className="custom-wrap">
              <h2 id="custom-title" className="panel-title">{t('Personalizar')}</h2>
              <p className="note">
                {t('El servidor no ofrece todavía la personalización de prendas. Suele pasar cuando el backend sigue con la versión anterior: páralo, ejecuta')} <code>{t('npx prisma migrate dev')}</code> {t('en la carpeta Backend y vuelve a arrancarlo con')} <code>{t('npm run start:dev')}</code>{t('. Después recarga esta página.')}
              </p>
              <div className="actions custom-actions">
                <button type="button" className="btn wd-btn-line" onClick={stopCustomizing}>
                  {t('Cerrar')}
                </button>
              </div>
            </section>
          )}
          {customizing && draft && type?.customizationOptions && (
            <section aria-labelledby="custom-title" className="custom-wrap">
              <h2 id="custom-title" className="panel-title">{t('Personalizar')}</h2>
              <CustomizationPanel
                options={type.customizationOptions}
                initialTab={customTab}
                value={draft}
                onChange={(update) => setDraft((d) => update(d ?? {}))}
                selectedId={selectedDetail}
                onSelect={(id) => {
                  setSelectedDetail(id);
                  setPlacement(null);
                }}
                placement={placement}
                onPlacement={setPlacement}
                disabled={useGlb}
                baseColor={color}
                patternScale={patternScaleFor(type.modelKey)}
                library={!useGlb && libraryEntry ? { colors: libraryEntry.colors ?? [], parts: libraryEntry.parts ?? [] } : null}
                onDraw={
                  webgl
                    ? () => {
                        setPlacement(null);
                        setSelectedDetail(null);
                        setDrawError(null);
                        setDrawing(true);
                      }
                    : undefined
                }
              />
              <ErrorNote error={customError} />
              <div className="actions custom-actions">
                <button type="button" className="btn wd-btn-line" onClick={stopCustomizing}>
                  {customDirty ? t('Descartar') : t('Cerrar')}
                </button>
                <span className="spacer" />
                <button type="button" className="btn wd-add" onClick={() => void saveCustomization()} disabled={!customDirty || savingCustom}>
                  {savingCustom ? <Busy text={t('Guardando…')} /> : t('Guardar')}
                </button>
              </div>
            </section>
          )}
          {!customizing && (
          <>
          <section aria-labelledby="item-details-title" className="item-details">
            <div className="panel-title-row">
              <h2 id="item-details-title" className="panel-title">
                {t('Parches, bordados y estampados{v}', { v: (item.customization?.details?.length ?? 0) > 0 ? ` (${item.customization?.details?.length})` : '' })}
              </h2>
              {!useGlb && (
                <button type="button" className="btn wd-btn-line btn-small" onClick={() => startCustomizing('details')}>
                  <Icon name="plus" size={13} /> {t('Añadir')}
                </button>
              )}
            </div>
            {(item.customization?.details?.length ?? 0) === 0 ? (
              <p className="muted small">
                {useGlb ? t('Esta prenda usa un modelo 3D propio (.glb): no admite detalles.') : t('Aún no tiene ninguno. Pulsa «Añadir» para poner parches, bordados, estampados, texto o un dibujo.')}
              </p>
            ) : (
              <>
                <p className="muted small">{t('Pulsa uno para verlo resaltado en la prenda.')}</p>
                <DetailList
                  details={item.customization?.details ?? []}
                  selectedId={selectedDetail}
                  onSelect={setSelectedDetail}
                  onEdit={useGlb ? undefined : (id) => startCustomizing('details', id)}
                  onRemove={useGlb || detailBusy ? undefined : (id) => void removeDetailNow(id)}
                />
              </>
            )}
            {removed && (
              <p className="note small detail-undo" role="status">
                {t('Quitado: {detailTitle}.', { detailTitle: detailTitle(removed.detail) })}{' '}
                <button type="button" className="btn-link" onClick={() => void undoRemove()} disabled={detailBusy}>
                  {t('Deshacer')}
                </button>
              </p>
            )}
            <ErrorNote error={detailError} />
          </section>

          <section aria-labelledby="variants-title">
            <h2 id="variants-title" className="panel-title">{t('Color')}</h2>
            {canTint ? (
              <>
                <div className="color-row">
                  {[item.color, ...VARIANTS.filter((c) => c !== item.color.toUpperCase())].map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      className={`color-chip${c.toUpperCase() === color.toUpperCase() ? ' is-active' : ''}`}
                      style={{ background: c }}
                      aria-label={i === 0 ? t('Color guardado {c}', { c }) : t('Probar color {c}', { c })}
                      aria-pressed={c.toUpperCase() === color.toUpperCase()}
                      onClick={() => setPreview(i === 0 ? null : c)}
                    />
                  ))}
                </div>
                {preview ? (
                  <div className="inline-form">
                    <span className="muted small">{t('Vista previa: {preview}', { preview })}</span>
                    <button type="button" className="btn wd-add" onClick={() => void saveColor()} disabled={savingColor}>
                      {savingColor ? <Busy text={t('Guardando…')} /> : t('Guardar este color')}
                    </button>
                    <button type="button" className="btn wd-btn-line" onClick={() => setPreview(null)}>
                      {t('Deshacer')}
                    </button>
                  </div>
                ) : (
                  <p className="muted small">{t('Toca un color para verlo en la prenda.')}</p>
                )}
                <ErrorNote error={saveError} />
              </>
            ) : (
              <p className="muted small">
                {t('Este modelo 3D no tiene materiales marcados como teñibles; se muestra con sus colores originales.')}
              </p>
            )}
          </section>

          <section aria-labelledby="details-title">
            <h2 id="details-title" className="panel-title">{t('Ficha')}</h2>
            <dl className="details">
              <dt>{t('Tejido (aspecto)')}</dt>
              <dd>{FABRIC_LABEL[fabric]}</dd>
              <dt>{t('Modelo 3D')}</dt>
              <dd>{item.modelUrl ? t('Archivo propio (.glb)') : libraryEntry ? t('Biblioteca: {file}', { file: libraryEntry.file }) : t('Generado por código')}</dd>
              {item.size && (
                <>
                  <dt>{t('Talla')}</dt>
                  <dd>{item.size}</dd>
                </>
              )}
              <dt>{t('Temporada')}</dt>
              <dd>{SEASON_LABEL[item.season]}</dd>
              {Object.entries(item.attributes).map(([key, value]) => {
                const field = type?.attributeSchema.fields?.[key];
                if (!field) return null;
                return (
                  <AttributeRow key={key} field={field} value={value} />
                );
              })}
            </dl>
            {item.notes && <p className="muted small">{item.notes}</p>}
          </section>

          <PurchaseInfo item={item} />

          <section className="panel-foot muted small">
            <p>
              {useGlb
                ? t('Modelo 3D real cargado desde archivo.')
                : t('Modelo 3D generado por código a partir del tipo de prenda y sus cortes. Puedes asociar un modelo .glb real desde «Editar».')}
            </p>
            <p>{t('El movimiento de la tela es una aproximación visual (shader), no una simulación física.')}</p>
          </section>
          </>
          )}
        </aside>
      </div>

      {editing && (
        <ItemEditor
          item={item}
          wardrobes={wardrobes}
          garmentTypes={garmentTypes}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            setData(saved);
          }}
          onDeleted={() => navigate(backTo, { replace: true })}
        />
      )}
    </section>
  );
}

/** Dónde se compró: tienda, producto, precio y enlace (solo http/https). */
function PurchaseInfo({ item }: { item: WardrobeItem }) {
  const url = safeHttpUrl(item.productUrl);
  const price = formatMoney(item.purchasePrice, item.currency);
  const brand = typeof item.attributes.brand === 'string' ? item.attributes.brand : null;
  const styles = item.styles.map((s) => labelOf(STYLE_TAGS, s));
  if (!url && !price && !brand && !item.storeName && !item.productName && !item.productRef && !item.purchaseDate && !styles.length) return null;
  return (
    <section aria-labelledby="purchase-title">
      <h2 id="purchase-title" className="panel-title">{t('Compra y estilo')}</h2>
      <dl className="details">
        {styles.length > 0 && (
          <>
            <dt>{t('Estilo')}</dt>
            <dd>{styles.join(', ')}</dd>
          </>
        )}
        {brand && (
          <>
            <dt>{t('Marca')}</dt>
            <dd>{brand}</dd>
          </>
        )}
        {item.productName && (
          <>
            <dt>{t('Producto')}</dt>
            <dd>{item.productName}</dd>
          </>
        )}
        {(item.storeName || item.purchasePlatform) && (
          <>
            <dt>{t('Tienda')}</dt>
            <dd>{[item.storeName, item.purchasePlatform ? labelOf(PURCHASE_PLATFORMS, item.purchasePlatform).toLowerCase() : null].filter(Boolean).join(' · ')}</dd>
          </>
        )}
        {item.productRef && (
          <>
            <dt>{t('Referencia')}</dt>
            <dd>{item.productRef}</dd>
          </>
        )}
        {price && (
          <>
            <dt>{t('Precio')}</dt>
            <dd>{price}</dd>
          </>
        )}
        {item.purchaseDate && (
          <>
            <dt>{t('Comprado')}</dt>
            <dd>{formatDate(item.purchaseDate)}</dd>
          </>
        )}
      </dl>
      {url && (
        <a className="btn btn-small product-link" href={url} target="_blank" rel="noopener noreferrer nofollow">
          {t('Ver en {hostOf}', { hostOf: hostOf(url) })} <Icon name="external" size={13} />
        </a>
      )}
    </section>
  );
}

function AttributeRow({ field, value }: { field: AttributeField; value: AttributeValue }) {
  let text: string;
  if (field.type === 'enum') text = field.options.find((o) => o.value === value)?.label ?? String(value);
  else if (field.type === 'boolean') text = value ? t('Sí') : t('No');
  else text = String(value);
  return (
    <>
      <dt>{field.label}</dt>
      <dd>{text}</dd>
    </>
  );
}

/** Progreso de descarga del modelo .glb (lo mide el gestor de carga de three.js). */
function ModelProgress() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="stage-progress" role="progressbar" aria-label={t('Cargando modelo 3D')} aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ transform: `scaleX(${progress / 100})` }} />
    </div>
  );
}

/** Sin WebGL: foto de la prenda si la hay; si no, su ficha con el color. */
function NoWebGL({ item }: { item: WardrobeItem }) {
  return (
    <div className="no-webgl">
      {item.imageUrl ? (
        <img src={item.imageUrl} alt={item.name} loading="lazy" />
      ) : (
        <span className="no-webgl-swatch" style={{ background: item.color }} aria-hidden="true" />
      )}
      <p className="muted small">
        {t('Tu navegador no puede mostrar gráficos 3D (WebGL desactivado o no disponible).{v}', { v: item.imageUrl ? '' : t(' Añade una URL de imagen a la prenda para verla aquí.') })}
      </p>
    </div>
  );
}
