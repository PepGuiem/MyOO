import { useCallback, useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi, marketApi } from '../api/endpoints';
import type { Listing, ListingStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ReportDialog } from '../components/community/ReportDialog';
import { ErrorNote } from '../components/ErrorNote';
import { ConfirmDialog } from '../components/fx/ConfirmDialog';
import { SprayLoader } from '../components/fx/SprayLoader';
import { useToast } from '../components/fx/Toast';
import { Icon } from '../components/Icon';
import { priceLabel } from '../components/market/ListingCard';
import { ListingForm } from '../components/market/ListingForm';
import { ListingMedia, useListingPhoto } from '../components/market/ListingMedia';
import { PersonAvatar, personName, profilePath } from '../components/social/PersonAvatar';
import { errorText, explain } from '../lib/apiErrors';
import { timeAgo } from '../lib/community';
import { LISTING_CONDITION, LISTING_KIND, LISTING_STATUS, MARKET_ERRORS } from '../lib/market';
import { burst, withTransition } from '../lib/motion';
import { play } from '../lib/sfx';
import { WISH_CATEGORY } from '../lib/wishlist';

/** Ficha de un anuncio: galería, datos, contacto por chat y favoritos. */
export function ListingPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [l, setL] = useState<Listing | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [photo, setPhoto] = useState(0);
  const [view, setView] = useState<'photo' | '3d'>('photo');
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [contactError, setContactError] = useState<unknown>(null);
  const [pulse, setPulse] = useState(0);

  const load = useCallback(() => {
    marketApi
      .get(id)
      .then((x) => {
        setL(x);
        setError(null);
      })
      .catch((e: unknown) => setError(e));
  }, [id]);
  useEffect(load, [load]);

  if (!l) {
    return (
      <section className="page mk mk-item">
        <Link to="/market" className="wl-back">
          <Icon name="back" size={14} /> Street Market
        </Link>
        <ErrorNote error={error} />
        {!error && <SprayLoader label="Abriendo el anuncio…" />}
      </section>
    );
  }

  async function favorite(e: MouseEvent<HTMLButtonElement>) {
    if (!l) return;
    const on = !l.isFavorite;
    const r = e.currentTarget.getBoundingClientRect();
    setL({ ...l, isFavorite: on, favorites: l.favorites + (on ? 1 : -1) });
    if (on) {
      setPulse((p) => p + 1);
      burst(r.left + r.width / 2, r.top + r.height / 2, { count: 12, spread: 40 });
      play('pop');
    }
    try {
      const res = await marketApi.favorite(l.id, on);
      setL((x) => (x ? { ...x, ...res } : x));
    } catch (err) {
      setL(l);
      toast.show(errorText(err, MARKET_ERRORS, 'No se pudo guardar'), { tone: 'danger', sound: 'error' });
    }
  }

  async function contact(e: FormEvent) {
    e.preventDefault();
    if (!l) return;
    setBusy(true);
    setContactError(null);
    try {
      const { conversationId } = await marketApi.contact(l.id, message.trim() || null);
      play('success');
      toast.show('Mensaje enviado. Seguid hablando por el chat.', { tone: 'ok', icon: 'chat' });
      navigate(`/mensajes/${conversationId}`);
    } catch (err) {
      setContactError(explain(err, MARKET_ERRORS));
      play('error');
      setBusy(false);
    }
  }

  async function setStatus(status: ListingStatus) {
    if (!l || status === l.status) return;
    setBusy(true);
    try {
      const u = await marketApi.update(l.id, { status });
      withTransition(() => setL(u));
      play(status === 'SOLD' ? 'success' : 'click');
      toast.show(`Marcado como ${LISTING_STATUS[status].label.toLowerCase()}`, { tone: status === 'SOLD' ? 'ok' : 'info' });
    } catch (err) {
      toast.show(errorText(err, MARKET_ERRORS, 'No se pudo cambiar'), { tone: 'danger', sound: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!l) return;
    setBusy(true);
    try {
      await marketApi.remove(l.id);
      play('swoosh');
      toast.show('Anuncio borrado', { tone: 'danger', icon: 'trash' });
      navigate('/market');
    } catch (err) {
      setBusy(false);
      setConfirm(false);
      toast.show(errorText(err, MARKET_ERRORS, 'No se pudo borrar'), { tone: 'danger', sound: 'error' });
    }
  }

  async function hide() {
    if (!l) return;
    try {
      await adminApi.hideListing(l.id, true);
      toast.show('Anuncio ocultado', { tone: 'info', icon: 'eyeOff' });
      navigate('/market');
    } catch (err) {
      toast.show(errorText(err, {}, 'No se pudo ocultar'), { tone: 'danger', sound: 'error' });
    }
  }

  const hasPhotos = l.photos.length > 0;
  const showing3d = !hasPhotos || view === '3d';
  const facts: [string, string][] = [
    ['Categoría', WISH_CATEGORY[l.category].label],
    ['Marca', l.brand ?? '—'],
    ['Talla', l.size ?? '—'],
    ['Estado', LISTING_CONDITION[l.condition].label],
    ['Ciudad', l.city ?? '—'],
    ['Publicado', timeAgo(l.createdAt)],
  ];

  return (
    <section className={`page mk mk-item is-${l.status.toLowerCase()}`}>
      <Link to="/market" className="wl-back">
        <Icon name="back" size={14} /> Street Market
      </Link>

      {l.hiddenByAdmin && (
        <p className="mk-hidden-note">
          <Icon name="eyeOff" size={14} /> Un administrador ha ocultado este anuncio: solo lo ves tú.
        </p>
      )}

      <div className="mk-item-grid">
        <div className="mk-gallery">
          <div className="mk-gallery-main">
            <ListingMedia key={`${photo}-${view}`} listing={l} photo={photo} active mode={showing3d ? '3d' : 'auto'} className="mk-gallery-view" />
            <span className={`mk-kind is-${l.kind.toLowerCase()} is-big`}>
              <Icon name={LISTING_KIND[l.kind].icon} size={13} /> {LISTING_KIND[l.kind].label}
            </span>
            {l.status !== 'ACTIVE' && <span className="mk-ribbon is-big">{LISTING_STATUS[l.status].label}</span>}
          </div>
          {(l.photos.length > 1 || (hasPhotos && l.garment)) && (
            <div className="mk-thumbs" role="group" aria-label="Fotos">
              {l.photos.map((a, i) => (
                <Thumb
                  key={a}
                  listingId={l.id}
                  assetId={a}
                  index={i}
                  active={!showing3d && photo === i}
                  onPick={() =>
                    withTransition(() => {
                      setView('photo');
                      setPhoto(i);
                    })
                  }
                />
              ))}
              {l.garment && hasPhotos && (
                <button type="button" className={`mk-thumb is-3d${showing3d ? ' is-active' : ''}`} aria-pressed={showing3d} onClick={() => withTransition(() => setView('3d'))}>
                  3D
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mk-info">
          <span className="fits-kicker">
            <Icon name={WISH_CATEGORY[l.category].icon} size={13} /> {WISH_CATEGORY[l.category].label}
          </span>
          <h1 className="mk-item-h1">{l.title}</h1>
          <div className="mk-item-price">
            <b>{priceLabel(l)}</b>
            {!l.isMine && (
              <button
                type="button"
                className={`mk-fav is-inline${l.isFavorite ? ' is-on' : ''}`}
                aria-pressed={l.isFavorite}
                aria-label={l.isFavorite ? 'Quitar de guardados' : 'Guardar'}
                onClick={(e) => void favorite(e)}
              >
                <Icon key={pulse} name="heart" size={18} />
                <span>{l.favorites}</span>
              </button>
            )}
          </div>

          {l.kind === 'SWAP' && l.swapFor && (
            <p className="mk-swap">
              <Icon name="swap" size={14} /> <span>A cambio de:</span> {l.swapFor}
            </p>
          )}

          <dl className="wl-facts mk-facts">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>

          {l.description && <p className="wl-notes mk-desc">{l.description}</p>}

          <div className="mk-seller-row">
            <Link to={profilePath(l.seller)} className="mk-seller-link">
              <PersonAvatar person={l.seller} size={40} />
              <span>
                <small className="muted">{l.isMine ? 'Tu anuncio' : 'Vende'}</small>
                <strong>{personName(l.seller)}</strong>
              </span>
            </Link>
            {!l.isMine && (
              <button type="button" className="icon-btn" title="Denunciar anuncio" aria-label="Denunciar anuncio" onClick={() => setReporting(true)}>
                <Icon name="flag" size={15} />
              </button>
            )}
            {!l.isMine && user?.role === 'ADMIN' && (
              <button type="button" className="icon-btn" title="Ocultar (admin)" aria-label="Ocultar anuncio (admin)" onClick={() => void hide()}>
                <Icon name="eyeOff" size={15} />
              </button>
            )}
          </div>

          {l.isMine ? (
            <div className="mk-owner">
              <div className="mk-status-pick" role="radiogroup" aria-label="Estado del anuncio">
                {(['ACTIVE', 'RESERVED', 'SOLD'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={l.status === s}
                    className={`wl-cat-chip${l.status === s ? ' is-active' : ''}`}
                    disabled={busy}
                    title={LISTING_STATUS[s].hint}
                    onClick={() => void setStatus(s)}
                  >
                    {LISTING_STATUS[s].label}
                  </button>
                ))}
              </div>
              <div className="wl-item-actions">
                <button type="button" className="btn btn-street btn-ghost" onClick={() => setEditing(true)}>
                  <Icon name="edit" size={14} /> Editar
                </button>
                <button type="button" className="btn btn-danger" onClick={() => setConfirm(true)}>
                  <Icon name="trash" size={14} /> Borrar
                </button>
              </div>
            </div>
          ) : l.canContact ? (
            <form className="mk-contact" onSubmit={contact}>
              <label className="field">
                <span>Escribe a {personName(l.seller)}</span>
                <textarea rows={2} maxLength={500} value={message} placeholder="¿Sigue disponible? ¿Hace envío?" onChange={(e) => setMessage(e.target.value)} />
              </label>
              <ErrorNote error={contactError} />
              <button type="submit" className="btn btn-primary btn-street" disabled={busy}>
                <Icon name="chat" size={14} /> {busy ? 'Enviando…' : 'Contactar por chat'}
              </button>
              <small className="muted">El pago y la entrega los acordáis vosotros: MyOO no cobra ni guarda datos de pago.</small>
            </form>
          ) : (
            <p className="mk-contact-off muted">
              <Icon name="lock" size={14} /> {l.status === 'SOLD' ? 'Este anuncio ya está vendido.' : 'Esta persona no acepta mensajes ahora mismo.'}
            </p>
          )}
        </div>
      </div>

      {editing && (
        <ListingForm
          mode={{ kind: 'edit', listing: l }}
          onClose={() => setEditing(false)}
          onSaved={(u) => {
            setL(u);
            setEditing(false);
            setPhoto(0);
            play('success');
            toast.show('Cambios guardados', { tone: 'ok' });
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog title={`¿Borrar «${l.title}»?`} confirmLabel="Borrar" danger busy={busy} onConfirm={() => void remove()} onClose={() => setConfirm(false)}>
          El anuncio desaparece del market y de los guardados de otras personas. Las fotos que no uses en nada más también se borran.
        </ConfirmDialog>
      )}
      {reporting && <ReportDialog targetType="LISTING" targetId={l.id} onClose={() => setReporting(false)} />}
    </section>
  );
}

function Thumb({ listingId, assetId, index, active, onPick }: { listingId: string; assetId: string; index: number; active: boolean; onPick: () => void }) {
  const url = useListingPhoto(listingId, assetId);
  return (
    <button type="button" className={`mk-thumb${active ? ' is-active' : ''}`} aria-pressed={active} aria-label={`Foto ${index + 1}`} onClick={onPick}>
      {url ? <img src={url} alt="" /> : <span className="mk-media-wait" aria-hidden="true" />}
    </button>
  );
}
