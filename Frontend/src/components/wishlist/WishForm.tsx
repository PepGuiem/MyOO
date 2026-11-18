import { useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { assetsApi, wishlistApi } from '../../api/endpoints';
import type { GarmentType, Wardrobe, WishlistCategory, WishlistInput, WishlistItem, WishlistStatus } from '../../api/types';
import { useAssetUrl } from '../../lib/assetUrl';
import { play } from '../../lib/sfx';
import { brandOf, CURRENCIES, num, WISH_CATEGORIES, WISH_CATEGORY, WISH_STATUS, WISH_STATUSES } from '../../lib/wishlist';
import { ErrorNote } from '../ErrorNote';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { Select } from '../Select';
import { t } from '../../i18n';

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Añadir o editar un artículo de la wishlist. El precio de un artículo ya
 * guardado no se cambia aquí: se apunta en su ficha para que quede en el
 * historial.
 */
export function WishForm({
  item,
  garmentTypes,
  wardrobes,
  defaultCurrency,
  onClose,
  onSaved,
}: {
  item: WishlistItem | null;
  garmentTypes: GarmentType[];
  wardrobes: Wardrobe[];
  defaultCurrency: string;
  onClose: () => void;
  onSaved: (item: WishlistItem, created: boolean) => void;
}) {
  const editing = !!item;
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState<WishlistCategory | null>(item?.wishlistCategory ?? null);
  const [garmentTypeId, setGarmentTypeId] = useState(item?.garmentType.id ?? '');
  const [brand, setBrand] = useState(item ? (brandOf(item) ?? '') : '');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState(item?.currency ?? defaultCurrency);
  const [size, setSize] = useState(item?.size ?? '');
  const [color, setColor] = useState(item?.color ?? '#2b2b2f');
  const [productUrl, setProductUrl] = useState(item?.productUrl ?? '');
  const [storeName, setStoreName] = useState(item?.storeName ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [status, setStatus] = useState<WishlistStatus>(item?.wishlistStatus ?? 'WANT');
  const [targetPrice, setTargetPrice] = useState(item?.targetPrice ? String(Number(item.targetPrice)) : '');
  const [trackPrice, setTrackPrice] = useState(item?.trackPrice ?? false);
  const [wardrobeId, setWardrobeId] = useState(item?.wardrobe.id ?? '');
  const [photoAssetId, setPhotoAssetId] = useState<string | null>(item?.photoAssetId ?? null);
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoUrl = useAssetUrl(photoAssetId);
  const preview = photoUrl ?? (/^https?:\/\//.test(imageUrl.trim()) ? imageUrl.trim() : null);

  // Tipos de prenda (para verla en 3D): los de la categoría primero.
  const typeOptions = useMemo(() => {
    const def = category ? WISH_CATEGORY[category].garment : null;
    const sorted = [...garmentTypes].sort((a, b) => Number(b.code === def) - Number(a.code === def) || a.sortOrder - b.sortOrder);
    return [
      ...(category && category !== 'OTHER' ? [{ value: '', label: t('Automático ({v})', { v: garmentTypes.find((g) => g.code === def)?.name ?? '—' }) }] : []),
      ...sorted.map((g) => ({ value: g.id, label: g.name })),
    ];
  }, [garmentTypes, category]);

  const priceNum = price.trim() === '' ? null : Number(price.replace(',', '.'));
  const targetNum = targetPrice.trim() === '' ? null : Number(targetPrice.replace(',', '.'));
  const problems = {
    name: !name.trim() ? t('Ponle un nombre.') : null,
    category: !category ? t('Elige una categoría.') : null,
    type: category === 'OTHER' && !garmentTypeId ? t('En «Otros», elige con qué prenda se dibuja en 3D.') : null,
    price: priceNum !== null && (!Number.isFinite(priceNum) || priceNum < 0) ? t('Precio no válido.') : null,
    target: targetNum !== null && (!Number.isFinite(targetNum) || targetNum < 0) ? t('Precio objetivo no válido.') : null,
    url: productUrl.trim() && !/^https?:\/\/\S+\.\S+/.test(productUrl.trim()) ? t('El enlace debe empezar por http:// o https://') : null,
    image: imageUrl.trim() && !/^https?:\/\/\S+\.\S+/.test(imageUrl.trim()) ? t('La URL de la foto debe empezar por http:// o https://') : null,
  };
  const invalid = Object.values(problems).some(Boolean);

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

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTriedSubmit(true);
    if (invalid || !category) {
      play('error');
      return;
    }
    setSaving(true);
    setError(null);
    const body: WishlistInput = {
      name: name.trim(),
      category,
      garmentTypeId: garmentTypeId || undefined,
      color,
      brand: brand.trim() || null,
      size: size.trim() || null,
      productUrl: productUrl.trim() || null,
      storeName: storeName.trim() || null,
      notes: notes.trim() || null,
      photoAssetId,
      imageUrl: photoAssetId ? null : imageUrl.trim() || null,
      status,
      targetPrice: targetNum,
      trackPrice,
      wardrobeId: wardrobeId || undefined,
    };
    try {
      const saved = editing
        ? await wishlistApi.update(item.id, body)
        : await wishlistApi.create({
            ...body,
            name: body.name!,
            category,
            color,
            price: priceNum ?? undefined,
            currency,
          });
      onSaved(saved, !editing);
    } catch (err) {
      setError(err);
      play('error');
      setSaving(false);
    }
  }

  const show = (k: keyof typeof problems) => (triedSubmit ? problems[k] : null);

  return (
    <Modal title={editing ? t('Editar deseo') : t('Añadir a la wishlist')} onClose={onClose} wide className="wl-form-modal">
      <form className="wl-form" onSubmit={submit} noValidate>
        {/* Foto */}
        <div className="wl-photo-field">
          <div className={`wl-photo-drop${preview ? ' has-photo' : ''}`} style={{ '--sw': color } as CSSProperties}>
            {preview ? (
              <img src={preview} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="wl-photo-empty">
                <Icon name={category ? WISH_CATEGORY[category].icon : 'tag'} size={42} />
                <small>{t('Sin foto: se verá su modelo 3D')}</small>
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
              <span>{t('…o la URL de una foto')}</span>
              <input type="url" inputMode="url" placeholder="https://…" value={imageUrl} maxLength={2048} onChange={(e) => setImageUrl(e.target.value)} />
              {show('image') && <small className="field-error">{show('image')}</small>}
            </label>
          )}
        </div>

        {/* Datos */}
        <div className="wl-form-main">
          <label className="field">
            <span>{t('Nombre *')}</span>
            <input value={name} maxLength={80} placeholder={t('Zapatillas blancas de piel')} onChange={(e) => setName(e.target.value)} aria-invalid={!!show('name')} />
            {show('name') && <small className="field-error">{show('name')}</small>}
          </label>

          <div className="field">
            <span id="wl-cat">{t('Categoría *')}</span>
            <div className="wl-cat-pick" role="radiogroup" aria-labelledby="wl-cat">
              {WISH_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={category === c}
                  className={`wl-cat-chip${category === c ? ' is-active' : ''}`}
                  onClick={() => {
                    play('click');
                    setCategory(c);
                    if (!editing || c !== item?.wishlistCategory) setGarmentTypeId('');
                  }}
                >
                  <Icon name={WISH_CATEGORY[c].icon} size={15} /> {WISH_CATEGORY[c].label}
                </button>
              ))}
            </div>
            {show('category') && <small className="field-error">{show('category')}</small>}
          </div>

          <div className="row">
            <label className="field">
              <span>{t('Marca')}</span>
              <input value={brand} maxLength={60} onChange={(e) => setBrand(e.target.value)} />
            </label>
            <label className="field">
              <span>{t('Talla que quieres')}</span>
              <input value={size} maxLength={20} placeholder="M, 42, 32/34…" onChange={(e) => setSize(e.target.value)} />
            </label>
          </div>

          <div className="row">
            {editing ? (
              <div className="field">
                <span>{t('Precio actual')}</span>
                <p className="wl-form-note">
                  <Icon name="history" size={13} /> {t('Se cambia desde la ficha («Apuntar precio») para que quede en el historial.')}
                </p>
              </div>
            ) : (
              <div className="field">
                <span id="wl-price">{t('Precio actual')}</span>
                <div className="wl-money-input">
                  <input
                    inputMode="decimal"
                    placeholder={t('Si lo sabes')}
                    aria-labelledby="wl-price"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    aria-invalid={!!show('price')}
                  />
                  <Select
                    size="sm"
                    ariaLabel={t('Moneda')}
                    value={currency}
                    options={[...new Set([currency, ...CURRENCIES])].map((c) => ({ value: c, label: c }))}
                    onChange={setCurrency}
                  />
                </div>
                {show('price') && <small className="field-error">{show('price')}</small>}
              </div>
            )}
            <label className="field">
              <span>{t('Avisarme si baja de…')}</span>
              <input inputMode="decimal" placeholder={t('Precio objetivo')} value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} aria-invalid={!!show('target')} />
              {show('target') && <small className="field-error">{show('target')}</small>}
            </label>
          </div>

          <div className="row">
            <label className="field">
              <span>{t('Color *')}</span>
              <span className="wl-color">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} aria-label={t('Color')} />
                <code>{color.toUpperCase()}</code>
              </span>
            </label>
            <div className="field">
              <span id="wl-type">{t('Modelo 3D {v}', { v: category === 'OTHER' ? '*' : '' })}</span>
              <Select labelledBy="wl-type" value={garmentTypeId} options={typeOptions} placeholder={t('Elige prenda')} onChange={setGarmentTypeId} />
              {show('type') && <small className="field-error">{show('type')}</small>}
            </div>
          </div>

          <div className="row">
            <label className="field">
              <span>{t('Enlace de compra')}</span>
              <input type="url" inputMode="url" placeholder="https://…" value={productUrl} maxLength={2048} onChange={(e) => setProductUrl(e.target.value)} />
              {show('url') && <small className="field-error">{show('url')}</small>}
            </label>
            <label className="field">
              <span>{t('Tienda')}</span>
              <input value={storeName} maxLength={80} onChange={(e) => setStoreName(e.target.value)} />
            </label>
          </div>

          <div className="field">
            <span id="wl-status">{t('Estado')}</span>
            <div className="wl-status-pick" role="radiogroup" aria-labelledby="wl-status">
              {WISH_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={status === s}
                  className={`wl-status-chip${status === s ? ' is-active' : ''}`}
                  style={{ '--st': WISH_STATUS[s].color } as CSSProperties}
                  title={WISH_STATUS[s].hint}
                  onClick={() => {
                    play('click');
                    setStatus(s);
                  }}
                >
                  <Icon name={WISH_STATUS[s].icon} size={13} /> {WISH_STATUS[s].short}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span>{t('Notas')}</span>
            <textarea rows={2} maxLength={1000} placeholder={t('Para el finde, esperar a rebajas…')} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          {wardrobes.length > 1 && (
            <div className="field">
              <span id="wl-wardrobe">{t('Cuando lo compres, irá a')}</span>
              <Select
                labelledBy="wl-wardrobe"
                value={wardrobeId}
                options={[{ value: '', label: t('Mi primer armario') }, ...wardrobes.map((w) => ({ value: w.id, label: w.name }))]}
                onChange={setWardrobeId}
              />
            </div>
          )}

          <label className="switch-row">
            <input type="checkbox" role="switch" checked={trackPrice} onChange={(e) => setTrackPrice(e.target.checked)} />
            <span className="switch" aria-hidden="true" />
            <span>
              <strong>{t('Seguir el precio')}</strong>
              <small className="muted">
                {t('Queda marcado para cuando se conecte un servicio de seguimiento de precios. De momento los precios los apuntas tú: la app no consulta tiendas ni se inventa precios.')}
              </small>
            </span>
          </label>

          {editing && num(item.currentPrice) === null && <p className="wl-form-note">{t('Sin precio todavía: apúntalo desde la ficha cuando lo sepas.')}</p>}

          <ErrorNote error={error} />

          <div className="wl-form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              {t('Cancelar')}
            </button>
            <button type="submit" className="btn btn-primary btn-street" disabled={saving || uploading}>
              <Icon name={editing ? 'check' : 'heart'} size={14} /> {saving ? t('Guardando…') : editing ? t('Guardar cambios') : t('Guardar en la wishlist')}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
