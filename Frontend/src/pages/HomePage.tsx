import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { itemsApi, outfitsApi } from '../api/endpoints';
import type { GarmentCategory, Outfit, WardrobeItem } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorNote } from '../components/ErrorNote';
import { Icon, type IconName } from '../components/Icon';
import { useAppData } from '../components/Layout';
import { CountUp } from '../components/street/Street';
import { GarmentCard, GarmentCardSkeletons } from '../components/wardrobe/GarmentCard';
import { useBodyShape } from '../lib/bodyPref';
import { CATEGORY_FILTERS, SEASON_LABEL, plural } from '../lib/labels';
import { OutfitView } from '../three/OutfitMannequin';
import { OutfitCard } from './OutfitsPage';
import { FirstWardrobe } from './WardrobePage';
import { LOCALE_TAG, t } from '../i18n';

const CATEGORY_ICON: Record<GarmentCategory, IconName> = {
  TOP: 'tshirt',
  BOTTOM: 'pants',
  FULL_BODY: 'dress',
  OUTERWEAR: 'jacket',
  FOOTWEAR: 'shoe',
  ACCESSORY: 'cap',
};

const CATEGORIES = CATEGORY_FILTERS.filter((c): c is { value: GarmentCategory; label: string } => c.value !== null);

interface HomeData {
  items: WardrobeItem[];
  itemTotal: number;
  outfits: Outfit[];
  outfitTotal: number;
  byCategory: Record<GarmentCategory, number>;
}

function greeting(d: Date): string {
  const h = d.getHours();
  if (h >= 6 && h < 14) return t('Buenos días');
  if (h >= 14 && h < 21) return t('Buenas tardes');
  return t('Buenas noches');
}

/**
 * Inicio: saludo, el último outfit puesto en el maniquí, cifras del armario,
 * prendas recientes, accesos por categoría, armarios y outfits.
 */
export function HomePage() {
  const { user } = useAuth();
  const { wardrobes, reloadWardrobes } = useAppData();
  const { shape } = useBodyShape();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<unknown>(null);
  // Outfit destacado: el más reciente; «Otro» pasa al siguiente.
  const [featured, setFeatured] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([
      itemsApi.list({ pageSize: 8 }),
      outfitsApi.list(1),
      // Solo nos interesa el total de cada categoría.
      Promise.all(CATEGORIES.map((c) => itemsApi.list({ category: c.value, pageSize: 1 }).then((r) => r.meta.total))),
    ])
      .then(([items, outfits, counts]) => {
        if (!alive) return;
        setData({
          items: items.data,
          itemTotal: items.meta.total,
          outfits: outfits.data,
          outfitTotal: outfits.meta.total,
          byCategory: Object.fromEntries(CATEGORIES.map((c, i) => [c.value, counts[i]])) as Record<GarmentCategory, number>,
        });
      })
      .catch((err: unknown) => alive && setError(err));
    return () => {
      alive = false;
    };
  }, []);

  const now = useMemo(() => new Date(), []);
  const today = now.toLocaleDateString(LOCALE_TAG, { weekday: 'long', day: 'numeric', month: 'long' });
  const name = user?.displayName?.trim() || user?.email?.split('@')[0] || '';
  const loading = !data && !error;
  const outfit = data?.outfits.length ? data.outfits[featured % data.outfits.length] : null;
  const garments = useMemo(() => outfit?.items.map((i) => ({ ...i.wardrobeItem, styling: i.styling })) ?? [], [outfit]);
  const from = { state: { from: location.pathname } };

  const title = greeting(now);

  if (wardrobes.length === 0 && data && data.itemTotal === 0) {
    return (
      <section className="page home hm">
        <HomeHead today={today} title={title} name={name} summary={t('Bienvenido a MyOut. Tres pasos para empezar:')} />
        <ol className="home-steps hm-steps">
          <li className="is-current">
            <span className="step-n">1</span>
            <div>
              <FirstWardrobe embedded onCreated={reloadWardrobes} />
            </div>
          </li>
          <li>
            <span className="step-n">2</span>
            <div>
              <h2>{t('Añade tus prendas')}</h2>
              <p className="muted">{t('Cada prenda se ve en 3D con su color, corte y detalles.')}</p>
            </div>
          </li>
          <li>
            <span className="step-n">3</span>
            <div>
              <h2>{t('Combínalas en outfits')}</h2>
              <p className="muted">{t('Vístelas sobre el maniquí y decide cómo llevar cada una.')}</p>
            </div>
          </li>
        </ol>
      </section>
    );
  }

  const summary = data
    ? t('{plural} en {plural2} y {plural3}.', { plural: plural(data.itemTotal, 'prenda', 'prendas'), plural2: plural(wardrobes.length, 'armario', 'armarios'), plural3: plural(data.outfitTotal, 'outfit', 'outfits') })
    : t('Cargando tu armario…');

  return (
    <section className="page home hm">
      <HomeHead
        today={today}
        title={title}
        name={name}
        summary={summary}
        actions={
          <>
            <Link to="/armario?nueva=1" className="btn wd-btn-line">
              <Icon name="plus" size={14} /> {t('Añadir prenda')}
            </Link>
            <Link to="/outfits/new" className="btn wd-add">
              <Icon name="plus" size={15} /> <span>{t('Nuevo outfit')}</span>
            </Link>
          </>
        }
      />

      <ErrorNote error={error} />

      <ul className="wd-stats hm-stats" aria-label={t('Resumen')}>
        <li style={{ '--i': 0 } as CSSProperties}>
          <Icon name="tshirt" size={16} />
          <Link to="/armario">
            <strong>{data ? <CountUp value={data.itemTotal} /> : '–'}</strong>
            <span>{t('Prendas')}</span>
          </Link>
        </li>
        <li style={{ '--i': 1 } as CSSProperties}>
          <Icon name="wardrobe" size={16} />
          <Link to="/armario">
            <strong>
              <CountUp value={wardrobes.length} />
            </strong>
            <span>{t('Armarios')}</span>
          </Link>
        </li>
        <li style={{ '--i': 2 } as CSSProperties}>
          <Icon name="layers" size={16} />
          <Link to="/outfits">
            <strong>{data ? <CountUp value={data.outfitTotal} /> : '–'}</strong>
            <span>{t('Outfits')}</span>
          </Link>
        </li>
        <li className="hm-stats-cta" style={{ '--i': 3 } as CSSProperties}>
          <Icon name="sparkles" size={16} />
          <Link to="/estilista">
            <strong>{t('¿Qué me pongo hoy?')}</strong>
            <span>
              {t('Pregunta al estilista')} <Icon name="forward" size={11} />
            </span>
          </Link>
        </li>
      </ul>

      <div className="home-hero hm-hero">
        <div className="hero-stage hm-stage">
          <span className="hm-stage-beams" aria-hidden="true" />
          <span className="hm-stage-floor" aria-hidden="true" />
          {outfit ? (
            <OutfitView key={outfit.id} className="hero-view" garments={garments} shape={shape} active speed={0.25} distance={4.2} />
          ) : (
            <OutfitView className="hero-view" garments={[]} shape={shape} active speed={0.25} distance={4.2} />
          )}
        </div>
        <div className="hero-info hm-info">
          {loading ? (
            <>
              <span className="skeleton-line" style={{ width: '30%' }} />
              <span className="skeleton-line" style={{ width: '70%', height: 28 }} />
              <span className="skeleton-line" style={{ width: '50%' }} />
            </>
          ) : outfit ? (
            <>
              <span className="wd-kicker hm-kicker">
                <Icon name="layers" size={12} /> {featured === 0 ? t('Tu último outfit') : t('Outfit')}
              </span>
              <h2 key={outfit.id} className="hm-outfit-name">
                {outfit.name}
              </h2>
              <p className="hm-outfit-meta">
                {[outfit.occasion, outfit.season ? SEASON_LABEL[outfit.season] : null, plural(garments.length, t('prenda'), t('prendas'))].filter(Boolean).join(' · ')}
              </p>
              <ul key={`l${outfit.id}`} className="hm-pieces">
                {outfit.items.map((i, k) => (
                  <li key={i.wardrobeItem.id} style={{ '--i': k } as CSSProperties}>
                    <span className="wd-swatch" style={{ background: i.wardrobeItem.color }} aria-hidden="true" />
                    <span className="hm-piece-name">{i.wardrobeItem.name}</span>
                    <span className="hm-piece-type">{i.wardrobeItem.garmentType.name}</span>
                  </li>
                ))}
              </ul>
              <div className="hm-hero-actions">
                <Link to={`/outfits/${outfit.id}`} className="btn wd-add">
                  <Icon name="external" size={14} /> <span>{t('Abrir')}</span>
                </Link>
                {data && data.outfits.length > 1 && (
                  <button type="button" className="btn wd-btn-line" onClick={() => setFeatured((f) => f + 1)}>
                    <Icon name="shuffle" size={14} /> {t('Ver otro')}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <span className="wd-kicker hm-kicker">
                <Icon name="layers" size={12} /> {t('Outfits')}
              </span>
              <h2 className="hm-outfit-name">{t('Viste el maniquí')}</h2>
              <p className="hm-outfit-meta">{t('Combina prendas de tus armarios, elige cómo llevar cada una y guárdalas juntas.')}</p>
              <div className="hm-hero-actions">
                <Link to="/outfits/new" className="btn wd-add">
                  <Icon name="plus" size={14} /> <span>{t('Crear el primero')}</span>
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      <HomeSection n="01" title={t('Añadido recientemente')} link={{ to: '/armario', label: t('Ver armario') }}>
        {data && data.items.length === 0 ? (
          <div className="hm-none">
            <Icon name="hanger" size={30} />
            <p>{t('Aún no hay prendas.')}</p>
            <Link to="/armario?nueva=1" className="btn wd-add">
              <Icon name="plus" size={14} /> <span>{t('Añadir prenda')}</span>
            </Link>
          </div>
        ) : (
          <div className="wd-grid view-grid hm-grid">
            {loading && <GarmentCardSkeletons count={6} />}
            {data?.items.map((item, i) => (
              <GarmentCard key={item.id} item={item} index={i} view="grid" onOpen={() => navigate(`/items/${item.id}`, from)} />
            ))}
          </div>
        )}
      </HomeSection>

      <HomeSection n="02" title={t('Por categoría')}>
        <div className="hm-cats">
          {CATEGORIES.map((c, i) => (
            <Link
              key={c.value}
              to={`/armario?cat=${c.value}`}
              className={`hm-cat${data && !data.byCategory[c.value] ? ' is-empty' : ''}`}
              style={{ '--i': i } as CSSProperties}
            >
              <span className="hm-cat-icon">
                <Icon name={CATEGORY_ICON[c.value]} size={20} />
              </span>
              <span className="hm-cat-name">{c.label}</span>
              <span className="hm-cat-count">{data ? data.byCategory[c.value] : '–'}</span>
            </Link>
          ))}
        </div>
      </HomeSection>

      {wardrobes.length > 0 && (
        <HomeSection n="03" title={t('Tus armarios')}>
          <ul className="hm-wardrobes">
            {wardrobes.map((w) => (
              <li key={w.id}>
                <Link to={`/armario?w=${w.id}`}>
                  <Icon name="wardrobe" size={18} />
                  <span className="hm-wardrobe-name">{w.name}</span>
                  <span className="hm-wardrobe-count">{plural(w.itemCount, t('prenda'), t('prendas'))}</span>
                  <Icon name="forward" className="hm-arrow" />
                </Link>
              </li>
            ))}
          </ul>
        </HomeSection>
      )}

      {data && data.outfits.length > 1 && (
        <HomeSection n="04" title={t('Tus outfits')} link={{ to: '/outfits', label: t('Ver todos') }}>
          <div className="grid grid-outfits home-grid">
            {data.outfits.slice(0, 4).map((o) => (
              <OutfitCard key={o.id} outfit={o} />
            ))}
          </div>
        </HomeSection>
      )}
    </section>
  );
}

function HomeHead({ today, title, name, summary, actions }: { today: string; title: string; name: string; summary: string; actions?: ReactNode }) {
  const full = name ? `${title}, ${name}` : title;
  return (
    <header className="hm-head">
      <div className="hm-head-main">
        <span className="wd-kicker">
          <Icon name="bolt" size={12} /> {today}
        </span>
        <h1 className="wd-title hm-title" data-text={full} aria-label={full}>
          {title}
          {name && (
            <>
              , <em>{name}</em>
            </>
          )}
        </h1>
        <p className="hm-summary">{summary}</p>
      </div>
      {actions && <div className="wd-head-actions">{actions}</div>}
    </header>
  );
}

function HomeSection({ n, title, link, children }: { n: string; title: string; link?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className="hm-section">
      <div className="hm-section-head">
        <span className="hm-section-n" aria-hidden="true">
          {n}
        </span>
        <h2>{title}</h2>
        {link && (
          <Link to={link.to} className="hm-section-link">
            {link.label} <Icon name="forward" size={14} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
