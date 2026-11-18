import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { assetsApi, sneakersApi } from '../../api/endpoints';
import type { GarmentType, Sneaker, SneakerBrand, SneakerCondition, SneakerDuplicate, SneakerInput, SneakerScope, WardrobeItem } from '../../api/types';
import { useAssetUrl } from '../../lib/assetUrl';
import { play } from '../../lib/sfx';
import { BRAND_LABEL, CONDITION, SNEAKER_BRANDS, SNEAKER_CONDITIONS } from '../../lib/sneakers';
import { CURRENCIES, todayKey } from '../../lib/wishlist';
import { ErrorNote } from '../ErrorNote';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { Select } from '../Select';
import { t } from '../../i18n';

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;

export type SneakerFormMode =
  | { kind: 'create'; scope: SneakerScope }
  | { kind: 'edit'; sneaker: Sneaker }
  | { kind: 'adopt'; item: WardrobeItem };

const toNum = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

/**
 * Añadir, editar o fichar unas zapatillas. Tú pones los datos y la foto: la
 * app no rellena modelos ni imágenes. Si ya tienes un par igual (misma marca,
 * modelo, colorway y talla), el servidor lo para y aquí se ofrece verlo o
 * guardarlo igualmente.
 */
export function SneakerForm({
  mode,
  garmentTypes,
  onClose,
  onSaved,
}: {
  mode: SneakerFormMode;
  garmentTypes: GarmentType[];
  onClose: () => void;
  onSaved: (s: Sneaker, created: boolean) => void;
}) {
  const edit = mode.kind === 'edit' ? mode.sneaker : null;
  const adopt = mode.kind === 'adopt' ? mode.item : null;
  const scope: SneakerScope = mode.kind === 'create' ? mode.scope : edit?.wishlistStatus ? 'wish' : 'owned';
  const wish = scope === 'wish';
  const base = edit ?? adopt;

  const [brand, setBrand] = useState<SneakerBrand | null>(edit?.sneaker.brand ?? null);
  const [brandName, setBrandName] = useState(edit?.sneaker.brandName ?? '');
  const [model, setModel] = useState(edit?.sneaker.model ?? '');
  const [colorway, setColorway] = useState(edit?.sneaker.colorway ?? '');
  const [condition, setCondition] = useState<SneakerCondition>(edit?.sneaker.condition ?? (wish ? 'DEADSTOCK' : 'GOOD'));
  const [wearCount, setWearCount] = useState(String(edit?.sneaker.wearCount ?? 0));
  const [size, setSize] = useState(base?.size ?? '');
  const [color, setColor] = useState(base?.color ?? '#F2F2F0');
  const [purchaseDate, setPurchaseDate] = useState(edit?.purchaseDate?.slice(0, 10) ?? '');
  const [purchasePrice, setPurchasePrice] = useState(edit?.purchasePrice ? String(Number(edit.purchasePrice)) : '');
  const [currency, setCurrency] = useState(edit?.currency ?? 'EUR');
  const [storeName, setStoreName] = useState(edit?.storeName ?? '');
  const [notes, setNotes] = useState(edit?.notes ?? '');
  const [garmentTypeId, setGarmentTypeId] = useState(edit?.garmentType.id ?? '');
  const [photoAssetId, setPhotoAssetId] = useState<string | null>(edit?.photoAssetId ?? null);
  const [imageUrl, setImageUrl] = useState(edit?.imageUrl ?? '');
  // Solo wishlist (al crear)
  const [price, setPrice] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [productUrl, setProductUrl] = useState('');

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [tried, setTried] = useState(false);
  const [dupes, setDupes] = useState<SneakerDuplicate[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dupeRef = useRef<HTMLDivElement>(null);
  // El aviso de duplicado sale abajo: se lleva a la vista.
  useEffect(() => {
    if (dupes) dupeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [dupes]);
  const photoUrl = useAssetUrl(photoAssetId);
  const preview = photoUrl ?? (/^https?:\/\//.test(imageUrl.trim()) ? imageUrl.trim() : null);
  const footwear = garmentTypes.filter((g) => g.category === 'FOOTWEAR');
  const showPhoto = mode.kind !== 'adopt';
  const showItemFields = mode.kind !== 'adopt';

  const nums = { price: toNum(purchasePrice), wish: toNum(price), target: toNum(targetPrice), wear: toNum(wearCount) };
  const bad = (n: number | null) => n !== null && (!Number.isFinite(n) || n < 0);
  const problems = {
    brand: !brand ? t('Elige la marca.') : null,
    brandName: brand === 'OTHER' && !brandName.trim() ? t('Escribe la marca.') : null,
    model: !model.trim() ? t('Escribe el modelo.') : null,
    price: bad(nums.price) || bad(nums.wish) || bad(nums.target) ? t('Revisa los precios.') : null,
    wear: nums.wear !== null && (!Number.isInteger(nums.wear) || nums.wear < 0) ? t('Los usos son un número entero (0 o más).') : null,
    date: purchaseDate && purchaseDate > todayKey() ? t('La fecha no puede ser futura.') : null,
    image: imageUrl.trim() && !/^https?:\/\/\S+\.\S+/.test(imageUrl.trim()) ? t('La URL de la foto debe empezar por http:// o https://') : null,
    url: productUrl.trim() && !/^https?:\/\/\S+\.\S+/.test(productUrl.trim()) ? t('El enlace debe empezar por http:// o https://') : null,
  };
  const invalid = Object.values(problems).some(Boolean);
  const show = (k: keyof typeof problems) => (tried ? problems[k] : null);

  async function upload(file: File) {
    setError(null);
    if (!ACCEPT.includes(file.type)) return setError(new Error(t('La foto debe ser PNG, JPEG o WebP.')));
    if (file.size > MAX_BYTES) return setError(new Error(t('La foto ocupa más de 2 MB.')));
    setUploading(true);
    try {
      const asset = await assetsApi.upload(file);
      setPhotoAssetId(asset.id);
      setImageUrl('');
      play('pop');
    } catch (err) {
      setError(err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function save(allowDuplicate = false) {
    setTried(true);
    if (invalid || !brand || saving) {
      if (invalid) play('error');
      return;
    }
    setSaving(true);
    setError(null);
    const card: SneakerInput = {
      brand,
      brandName: brand === 'OTHER' ? brandName.trim() : null,
      model: model.trim(),
      colorway: colorway.trim() || null,
      condition,
      allowDuplicate: allowDuplicate || undefined,
    };
    const item: SneakerInput = {
      size: size.trim() || null,
      color,
      notes: notes.trim() || null,
      photoAssetId,
      imageUrl: photoAssetId ? null : imageUrl.trim() || null,
      storeName: storeName.trim() || null,
      garmentTypeId: garmentTypeId || undefined,
    };
    const owned: SneakerInput = wish
      ? {}
      : {
          // En la edición los usos se cambian con «+1 uso» en la ficha.
          wearCount: mode.kind === 'edit' ? undefined : (nums.wear ?? 0),
          purchaseDate: purchaseDate || null,
          purchasePrice: nums.price,
          currency,
        };
    try {
      let saved: Sneaker;
      if (mode.kind === 'edit') saved = await sneakersApi.update(mode.sneaker.id, { ...card, ...item, ...owned });
      else if (mode.kind === 'adopt') saved = await sneakersApi.adopt(mode.item.id, { ...card, wearCount: nums.wear ?? 0 });
      else
        saved = await sneakersApi.create({
          ...card,
          ...item,
          ...owned,
          brand,
          model: model.trim(),
          scope,
          ...(wish
            ? { price: nums.wish ?? undefined, currency, targetPrice: nums.target, productUrl: productUrl.trim() || null, purchasePrice: undefined }
            : {}),
        });
      onSaved(saved, mode.kind !== 'edit');
    } catch (err) {
      setSaving(false);
      if (err instanceof ApiError && err.status === 409 && err.body?.code === 'duplicate_sneaker') {
        setDupes((err.body.duplicates as SneakerDuplicate[]) ?? []);
        play('error');
        return;
      }
      setError(err);
      play('error');
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setDupes(null);
    void save(false);
  }

  const title = mode.kind === 'edit' ? t('Editar zapatillas') : mode.kind === 'adopt' ? t('Añadir «{name}» a la colección', { name: mode.item.name }) : wish ? t('Zapatillas que quieres') : t('Añadir a tu colección');

  return (
    <Modal title={title} onClose={onClose} wide className="wl-form-modal snk-form-modal">
      <form className={`wl-form snk-form${showPhoto ? '' : ' is-compact'}`} onSubmit={submit} noValidate>
        {showPhoto && (
          <div className="wl-photo-field">
            <div className={`wl-photo-drop snk-photo-drop${preview ? ' has-photo' : ''}`} style={{ '--sw': color } as CSSProperties}>
              {preview ? (
                <img src={preview} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="wl-photo-empty">
                  <Icon name="shoe" size={46} />
                  <small>{t('Sube tu foto. Sin foto, se verá el modelo 3D con tu color.')}</small>
                </span>
              )}
              {uploading && <span className="wl-photo-busy">{t('Subiendo…')}</span>}
            </div>
            <div className="wl-photo-actions">
              <label className="btn btn-small btn-street">
                <Icon name="plus" size={13} /> {photoAssetId ? t('Cambiar foto') : t('Subir foto')}
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPT.join(',')}
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                  }}
                />
              </label>
              {(photoAssetId || imageUrl) && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setPhotoAssetId(null);
                    setImageUrl('');
                  }}
                >
                  {t('Quitar foto')}
                </button>
              )}
              <small className="muted">{t('PNG, JPEG o WebP · máx. 2 MB')}</small>
            </div>
            {!photoAssetId && (
              <label className="field">
                <span>{t('…o la URL de tu foto')}</span>
                <input type="url" inputMode="url" placeholder="https://…" value={imageUrl} maxLength={2048} onChange={(e) => setImageUrl(e.target.value)} />
                {show('image') && <small className="field-error">{show('image')}</small>}
              </label>
            )}
          </div>
        )}

        <div className="wl-form-main">
          {wish && mode.kind === 'create' && (
            <p className="snk-form-scope">
              <Icon name="heart" size={13} /> {t('Va a tu')} <b>{t('wishlist')}</b>{t(': es un par que quieres, no uno que tengas.')}
            </p>
          )}

          <div className="field">
            <span id="snk-brand">{t('Marca *')}</span>
            <div className="snk-brand-pick" role="radiogroup" aria-labelledby="snk-brand">
              {SNEAKER_BRANDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={brand === b}
                  className={`snk-brand-tag${brand === b ? ' is-active' : ''}`}
                  onClick={() => {
                    play('click');
                    setBrand(b);
                  }}
                >
                  {BRAND_LABEL[b]}
                </button>
              ))}
            </div>
            {show('brand') && <small className="field-error">{show('brand')}</small>}
          </div>

          {brand === 'OTHER' && (
            <label className="field">
              <span>{t('Nombre de la marca *')}</span>
              <input value={brandName} maxLength={40} onChange={(e) => setBrandName(e.target.value)} aria-invalid={!!show('brandName')} />
              {show('brandName') && <small className="field-error">{show('brandName')}</small>}
            </label>
          )}

          <div className="row">
            <label className="field">
              <span>{t('Modelo *')}</span>
              <input value={model} maxLength={80} placeholder={t('Tal y como se llama el modelo')} onChange={(e) => setModel(e.target.value)} aria-invalid={!!show('model')} />
              {show('model') && <small className="field-error">{show('model')}</small>}
            </label>
            <label className="field">
              <span>{t('Colorway')}</span>
              <input value={colorway} maxLength={80} placeholder={t('Blanco / Negro…')} onChange={(e) => setColorway(e.target.value)} />
            </label>
          </div>

          {showItemFields && (
            <div className="row">
              <label className="field">
                <span>{t('Talla')}</span>
                <input value={size} maxLength={20} placeholder={t('42,5 · US 9…')} onChange={(e) => setSize(e.target.value)} />
              </label>
              <label className="field">
                <span>{t('Color principal')}</span>
                <span className="wl-color">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} aria-label={t('Color principal')} />
                  <code>{color.toUpperCase()}</code>
                </span>
              </label>
            </div>
          )}

          <div className="field">
            <span id="snk-cond">{t('Estado de conservación')}</span>
            <div className="snk-cond-pick" role="radiogroup" aria-labelledby="snk-cond">
              {SNEAKER_CONDITIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={condition === c}
                  className={`snk-cond-chip${condition === c ? ' is-active' : ''}`}
                  title={CONDITION[c].hint}
                  onClick={() => {
                    play('click');
                    setCondition(c);
                  }}
                >
                  <span className="snk-cond-dots" aria-hidden="true">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <i key={n} className={n <= CONDITION[c].level ? 'is-on' : ''} />
                    ))}
                  </span>
                  {CONDITION[c].label}
                </button>
              ))}
            </div>
          </div>

          {!wish && showItemFields && (
            <div className="row snk-row-3">
              <label className="field">
                <span>{t('Fecha de adquisición')}</span>
                <input type="date" value={purchaseDate} max={todayKey()} onChange={(e) => setPurchaseDate(e.target.value)} aria-invalid={!!show('date')} />
                {show('date') && <small className="field-error">{show('date')}</small>}
              </label>
              <div className="field">
                <span id="snk-price">{t('Precio de compra')}</span>
                <div className="wl-money-input">
                  <input inputMode="decimal" aria-labelledby="snk-price" placeholder="—" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
                  <Select size="sm" ariaLabel={t('Moneda')} value={currency} options={[...new Set([currency, ...CURRENCIES])].map((c) => ({ value: c, label: c }))} onChange={setCurrency} />
                </div>
              </div>
            </div>
          )}

          {!wish && mode.kind !== 'edit' && (
            <label className="field snk-wear-field">
              <span>{t('Veces que ya las has usado')}</span>
              <input inputMode="numeric" value={wearCount} onChange={(e) => setWearCount(e.target.value)} aria-invalid={!!show('wear')} />
              <small className="muted">{t('Luego súmalas con «+1 uso». Los días del calendario marcados como usados se cuentan solos.')}</small>
              {show('wear') && <small className="field-error">{show('wear')}</small>}
            </label>
          )}

          {wish && mode.kind === 'create' && (
            <>
              <div className="row">
                <div className="field">
                  <span id="snk-wprice">{t('Precio que has visto')}</span>
                  <div className="wl-money-input">
                    <input inputMode="decimal" aria-labelledby="snk-wprice" placeholder={t('Si lo sabes')} value={price} onChange={(e) => setPrice(e.target.value)} />
                    <Select size="sm" ariaLabel={t('Moneda')} value={currency} options={[...new Set([currency, ...CURRENCIES])].map((c) => ({ value: c, label: c }))} onChange={setCurrency} />
                  </div>
                </div>
                <label className="field">
                  <span>{t('Avisarme si baja de…')}</span>
                  <input inputMode="decimal" placeholder={t('Precio objetivo')} value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} />
                </label>
              </div>
              <label className="field">
                <span>{t('Enlace de compra')}</span>
                <input type="url" inputMode="url" placeholder="https://…" value={productUrl} maxLength={2048} onChange={(e) => setProductUrl(e.target.value)} />
                {show('url') && <small className="field-error">{show('url')}</small>}
              </label>
            </>
          )}
          {show('price') && <small className="field-error">{show('price')}</small>}

          {showItemFields && (
            <div className="row">
              <label className="field">
                <span>{t('Tienda')}</span>
                <input value={storeName} maxLength={80} onChange={(e) => setStoreName(e.target.value)} />
              </label>
              {footwear.length > 1 ? (
                <div className="field">
                  <span id="snk-type">{t('Modelo 3D')}</span>
                  <Select
                    labelledBy="snk-type"
                    value={garmentTypeId}
                    options={[{ value: '', label: t('Zapatillas (por defecto)') }, ...footwear.map((g) => ({ value: g.id, label: g.name }))]}
                    onChange={setGarmentTypeId}
                  />
                </div>
              ) : (
                <span />
              )}
            </div>
          )}

          {showItemFields && (
            <label className="field">
              <span>{t('Notas personales')}</span>
              <textarea rows={2} maxLength={1000} placeholder={t('Cómo tallan, dónde las compraste, cómo limpiarlas…')} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          )}

          {dupes && (
            <div className="snk-dupe" role="alert" ref={dupeRef}>
              <p>
                <Icon name="flag" size={14} />{' '}
                {dupes.some((d) => d.scope === 'owned') && wish ? (
                  <b>{t('Ya tienes este par en tu colección.')}</b>
                ) : (
                  <b>{t('Ya tienes guardado un par igual')}</b>
                )}{' '}
                {t('(misma marca, modelo, colorway y talla):')}
              </p>
              <ul>
                {dupes.map((d) => (
                  <li key={d.id}>
                    <Link to={`/sneakers/${d.id}`} onClick={onClose}>
                      {d.name}
                      {d.size ? t(' · talla {size}', { size: d.size }) : ''}
                    </Link>{' '}
                    <span className="muted">{d.scope === 'wish' ? '(wishlist)' : t('(colección)')}</span>
                  </li>
                ))}
              </ul>
              <div className="snk-dupe-actions">
                <button type="button" className="btn btn-ghost btn-small" onClick={() => setDupes(null)}>
                  {t('Revisar los datos')}
                </button>
                <button type="button" className="btn btn-small" onClick={() => void save(true)} disabled={saving}>
                  {wish ? t('Guardarlo igualmente') : t('Tengo otro par igual: guardarlo')}
                </button>
              </div>
            </div>
          )}

          <ErrorNote error={error} />

          <div className="wl-form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              {t('Cancelar')}
            </button>
            <button type="submit" className="btn btn-primary btn-street" disabled={saving || uploading}>
              <Icon name={mode.kind === 'edit' ? 'check' : wish ? 'heart' : 'plus'} size={14} />{' '}
              {saving ? t('Guardando…') : mode.kind === 'edit' ? t('Guardar cambios') : wish ? t('Guardar en la wishlist') : t('Añadir a la colección')}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
