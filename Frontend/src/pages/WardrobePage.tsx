import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { itemsApi, wardrobesApi } from '../api/endpoints';
import type { GarmentCategory, WardrobeItem } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { Select } from '../components/Select';
import { TileSkeletons } from '../components/Skeleton';
import { ItemEditor } from '../components/ItemEditor';
import { ItemTile } from '../components/ItemTile';
import { useAppData } from '../components/Layout';
import { CATEGORY_FILTERS, plural } from '../lib/labels';
import { InfiniteSentinel } from '../components/InfiniteSentinel';
import { usePagedList } from '../lib/usePagedList';

const PAGE_SIZE = 24;

export function WardrobePage() {
  const { wardrobes, garmentTypes, reloadWardrobes } = useAppData();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const wardrobeId = params.get('w') ?? undefined;
  const category = (params.get('cat') as GarmentCategory | null) ?? undefined;
  const wardrobe = wardrobes.find((w) => w.id === wardrobeId);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<WardrobeItem | 'new' | null>(null);

  // Retrasamos la búsqueda 250 ms para no lanzar una petición por tecla.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Scroll infinito: 24 prendas por tanda; la siguiente llega al acercarse al final.
  const list = usePagedList(
    (page) => itemsApi.list({ wardrobeId, category, search: query || undefined, page, pageSize: PAGE_SIZE }),
    [wardrobeId, category, query],
  );
  const { items, total, loading, error } = list;

  // Desde el inicio, «Añadir prenda» llega con ?nueva=1: abrimos el editor.
  useEffect(() => {
    if (params.get('nueva') !== '1' || garmentTypes.length === 0) return;
    setEditing('new');
    const next = new URLSearchParams(params);
    next.delete('nueva');
    setParams(next, { replace: true });
  }, [params, setParams, garmentTypes.length]);

  function setFilter(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  function refreshAfterChange() {
    void reloadWardrobes();
    list.reload();
  }

  if (wardrobes.length === 0 && !loading) {
    return <FirstWardrobe onCreated={reloadWardrobes} />;
  }

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <h1>{wardrobe?.name ?? 'Todo el armario'}</h1>
          <p className="muted">
            {loading && items.length === 0 ? 'Cargando…' : plural(total, 'prenda', 'prendas')}
            {wardrobe?.description ? `. ${wardrobe.description}` : ''}
          </p>
        </div>
        <div className="head-actions">
          {wardrobe && (
            <WardrobeMenu
              id={wardrobe.id}
              name={wardrobe.name}
              onChanged={reloadWardrobes}
              onDeleted={async () => {
                await reloadWardrobes();
                navigate('/armario');
              }}
            />
          )}
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')} disabled={garmentTypes.length === 0}>
            Añadir prenda
          </button>
        </div>
      </header>

      <div className="toolbar">
        <div className="mobile-only toolbar-select">
          <Select
            ariaLabel="Armario"
            value={wardrobeId ?? ''}
            options={[{ value: '', label: 'Todo el armario' }, ...wardrobes.map((w) => ({ value: w.id, label: w.name }))]}
            onChange={(v) => setFilter('w', v || null)}
          />
        </div>
        <div className="chips" role="group" aria-label="Filtrar por categoría">
          {CATEGORY_FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              className={`chip${(f.value ?? undefined) === category ? ' is-active' : ''}`}
              aria-pressed={(f.value ?? undefined) === category}
              onClick={() => setFilter('cat', f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="search">
          <Icon name="search" />
          <input type="search" placeholder="Buscar por nombre" aria-label="Buscar prendas por nombre" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {items.length === 0 && <ErrorNote error={error} />}

      {items.length === 0 && !loading && !error ? (
        <div className="empty">
          <p>{query || category ? 'Ninguna prenda coincide con este filtro.' : 'Este armario está vacío. Añade una prenda para verla en 3D.'}</p>
          {!query && !category && (
            <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
              Añadir prenda
            </button>
          )}
        </div>
      ) : (
        <div className="grid" aria-busy={loading && items.length === 0}>
          {loading && items.length === 0 && <TileSkeletons />}
          {items.map((item, i) => (
            <ItemTile
              key={item.id}
              item={item}
              index={i % PAGE_SIZE}
              onOpen={() => navigate(`/items/${item.id}`, { state: { from: location.pathname + location.search } })}
            />
          ))}
        </div>
      )}

      <InfiniteSentinel
        hasMore={list.hasMore}
        loading={loading}
        error={items.length > 0 ? error : null}
        onMore={list.loadMore}
        count={items.length}
        endLabel={total > PAGE_SIZE ? `Ya están las ${total} prendas.` : undefined}
      />

      {editing && (
        <ItemEditor
          item={editing === 'new' ? undefined : editing}
          wardrobes={wardrobes}
          garmentTypes={garmentTypes}
          defaultWardrobeId={wardrobeId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refreshAfterChange();
          }}
          onDeleted={() => {
            setEditing(null);
            refreshAfterChange();
          }}
        />
      )}
    </section>
  );
}

function WardrobeMenu({
  id,
  name,
  onChanged,
  onDeleted,
}: {
  id: string;
  name: string;
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'idle' | 'rename' | 'delete'>('idle');
  const [value, setValue] = useState(name);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setMode('idle');
    setValue(name);
    setError(null);
  }, [id, name]);

  async function rename(e: FormEvent) {
    e.preventDefault();
    try {
      await wardrobesApi.update(id, { name: value.trim() });
      await onChanged();
      setMode('idle');
    } catch (err) {
      setError(err);
    }
  }

  async function remove() {
    try {
      await wardrobesApi.remove(id);
      await onDeleted();
    } catch (err) {
      setError(err);
    }
  }

  if (mode === 'rename') {
    return (
      <form className="inline-form" onSubmit={rename}>
        <input autoFocus value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} aria-label="Nuevo nombre" />
        <button type="submit" className="btn">Guardar</button>
        <button type="button" className="btn btn-ghost" onClick={() => setMode('idle')}>Cancelar</button>
        <ErrorNote error={error} />
      </form>
    );
  }
  if (mode === 'delete') {
    return (
      <div className="inline-form">
        <span className="muted">Se borrarán también sus prendas.</span>
        <button type="button" className="btn btn-danger" onClick={remove}>Eliminar armario</button>
        <button type="button" className="btn btn-ghost" onClick={() => setMode('idle')}>Cancelar</button>
        <ErrorNote error={error} />
      </div>
    );
  }
  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => setMode('rename')}>Renombrar</button>
      <button type="button" className="btn btn-ghost" onClick={() => setMode('delete')}>Eliminar</button>
    </>
  );
}

export function FirstWardrobe({ onCreated, embedded = false }: { onCreated: () => Promise<void>; embedded?: boolean }) {
  const [name, setName] = useState('Armario principal');
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await wardrobesApi.create({ name: name.trim() });
      await onCreated();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <section className={embedded ? 'first-run first-run-embedded' : 'page first-run'}>
      {embedded ? <h2>Empieza por un armario</h2> : <h1>Empieza por un armario</h1>}
      <p className="muted">Un armario agrupa prendas: el de casa, una maleta, la ropa de deporte.</p>
      <form className="inline-form" onSubmit={submit}>
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Nombre del armario" />
        <button type="submit" className="btn btn-primary">Crear armario</button>
      </form>
      <ErrorNote error={error} />
    </section>
  );
}
