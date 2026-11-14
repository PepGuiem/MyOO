import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError } from '../api/client';
import { assetsApi, oauthApi, peopleApi, plansApi, usersApi } from '../api/endpoints';
import type { InstagramOverview, LimitedResource, MessagePolicy, ProfileInput, ProviderSlug, User, UserBrief } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorNote } from '../components/ErrorNote';
import { useToast } from '../components/fx/Toast';
import { Icon, type IconName } from '../components/Icon';
import { PersonRow } from '../components/social/PersonRow';
import { CountUp, CoverArt, DripEdge, GraffitiName, seeded, stickerTilt } from '../components/street/Street';
import { Busy, Spinner } from '../components/Spinner';
import { t } from '../i18n';
import { useAssetUrl } from '../lib/assetUrl';
import { cropImage } from '../lib/imageCrop';
import { RESOURCE_LABEL, formatDate } from '../lib/labels';
import { animateOut, burstAt, canHover, reducedMotion } from '../lib/motion';
import { openProvider, pendingAction, PROVIDER_LABEL, setPendingAction, takeReauthProof } from '../lib/oauthFlow';
import { STYLE_TAGS } from '../lib/stylist';
import { useAsync } from '../lib/useAsync';
import { useInView } from '../lib/useInView';

/** Colores de spray para el acento del perfil (o el que elijas). */
const ACCENTS = ['#E6E4DF', '#FF5A1F', '#F2C14E', '#7BD389', '#4FC3F7', '#9C6ADE', '#F06292'];
const MAX_STYLES = 5;
const MAX_COLORS = 6;
const USERNAME_RE = /^(?!\.)(?!.*\.$)(?!.*\.\.)[a-z0-9._]{3,30}$/;
const EDITOR_ID = 'pf-editor';

const STYLE_LABEL: Record<string, string> = Object.fromEntries(STYLE_TAGS.map((s) => [s.value, t(s.label)]));

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

/** Sacude un formulario cuando algo sale mal (sin animación si se pide reducir movimiento). */
function shake(el: Element | null | undefined) {
  if (!el || reducedMotion() || !(el as HTMLElement).animate) return;
  (el as HTMLElement).animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-7px)' },
      { transform: 'translateX(6px)' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(2px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 420, easing: 'ease-out' },
  );
}

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const flash = (location.state ?? {}) as { welcome?: boolean; passwordRemoved?: boolean; oauth?: string; provider?: ProviderSlug };
  const providers = useAsync(() => oauthApi.providers(), []);
  const social = useAsync(() => (user ? peopleApi.get(user.id) : Promise.resolve(null)), [user?.id]);
  const usage = useAsync(() => plansApi.mine(), []);
  const [editing, setEditing] = useState(false);
  const spotFrame = useRef(0);

  if (!user) return null;

  const linked = (p: ProviderSlug) => user.accounts.find((a) => a.provider === p.toUpperCase());
  const igLinked = !!linked('instagram');

  function closeEditor() {
    // Si la animación de salida no llegase a terminar, se cierra igualmente.
    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      setEditing(false);
    };
    animateOut(document.getElementById(EDITOR_ID), finish);
    window.setTimeout(finish, 480);
  }

  /** Luz que sigue al ratón dentro de las tarjetas (solo con ratón). */
  function spotlight(e: ReactPointerEvent<HTMLElement>) {
    if (e.pointerType !== 'mouse') return;
    const card = (e.target as Element).closest<HTMLElement>('.pf-card');
    if (!card) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(spotFrame.current);
    spotFrame.current = requestAnimationFrame(() => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${clientX - r.left}px`);
      card.style.setProperty('--my', `${clientY - r.top}px`);
    });
  }

  return (
    <section
      className="page profile pf"
      onPointerMove={canHover() ? spotlight : undefined}
      style={user.accentColor ? ({ '--accent': user.accentColor } as CSSProperties) : undefined}
    >
      {flash.welcome && (
        <p className="note profile-flash pf-flash" role="status">
          <Icon name="check" size={14} /> {t('Cuenta creada. Ponle tu foto y tu estilo a tu perfil.')}
        </p>
      )}
      {flash.passwordRemoved && (
        <p className="note profile-flash pf-flash" role="status">
          {t(
            'Hemos conectado tu cuenta. Por seguridad hemos quitado la contraseña que tenía (tu email no estaba verificado): puedes crear una nueva abajo, en «Seguridad».',
          )}
        </p>
      )}
      {flash.oauth === 'link' && flash.provider && (
        <p className="note profile-flash pf-flash" role="status">
          <Icon name="check" size={14} /> {t('{name} conectado.', { name: PROVIDER_LABEL[flash.provider] })}
        </p>
      )}

      <ProfileHero user={user} onChange={setUser} onEdit={() => (editing ? closeEditor() : setEditing(true))} editing={editing} />

      {editing && (
        <ProfileEditor
          user={user}
          onSaved={(u) => {
            setUser(u);
            toast.show(t('Perfil guardado'), { tone: 'ok', sound: 'success' });
            closeEditor();
          }}
          onCancel={() => closeEditor()}
        />
      )}

      <PaintDivider n="01" label={t('Tus números')} />

      <StatsGrid user={user} usage={usage.data?.usage ?? null} usageLoading={usage.loading} social={social.data?.counts ?? null} socialLoading={social.loading} />

      <PaintDivider n="02" label={t('Ajustes')} />

      <div className="profile-grid pf-grid">
        <ConnectedAccounts
          user={user}
          providers={providers.data}
          providersLoading={providers.loading}
          onChange={setUser}
          justLinked={flash.oauth === 'link' ? (flash.provider ?? null) : null}
        />
        <SecurityPanel user={user} justReauthed={flash.oauth === 'reauth'} />
      </div>

      <PrivacyPanel user={user} onChange={setUser} />

      {igLinked && <InstagramPanel onAvatar={(u) => setUser(u)} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Detalles gráficos
// ---------------------------------------------------------------------------

/** Separador con trazo de pintura y numeración de revista. */
function PaintDivider({ n, label }: { n: string; label: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={`pf-divider${inView ? ' is-in' : ''}`} aria-hidden="true">
      <span className="pf-divider-n">{n}</span>
      <span className="pf-divider-label">{label}</span>
      <svg className="pf-divider-stroke" viewBox="0 0 600 24" preserveAspectRatio="none">
        <path d="M4 14c60-6 120-9 190-6s120 8 200 4 140-9 202-5" />
        <path className="thin" d="M30 19c80-3 170-5 260-2s170 4 280-1" />
      </svg>
    </div>
  );
}

/** Motas de luz que suben despacio por la portada (decorativas). */
function Embers({ seed, count = 14 }: { seed: string; count?: number }) {
  const motes = useMemo(() => {
    const r = seeded(`${seed}:embers`);
    return Array.from({ length: count }, () => ({
      x: 4 + r() * 92,
      s: 2 + r() * 3,
      d: 7 + r() * 8,
      delay: -r() * 14,
      drift: (r() - 0.5) * 60,
      hue: r() > 0.55 ? 'var(--pf-orange)' : 'var(--pf-red)',
    }));
  }, [seed, count]);
  return (
    <span className="pf-embers" aria-hidden="true">
      {motes.map((m, i) => (
        <i
          key={i}
          style={
            {
              left: `${m.x}%`,
              '--s': `${m.s}px`,
              '--d': `${m.d}s`,
              '--delay': `${m.delay}s`,
              '--drift': `${m.drift}px`,
              '--c': m.hue,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/** Etiqueta cosida, como la de una prenda: año de alta y @usuario (datos reales). */
function CareLabel({ user }: { user: User }) {
  const bars = useMemo(() => {
    const r = seeded(`${user.id}:label`);
    return Array.from({ length: 22 }, () => 1 + Math.round(r() * 2));
  }, [user.id]);
  return (
    <div className="pf-label" aria-hidden="true">
      <span className="pf-label-brand">MYOUT</span>
      <span>{t('Miembro desde {year}', { year: new Date(user.createdAt).getFullYear() })}</span>
      {user.username && <span>@{user.username}</span>}
      <span className="pf-label-bars">
        {bars.map((w, i) => (
          <i key={i} style={{ width: w }} />
        ))}
      </span>
      <span className="pf-label-foot">{t('Hecho en la calle')}</span>
    </div>
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
      setError(err instanceof DOMException || (err instanceof Error && !(err instanceof ApiError)) ? new Error(t('No se ha podido leer la imagen.')) : err);
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
  const mainStyle = user.styleTags[0];
  const otherStyles = user.styleTags.slice(1);

  return (
    <header className="profile-hero pf-hero pf-card">
      <div className={`profile-cover pf-cover${cover ? ' has-image' : ''}`} style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
        {!cover && <CoverArt seed={user.id} initials={initialsOf(name)} />}
        <span className="cover-lamp" aria-hidden="true" />
        <span className="pf-cover-glow" aria-hidden="true" />
        <Embers seed={user.id} />
        <span className="pf-neon-line" aria-hidden="true" />
        <DripEdge seed={user.id} />
        <div className="profile-cover-actions pf-cover-actions">
          <FileButton label={cover ? t('Cambiar portada') : t('Añadir portada')} busy={busy === 'cover'} onFile={(e) => upload('cover', e)} />
          {user.coverAssetId && (
            <button type="button" className="btn btn-small btn-glass pf-glass" disabled={busy !== null} onClick={() => remove('cover')}>
              <Icon name="trash" size={13} /> {t('Quitar')}
            </button>
          )}
        </div>
        <CareLabel user={user} />
      </div>

      <div className="pf-id">
        <div className="pf-avatar-wrap">
          <span className="pf-avatar-ring" aria-hidden="true" />
          <span className="pf-avatar-halo" aria-hidden="true" />
          <span className={`avatar pf-avatar${avatar ? ' has-image' : ''}`}>
            {avatar ? <img src={avatar} alt="" /> : name.charAt(0).toUpperCase()}
            {busy === 'avatar' && (
              <span className="profile-avatar-busy">
                <Spinner size={22} />
              </span>
            )}
          </span>
          <label className="pf-avatar-edit" title={t('Cambiar foto')}>
            <Icon name="camera" size={15} />
            <span className="visually-hidden">{t('Cambiar foto de perfil')}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy !== null} onChange={(e) => upload('avatar', e)} />
          </label>
        </div>

        <div className="pf-who">
          <div className="pf-name-row">
            <GraffitiName text={name} className="profile-name pf-name" />
            {mainStyle ? (
              <span className="pf-sticker" style={{ '--r': `${stickerTilt(mainStyle) * 1.6}deg` } as CSSProperties} title={t('Estilo favorito')}>
                <small>{t('Estilo')}</small>
                {STYLE_LABEL[mainStyle] ?? mainStyle}
              </span>
            ) : (
              <button type="button" className="pf-sticker is-empty" onClick={onEdit} aria-expanded={editing} aria-controls={EDITOR_ID}>
                <small>{t('Estilo')}</small>
                <Icon name="plus" size={12} /> {t('Elige el tuyo')}
              </button>
            )}
          </div>
          <ul className="pf-meta" aria-label={t('Datos del perfil')}>
            <li>{user.username ? <span className="handle-tag">@{user.username}</span> : <span className="muted">{t('Sin @usuario')}</span>}</li>
            {user.pronouns && <li>{user.pronouns}</li>}
            {user.location && (
              <li>
                <Icon name="mapPin" size={13} /> {user.location}
              </li>
            )}
            <li>
              <Icon name="history" size={13} /> {t('En MyOut desde {date}', { date: formatDate(user.createdAt) })}
            </li>
          </ul>
        </div>

        <div className="pf-actions">
          <button type="button" className={`btn pf-btn-neon${editing ? ' is-on' : ''}`} onClick={onEdit} aria-expanded={editing} aria-controls={EDITOR_ID}>
            <Icon name={editing ? 'close' : 'edit'} size={14} /> <span>{editing ? t('Cerrar edición') : t('Editar perfil')}</span>
          </button>
          {user.avatarAssetId && (
            <button type="button" className="btn btn-ghost pf-btn-ghost" disabled={busy !== null} onClick={() => remove('avatar')}>
              {t('Quitar foto')}
            </button>
          )}
        </div>
      </div>

      <ErrorNote error={error} />

      {(user.bio || otherStyles.length > 0 || user.website || ig || user.favoriteColors.length > 0 || user.sizes.top || user.sizes.bottom || user.sizes.shoes) && (
        <div className="profile-about pf-about">
          {user.bio && <p className="profile-bio pf-bio">{user.bio}</p>}
          {otherStyles.length > 0 && (
            <ul className="profile-tags sticker-row" aria-label={t('Estilos')}>
              {otherStyles.map((tag, i) => (
                <li key={tag} className="sticker" style={{ '--r': `${stickerTilt(tag)}deg`, '--i': i } as CSSProperties}>
                  {STYLE_LABEL[tag] ?? tag}
                </li>
              ))}
            </ul>
          )}
          <div className="profile-links pf-links">
            {user.website && (
              <a href={user.website} target="_blank" rel="noopener noreferrer nofollow">
                <Icon name="link" size={13} /> {prettyUrl(user.website)}
              </a>
            )}
            {ig && (
              <a href={`https://www.instagram.com/${encodeURIComponent(ig)}/`} target="_blank" rel="noopener noreferrer nofollow">
                <Icon name="camera" size={13} /> Instagram @{ig}
              </a>
            )}
            {user.favoriteColors.length > 0 && (
              <span className="profile-colors" aria-label={t('Colores favoritos')}>
                {user.favoriteColors.map((c, i) => (
                  <span key={c} className="splat" style={{ '--c': c, '--i': i } as CSSProperties} title={c} />
                ))}
              </span>
            )}
            {(user.sizes.top || user.sizes.bottom || user.sizes.shoes) && (
              <span className="profile-sizes pf-sizes">
                {user.sizes.top && <span>{t('Arriba {size}', { size: user.sizes.top })}</span>}
                {user.sizes.bottom && <span>{t('Abajo {size}', { size: user.sizes.bottom })}</span>}
                {user.sizes.shoes && <span>{t('Pie {size}', { size: user.sizes.shoes })}</span>}
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
    <label className={`btn btn-small btn-glass pf-glass file-btn${busy ? ' is-busy' : ''}`}>
      {busy ? (
        <Busy text={t('Subiendo…')} />
      ) : (
        <>
          <Icon name="camera" size={13} /> {label}
        </>
      )}
      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={onFile} />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Cifras (siempre datos reales: plan del usuario y su red)
// ---------------------------------------------------------------------------

const STAT_ICON: Record<Exclude<LimitedResource, 'MANNEQUINS'>, IconName> = {
  WARDROBES: 'wardrobe',
  WARDROBE_ITEMS: 'tshirt',
  OUTFITS: 'layers',
};

type Stat = { key: string; icon: IconName; label: string; value: number | null; to?: string };

function StatsGrid({
  user,
  usage,
  usageLoading,
  social,
  socialLoading,
}: {
  user: User;
  usage: { resource: LimitedResource; used: number }[] | null;
  usageLoading: boolean;
  social: { followers: number; following: number } | null;
  socialLoading: boolean;
}) {
  const [ref, inView] = useInView<HTMLUListElement>();
  const handle = encodeURIComponent(user.username ?? user.id);
  const used = (r: LimitedResource) => usage?.find((u) => u.resource === r)?.used ?? null;

  const stats: Stat[] = [];
  if (usage || usageLoading) {
    (['WARDROBES', 'WARDROBE_ITEMS', 'OUTFITS'] as const).forEach((r) =>
      stats.push({ key: r, icon: STAT_ICON[r], label: RESOURCE_LABEL[r], value: usage ? used(r) : null }),
    );
  }
  if (social || socialLoading) {
    stats.push(
      { key: 'followers', icon: 'users', label: t('Seguidores'), value: social?.followers ?? null, to: `/u/${handle}?tab=followers` },
      { key: 'following', icon: 'userCheck', label: t('Siguiendo'), value: social?.following ?? null, to: `/u/${handle}?tab=following` },
    );
  }
  if (stats.length === 0) return null;

  return (
    <ul ref={ref} className={`pf-stats${inView ? ' is-in' : ''}`} aria-label={t('Tu armario en números')}>
      {stats.map((s, i) => {
        const body = (
          <>
            <span className="pf-stat-icon">
              <Icon name={s.icon} size={18} />
            </span>
            <strong className="pf-stat-num">
              {s.value === null ? <span className="pf-stat-skel" aria-label={t('Cargando…')} /> : <CountUp value={inView ? s.value : 0} delay={120 + i * 110} duration={1100} />}
            </strong>
            <span className="pf-stat-label">{s.label}</span>
            <span className="pf-stat-tag" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
          </>
        );
        return (
          <li key={s.key} className="pf-stat pf-card" style={{ '--i': i } as CSSProperties}>
            {s.to ? <Link to={s.to}>{body}</Link> : <div>{body}</div>}
          </li>
        );
      })}
    </ul>
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
  const saveRef = useRef<HTMLButtonElement>(null);
  // Al abrir el editor, se lleva a la vista y se enfoca el primer campo.
  useEffect(() => {
    formRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
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
    const timer = window.setTimeout(() => {
      usersApi
        .usernameAvailable(wanted)
        .then((r) => alive && setNameCheck(!r.valid ? 'invalid' : r.available ? 'free' : 'taken'))
        .catch(() => alive && setNameCheck('idle'));
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [wanted, user.username]);

  function toggleStyle(tag: string) {
    set('styleTags', d.styleTags.includes(tag) ? d.styleTags.filter((x) => x !== tag) : [...d.styleTags, tag].slice(0, MAX_STYLES));
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
      const saved = await usersApi.update(body);
      burstAt(saveRef.current);
      onSaved(saved);
    } catch (err) {
      setError(err);
      setBusy(false);
      shake(formRef.current);
    }
  }

  const hint: Record<typeof nameCheck, ReactNode> = {
    idle: <>{t('Tu nombre único en MyOut: 3-30 letras minúsculas, números, punto o guion bajo.')}</>,
    checking: <Busy text={t('Comprobando…')} />,
    free: (
      <span className="ok-text">
        <Icon name="check" size={12} /> {t('Disponible')}
      </span>
    ),
    taken: <span className="danger-text">{t('Ya lo tiene otra persona')}</span>,
    invalid: <span className="danger-text">{t('Solo minúsculas, números, punto y guion bajo (3-30)')}</span>,
  };

  return (
    <form id={EDITOR_ID} ref={formRef} className="panel profile-editor pf-card pf-panel pf-editor" onSubmit={save} aria-labelledby={`${ids}-t`}>
      <PanelHead icon="edit" eyebrow={t('Perfil')} title={t('Editar perfil')} id={`${ids}-t`} />

      <div className="profile-form-grid">
        <label className="field">
          <span>{t('Nombre visible')}</span>
          <input maxLength={60} value={d.displayName} onChange={(e) => set('displayName', e.target.value)} autoComplete="nickname" />
        </label>
        <div className="field">
          <label htmlFor={`${ids}-u`} className="field-label">
            {t('@usuario')}
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
          <span>{t('Pronombres')}</span>
          <input maxLength={30} value={d.pronouns} placeholder={t('ella, él, elle…')} onChange={(e) => set('pronouns', e.target.value)} />
        </label>
        <label className="field">
          <span>{t('Ciudad')}</span>
          <input maxLength={60} value={d.location} onChange={(e) => set('location', e.target.value)} autoComplete="address-level2" />
        </label>
        <label className="field field-wide">
          <span>
            {t('Bio')} <small className="muted">{d.bio.length}/300</small>
          </span>
          <textarea rows={3} maxLength={300} value={d.bio} placeholder={t('Cuenta tu estilo en un par de frases')} onChange={(e) => set('bio', e.target.value)} />
        </label>
        <label className="field">
          <span>{t('Web')}</span>
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
          {t('Tus estilos')} <small className="muted">{t('(hasta {n})', { n: MAX_STYLES })}</small>
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
                {STYLE_LABEL[s.value]}
              </button>
            );
          })}
        </div>
        <small className="muted">{t('El primero que elijas sale como pegatina junto a tu nombre.')}</small>
      </fieldset>

      <div className="profile-form-grid">
        <fieldset className="field">
          <legend>
            {t('Colores favoritos')} <small className="muted">{t('(hasta {n})', { n: MAX_COLORS })}</small>
          </legend>
          <div className="color-list">
            {d.favoriteColors.map((c) => (
              <button
                key={c}
                type="button"
                className="color-pill"
                title={t('Quitar {color}', { color: c })}
                onClick={() => set('favoriteColors', d.favoriteColors.filter((x) => x !== c))}
              >
                <span className="swatch" style={{ background: c }} /> {c}
                <Icon name="close" size={11} />
              </button>
            ))}
            {d.favoriteColors.length < MAX_COLORS && (
              <span className="color-add">
                <input type="color" value={newColor} aria-label={t('Color')} onChange={(e) => setNewColor(e.target.value)} />
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => {
                    const c = newColor.toUpperCase();
                    if (!d.favoriteColors.includes(c)) set('favoriteColors', [...d.favoriteColors, c]);
                  }}
                >
                  <Icon name="plus" size={12} /> {t('Añadir')}
                </button>
              </span>
            )}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>{t('Tus tallas')}</legend>
          <div className="size-row">
            <label>
              <small>{t('Arriba')}</small>
              <input maxLength={10} value={d.sizeTop} placeholder="M" onChange={(e) => set('sizeTop', e.target.value)} />
            </label>
            <label>
              <small>{t('Abajo')}</small>
              <input maxLength={10} value={d.sizeBottom} placeholder="32" onChange={(e) => set('sizeBottom', e.target.value)} />
            </label>
            <label>
              <small>{t('Calzado')}</small>
              <input maxLength={10} value={d.sizeShoes} placeholder="43" onChange={(e) => set('sizeShoes', e.target.value)} />
            </label>
          </div>
        </fieldset>
      </div>

      <fieldset className="field">
        <legend>{t('Color de tu perfil')}</legend>
        <div className="accent-row">
          <button type="button" className={`accent-dot is-none${d.accentColor === null ? ' is-active' : ''}`} aria-pressed={d.accentColor === null} onClick={() => set('accentColor', null)}>
            <span className="visually-hidden">{t('Sin color')}</span>
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
          <label className="accent-custom" title={t('Otro color')}>
            <input type="color" value={d.accentColor ?? '#5C5C62'} onChange={(e) => set('accentColor', e.target.value.toUpperCase())} aria-label={t('Otro color')} />
          </label>
          <small className="muted">{t('Se usa en tu portada y en tu nombre.')}</small>
        </div>
      </fieldset>

      <ErrorNote error={error} />

      <div className="actions">
        <button ref={saveRef} type="submit" className="btn pf-btn-neon" disabled={busy || nameCheck === 'taken' || nameCheck === 'invalid'}>
          {busy ? (
            <Busy text={t('Guardando…')} />
          ) : (
            <>
              <Icon name="check" size={14} /> <span>{t('Guardar perfil')}</span>
            </>
          )}
        </button>
        <button type="button" className="btn btn-ghost pf-btn-ghost" onClick={onCancel} disabled={busy}>
          {t('Cancelar')}
        </button>
      </div>
    </form>
  );
}

/** Título de panel: icono, antetítulo y título. */
function PanelHead({ icon, eyebrow, title, id, children }: { icon: IconName; eyebrow: string; title: string; id: string; children?: ReactNode }) {
  return (
    <div className="pf-head">
      <span className="pf-head-icon" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <div className="pf-head-text">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={id}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

/** Aparece al entrar en pantalla (desplazamiento + fundido). */
function Reveal({ className, labelledBy, children }: { className: string; labelledBy: string; children: ReactNode }) {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <section ref={ref} className={`${className} pf-reveal${inView ? ' is-in' : ''}`} aria-labelledby={labelledBy}>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cuentas conectadas
// ---------------------------------------------------------------------------

const ROWS: { slug: ProviderSlug; help: string; icon: IconName }[] = [
  { slug: 'google', help: t('Entra con tu cuenta de Google.'), icon: 'key' },
  { slug: 'apple', help: t('Entra con tu Apple ID.'), icon: 'key' },
  { slug: 'instagram', help: t('Muestra tus publicaciones en tu perfil. Solo cuentas profesionales (creador o empresa).'), icon: 'camera' },
];

function ConnectedAccounts({
  user,
  providers,
  providersLoading,
  onChange,
  justLinked,
}: {
  user: User;
  providers: Record<ProviderSlug, boolean> | null;
  providersLoading: boolean;
  onChange: (u: User) => void;
  justLinked: ProviderSlug | null;
}) {
  const [busy, setBusy] = useState<ProviderSlug | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [changed, setChanged] = useState<ProviderSlug | null>(justLinked);
  const toast = useToast();

  useEffect(() => {
    if (!changed) return;
    const timer = window.setTimeout(() => setChanged(null), 1600);
    return () => window.clearTimeout(timer);
  }, [changed]);

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
      setChanged(slug);
      toast.show(t('{name} desconectado', { name: PROVIDER_LABEL[slug] }), { tone: 'info', icon: 'link' });
    } catch (err) {
      const code = err instanceof ApiError ? err.body?.code : null;
      setError(
        code === 'last_login_method' ? new Error(t('Crea antes una contraseña: {name} es tu única forma de entrar.', { name: PROVIDER_LABEL[slug] })) : err,
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Reveal className="panel pf-card pf-panel pf-accounts" labelledBy="accounts-title">
      <PanelHead icon="link" eyebrow={t('Cuentas')} title={t('Cuentas conectadas')} id="accounts-title" />
      <ul className="pf-acc-list">
        {ROWS.map(({ slug, help, icon }, i) => {
          const acc = user.accounts.find((a) => a.provider === slug.toUpperCase());
          const available = providers?.[slug] ?? false;
          const state = acc ? 'linked' : providersLoading && !providers ? 'loading' : available ? 'ready' : 'off';
          const status = { linked: t('Conectada'), ready: t('Sin conectar'), off: t('No configurado'), loading: t('Comprobando…') }[state];
          return (
            <li key={slug} className={`pf-acc is-${state}${changed === slug ? ' is-changed' : ''}`} style={{ '--i': i } as CSSProperties}>
              <span className={`pf-acc-mono mono-${slug}`} aria-hidden="true">
                {PROVIDER_LABEL[slug].charAt(0)}
                <Icon name={icon} size={11} />
              </span>
              <div className="pf-acc-text">
                <strong>{PROVIDER_LABEL[slug]}</strong>
                <span className="pf-status">
                  <i aria-hidden="true" /> {status}
                </span>
                <small className="muted">
                  {acc
                    ? acc.username
                      ? `@${acc.username}`
                      : (acc.email ?? t('Conectada'))
                    : state === 'off'
                      ? t('Aún no está configurado en el servidor.')
                      : help}
                </small>
              </div>
              {acc ? (
                <button type="button" className="btn btn-small pf-btn-off" disabled={busy !== null} onClick={() => disconnect(slug)}>
                  {busy === slug ? <Busy text="…" /> : t('Desconectar')}
                </button>
              ) : state === 'off' ? (
                <span className="pf-acc-na">
                  <Icon name="lock" size={12} /> {t('No disponible')}
                </span>
              ) : (
                <button type="button" className="btn btn-small pf-btn-on" disabled={busy !== null || !available} onClick={() => connect(slug)}>
                  {busy === slug ? <Busy text={t('Abriendo…')} /> : t('Conectar')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <ErrorNote error={error} />
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// Seguridad: contraseña
// ---------------------------------------------------------------------------

/** Mismas reglas que antes (y que el backend): 8+ caracteres, con letras y números. */
function passwordChecks(p: string) {
  return [
    { ok: p.length >= 8, label: t('8 caracteres o más') },
    { ok: /[A-Za-z]/.test(p) && /\d/.test(p), label: t('Letras y números') },
  ];
}

function strength(p: string): 0 | 1 | 2 | 3 {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Za-z]/.test(p) && /\d/.test(p)) s++;
  if (p.length >= 12 || /[^A-Za-z0-9]/.test(p)) s++;
  return Math.max(1, s) as 1 | 2 | 3;
}

const STRENGTH_LABEL = ['', t('Floja'), t('Aceptable'), t('Fuerte')] as const;

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  describedBy,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  minLength?: number;
  describedBy?: string;
  children?: ReactNode;
}) {
  const id = useId();
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.('CapsLock') ?? false);
  return (
    <div className="field pf-field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="input-affix pf-input">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          required
          minLength={minLength}
          maxLength={128}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          onKeyUp={onKey}
          onBlur={() => setCaps(false)}
          aria-describedby={describedBy}
        />
        <button type="button" className="affix-btn pf-eye" aria-pressed={show} aria-controls={id} onClick={() => setShow((v) => !v)} title={show ? t('Ocultar') : t('Mostrar')}>
          <Icon name={show ? 'eyeOff' : 'eye'} size={16} />
          <span className="visually-hidden">{show ? t('Ocultar contraseña') : t('Mostrar contraseña')}</span>
        </button>
      </div>
      {caps && <small className="pw-caps">{t('Bloq Mayús está activado')}</small>}
      {children}
    </div>
  );
}

function SecurityPanel({ user, justReauthed }: { user: User; justReauthed: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const helpId = useId();
  const toast = useToast();
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
  const checks = passwordChecks(next);
  const valid = checks.every((c) => c.ok);
  const level = strength(next);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await usersApi.setPassword(user.hasPassword ? { newPassword: next, currentPassword: current } : { newPassword: next, reauthToken: proof.current ?? undefined });
      burstAt(saveRef.current);
      toast.show(t('Contraseña guardada'), { tone: 'ok', icon: 'lock', sound: 'success' });
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirmed(false);
      proof.current = null;
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(
        status === 403
          ? new Error(user.hasPassword ? t('La contraseña actual no es correcta.') : t('La confirmación ha caducado. Vuelve a confirmar tu identidad.'))
          : err,
      );
      shake(formRef.current);
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
    <Reveal className="panel pf-card pf-panel pf-security" labelledBy="security-title">
      <PanelHead icon="shield" eyebrow={t('Seguridad')} title={user.hasPassword || done ? t('Cambiar contraseña') : t('Crear contraseña')} id="security-title" />
      {done && (
        <p className="note pf-done" role="status">
          <span className="pf-done-mark" aria-hidden="true">
            <Icon name="check" size={16} />
          </span>
          {t('Contraseña guardada. Ya puedes entrar también con tu email.')}
        </p>
      )}

      {user.hasPassword || done || confirmed ? (
        <form ref={formRef} className="stack pf-form" onSubmit={submit}>
          {(user.hasPassword || done) && <PasswordField label={t('Contraseña actual')} value={current} onChange={setCurrent} autoComplete="current-password" />}
          <PasswordField label={t('Nueva contraseña')} value={next} onChange={setNext} autoComplete="new-password" minLength={8} describedBy={helpId}>
            <div id={helpId} className="pf-pw-help" aria-live="polite">
              <div className={`pf-meter level-${level}`} aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <ul className="pf-checks">
                {checks.map((c) => (
                  <li key={c.label} className={c.ok ? 'is-ok' : undefined}>
                    <span aria-hidden="true">
                      <Icon name={c.ok ? 'check' : 'close'} size={11} />
                    </span>
                    {c.label}
                  </li>
                ))}
                {level > 0 && <li className={`pf-level level-${level}`}>{STRENGTH_LABEL[level]}</li>}
              </ul>
            </div>
          </PasswordField>
          <ErrorNote error={error} />
          <div className="actions">
            <button ref={saveRef} type="submit" className="btn pf-btn-neon" disabled={busy || !valid}>
              {busy ? (
                <Busy text={t('Guardando…')} />
              ) : (
                <>
                  <Icon name="lock" size={14} /> <span>{t('Guardar contraseña')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      ) : (
        <div className="stack">
          <p className="muted">
            {t('Entraste con {providers} y aún no tienes contraseña. Para crearla, confirma antes que eres tú.', {
              providers: loginProviders.map((a) => PROVIDER_LABEL[a.provider.toLowerCase() as ProviderSlug]).join(t(' y ')) || t('un proveedor'),
            })}
          </p>
          <div className="actions">
            {loginProviders.map((a) => {
              const slug = a.provider.toLowerCase() as ProviderSlug;
              return (
                <button key={slug} type="button" className="btn pf-btn-on" onClick={() => reauth(slug)}>
                  {t('Confirmar con {name}', { name: PROVIDER_LABEL[slug] })}
                </button>
              );
            })}
          </div>
          <ErrorNote error={error} />
        </div>
      )}
    </Reveal>
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
    <Reveal className="panel instagram-panel pf-card pf-panel" labelledBy="ig-title">
      <PanelHead icon="camera" eyebrow="Instagram" title={data?.username ? `@${data.username}` : t('Tu Instagram')} id="ig-title">
        {data?.status === 'ok' && (
          <div className="actions">
            {data.profile?.profilePictureUrl && (
              <button type="button" className="btn btn-small pf-btn-on" disabled={busy} onClick={usePhoto}>
                {busy ? <Busy text={t('Copiando…')} /> : t('Usar su foto de perfil')}
              </button>
            )}
            <a className="btn btn-small btn-ghost pf-btn-ghost" href={`https://www.instagram.com/${encodeURIComponent(data.username ?? '')}/`} target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={13} /> {t('Abrir')}
            </a>
          </div>
        )}
      </PanelHead>

      {ig.loading && !ig.data && <Spinner label={t('Cargando tus publicaciones…')} />}
      {data?.status === 'expired' && (
        <p className="note note-error">
          {t('La conexión con Instagram ha caducado.')}{' '}
          <button type="button" className="link-btn inline" onClick={() => void openProvider('instagram', 'link')}>
            {t('Volver a conectar')}
          </button>
        </p>
      )}
      {data?.status === 'unavailable' && <p className="muted">{t('Instagram no responde ahora mismo. Prueba más tarde.')}</p>}
      {data?.status === 'ok' && (
        <>
          {data.profile && (
            <p className="muted small">
              {data.profile.mediaCount !== null && t('{n} publicaciones', { n: data.profile.mediaCount })}
              {data.profile.followersCount !== null && ` · ${t('{n} seguidores', { n: data.profile.followersCount })}`}
            </p>
          )}
          {data.media.length > 0 ? (
            <ul className="ig-grid">
              {data.media
                .filter((m) => m.imageUrl)
                .map((m) => (
                  <li key={m.id}>
                    <a href={m.permalink ?? '#'} target="_blank" rel="noopener noreferrer" title={m.caption ?? undefined}>
                      <img src={m.imageUrl!} alt={m.caption ? m.caption.slice(0, 80) : t('Publicación de Instagram')} loading="lazy" referrerPolicy="no-referrer" />
                      {m.mediaType !== 'IMAGE' && <span className="ig-kind">{m.mediaType === 'VIDEO' ? t('Vídeo') : t('Álbum')}</span>}
                    </a>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="muted">{t('Aún no hay publicaciones.')}</p>
          )}
        </>
      )}
      <ErrorNote error={error ?? ig.error} />
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// Privacidad: cuenta privada, quién puede escribirte y personas bloqueadas
// ---------------------------------------------------------------------------

const POLICIES: { value: MessagePolicy; label: string; help: string; icon: IconName }[] = [
  { value: 'EVERYONE', label: t('Todos##mensajes'), help: t('Cualquiera puede escribirte (salvo quien bloquees).'), icon: 'users' },
  { value: 'FOLLOWING', label: t('Personas a las que sigo'), help: t('Solo te escribe quien tú sigues.'), icon: 'userCheck' },
  { value: 'NOBODY', label: t('Nadie'), help: t('Nadie puede empezar un chat contigo ni añadirte a grupos.'), icon: 'lock' },
];

function PrivacyPanel({ user, onChange }: { user: User; onChange: (u: User) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [blocked, setBlocked] = useState<UserBrief[] | null>(null);
  const [showBlocked, setShowBlocked] = useState(false);
  const [saved, setSaved] = useState(0);
  const toast = useToast();

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(0), 2200);
    return () => window.clearTimeout(timer);
  }, [saved]);

  async function save(body: ProfileInput) {
    setBusy(true);
    setError(null);
    try {
      onChange(await usersApi.update(body));
      setSaved(Date.now());
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
      toast.show(t('Desbloqueado'), { tone: 'ok' });
    } catch (err) {
      setError(err);
    }
  }

  const idx = Math.max(
    0,
    POLICIES.findIndex((p) => p.value === user.messagePolicy),
  );
  const current = POLICIES.find((p) => p.value === user.messagePolicy) ?? POLICIES[1];

  return (
    <Reveal className="panel privacy-panel pf-card pf-panel pf-privacy" labelledBy="privacy-title">
      <PanelHead icon="eye" eyebrow={t('Privacidad')} title={t('Quién te ve y quién te escribe')} id="privacy-title">
        <span className={`pf-saved${saved ? ' is-on' : ''}`} role="status" aria-live="polite">
          {saved ? (
            <>
              <Icon name="check" size={12} /> {t('Guardado')}
            </>
          ) : null}
        </span>
        <Link to={`/u/${encodeURIComponent(user.username ?? user.id)}`} className="btn btn-small pf-btn-ghost pf-preview-btn">
          <Icon name="eye" size={14} /> {t('Ver tu perfil como lo ven los demás')}
        </Link>
      </PanelHead>

      <div className="privacy-grid pf-privacy-grid">
        <div className={`privacy-item pf-tile${user.isPrivate ? ' is-on' : ''}`}>
          <label className="switch-row pf-switch-row">
            <input type="checkbox" role="switch" checked={user.isPrivate} disabled={busy} onChange={(e) => void save({ isPrivate: e.target.checked })} />
            <span className="switch pf-switch" aria-hidden="true" />
            <span>
              <strong>
                <Icon name="lock" size={13} /> {t('Cuenta privada')}
              </strong>
              <small className="muted">
                {user.isPrivate
                  ? t('Para seguirte hay que enviarte una solicitud. Solo tus seguidores ven tus outfits y a quién sigues.')
                  : t('Cualquiera puede seguirte y ver los outfits que compartes. Tu armario sigue siendo solo tuyo.')}
              </small>
            </span>
          </label>
          {!user.isPrivate && <small className="muted">{t('Si pasas a privada, quien ya te sigue sigue haciéndolo.')}</small>}
        </div>

        <div className="privacy-item pf-tile">
          <span className="field-label" id="policy-label">
            <Icon name="chat" size={13} /> {t('Quién puede escribirte')}
          </span>
          <div className="seg pf-seg" role="radiogroup" aria-labelledby="policy-label" style={{ '--idx': idx, '--n': POLICIES.length } as CSSProperties}>
            <span className="pf-seg-glider" aria-hidden="true" />
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
                <Icon name={p.icon} size={14} />
                <span>{p.label}</span>
              </button>
            ))}
          </div>
          <small className="muted pf-policy-help" key={current.value}>
            {current.help} {t('Si alguien te escribe, siempre puedes contestarle.')}
          </small>
        </div>
      </div>

      <ErrorNote error={error} />

      <div className="pf-blocked">
        <button type="button" className="pf-blocked-toggle" aria-expanded={showBlocked} onClick={() => setShowBlocked((v) => !v)}>
          <Icon name="eyeOff" size={14} />
          <span>{t('Personas bloqueadas')}</span>
          {blocked && <span className="pf-count">{blocked.length}</span>}
          <Icon name="down" size={14} className="pf-chevron" />
        </button>
        <div className={`pf-collapse${showBlocked ? ' is-open' : ''}`}>
          <div>
            {showBlocked && !blocked && <Spinner size={14} />}
            {blocked?.length === 0 && <p className="muted small">{t('No has bloqueado a nadie.')}</p>}
            {blocked && blocked.length > 0 && (
              <ul className="person-list">
                {blocked.map((b) => (
                  <PersonRow
                    key={b.id}
                    person={b}
                    action={
                      <button type="button" className="btn btn-small pf-btn-on" onClick={() => void unblock(b.id)}>
                        {t('Desbloquear')}
                      </button>
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Reveal>
  );
}
