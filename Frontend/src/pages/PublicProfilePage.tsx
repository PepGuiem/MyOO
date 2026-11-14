import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { adminApi, chatApi, peopleApi } from '../api/endpoints';
import type { PersonResult, PublicProfile, SharedOutfit } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ReportDialog } from '../components/community/ReportDialog';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { FollowButton } from '../components/social/FollowButton';
import { CoverArt, DripEdge, GraffitiName, stickerTilt } from '../components/street/Street';
import { initialsOf } from './ProfilePage';
import { PersonAvatar, personName } from '../components/social/PersonAvatar';
import { PersonRow } from '../components/social/PersonRow';
import { Busy, Spinner } from '../components/Spinner';
import { useBodyShape } from '../lib/bodyPref';
import { SEASON_LABEL, plural } from '../lib/labels';
import { usePersonImage } from '../lib/personImage';
import { useRealtimeEvent } from '../lib/realtime';
import { STYLE_TAGS } from '../lib/stylist';
import { OutfitView } from '../three/OutfitMannequin';
import { UserDialog } from './AdminPage';
import { OUTFIT_TILE_DISTANCE } from './OutfitsPage';
import { InfiniteSentinel } from '../components/InfiniteSentinel';
import { usePagedList } from '../lib/usePagedList';

const STYLE_LABEL: Record<string, string> = Object.fromEntries(STYLE_TAGS.map((s) => [s.value, s.label]));
type Tab = 'outfits' | 'followers' | 'following';

/** Perfil de otra persona (o el tuyo, tal como lo ven los demás): /u/:handle */
export function PublicProfilePage() {
  const { handle = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'outfits';
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<'report' | 'admin' | null>(null);
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'ADMIN';

  const load = useCallback(() => {
    setError(null);
    peopleApi
      .get(handle)
      .then(setProfile)
      .catch(setError);
  }, [handle]);
  useEffect(load, [load]);

  // Si te aceptan la solicitud mientras miras su perfil, se actualiza solo.
  useRealtimeEvent((e) => {
    if (e.type === 'follow_accepted' && e.user?.id === profile?.id) load();
  });

  const cover = usePersonImage(profile?.id, profile?.cover, 'cover');

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <section className="page profile">
        {notFound ? (
          <div className="empty">
            <p>Esta persona no existe o no está disponible.</p>
            <Link to="/personas" className="btn">
              Buscar personas
            </Link>
          </div>
        ) : (
          <ErrorNote error={error} />
        )}
      </section>
    );
  }
  if (!profile) return <Spinner size={22} label="Cargando perfil…" />;

  const p = profile;
  const rel = p.relationship;

  async function message() {
    setBusy(true);
    try {
      const c = await chatApi.direct(p.id);
      navigate(`/mensajes/${c.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setMenu(false);
    try {
      await fn();
      load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page profile" style={p.accentColor ? ({ '--accent': p.accentColor } as CSSProperties) : undefined}>
      <header className="profile-hero">
        <div className={`profile-cover${cover ? ' has-image' : ''}`} style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
          {!cover && <CoverArt seed={p.id} initials={initialsOf(personName(p))} />}
          <span className="cover-lamp" aria-hidden="true" />
          <DripEdge seed={p.id} />
        </div>
        <div className="profile-id">
          <div className="profile-avatar-wrap">
            <span className="tape tape-a" aria-hidden="true" />
            <span className="tape tape-b" aria-hidden="true" />
            <PersonAvatar person={p} size={112} className="profile-avatar" />
          </div>
          <div className="profile-who">
            <GraffitiName text={personName(p)} className="profile-name" />
            <p className="profile-handle">
              {p.username && <span className="handle-tag">@{p.username}</span>}
              {p.pronouns && <span>{p.pronouns}</span>}
              {p.location && <span>{p.location}</span>}
              {p.isPrivate && (
                <span className="lock-label">
                  <Icon name="lock" size={12} /> Privada
                </span>
              )}
            </p>
          </div>
          <div className="profile-actions">
            {rel.isSelf ? (
              <Link to="/perfil" className="btn btn-primary">
                <Icon name="edit" size={14} /> Editar tu perfil
              </Link>
            ) : rel.blockedByMe ? (
              <button type="button" className="btn" disabled={busy} onClick={() => void act(() => peopleApi.unblock(p.id))}>
                Desbloquear
              </button>
            ) : (
              <>
                <FollowButton
                  userId={p.id}
                  state={rel.following}
                  followsYou={rel.followedBy === 'accepted'}
                  onChange={(following) => {
                    setProfile({ ...p, relationship: { ...rel, following } });
                    if (following !== rel.following) load();
                  }}
                />
                {p.canMessage && (
                  <button type="button" className="btn" disabled={busy} onClick={() => void message()}>
                    {busy ? <Busy text="Abriendo…" /> : (
                      <>
                        <Icon name="chat" size={14} /> Mensaje
                      </>
                    )}
                  </button>
                )}
                {p.canView && (
                  <Link to={`/batallas?retar=${p.id}`} className="btn" title="Retarle a una Streetwear Battle">
                    <Icon name="bolt" size={14} /> Retar
                  </Link>
                )}
                <span className="menu-wrap">
                  <button type="button" className="btn btn-ghost" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((v) => !v)}>
                    <Icon name="more" size={16} />
                    <span className="visually-hidden">Más opciones</span>
                  </button>
                  {menu && (
                    <span className="menu" role="menu">
                      {rel.followedBy !== 'none' && (
                        <button type="button" role="menuitem" onClick={() => void act(() => peopleApi.removeFollower(p.id))}>
                          {rel.followedBy === 'pending' ? 'Rechazar su solicitud' : 'Eliminar de tus seguidores'}
                        </button>
                      )}
                      <button type="button" role="menuitem" className="danger-text" onClick={() => void act(() => peopleApi.block(p.id))}>
                        Bloquear
                      </button>
                      <button type="button" role="menuitem" onClick={() => (setMenu(false), setDialog('report'))}>
                        Denunciar perfil
                      </button>
                      {isAdmin && (
                        <button type="button" role="menuitem" onClick={() => (setMenu(false), setDialog('admin'))}>
                          Abrir en el panel de admin
                        </button>
                      )}
                    </span>
                  )}
                </span>
              </>
            )}
          </div>
        </div>

        {rel.followedBy === 'accepted' && !rel.isSelf && (
          <p className="profile-follows-you">
            <span className="sticker sticker-small" style={{ '--r': '-4deg', '--i': 0 } as CSSProperties}>
              Te sigue
            </span>
          </p>
        )}

        <div className="profile-about">
          {p.bio && <p className="profile-bio">{p.bio}</p>}
          {p.styleTags.length > 0 && (
            <ul className="profile-tags sticker-row" aria-label="Estilos">
              {p.styleTags.map((t, i) => (
                <li key={t} className="sticker" style={{ '--r': `${stickerTilt(t)}deg`, '--i': i } as CSSProperties}>
                  {STYLE_LABEL[t] ?? t}
                </li>
              ))}
            </ul>
          )}
          <div className="profile-links">
            {p.website && (
              <a href={p.website} target="_blank" rel="noopener noreferrer nofollow">
                <Icon name="external" size={13} /> {p.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            )}
            {p.instagramHandle && (
              <a href={`https://www.instagram.com/${encodeURIComponent(p.instagramHandle)}/`} target="_blank" rel="noopener noreferrer nofollow">
                <Icon name="external" size={13} /> Instagram @{p.instagramHandle}
              </a>
            )}
            {p.favoriteColors.length > 0 && (
              <span className="profile-colors" aria-label="Colores favoritos">
                {p.favoriteColors.map((c, i) => (
                  <span key={c} className="splat" style={{ '--c': c, '--i': i } as CSSProperties} title={c} />
                ))}
              </span>
            )}
          </div>
        </div>
      </header>

      <nav className="profile-tabs" aria-label="Contenido del perfil">
        {(
          [
            ['outfits', `${p.counts.outfits} outfits`],
            ['followers', plural(p.counts.followers, 'seguidor', 'seguidores')],
            ['following', `${p.counts.following} siguiendo`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="profile-tab"
            aria-current={tab === key ? 'page' : undefined}
            disabled={!p.canView}
            onClick={() => setParams(key === 'outfits' ? {} : { tab: key }, { replace: true })}
          >
            {label}
          </button>
        ))}
      </nav>

      {rel.blockedByMe ? (
        <div className="empty">
          <p>Has bloqueado a esta persona: no os veis ni os podéis escribir.</p>
        </div>
      ) : !p.canView ? (
        <div className="empty private-wall">
          <Icon name="lock" size={28} />
          <p>
            <strong>Esta cuenta es privada.</strong>
            <br />
            {rel.following === 'pending' ? 'Tu solicitud está pendiente.' : 'Síguela para ver sus outfits y a quién sigue.'}
          </p>
        </div>
      ) : tab === 'outfits' ? (
        <SharedOutfits handle={p.id} isSelf={rel.isSelf} isAdmin={isAdmin} />
      ) : (
        <Connections handle={p.id} which={tab} />
      )}
      {dialog === 'report' && <ReportDialog targetType="USER" targetId={p.id} onClose={() => setDialog(null)} />}
      {dialog === 'admin' && <UserDialog id={p.id} onClose={() => setDialog(null)} />}
    </section>
  );
}

function SharedOutfits({ handle, isSelf, isAdmin }: { handle: string; isSelf: boolean; isAdmin: boolean }) {
  const list = usePagedList((page) => peopleApi.outfits(handle, page), [handle]);
  const { items, loading, error } = list;
  if (error && items.length === 0) return <ErrorNote error={error} />;
  if (loading && items.length === 0) return <Spinner label="Cargando outfits…" />;
  if (items.length === 0) {
    return (
      <div className="empty">
        <p>{isSelf ? 'Aún no compartes ningún outfit. Marca «Compartir en mi perfil» al editar uno.' : 'Todavía no comparte outfits.'}</p>
        {isSelf && (
          <Link to="/outfits" className="btn">
            Ir a mis outfits
          </Link>
        )}
      </div>
    );
  }
  return (
    <>
    <div className="grid grid-outfits grid-outfits-large">
      {items.map((o, i) => (
        <SharedOutfitCard
          index={i % 24}
          key={o.id}
          outfit={o}
          canReport={!isSelf}
          isAdmin={isAdmin}
          onHidden={() => list.setItems((l) => l.filter((x) => x.id !== o.id))}
        />
      ))}
    </div>
    <InfiniteSentinel hasMore={list.hasMore} loading={loading} error={error} onMore={list.loadMore} count={items.length} />
    </>
  );
}

function SharedOutfitCard({
  outfit,
  index,
  canReport,
  isAdmin,
  onHidden,
}: {
  outfit: SharedOutfit;
  index: number;
  canReport: boolean;
  isAdmin: boolean;
  onHidden: () => void;
}) {
  const [active, setActive] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function hide() {
    try {
      await adminApi.hideOutfit(outfit.id, true);
      onHidden();
    } catch (err) {
      setError(err);
    }
  }

  const { shape } = useBodyShape();
  const garments = useMemo(() => outfit.items.map((i) => ({ ...i.wardrobeItem, styling: i.styling })), [outfit.items]);
  const meta = [outfit.occasion, outfit.season ? SEASON_LABEL[outfit.season] : null, plural(garments.length, 'prenda', 'prendas')]
    .filter(Boolean)
    .join(', ');
  return (
    <div
      className="tile tile-outfit is-static tile-in"
      style={{ '--i': Math.min(index, 12) } as CSSProperties}
      tabIndex={0}
      aria-label={`${outfit.name}. ${meta}`}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <div className="tile-stage">
        <OutfitView className="tile-view" garments={garments} shape={shape} active={active} distance={OUTFIT_TILE_DISTANCE} />
      </div>
      <div className="tile-caption">
        <span className="tile-name">{outfit.name}</span>
      </div>
      <span className="tile-meta">{meta}</span>
      {outfit.description && <span className="tile-meta">{outfit.description}</span>}
      {(canReport || isAdmin) && (
        <span className="tile-tools">
          {canReport && (
            <button type="button" className="icon-btn" title="Denunciar outfit" aria-label={`Denunciar «${outfit.name}»`} onClick={() => setReporting(true)}>
              <Icon name="flag" size={14} />
            </button>
          )}
          {isAdmin && (
            <button type="button" className="icon-btn" title="Ocultar (admin)" aria-label={`Ocultar «${outfit.name}» (admin)`} onClick={() => void hide()}>
              <Icon name="eyeOff" size={14} />
            </button>
          )}
        </span>
      )}
      <ErrorNote error={error} />
      {reporting && <ReportDialog targetType="OUTFIT" targetId={outfit.id} onClose={() => setReporting(false)} />}
    </div>
  );
}

function Connections({ handle, which }: { handle: string; which: 'followers' | 'following' }) {
  const { user } = useAuth();
  const [people, setPeople] = useState<PersonResult[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    setPeople(null);
    (which === 'followers' ? peopleApi.followers(handle) : peopleApi.following(handle))
      .then((r) => setPeople(r.data))
      .catch(setError);
  }, [handle, which]);
  if (error) return <ErrorNote error={error} />;
  if (!people) return <Spinner label="Cargando…" />;
  if (people.length === 0) return <p className="muted">{which === 'followers' ? 'Sin seguidores todavía.' : 'No sigue a nadie todavía.'}</p>;
  return (
    <ul className="person-list panel">
      {people.map((person) => (
        <PersonRow
          key={person.id}
          person={person}
          action={
            person.id === user?.id ? undefined : (
            <FollowButton
              small
              userId={person.id}
              state={person.following}
              onChange={(following) => setPeople((l) => l?.map((x) => (x.id === person.id ? { ...x, following } : x)) ?? l)}
            />
            )
          }
        />
      ))}
    </ul>
  );
}
