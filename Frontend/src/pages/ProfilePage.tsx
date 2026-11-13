import { useEffect, useId, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError } from '../api/client';
import { assetsApi, oauthApi, peopleApi, plansApi, usersApi } from '../api/endpoints';
import type { InstagramOverview, MessagePolicy, ProfileInput, ProviderSlug, User, UserBrief } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { PersonRow } from '../components/social/PersonRow';
import { CountUp, CoverArt, DripEdge, GraffitiName, stickerTilt } from '../components/street/Street';
import { Busy, Spinner } from '../components/Spinner';
import { useAssetUrl } from '../lib/assetUrl';
import { cropImage } from '../lib/imageCrop';
import { RESOURCE_LABEL, formatDate } from '../lib/labels';
import { openProvider, pendingAction, PROVIDER_LABEL, setPendingAction, takeReauthProof } from '../lib/oauthFlow';
import { STYLE_TAGS } from '../lib/stylist';
import { useAsync } from '../lib/useAsync';

/** Colores de spray para el acento del perfil (o el que elijas). */
const ACCENTS = ['#E6E4DF', '#FF5A1F', '#F2C14E', '#7BD389', '#4FC3F7', '#9C6ADE', '#F06292'];
const MAX_STYLES = 5;
const MAX_COLORS = 6;
const USERNAME_RE = /^(?!\.)(?!.*\.$)(?!.*\.\.)[a-z0-9._]{3,30}$/;

const STYLE_LABEL: Record<string, string> = Object.fromEntries(STYLE_TAGS.map((s) => [s.value, s.label]));

/** Iniciales para la "bomba" de la portada (máx. 3 letras). */
export function initialsOf(name: string): string {
  const words = name.replace(/^@/, '').split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? words.slice(0, 3).map((w) => w[0]) : [...(words[0] ?? '?').slice(0, 3)];
  return letters.join('').toUpperCase();
}

function displayName(user: User): string {
  return user.displayName?.trim() || user.email.split('@')[0];
}

/** Web sin "https://" para mostrarla. */
function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const location = useLocation();
  const flash = (location.state ?? {}) as { welcome?: boolean; passwordRemoved?: boolean; oauth?: string; provider?: ProviderSlug };
  const providers = useAsync(() => oauthApi.providers(), []);
  const social = useAsync(() => (user ? peopleApi.get(user.id) : Promise.resolve(null)), [user?.id]);
  const usage = useAsync(() => plansApi.mine(), []);
  const [editing, setEditing] = useState(false);

  if (!user) return null;

  const linked = (p: ProviderSlug) => user.accounts.find((a) => a.provider === p.toUpperCase());
  const igLinked = !!linked('instagram');

  return (
    <section className="page profile" style={user.accentColor ? ({ '--accent': user.accentColor } as CSSProperties) : undefined}>
      {flash.welcome && (
        <p className="note profile-flash" role="status">
          <Icon name="check" size={14} /> Cuenta creada. Ponle tu foto y tu estilo a tu perfil.
        </p>
      )}
      {flash.passwordRemoved && (
        <p className="note profile-flash" role="status">
          Hemos conectado tu cuenta. Por seguridad hemos quitado la contraseña que tenía (tu email no estaba verificado):
          puedes crear una nueva abajo, en «Seguridad».
        </p>
      )}
      {flash.oauth === 'link' && flash.provider && (
        <p className="note profile-flash" role="status">
          <Icon name="check" size={14} /> {PROVIDER_LABEL[flash.provider]} conectado.
        </p>
      )}

      <ProfileHero user={user} onChange={setUser} onEdit={() => setEditing((v) => !v)} editing={editing} />

      {usage.data && (
        <ul className="profile-stats" aria-label="Tu armario en números">
          {usage.data.usage
            .filter((u) => u.resource !== 'MANNEQUINS')
            .map((u, i) => (
              <li key={u.resource} style={{ '--i': i } as CSSProperties}>
                <strong>
                  <CountUp value={u.used} delay={300 + i * 90} />
                </strong>
                <span>{RESOURCE_LABEL[u.resource]}</span>
              </li>
            ))}
          {social.data && (
            <>
              <li style={{ '--i': 4 } as CSSProperties}>
                <Link to={`/u/${encodeURIComponent(user.username ?? user.id)}?tab=followers`}>
                  <strong>
                    <CountUp value={social.data.counts.followers} delay={660} />
                  </strong>
                  <span>Seguidores</span>
                </Link>
              </li>
              <li style={{ '--i': 5 } as CSSProperties}>
                <Link to={`/u/${encodeURIComponent(user.username ?? user.id)}?tab=following`}>
                  <strong>
                    <CountUp value={social.data.counts.following} delay={750} />
                  </strong>
                  <span>Siguiendo</span>
                </Link>
              </li>
            </>
          )}
          <li style={{ '--i': 6 } as CSSProperties}>
            <strong>{formatDate(user.createdAt)}</strong>
            <span>En MyOut desde</span>
          </li>
        </ul>
      )}

      {editing && <ProfileEditor user={user} onSaved={(u) => { setUser(u); setEditing(false); }} onCancel={() => setEditing(false)} />}

      <div className="profile-grid">
        <ConnectedAccounts user={user} providers={providers.data} onChange={setUser} />
        <SecurityPanel user={user} justReauthed={flash.oauth === 'reauth'} />
      </div>

      <PrivacyPanel user={user} onChange={setUser} />

      {igLinked && <InstagramPanel onAvatar={(u) => setUser(u)} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cabecera: portada, foto, nombre, bio, estilos y enlaces
// ---------------------------------------------------------------------------

function ProfileHero({ user, onChange, onEdit, editing }: { user: User; onChange: (u: User) => void; onEdit: () => void; editing: boolean }) {
  const avatar = useAssetUrl(user.avatarAssetId);
  const cover = useAssetUrl(user.coverAssetId);
  const [busy, setBusy] = useState<'avatar' | 'cover' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const name = displayName(user);

  async function upload(kind: 'avatar' | 'cover', e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(kind);
    setError(null);
    try {
      const prepared = kind === 'avatar' ? await cropImage(file, 512, 512, 'foto-perfil') : await cropImage(file, 1600, 560, 'portada');
      const asset = await assetsApi.upload(prepared);
      onChange(await usersApi.update(kind === 'avatar' ? { avatarAssetId: asset.id } : { coverAssetId: asset.id }));
    } catch (err) {
      setError(err instanceof DOMException || (err instanceof Error && !(err instanceof ApiError)) ? new Error('No se ha podido leer la imagen.') : err);
    } finally {
      setBusy(null);
    }
  }

  async function remove(kind: 'avatar' | 'cover') {
    setBusy(kind);
    setError(null);
    try {
      onChange(await usersApi.update(kind === 'avatar' ? { avatarAssetId: null } : { coverAssetId: null }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  const ig = user.instagramHandle;

  return (
    <header className="profile-hero">
      <div className={`profile-cover${cover ? ' has-image' : ''}`} style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
        {!cover && <CoverArt seed={user.id} initials={initialsOf(name)} />}
        <span className="cover-lamp" aria-hidden="true" />
        <DripEdge seed={user.id} />
        <div className="profile-cover-actions">
          <FileButton label={cover ? 'Cambiar portada' : 'Añadir portada'} busy={busy === 'cover'} onFile={(e) => upload('cover', e)} />
          {user.coverAssetId && (
            <button type="button" className="btn btn-small btn-glass" disabled={busy !== null} onClick={() => remove('cover')}>
              Quitar
            </button>
          )}
        </div>
      </div>

      <div className="profile-id">
        <div className="profile-avatar-wrap">
          <span className="tape tape-a" aria-hidden="true" />
          <span className="tape tape-b" aria-hidden="true" />
          <span className={`avatar profile-avatar${avatar ? ' has-image' : ''}`}>
            {avatar ? <img src={avatar} alt="" /> : name.charAt(0).toUpperCase()}
            {busy === 'avatar' && (
              <span className="profile-avatar-busy">
                <Spinner size={22} />
              </span>
            )}
          </span>
          <label className="profile-avatar-edit" title="Cambiar foto">
            <Icon name="edit" size={14} />
            <span className="visually-hidden">Cambiar foto de perfil</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy !== null} onChange={(e) => upload('avatar', e)} />
          </label>
        </div>

        <div className="profile-who">
          <GraffitiName text={name} className="profile-name" />
          <p className="profile-handle">
            {user.username ? <span className="handle-tag">@{user.username}</span> : <span className="muted">Sin @usuario</span>}
            {user.pronouns && <span>{user.pronouns}</span>}
            {user.location && <span>{user.location}</span>}
          </p>
        </div>

        <div className="profile-actions">
          <button type="button" className={`btn${editing ? '' : ' btn-primary'}`} onClick={onEdit} aria-expanded={editing}>
            <Icon name="edit" size={14} /> {editing ? 'Cerrar edición' : 'Editar perfil'}
          </button>
          {user.avatarAssetId && (
            <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={() => remove('avatar')}>
              Quitar foto
            </button>
          )}
        </div>
      </div>

      <ErrorNote error={error} />

      {(user.bio || user.styleTags.length > 0 || user.website || ig || user.favoriteColors.length > 0) && (
        <div className="profile-about">
          {user.bio && <p className="profile-bio">{user.bio}</p>}
          {user.styleTags.length > 0 && (
            <ul className="profile-tags sticker-row" aria-label="Estilos">
              {user.styleTags.map((t, i) => (
                <li key={t} className="sticker" style={{ '--r': `${stickerTilt(t)}deg`, '--i': i } as CSSProperties}>
                  {STYLE_LABEL[t] ?? t}
                </li>
              ))}
            </ul>
          )}
          <div className="profile-links">
            {user.website && (
              <a href={user.website} target="_blank" rel="noopener noreferrer nofollow">
                <Icon name="external" size={13} /> {prettyUrl(user.website)}
              </a>
            )}
            {ig && (
              <a href={`https://www.instagram.com/${encodeURIComponent(ig)}/`} target="_blank" rel="noopener noreferrer nofollow">
                <Icon name="external" size={13} /> Instagram @{ig}
              </a>
            )}
            {user.favoriteColors.length > 0 && (
              <span className="profile-colors" aria-label="Colores favoritos">
                {user.favoriteColors.map((c, i) => (
                  <span key={c} className="splat" style={{ '--c': c, '--i': i } as CSSProperties} title={c} />
                ))}
              </span>
            )}
            {(user.sizes.top || user.sizes.bottom || user.sizes.shoes) && (
              <span className="profile-sizes">
                {user.sizes.top && <span>Arriba {user.sizes.top}</span>}
                {user.sizes.bottom && <span>Abajo {user.sizes.bottom}</span>}
                {user.sizes.shoes && <span>Pie {user.sizes.shoes}</span>}
              </span>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function FileButton({ label, busy, onFile }: { label: string; busy: boolean; onFile: (e: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className={`btn btn-small btn-glass file-btn${busy ? ' is-busy' : ''}`}>
      {busy ? <Busy text="Subiendo…" /> : label}
      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={onFile} />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Editar perfil
// ---------------------------------------------------------------------------

type Draft = {
  displayName: string;
  username: string;
  pronouns: string;
  location: string;
  bio: string;
  website: string;
  instagramHandle: string;
  styleTags: string[];
  favoriteColors: string[];
  sizeTop: string;
  sizeBottom: string;
  sizeShoes: string;
  accentColor: string | null;
};

function draftOf(u: User): Draft {
  return {
    displayName: u.displayName ?? '',
    username: u.username ?? '',
    pronouns: u.pronouns ?? '',
    location: u.location ?? '',
    bio: u.bio ?? '',
    website: u.website ?? '',
    instagramHandle: u.instagramHandle ?? '',
    styleTags: u.styleTags,
    favoriteColors: u.favoriteColors,
    sizeTop: u.sizes.top ?? '',
    sizeBottom: u.sizes.bottom ?? '',
    sizeShoes: u.sizes.shoes ?? '',
    accentColor: u.accentColor,
  };
}

function ProfileEditor({ user, onSaved, onCancel }: { user: User; onSaved: (u: User) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(() => draftOf(user));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [nameCheck, setNameCheck] = useState<'idle' | 'checking' | 'free' | 'taken' | 'invalid'>('idle');
  const [newColor, setNewColor] = useState('#5C5C62');
  const ids = useId();
  const formRef = useRef<HTMLFormElement>(null);
  // Al abrir el editor, se lleva a la vista y se enfoca el primer campo.
  useEffect(() => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    formRef.current?.querySelector('input')?.focus({ preventScroll: true });
  }, []);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  // ¿Está libre el @usuario? (se comprueba al dejar de escribir)
  const wanted = d.username.trim().replace(/^@/, '').toLowerCase();
  useEffect(() => {
    if (!wanted || wanted === user.username) {
      setNameCheck('idle');
      return;
    }
    if (!USERNAME_RE.test(wanted)) {
      setNameCheck('invalid');
      return;
    }
    setNameCheck('checking');
    let alive = true;
    const t = window.setTimeout(() => {
      usersApi
        .usernameAvailable(wanted)
        .then((r) => alive && setNameCheck(!r.valid ? 'invalid' : r.available ? 'free' : 'taken'))
        .catch(() => alive && setNameCheck('idle'));
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [wanted, user.username]);

  function toggleStyle(tag: string) {
    set('styleTags', d.styleTags.includes(tag) ? d.styleTags.filter((t) => t !== tag) : [...d.styleTags, tag].slice(0, MAX_STYLES));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: ProfileInput = {
      displayName: d.displayName.trim() || undefined,
      username: wanted || null,
      pronouns: d.pronouns,
      location: d.location,
      bio: d.bio,
      website: d.website.trim() && !/^https?:\/\//i.test(d.website.trim()) ? `https://${d.website.trim()}` : d.website,
      instagramHandle: d.instagramHandle,
      styleTags: d.styleTags,
      favoriteColors: d.favoriteColors,
      sizeTop: d.sizeTop,
      sizeBottom: d.sizeBottom,
      sizeShoes: d.sizeShoes,
      accentColor: d.accentColor,
    };
    try {
      onSaved(await usersApi.update(body));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const hint: Record<typeof nameCheck, ReactNode> = {
    idle: <>Tu nombre único en MyOut: 3-30 letras minúsculas, números, punto o guion bajo.</>,
    checking: <Busy text="Comprobando…" />,
    free: (
      <span className="ok-text">
        <Icon name="check" size={12} /> Disponible
      </span>
    ),
    taken: <span className="danger-text">Ya lo tiene otra persona</span>,
    invalid: <span className="danger-text">Solo minúsculas, números, punto y guion bajo (3-30)</span>,
  };

  return (
    <form ref={formRef} className="panel profile-editor" onSubmit={save} aria-labelledby={`${ids}-t`}>
      <div>
        <p className="eyebrow">Perfil</p>
        <h2 id={`${ids}-t`}>Editar perfil</h2>
      </div>

      <div className="profile-form-grid">
        <label className="field">
          <span>Nombre visible</span>
          <input maxLength={60} value={d.displayName} onChange={(e) => set('displayName', e.target.value)} autoComplete="nickname" />
        </label>
        <div className="field">
          <label htmlFor={`${ids}-u`} className="field-label">
            @usuario
          </label>
          <div className="input-affix input-prefix">
            <span aria-hidden="true">@</span>
            <input
              id={`${ids}-u`}
              maxLength={31}
              value={d.username}
              spellCheck={false}
              autoCapitalize="none"
              onChange={(e) => set('username', e.target.value)}
              aria-describedby={`${ids}-uh`}
              aria-invalid={nameCheck === 'taken' || nameCheck === 'invalid'}
            />
          </div>
          <small id={`${ids}-uh`} className="field-hint" aria-live="polite">
            {hint[nameCheck]}
          </small>
        </div>
        <label className="field">
          <span>Pronombres</span>
          <input maxLength={30} value={d.pronouns} placeholder="ella, él, elle…" onChange={(e) => set('pronouns', e.target.value)} />
        </label>
        <label className="field">
          <span>Ciudad</span>
          <input maxLength={60} value={d.location} onChange={(e) => set('location', e.target.value)} autoComplete="address-level2" />
        </label>
        <label className="field field-wide">
          <span>
            Bio <small className="muted">{d.bio.length}/300</small>
          </span>
          <textarea rows={3} maxLength={300} value={d.bio} placeholder="Cuenta tu estilo en un par de frases" onChange={(e) => set('bio', e.target.value)} />
        </label>
        <label className="field">
          <span>Web</span>
          <input type="url" inputMode="url" maxLength={200} value={d.website} placeholder="https://…" onChange={(e) => set('website', e.target.value)} />
        </label>
        <label className="field">
          <span>Instagram</span>
          <div className="input-affix input-prefix">
            <span aria-hidden="true">@</span>
            <input maxLength={31} value={d.instagramHandle} spellCheck={false} autoCapitalize="none" onChange={(e) => set('instagramHandle', e.target.value)} />
          </div>
        </label>
      </div>

      <fieldset className="field">
        <legend>
          Tus estilos <small className="muted">(hasta {MAX_STYLES})</small>
        </legend>
        <div className="chips">
          {STYLE_TAGS.map((s) => {
            const on = d.styleTags.includes(s.value);
            return (
              <button
                key={s.value}
                type="button"
                className={`chip${on ? ' is-active' : ''}`}
                aria-pressed={on}
                disabled={!on && d.styleTags.length >= MAX_STYLES}
                onClick={() => toggleStyle(s.value)}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="profile-form-grid">
        <fieldset className="field">
          <legend>
            Colores favoritos <small className="muted">(hasta {MAX_COLORS})</small>
          </legend>
          <div className="color-list">
            {d.favoriteColors.map((c) => (
              <button
                key={c}
                type="button"
                className="color-pill"
                title={`Quitar ${c}`}
                onClick={() => set('favoriteColors', d.favoriteColors.filter((x) => x !== c))}
              >
                <span className="swatch" style={{ background: c }} /> {c}
                <Icon name="close" size={11} />
              </button>
            ))}
            {d.favoriteColors.length < MAX_COLORS && (
              <span className="color-add">
                <input type="color" value={newColor} aria-label="Color" onChange={(e) => setNewColor(e.target.value)} />
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => {
                    const c = newColor.toUpperCase();
                    if (!d.favoriteColors.includes(c)) set('favoriteColors', [...d.favoriteColors, c]);
                  }}
                >
                  <Icon name="plus" size={12} /> Añadir
                </button>
              </span>
            )}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>Tus tallas</legend>
          <div className="size-row">
            <label>
              <small>Arriba</small>
              <input maxLength={10} value={d.sizeTop} placeholder="M" onChange={(e) => set('sizeTop', e.target.value)} />
            </label>
            <label>
              <small>Abajo</small>
              <input maxLength={10} value={d.sizeBottom} placeholder="32" onChange={(e) => set('sizeBottom', e.target.value)} />
            </label>
            <label>
              <small>Calzado</small>
              <input maxLength={10} value={d.sizeShoes} placeholder="43" onChange={(e) => set('sizeShoes', e.target.value)} />
            </label>
          </div>
        </fieldset>
      </div>

      <fieldset className="field">
        <legend>Color de tu perfil</legend>
        <div className="accent-row">
          <button type="button" className={`accent-dot is-none${d.accentColor === null ? ' is-active' : ''}`} aria-pressed={d.accentColor === null} onClick={() => set('accentColor', null)}>
            <span className="visually-hidden">Sin color</span>
          </button>
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              className={`accent-dot${d.accentColor === c ? ' is-active' : ''}`}
              style={{ background: c }}
              aria-pressed={d.accentColor === c}
              aria-label={c}
              onClick={() => set('accentColor', c)}
            />
          ))}
          <label className="accent-custom" title="Otro color">
            <input type="color" value={d.accentColor ?? '#5C5C62'} onChange={(e) => set('accentColor', e.target.value.toUpperCase())} aria-label="Otro color" />
          </label>
          <small className="muted">Se usa en tu portada y en tu nombre.</small>
        </div>
      </fieldset>

      <ErrorNote error={error} />

      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy || nameCheck === 'taken' || nameCheck === 'invalid'}>
          {busy ? <Busy text="Guardando…" /> : 'Guardar perfil'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Cuentas conectadas
// ---------------------------------------------------------------------------

const ROWS: { slug: ProviderSlug; help: string }[] = [
  { slug: 'google', help: 'Entra con tu cuenta de Google.' },
  { slug: 'apple', help: 'Entra con tu Apple ID.' },
  { slug: 'instagram', help: 'Muestra tus publicaciones en tu perfil. Solo cuentas profesionales (creador o empresa).' },
];

function ConnectedAccounts({ user, providers, onChange }: { user: User; providers: Record<ProviderSlug, boolean> | null; onChange: (u: User) => void }) {
  const [busy, setBusy] = useState<ProviderSlug | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function connect(slug: ProviderSlug) {
    setBusy(slug);
    setError(null);
    try {
      await openProvider(slug, 'link');
    } catch (err) {
      setError(err);
      setBusy(null);
    }
  }

  async function disconnect(slug: ProviderSlug) {
    setBusy(slug);
    setError(null);
    try {
      await usersApi.unlink(slug);
      onChange(await usersApi.me());
    } catch (err) {
      const code = err instanceof ApiError ? err.body?.code : null;
      setError(code === 'last_login_method' ? new Error(`Crea antes una contraseña: ${PROVIDER_LABEL[slug]} es tu única forma de entrar.`) : err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel" aria-labelledby="accounts-title">
      <div>
        <p className="eyebrow">Cuentas</p>
        <h2 id="accounts-title">Cuentas conectadas</h2>
      </div>
      <ul className="account-rows">
        {ROWS.map(({ slug, help }) => {
          const acc = user.accounts.find((a) => a.provider === slug.toUpperCase());
          const available = providers?.[slug] ?? false;
          return (
            <li key={slug} className={`account-row${acc ? ' is-linked' : ''}`}>
              <span className={`account-badge badge-${slug}`} aria-hidden="true">
                {PROVIDER_LABEL[slug].charAt(0)}
              </span>
              <div className="account-row-text">
                <strong>{PROVIDER_LABEL[slug]}</strong>
                <small className="muted">
                  {acc ? (acc.username ? `@${acc.username}` : acc.email ?? 'Conectada') : available ? help : 'No está configurado en el servidor.'}
                </small>
              </div>
              {acc ? (
                <button type="button" className="btn btn-small btn-ghost" disabled={busy !== null} onClick={() => disconnect(slug)}>
                  {busy === slug ? <Busy text="…" /> : 'Desconectar'}
                </button>
              ) : (
                <button type="button" className="btn btn-small" disabled={busy !== null || !available} onClick={() => connect(slug)}>
                  {busy === slug ? <Busy text="Abriendo…" /> : 'Conectar'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <ErrorNote error={error} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Seguridad: contraseña
// ---------------------------------------------------------------------------

function SecurityPanel({ user, justReauthed }: { user: User; justReauthed: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  // Vuelta de confirmar la identidad con Google/Apple para crear la contraseña.
  const proof = useRef<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (justReauthed && pendingAction() === 'set-password') {
      setPendingAction(null);
      proof.current = takeReauthProof();
      setConfirmed(!!proof.current);
    }
  }, [justReauthed]);

  const loginProviders = user.accounts.filter((a) => a.provider !== 'INSTAGRAM');
  const valid = next.length >= 8 && /[A-Za-z]/.test(next) && /\d/.test(next);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await usersApi.setPassword(user.hasPassword ? { newPassword: next, currentPassword: current } : { newPassword: next, reauthToken: proof.current ?? undefined });
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirmed(false);
      proof.current = null;
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(status === 403 ? new Error(user.hasPassword ? 'La contraseña actual no es correcta.' : 'La confirmación ha caducado. Vuelve a confirmar tu identidad.') : err);
    } finally {
      setBusy(false);
    }
  }

  async function reauth(slug: ProviderSlug) {
    setError(null);
    try {
      await openProvider(slug, 'reauth', 'set-password');
    } catch (err) {
      setError(err);
    }
  }

  return (
    <section className="panel" aria-labelledby="security-title">
      <div>
        <p className="eyebrow">Seguridad</p>
        <h2 id="security-title">{user.hasPassword || done ? 'Cambiar contraseña' : 'Crear contraseña'}</h2>
      </div>
      {done && (
        <p className="note" role="status">
          <Icon name="check" size={14} /> Contraseña guardada. Ya puedes entrar también con tu email.
        </p>
      )}

      {user.hasPassword || done || confirmed ? (
        <form className="stack" onSubmit={submit}>
          {(user.hasPassword || done) && (
            <label className="field">
              <span>Contraseña actual</span>
              <input type="password" required maxLength={128} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </label>
          )}
          <label className="field">
            <span>Nueva contraseña</span>
            <input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            <small className="field-hint">8 caracteres o más, con letras y números.</small>
          </label>
          <ErrorNote error={error} />
          <div className="actions">
            <button type="submit" className="btn" disabled={busy || !valid}>
              {busy ? <Busy text="Guardando…" /> : 'Guardar contraseña'}
            </button>
          </div>
        </form>
      ) : (
        <div className="stack">
          <p className="muted">
            Entraste con {loginProviders.map((a) => PROVIDER_LABEL[a.provider.toLowerCase() as ProviderSlug]).join(' y ') || 'un proveedor'} y aún no
            tienes contraseña. Para crearla, confirma antes que eres tú.
          </p>
          <div className="actions">
            {loginProviders.map((a) => {
              const slug = a.provider.toLowerCase() as ProviderSlug;
              return (
                <button key={slug} type="button" className="btn" onClick={() => reauth(slug)}>
                  Confirmar con {PROVIDER_LABEL[slug]}
                </button>
              );
            })}
          </div>
          <ErrorNote error={error} />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

function InstagramPanel({ onAvatar }: { onAvatar: (u: User) => void }) {
  const ig = useAsync<InstagramOverview>(() => usersApi.instagram(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const data = ig.data?.connected ? ig.data : null;

  async function usePhoto() {
    setBusy(true);
    setError(null);
    try {
      await usersApi.useInstagramPhoto();
      onAvatar(await usersApi.me());
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel instagram-panel" aria-labelledby="ig-title">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Instagram</p>
          <h2 id="ig-title">{data?.username ? `@${data.username}` : 'Tu Instagram'}</h2>
        </div>
        {data?.status === 'ok' && (
          <div className="actions">
            {data.profile?.profilePictureUrl && (
              <button type="button" className="btn btn-small" disabled={busy} onClick={usePhoto}>
                {busy ? <Busy text="Copiando…" /> : 'Usar su foto de perfil'}
              </button>
            )}
            <a className="btn btn-small btn-ghost" href={`https://www.instagram.com/${encodeURIComponent(data.username ?? '')}/`} target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={13} /> Abrir
            </a>
          </div>
        )}
      </div>

      {ig.loading && !ig.data && <Spinner label="Cargando tus publicaciones…" />}
      {data?.status === 'expired' && (
        <p className="note note-error">
          La conexión con Instagram ha caducado.{' '}
          <button type="button" className="link-btn inline" onClick={() => void openProvider('instagram', 'link')}>
            Volver a conectar
          </button>
        </p>
      )}
      {data?.status === 'unavailable' && <p className="muted">Instagram no responde ahora mismo. Prueba más tarde.</p>}
      {data?.status === 'ok' && (
        <>
          {data.profile && (
            <p className="muted small">
              {data.profile.mediaCount !== null && `${data.profile.mediaCount} publicaciones`}
              {data.profile.followersCount !== null && ` · ${data.profile.followersCount} seguidores`}
            </p>
          )}
          {data.media.length > 0 ? (
            <ul className="ig-grid">
              {data.media
                .filter((m) => m.imageUrl)
                .map((m) => (
                  <li key={m.id}>
                    <a href={m.permalink ?? '#'} target="_blank" rel="noopener noreferrer" title={m.caption ?? undefined}>
                      <img src={m.imageUrl!} alt={m.caption ? m.caption.slice(0, 80) : 'Publicación de Instagram'} loading="lazy" referrerPolicy="no-referrer" />
                      {m.mediaType !== 'IMAGE' && <span className="ig-kind">{m.mediaType === 'VIDEO' ? 'Vídeo' : 'Álbum'}</span>}
                    </a>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="muted">Aún no hay publicaciones.</p>
          )}
        </>
      )}
      <ErrorNote error={error ?? ig.error} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Privacidad: cuenta privada, quién puede escribirte y personas bloqueadas
// ---------------------------------------------------------------------------

const POLICIES: { value: MessagePolicy; label: string; help: string }[] = [
  { value: 'EVERYONE', label: 'Todos', help: 'Cualquiera puede escribirte (salvo quien bloquees).' },
  { value: 'FOLLOWING', label: 'Personas a las que sigo', help: 'Solo te escribe quien tú sigues.' },
  { value: 'NOBODY', label: 'Nadie', help: 'Nadie puede empezar un chat contigo ni añadirte a grupos.' },
];

function PrivacyPanel({ user, onChange }: { user: User; onChange: (u: User) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [blocked, setBlocked] = useState<UserBrief[] | null>(null);
  const [showBlocked, setShowBlocked] = useState(false);

  async function save(body: ProfileInput) {
    setBusy(true);
    setError(null);
    try {
      onChange(await usersApi.update(body));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!showBlocked) return;
    peopleApi
      .blocked()
      .then(setBlocked)
      .catch(setError);
  }, [showBlocked]);

  async function unblock(id: string) {
    try {
      await peopleApi.unblock(id);
      setBlocked((l) => l?.filter((b) => b.id !== id) ?? l);
    } catch (err) {
      setError(err);
    }
  }

  const current = POLICIES.find((p) => p.value === user.messagePolicy) ?? POLICIES[1];

  return (
    <section className="panel privacy-panel" aria-labelledby="privacy-title">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Privacidad</p>
          <h2 id="privacy-title">Quién te ve y quién te escribe</h2>
        </div>
        <Link to={`/u/${encodeURIComponent(user.username ?? user.id)}`} className="btn btn-small btn-ghost">
          Ver tu perfil como lo ven los demás
        </Link>
      </div>

      <div className="privacy-grid">
        <div className="privacy-item">
          <label className="switch-row">
            <input
              type="checkbox"
              role="switch"
              checked={user.isPrivate}
              disabled={busy}
              onChange={(e) => void save({ isPrivate: e.target.checked })}
            />
            <span className="switch" aria-hidden="true" />
            <span>
              <strong>Cuenta privada</strong>
              <small className="muted">
                {user.isPrivate
                  ? 'Para seguirte hay que enviarte una solicitud. Solo tus seguidores ven tus outfits y a quién sigues.'
                  : 'Cualquiera puede seguirte y ver los outfits que compartes. Tu armario sigue siendo solo tuyo.'}
              </small>
            </span>
          </label>
          {!user.isPrivate && <small className="muted">Si pasas a privada, quien ya te sigue sigue haciéndolo.</small>}
        </div>

        <div className="privacy-item">
          <span className="field-label" id="policy-label">
            Quién puede escribirte
          </span>
          <div className="seg" role="radiogroup" aria-labelledby="policy-label">
            {POLICIES.map((p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={user.messagePolicy === p.value}
                className={`seg-btn${user.messagePolicy === p.value ? ' is-active' : ''}`}
                disabled={busy}
                onClick={() => void save({ messagePolicy: p.value })}
              >
                {p.label}
              </button>
            ))}
          </div>
          <small className="muted">{current.help} Si alguien te escribe, siempre puedes contestarle.</small>
        </div>
      </div>

      <ErrorNote error={error} />

      <div>
        <button type="button" className="link-btn" aria-expanded={showBlocked} onClick={() => setShowBlocked((v) => !v)}>
          {showBlocked ? 'Ocultar personas bloqueadas' : 'Personas bloqueadas'}
        </button>
        {showBlocked && !blocked && <Spinner size={14} />}
        {showBlocked && blocked?.length === 0 && <p className="muted small">No has bloqueado a nadie.</p>}
        {showBlocked && blocked && blocked.length > 0 && (
          <ul className="person-list">
            {blocked.map((b) => (
              <PersonRow
                key={b.id}
                person={b}
                action={
                  <button type="button" className="btn btn-small" onClick={() => void unblock(b.id)}>
                    Desbloquear
                  </button>
                }
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
