import { useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { assetsApi, itemsApi } from '../api/endpoints';
import type {
  AttributeField,
  Attributes,
  AttributeValue,
  CustomDetail,
  Customization,
  GarmentType,
  Season,
  Wardrobe,
  WardrobeItem,
} from '../api/types';
import { CATEGORY_LABEL, SEASONS, SEASON_LABEL } from '../lib/labels';
import { MAX_STYLES_PER_ITEM, PURCHASE_PLATFORMS, STYLE_TAGS } from '../lib/stylist';
import { patternFromPhoto, readGarmentPhoto } from '../lib/photoGarment';
import { GarmentViewer, type PhotoPlacement } from '../three/GarmentViewer';
import { isBlenderModel, libraryModel } from '../three/libraryCatalog';
import { DetailList } from './DetailList';
import { ErrorNote } from './ErrorNote';
import { Modal } from './Modal';
import { Select } from './Select';
import { Busy } from './Spinner';

const PALETTE = ['#E8E8E8', '#8E8E93', '#2E2E33', '#151517', '#2B3445', '#8FA6C1', '#C8B79A', '#3B2F2A', '#5F6B52', '#8C3B3B'];

interface Props {
  item?: WardrobeItem;
  wardrobes: Wardrobe[];
  garmentTypes: GarmentType[];
  defaultWardrobeId?: string;
  onClose: () => void;
  onSaved: (item: WardrobeItem) => void;
  onDeleted?: (id: string) => void;
}

/** Crear o editar una prenda, con vista previa 3D en vivo. */
export function ItemEditor({ item, wardrobes, garmentTypes, defaultWardrobeId, onClose, onSaved, onDeleted }: Props) {
  const [name, setName] = useState(item?.name ?? '');
  const [typeId, setTypeId] = useState(item?.garmentType.id ?? garmentTypes[0]?.id ?? '');
  const [wardrobeId, setWardrobeId] = useState(item?.wardrobe.id ?? defaultWardrobeId ?? wardrobes[0]?.id ?? '');
  const [color, setColor] = useState(item?.color ?? '#8E8E93');
  const [size, setSize] = useState(item?.size ?? '');
  const [season, setSeason] = useState<Season>(item?.season ?? 'ALL_SEASON');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? '');
  const [modelUrl, setModelUrl] = useState(item?.modelUrl ?? '');
  const [attributes, setAttributes] = useState<Attributes>(item?.attributes ?? {});
  const [styles, setStyles] = useState<string[]>(item?.styles ?? []);
  // Dónde se compró (la marca va en los atributos de la prenda)
  const [productName, setProductName] = useState(item?.productName ?? '');
  const [storeName, setStoreName] = useState(item?.storeName ?? '');
  const [platform, setPlatform] = useState(item?.purchasePlatform ?? '');
  const [productUrl, setProductUrl] = useState(item?.productUrl ?? '');
  const [productRef, setProductRef] = useState(item?.productRef ?? '');
  const [price, setPrice] = useState(item?.purchasePrice ?? '');
  const [currency, setCurrency] = useState(item?.currency ?? 'EUR');
  const [purchaseDate, setPurchaseDate] = useState(item?.purchaseDate?.slice(0, 10) ?? '');
  const hasPurchase = !!(item?.productName || item?.storeName || item?.productUrl || item?.purchasePrice || item?.attributes.brand);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Personalización (estampado y detalles que salen de la foto)
  const [customization, setCustomization] = useState<Customization>(item?.customization ?? {});
  const [customTouched, setCustomTouched] = useState(false);
  const [photo, setPhoto] = useState<{ status: 'reading' | 'done' | 'error'; thumbnail?: string; notes?: string[]; message?: string } | null>(null);
  const [placement, setPlacement] = useState<PhotoPlacement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const type = garmentTypes.find((t) => t.id === typeId);
  // La marca se pide en «Dónde lo compraste», no entre los detalles del tipo.
  // Pantalones y camisetas usan siempre un modelo hecho en Blender: no se ofrece
  // «Modelo 3D» (salvo en las camisetas sin manga, muscle o polo, que aún no lo tienen).
  const blenderEntry = type ? libraryModel(type.modelKey, attributes) : null;
  const noModelChoice = type?.modelKey === 'pants' || (!!blenderEntry && isBlenderModel(blenderEntry));
  const fields = useMemo(
    () => Object.entries(type?.attributeSchema.fields ?? {}).filter(([k]) => k !== 'brand' && !(k === 'model3d' && noModelChoice)),
    [type, noModelChoice],
  );
  const brandField = type?.attributeSchema.fields?.brand;

  function toggleStyle(value: string) {
    setStyles((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : prev.length >= MAX_STYLES_PER_ITEM ? prev : [...prev, value],
    );
  }

  // Agrupamos los tipos por categoría para el <select>.
  const grouped = useMemo(() => {
    const groups = new Map<string, GarmentType[]>();
    for (const t of garmentTypes) {
      const label = CATEGORY_LABEL[t.category];
      groups.set(label, [...(groups.get(label) ?? []), t]);
    }
    return [...groups.entries()];
  }, [garmentTypes]);

  function changeType(id: string) {
    setTypeId(id);
    // Conservamos solo los atributos que existen en el tipo nuevo.
    const next = garmentTypes.find((t) => t.id === id)?.attributeSchema.fields ?? {};
    setAttributes((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k in next)));
  }

  function setAttr(key: string, value: AttributeValue | null) {
    setAttributes((prev) => {
      const next = { ...prev };
      if (value === null || value === '') delete next[key];
      else next[key] = value;
      return next;
    });
  }

  /** El estampado solo vale en los tipos que lo admiten (si se cambió el tipo después de la foto). */
  function forType(c: Customization): Customization {
    if (!c.pattern || type?.customizationOptions?.options.includes('pattern')) return c;
    const next = { ...c };
    delete next.pattern;
    return next;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    // «Añadir y poner detalles»: después de guardar se abre el editor 3D de detalles.
    const then = ((e.nativeEvent as SubmitEvent).submitter as HTMLElement | null)?.dataset.next;
    setSaving(true);
    setError(null);
    const body = {
      wardrobeId,
      garmentTypeId: typeId,
      name: name.trim(),
      color: color.toUpperCase(),
      size: size.trim() || null,
      season,
      notes: notes.trim() || null,
      imageUrl: imageUrl.trim() || null,
      modelUrl: modelUrl.trim() || null,
      attributes,
      styles,
      productName: productName.trim() || null,
      storeName: storeName.trim() || null,
      purchasePlatform: platform || null,
      productUrl: productUrl.trim() || null,
      productRef: productRef.trim() || null,
      purchasePrice: price === '' ? null : Math.round(Number(String(price).replace(',', '.')) * 100) / 100,
      currency: price === '' ? null : currency,
      purchaseDate: purchaseDate || null,
      // Solo si la foto la ha cambiado (al editar, lo demás se conserva tal cual)
      ...(customTouched ? { customization: forType(customization) } : {}),
    };
    try {
      const saved = item ? await itemsApi.update(item.id, body) : await itemsApi.create(body);
      onSaved(saved);
      if (then === 'details') {
        navigate(`/items/${saved.id}`, { state: { from: location.pathname + location.search, customize: true } });
      }
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!item) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await itemsApi.remove(item.id);
      onDeleted?.(item.id);
    } catch (err) {
      setError(err);
    }
  }

  const preview = type
    ? { color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#8E8E93', attributes, garmentType: type, customization }
    : null;

  /**
   * Foto de la prenda: se lee en el navegador (tipo, cortes, color, estampado y
   * gráficos) y se rellena el formulario; los gráficos recortados se guardan
   * como imágenes tuyas y se colocan en la prenda como detalles.
   */
  async function onPhoto(file: File) {
    setPhoto({ status: 'reading' });
    setPlacement(null);
    try {
      const reading = await readGarmentPhoto(file);
      if (!reading) {
        setPhoto({
          status: 'error',
          message: 'No encuentro una prenda clara en la foto. Prueba con la prenda entera, de frente y sobre un fondo liso que contraste.',
        });
        return;
      }
      const g = reading.guess;
      const found = g.modelKey ? garmentTypes.find((t) => t.modelKey === g.modelKey) : undefined;
      const target = found ?? type;
      if (found) setTypeId(found.id);
      const schema = target?.attributeSchema.fields ?? {};
      const next: Attributes = {};
      for (const [k, v] of Object.entries(g.attributes)) {
        const f = schema[k];
        if (f?.type === 'enum' && f.options.some((o) => o.value === v)) next[k] = v;
      }
      setAttributes((prev) => ({ ...Object.fromEntries(Object.entries(prev).filter(([k]) => k in schema && k !== 'closure')), ...next }));
      setColor(g.color);
      const notes = [...g.notes];
      if (!found && g.modelKey) notes.push('Ese tipo de prenda no está en tu catálogo: elige el tipo a mano.');
      const pattern = target?.customizationOptions?.options.includes('pattern') ? patternFromPhoto(g, target.modelKey) : null;
      // Los gráficos se guardan como imágenes tuyas para poder usarlos en 3D
      const placed: PhotoPlacement['graphics'] = [];
      let uploadFailed = false;
      for (const [i, gr] of reading.graphics.entries()) {
        try {
          const asset = await assetsApi.upload(new File([gr.blob], `foto-grafico-${i + 1}.png`, { type: 'image/png' }));
          placed.push({ assetId: asset.id, u: gr.region.u, v: gr.region.v, w: gr.region.w, h: gr.region.h, color: gr.region.color });
        } catch {
          uploadFailed = true;
        }
      }
      if (uploadFailed) notes.push('Algún gráfico no se pudo guardar (¿has llegado al límite de imágenes?): puedes añadirlo después.');
      setCustomization((prev) => {
        const nextC: Customization = { ...prev, details: (prev.details ?? []).filter((d) => !d.id.startsWith('ph')) };
        if (pattern) nextC.pattern = pattern;
        else delete nextC.pattern;
        return nextC;
      });
      setCustomTouched(true);
      if (placed.length && target) {
        setPlacement({ key: String(Date.now()), modelKey: target.modelKey, library: !!libraryModel(target.modelKey, { ...next }), graphics: placed });
      }
      setPhoto({ status: 'done', thumbnail: reading.thumbnail, notes });
    } catch {
      setPhoto({ status: 'error', message: 'No se ha podido leer la imagen. Prueba con una foto JPG o PNG.' });
    }
  }

  function onPlaced(key: string, details: CustomDetail[]) {
    if (placement?.key !== key) return;
    setPlacement(null);
    setCustomization((prev) => ({ ...prev, details: [...(prev.details ?? []).filter((d) => !d.id.startsWith('ph')), ...details] }));
  }

  return (
    <Modal title={item ? 'Editar prenda' : 'Nueva prenda'} onClose={onClose} wide className="dialog-editor">
      <form className="editor" onSubmit={submit}>
        <div className="editor-stage" aria-hidden="true">
          {preview && <GarmentViewer garment={preview} place={placement} onPlaced={onPlaced} />}
          <p className="stage-hint">Arrastra para girar</p>
        </div>

        <div className="editor-fields">
          <section className="field photo-box" aria-labelledby="photo-title">
            <div className="photo-head">
              <span id="photo-title" className="details-title">Desde una foto</span>
              <label className="btn btn-small photo-pick">
                {photo?.status === 'reading' ? <Busy text="Leyendo la foto…" /> : photo ? 'Usar otra foto' : 'Elegir foto'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={photo?.status === 'reading'}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void onPhoto(f);
                  }}
                />
              </label>
            </div>
            {!photo && (
              <p className="muted small">
                Haz o sube una foto de la prenda entera, de frente y sobre un fondo liso: se reconocen el tipo, las mangas,
                el cierre, el color, las rayas o cuadros y los logos o estampados, y se pasan al modelo 3D. La foto no sale de
                tu dispositivo; solo se guardan los gráficos recortados.
              </p>
            )}
            {photo?.status === 'error' && <p className="note small">{photo.message}</p>}
            {photo?.status === 'done' && (
              <div className="photo-result">
                {photo.thumbnail && <img src={photo.thumbnail} alt="Prenda recortada de la foto" />}
                <ul className="small">
                  {photo.notes?.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                  <li className="muted">Revisa el tipo y los detalles: cambia lo que no cuadre antes de guardar.</li>
                </ul>
              </div>
            )}
          </section>

          <label className="field">
            <span>Nombre</span>
            <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="row">
            <div className="field">
              <span id="item-type">Tipo</span>
              <Select
                labelledBy="item-type"
                value={typeId}
                options={grouped.flatMap(([label, types]) => types.map((t) => ({ value: t.id, label: t.name, group: label })))}
                onChange={changeType}
              />
            </div>
            <div className="field">
              <span id="item-wardrobe">Armario</span>
              <Select labelledBy="item-wardrobe" value={wardrobeId} options={wardrobes.map((w) => ({ value: w.id, label: w.name }))} onChange={setWardrobeId} />
            </div>
          </div>

          <fieldset className="field">
            <legend>Color</legend>
            <div className="color-row">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-chip${c === color.toUpperCase() ? ' is-active' : ''}`}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                  aria-pressed={c === color.toUpperCase()}
                  onClick={() => setColor(c)}
                />
              ))}
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#8E8E93'}
                onChange={(e) => setColor(e.target.value.toUpperCase())}
                aria-label="Elegir otro color"
              />
              <input
                className="hex-input"
                value={color}
                maxLength={7}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Código de color"
                pattern="#[0-9a-fA-F]{6}"
              />
            </div>
          </fieldset>

          <div className="row">
            <label className="field">
              <span>Talla</span>
              <input maxLength={20} value={size} onChange={(e) => setSize(e.target.value)} />
            </label>
            <div className="field">
              <span id="item-season">Temporada</span>
              <Select labelledBy="item-season" value={season} options={SEASONS.map((s) => ({ value: s, label: SEASON_LABEL[s] }))} onChange={(v) => setSeason(v as Season)} />
            </div>
          </div>

          {fields.length > 0 && (
            <fieldset className="field attrs">
              <legend>Detalles de {type?.name.toLowerCase()}</legend>
              <div className="attrs-grid">
                {fields.map(([key, field]) => (
                  <AttributeInput key={key} name={key} field={field} value={attributes[key]} onChange={(v) => setAttr(key, v)} />
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="field">
            <legend>Estilo <small className="muted">(hasta {MAX_STYLES_PER_ITEM}; si no eliges, el estilista lo deduce)</small></legend>
            <div className="chips chips-small" role="group" aria-label="Estilos de la prenda">
              {STYLE_TAGS.map((t) => {
                const on = styles.includes(t.value);
                return (
                  <button
                    key={t.value}
                    type="button"
                    className={`chip${on ? ' is-active' : ''}`}
                    aria-pressed={on}
                    disabled={!on && styles.length >= MAX_STYLES_PER_ITEM}
                    onClick={() => toggleStyle(t.value)}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <details className="field purchase-box" open={hasPurchase}>
            <summary>
              <span>Dónde lo compraste</span> <small className="muted">(opcional)</small>
            </summary>
            <div className="attrs-grid purchase-fields">
              {brandField && (
                <label className="field">
                  <span>Marca</span>
                  <input
                    maxLength={brandField.type === 'string' ? brandField.maxLength : 60}
                    value={typeof attributes.brand === 'string' ? attributes.brand : ''}
                    onChange={(e) => setAttr('brand', e.target.value || null)}
                  />
                </label>
              )}
              <label className="field">
                <span>Producto</span>
                <input maxLength={120} placeholder="Nombre comercial" value={productName} onChange={(e) => setProductName(e.target.value)} />
              </label>
              <label className="field">
                <span>Tienda</span>
                <input maxLength={80} value={storeName} onChange={(e) => setStoreName(e.target.value)} />
              </label>
              <div className="field">
                <span id="item-platform">Dónde</span>
                <Select
                  labelledBy="item-platform"
                  value={platform}
                  options={[{ value: '', label: 'Sin especificar' }, ...PURCHASE_PLATFORMS]}
                  onChange={setPlatform}
                />
              </div>
              <label className="field span-2">
                <span>Enlace al producto</span>
                <input type="url" maxLength={2048} placeholder="https://" value={productUrl} onChange={(e) => setProductUrl(e.target.value)} />
              </label>
              <label className="field">
                <span>Referencia</span>
                <input maxLength={80} placeholder="SKU o modelo" value={productRef} onChange={(e) => setProductRef(e.target.value)} />
              </label>
              <label className="field">
                <span>Fecha de compra</span>
                <input type="date" value={purchaseDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPurchaseDate(e.target.value)} />
              </label>
              <div className="field price-field">
                <span id="item-price">Precio</span>
                <div className="price-row">
                  <input
                    aria-labelledby="item-price"
                    inputMode="decimal"
                    pattern="\d{1,8}([.,]\d{1,2})?"
                    title="Un número con dos decimales como mucho"
                    placeholder="0,00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                  <input
                    aria-label="Moneda"
                    className="currency-input"
                    maxLength={3}
                    pattern="[A-Za-z]{3}"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  />
                </div>
              </div>
            </div>
            <small className="muted purchase-note">Si no sabes de dónde es, déjalo vacío. El enlace solo lo ves tú (y quien quieras cuando lo publiques).</small>
          </details>

          {(customization.details?.length ?? 0) > 0 && (
            <section className="field details-box" aria-labelledby="item-details-list">
              <span id="item-details-list" className="details-title">
                Detalles de la prenda ({customization.details?.length})
              </span>
              <DetailList
                details={customization.details ?? []}
                onRemove={(id) => {
                  setCustomization((prev) => ({ ...prev, details: (prev.details ?? []).filter((d) => d.id !== id) }));
                  setCustomTouched(true);
                }}
              />
              <p className="muted small">Para moverlos, cambiar su tamaño o su color, usa «Personalizar» en la prenda.</p>
            </section>
          )}

          {!item && (
            <section className="field details-box" aria-labelledby="details-title">
              <span id="details-title" className="details-title">Parches, bordados y estampados</span>
              <p className="muted small">
                Coloca parches, bordados, estampados, texto o tus propios dibujos sobre la prenda en 3D, haciendo clic donde
                van. Al pulsar el botón se guarda la prenda y se abre el editor de detalles.
              </p>
              <button type="submit" className="btn" data-next="details" disabled={saving || !wardrobeId || !typeId}>
                Añadir y poner detalles
              </button>
            </section>
          )}

          <label className="field">
            <span>Notas</span>
            <textarea rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <label className="field">
            <span>URL de imagen (opcional)</span>
            <input type="url" maxLength={2048} placeholder="https://" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          </label>

          <label className="field">
            <span>Modelo 3D real (.glb o .gltf, opcional)</span>
            <input
              maxLength={2048}
              placeholder="https://…/prenda.glb o /models/prenda.glb"
              pattern="(https?://\S+|/(?!/)[\w\-.\/]+)\.(glb|gltf)(\?\S*)?"
              title="Una URL http(s) o una ruta que empiece por / y termine en .glb o .gltf"
              value={modelUrl}
              onChange={(e) => setModelUrl(e.target.value)}
            />
            <small className="muted">Si lo dejas vacío, el modelo 3D se genera automáticamente.</small>
          </label>

          <ErrorNote error={error} />

          <div className="actions">
            {item && (
              <button type="button" className="btn btn-danger" onClick={remove}>
                {confirmDelete ? 'Confirmar: eliminar prenda' : 'Eliminar'}
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !wardrobeId || !typeId}>
              {saving ? <Busy text="Guardando…" /> : item ? 'Guardar cambios' : 'Añadir prenda'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function AttributeInput({
  name,
  field,
  value,
  onChange,
}: {
  name: string;
  field: AttributeField;
  value: AttributeValue | undefined;
  onChange: (value: AttributeValue | null) => void;
}) {
  const id = `attr-${name}`;
  switch (field.type) {
    case 'enum':
      return (
        <div className="field">
          <span id={id}>{field.label}</span>
          <Select
            labelledBy={id}
            value={typeof value === 'string' ? value : ''}
            options={[{ value: '', label: 'Sin especificar' }, ...field.options]}
            onChange={(v) => onChange(v || null)}
          />
        </div>
      );
    case 'boolean':
      return (
        <label className="check" htmlFor={id}>
          <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked ? true : null)} />
          <span>{field.label}</span>
        </label>
      );
    case 'number':
      return (
        <label className="field" htmlFor={id}>
          <span>{field.label}</span>
          <input
            id={id}
            type="number"
            min={field.min}
            max={field.max}
            step={field.integer ? 1 : 'any'}
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          />
        </label>
      );
    case 'string':
      return (
        <label className="field" htmlFor={id}>
          <span>{field.label}</span>
          <input id={id} maxLength={field.maxLength} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || null)} />
        </label>
      );
  }
}
