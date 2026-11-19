import { useRef, useState, type FormEvent } from 'react';
import { assetsApi, marketApi } from '../../api/endpoints';
import type { Listing, ListingCondition, ListingInput, ListingKind, WardrobeItem, WishlistCategory } from '../../api/types';
import { explain } from '../../lib/apiErrors';
import { useAssetUrl } from '../../lib/assetUrl';
import { LISTING_CONDITION, LISTING_CONDITIONS, LISTING_KIND, MARKET_ERRORS } from '../../lib/market';
import { play } from '../../lib/sfx';
import { brandOf as sneakerBrand } from '../../lib/sneakers';
import { brandOf, CURRENCIES, WISH_CATEGORIES, WISH_CATEGORY } from '../../lib/wishlist';
import { ErrorNote } from '../ErrorNote';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { Select } from '../Select';

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PHOTOS = 6;

export type ListingFormMode = { kind: 'create'; item?: WardrobeItem | null } | { kind: 'edit'; listing: Listing };

/** Categoría del market según el tipo de prenda (igual que en el backend). */
export function categoryFor(item: Pick<WardrobeItem, 'garmentType'>): WishlistCategory {
  switch (item.garmentType.code) {
    case 'SNEAKERS':
      return 'SNEAKERS';
    case 'SWEATER':
      return 'HOODIES';
    case 'T_SHIRT':
    case 'SHIRT':
      return 'TSHIRTS';
    case 'PANTS':
    case 'SHORTS':
      return 'PANTS';
    case 'JACKET':
    case 'COAT':
      return 'JACKETS';
  }
  if (item.garmentType.category === 'OUTERWEAR') return 'JACKETS';
  if (item.garmentType.category === 'ACCESSORY') return 'ACCESSORIES';
  return 'OTHER';
}

const SNEAKER_TO_LISTING: Record<string, ListingCondition> = {
  DEADSTOCK: 'NEW_WITH_TAGS',
  LIKE_NEW: 'LIKE_NEW',
  GOOD: 'GOOD',
  WORN: 'FAIR',
  BEAT: 'FAIR',
};

const parseMoney = (v: string): number | null => {
  const t = v.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && /^\d+(\.\d{1,2})?$/.test(t) ? n : NaN;
};

/**
 * Publicar o editar un anuncio de STREET MARKET. Desde «Vender» (una prenda o
 * unas zapatillas de tu armario) llega con sus datos y su foto ya puestos; si
 * no hay foto, el anuncio enseña su modelo 3D.
 */
export function ListingForm({ mode, onClose, onSaved }: { mode: ListingFormMode; onClose: () => void; onSaved: (l: Listing, created: boolean) => void }) {
  const editing = mode.kind === 'edit' ? mode.listing : null;
  const item = mode.kind === 'create' ? (mode.item ?? null) : null;

  const [kind, setKind] = useState<ListingKind>(editing?.kind ?? 'SELL');
  const [title, setTitle] = useState(editing?.title ?? (item ? (item.sneaker ? `${sneakerBrand(item.sneaker)} ${item.sneaker.model}` : item.name) : ''));
  const [category, setCategory] = useState<WishlistCategory | null>(editing?.category ?? (item ? categoryFor(item) : null));
  const [brand, setBrand] = useState(editing?.brand ?? (item ? (item.sneaker ? sneakerBrand(item.sneaker) : (brandOf(item) ?? '')) : ''));
  const [size, setSize] = useState(editing?.size ?? item?.size ?? '');
  const [condition, setCondition] = useState<ListingCondition>(
    editing?.condition ?? (item?.sneaker ? SNEAKER_TO_LISTING[item.sneaker.condition] : 'GOOD'),
  );
  const [price, setPrice] = useState(editing?.price ? String(Number(editing.price)) : '');
  const [currency, setCurrency] = useState(editing?.currency ?? item?.currency ?? 'EUR');
  const [city, setCity] = useState(editing?.city ?? '');
  const [swapFor, setSwapFor] = useState(editing?.swapFor ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [photos, setPhotos] = useState<string[]>(editing?.photos ?? (item?.photoAssetId ? [item.photoAssetId] : []));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [tried, setTried] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const priceN = parseMoney(price);
  const problems = {
    title: title.trim().length < 2 ? 'Ponle un título (mínimo 2 letras).' : null,
    category: !category ? 'Elige una categoría.' : null,
    price:
      priceN !== null && Number.isNaN(priceN)
        ? 'Escribe un precio válido (p. ej. 45 o 45,90).'
        : kind === 'SELL' && priceN === null
          ? 'Para vender hace falta un precio.'
          : null,
  };
  const invalid = Object.values(problems).some(Boolean);
  const show = (k: keyof typeof problems) => (tried ? problems[k] : null);

  async function upload(files: FileList | null) {
    if (!files) return;
    setError(null);
    const list = [...files].slice(0, MAX_PHOTOS - photos.length);
    for (const f of list) {
      if (!ACCEPT.includes(f.type)) return setError(new Error('Las fotos deben ser PNG, JPEG o WebP.'));
      if (f.size > MAX_BYTES) return setError(new Error('Cada foto puede ocupar como mucho 2 MB.'));
    }
    setUploading(true);
    try {
      for (const f of list) {
        const asset = await assetsApi.upload(f);
        setPhotos((p) => [...p, asset.id].slice(0, MAX_PHOTOS));
      }
      play('pop');
    } catch (err) {
      setError(err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function move(i: number, d: -1 | 1) {
    setPhotos((p) => {
      const j = i + d;
      if (j < 0 || j >= p.length) return p;
      const n = [...p];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (invalid || !category) {
      play('error');
      return;
    }
    setSaving(true);
    setError(null);
    const body: ListingInput = {
      kind,
      title: title.trim(),
      category,
      brand: brand.trim() || null,
      size: size.trim() || null,
      condition,
      price: priceN === null || Number.isNaN(priceN) ? null : priceN,
      currency,
      city: city.trim() || null,
      swapFor: kind === 'SWAP' ? swapFor.trim() || null : null,
      description: description.trim() || null,
      photoAssetIds: photos,
    };
    try {
      const saved = editing ? await marketApi.update(editing.id, body) : await marketApi.create({ ...body, itemId: item?.id });
      onSaved(saved, !editing);
    } catch (err) {
      setError(explain(err, MARKET_ERRORS));
      play('error');
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? 'Editar anuncio' : item ? `Vender «${item.name}»` : 'Publicar en el market'} onClose={onClose} wide className="wl-form-modal mk-form-modal">
      <form className="wl-form mk-form" onSubmit={submit} noValidate>
        <div className="mk-photos-field">
          <div className="mk-photos">
            {photos.map((id, i) => (
              <PhotoThumb key={id} id={id} index={i} count={photos.length} onMove={move} onRemove={() => setPhotos((p) => p.filter((x) => x !== id))} />
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className={`mk-photo-add${uploading ? ' is-busy' : ''}`}>
                <Icon name="plus" size={22} />
                <small>{uploading ? 'Subiendo…' : photos.length ? 'Añadir' : 'Subir fotos'}</small>
                <input ref={fileRef} type="file" accept={ACCEPT.join(',')} multiple hidden disabled={uploading} onChange={(e) => void upload(e.target.files)} />
              </label>
            )}
          </div>
          <small className="muted">
            Hasta {MAX_PHOTOS} fotos tuyas (PNG, JPEG o WebP, máx. 2 MB). La primera es la portada.
            {item && !photos.length && ' Sin fotos, el anuncio enseña el modelo 3D de tu prenda.'}
          </small>
        </div>

        <div className="wl-form-main">
          <div className="field">
            <span id="mk-kind">¿Qué quieres hacer?</span>
            <div className="mk-kind-pick" role="radiogroup" aria-labelledby="mk-kind">
              {(['SELL', 'SWAP'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  className={`wl-cat-chip${kind === k ? ' is-active' : ''}`}
                  onClick={() => {
                    play('click');
                    setKind(k);
                  }}
                >
                  <Icon name={LISTING_KIND[k].icon} size={15} /> {k === 'SELL' ? 'Vender' : 'Intercambiar'}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span>Título *</span>
            <input value={title} maxLength={80} placeholder="Sudadera negra oversize" onChange={(e) => setTitle(e.target.value)} aria-invalid={!!show('title')} />
            {show('title') && <small className="field-error">{show('title')}</small>}
          </label>

          <div className="field">
            <span id="mk-cat">Categoría *</span>
            <div className="wl-cat-pick" role="radiogroup" aria-labelledby="mk-cat">
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
              <span>Marca</span>
              <input value={brand} maxLength={40} onChange={(e) => setBrand(e.target.value)} />
            </label>
            <label className="field">
              <span>Talla</span>
              <input value={size} maxLength={20} placeholder="M, 42, 32/34…" onChange={(e) => setSize(e.target.value)} />
            </label>
          </div>

          <div className="row">
            <div className="field">
              <span id="mk-price">{kind === 'SELL' ? 'Precio *' : 'Valor orientativo'}</span>
              <div className="wl-money-input">
                <input
                  inputMode="decimal"
                  placeholder={kind === 'SELL' ? '45' : 'Opcional'}
                  aria-labelledby="mk-price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  aria-invalid={!!show('price')}
                />
                <Select size="sm" ariaLabel="Moneda" value={currency} options={[...new Set([currency, ...CURRENCIES])].map((c) => ({ value: c, label: c }))} onChange={setCurrency} />
              </div>
              {show('price') && <small className="field-error">{show('price')}</small>}
            </div>
            <div className="field">
              <span id="mk-cond">Estado</span>
              <Select
                labelledBy="mk-cond"
                value={condition}
                options={LISTING_CONDITIONS.map((c) => ({ value: c, label: LISTING_CONDITION[c].label }))}
                onChange={(v) => setCondition(v as ListingCondition)}
              />
            </div>
          </div>

          {kind === 'SWAP' && (
            <label className="field">
              <span>¿Qué te gustaría a cambio?</span>
              <input value={swapFor} maxLength={200} placeholder="Unas zapatillas talla 43, una chaqueta…" onChange={(e) => setSwapFor(e.target.value)} />
            </label>
          )}

          <label className="field">
            <span>Ciudad</span>
            <input value={city} maxLength={60} placeholder="Para quedar o calcular el envío" onChange={(e) => setCity(e.target.value)} />
          </label>

          <label className="field">
            <span>Descripción</span>
            <textarea rows={3} value={description} maxLength={1000} placeholder="Detalles, medidas, defectos, cómo prefieres el envío…" onChange={(e) => setDescription(e.target.value)} />
          </label>

          <p className="wl-form-note mk-form-note">
            <Icon name="chat" size={13} /> Quien esté interesado te escribirá por Mensajes. En MyOO no hay pagos: el trato lo cerráis vosotros. Si tu ajuste de
            mensajes es «Nadie», no podrán contactarte.
          </p>

          <ErrorNote error={error} />
          <div className="actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary btn-street" disabled={saving || uploading}>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Publicar'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function PhotoThumb({ id, index, count, onMove, onRemove }: { id: string; index: number; count: number; onMove: (i: number, d: -1 | 1) => void; onRemove: () => void }) {
  const url = useAssetUrl(id);
  return (
    <div className="mk-photo">
      {url ? <img src={url} alt={`Foto ${index + 1}`} /> : <span className="mk-media-wait" aria-hidden="true" />}
      {index === 0 && <span className="mk-photo-cover">Portada</span>}
      <span className="mk-photo-tools">
        <button type="button" className="icon-btn" aria-label="Mover a la izquierda" disabled={index === 0} onClick={() => onMove(index, -1)}>
          <Icon name="back" size={12} />
        </button>
        <button type="button" className="icon-btn" aria-label="Quitar foto" onClick={onRemove}>
          <Icon name="close" size={12} />
        </button>
        <button type="button" className="icon-btn" aria-label="Mover a la derecha" disabled={index === count - 1} onClick={() => onMove(index, 1)}>
          <Icon name="forward" size={12} />
        </button>
      </span>
    </div>
  );
}
