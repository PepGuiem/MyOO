import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { itemsApi, outfitsApi } from '../api/endpoints';
import type { GarmentCategory, Outfit, WardrobeItem } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { ItemTile } from '../components/ItemTile';
import { useAppData } from '../components/Layout';
import { TileSkeletons } from '../components/Skeleton';
import { useBodyShape } from '../lib/bodyPref';
import { CATEGORY_FILTERS, SEASON_LABEL, plural } from '../lib/labels';
import { OutfitView } from '../three/OutfitMannequin';
import { OutfitCard } from './OutfitsPage';
import { FirstWardrobe } from './WardrobePage';

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
  if (h >= 6 && h < 14) return 'Buenos días';
  if (h >= 14 && h < 21) return 'Buenas tardes';
  return 'Buenas noches';
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
  const today = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const name = user?.displayName?.trim() || user?.email?.split('@')[0] || '';
  const loading = !data && !error;
  const outfit = data?.outfits.length ? data.outfits[featured % data.outfits.length] : null;
  const garments = useMemo(() => outfit?.items.map((i) => ({ ...i.wardrobeItem, styling: i.styling })) ?? [], [outfit]);
  const from = { state: { from: location.pathname } };

  if (wardrobes.length === 0 && data && data.itemTotal === 0) {
    return (
      <section className="page home">
        <HomeHead today={today} title={`${greeting(now)}${name ? `, ${name}` : ''}`} summary="Bienvenido a MyOut. Tres pasos para empezar:" />
        <ol className="home-steps">
          <li className="is-current">
            <span className="step-n">1</span>
            <div>
              <FirstWardrobe embedded onCreated={reloadWardrobes} />
            </div>
          </li>
          <li>
            <span className="step-n">2</span>
            <div>
              <h2>Añade tus prendas</h2>
              <p className="muted">Cada prenda se ve en 3D con su color, corte y detalles.</p>
            </div>
          </li>
          <li>
            <span className="step-n">3</span>
            <div>
              <h2>Combínalas en outfits</h2>
              <p className="muted">Vístelas sobre el maniquí y decide cómo llevar cada una.</p>
            </div>
          </li>
        </ol>
      </section>
    );
  }

  const summary = data
    ? `${plural(data.itemTotal, 'prenda', 'prendas')} en ${plural(wardrobes.length, 'armario', 'armarios')} y ${plural(data.outfitTotal, 'outfit', 'outfits')}.`
    : 'Cargando tu armario…';

  return (
    <section className="page home">
      <HomeHead
        today={today}
        title={`${greeting(now)}${name ? `, ${name}` : ''}`}
        summary={summary}
        actions={
          <>
            <Link to="/armario?nueva=1" className="btn">
              <Icon name="plus" size={14} /> Añadir prenda
            </Link>
            <Link to="/outfits/new" className="btn btn-primary">
              <Icon name="plus" size={14} /> Nuevo outfit
            </Link>
          </>
        }
      />

      <ErrorNote error={error} />

      <div className="home-hero">
        <div className="hero-stage">
          {outfit ? (
            <OutfitView key={outfit.id} className="hero-view" garments={garments} shape={shape} active speed={0.25} distance={4.2} />
          ) : (
            <OutfitView className="hero-view" garments={[]} shape={shape} active speed={0.25} distance={4.2} />
          )}
        </div>
        <div className="hero-info">
          {loading ? (
            <>
              <span className="skeleton-line" style={{ width: '30%' }} />
              <span className="skeleton-line" style={{ width: '70%', height: 28 }} />
              <span className="skeleton-line" style={{ width: '50%' }} />
            </>
          ) : outfit ? (
            <>
              <p className="eyebrow">{featured === 0 ? 'Tu último outfit' : 'Outfit'}</p>
              <h2 className="hero-title">{outfit.name}</h2>
              <p className="muted">
                {[outfit.occasion, outfit.season ? SEASON_LABEL[outfit.season] : null, plural(garments.length, 'prenda', 'prendas')].filter(Boolean).join(' · ')}
              </p>
              <ul className="hero-items">
                {outfit.items.map((i) => (
                  <li key={i.wardrobeItem.id}>
                    <span className="swatch" style={{ background: i.wardrobeItem.color }} aria-hidden="true" />
                    <span className="hero-item-name">{i.wardrobeItem.name}</span>
                    <span className="hero-item-type">{i.wardrobeItem.garmentType.name}</span>
                  </li>
                ))}
              </ul>
              <div className="actions">
                <Link to={`/outfits/${outfit.id}`} className="btn">
                  Abrir
                </Link>
                {data && data.outfits.length > 1 && (
                  <button type="button" className="btn btn-ghost" onClick={() => setFeatured((f) => f + 1)}>
                    Ver otro
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow">Outfits</p>
              <h2 className="hero-title">Viste el maniquí</h2>
              <p className="muted">Combina prendas de tus armarios, elige cómo llevar cada una y guárdalas juntas.</p>
              <div className="actions">
                <Link to="/outfits/new" className="btn btn-primary">
                  Crear el primero
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="stats" aria-label="Resumen">
        <Link to="/armario" className="stat">
          <span className="stat-n">{data ? data.itemTotal : '–'}</span>
          <span className="stat-label">Prendas</span>
        </Link>
        <Link to="/armario" className="stat">
          <span className="stat-n">{wardrobes.length}</span>
          <span className="stat-label">Armarios</span>
        </Link>
        <Link to="/outfits" className="stat">
          <span className="stat-n">{data ? data.outfitTotal : '–'}</span>
          <span className="stat-label">Outfits</span>
        </Link>
      </div>

      <HomeSection title="Añadido recientemente" link={{ to: '/armario', label: 'Ver armario' }}>
        {data && data.items.length === 0 ? (
          <div className="empty empty-inline">
            <p>Aún no hay prendas.</p>
            <Link to="/armario?nueva=1" className="btn btn-primary">
              Añadir prenda
            </Link>
          </div>
        ) : (
          <div className="grid home-grid">
            {loading && <TileSkeletons count={6} />}
            {data?.items.slice(0, 6).map((item) => (
              <ItemTile key={item.id} item={item} onOpen={() => navigate(`/items/${item.id}`, from)} />
            ))}
          </div>
        )}
      </HomeSection>

      <HomeSection title="Por categoría">
        <div className="category-cards">
          {CATEGORIES.map((c) => (
            <Link key={c.value} to={`/armario?cat=${c.value}`} className={`category-card${data && !data.byCategory[c.value] ? ' is-empty' : ''}`}>
              <span className="category-name">{c.label}</span>
              <span className="category-count">{data ? data.byCategory[c.value] : '–'}</span>
            </Link>
          ))}
        </div>
      </HomeSection>

      {wardrobes.length > 0 && (
        <HomeSection title="Tus armarios">
          <ul className="wardrobe-cards">
            {wardrobes.map((w) => (
              <li key={w.id}>
                <Link to={`/armario?w=${w.id}`} className="wardrobe-card">
                  <span className="wardrobe-card-name">{w.name}</span>
                  <span className="muted small">{plural(w.itemCount, 'prenda', 'prendas')}</span>
                  <Icon name="forward" className="wardrobe-card-arrow" />
                </Link>
              </li>
            ))}
          </ul>
        </HomeSection>
      )}

      {data && data.outfits.length > 1 && (
        <HomeSection title="Tus outfits" link={{ to: '/outfits', label: 'Ver todos' }}>
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

function HomeHead({ today, title, summary, actions }: { today: string; title: string; summary: string; actions?: ReactNode }) {
  return (
    <header className="page-head home-head">
      <div>
        <p className="eyebrow">{today}</p>
        <h1>{title}</h1>
        <p className="muted">{summary}</p>
      </div>
      {actions && <div className="head-actions">{actions}</div>}
    </header>
  );
}

function HomeSection({ title, link, children }: { title: string; link?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className="home-section">
      <div className="section-head">
        <h2>{title}</h2>
        {link && (
          <Link to={link.to} className="section-link">
            {link.label} <Icon name="forward" size={14} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
