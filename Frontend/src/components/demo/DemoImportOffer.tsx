import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { garmentTypesApi, itemsApi, outfitsApi, plansApi, wardrobesApi } from '../../api/endpoints';
import { DEMO_BY_ID, demoPending, demoPlanShortage, type DemoPick } from '../../lib/demoOutfit';
import { ConfirmDialog } from '../fx/ConfirmDialog';
import { useToast } from '../fx/Toast';
import { ErrorNote } from '../ErrorNote';
import { t } from '../../i18n';

/**
 * MODO DEMO, segunda parte: si quien acaba de entrar pulsó «Guardar este
 * outfit» en /demo, se le ofrece crearlo en su cuenta. Usa la API normal (con
 * sesión): crea las prendas en su primer armario (o en uno nuevo) y el outfit
 * con ellas. Antes mira el uso de su plan para no dejarlo a medias; el backend
 * vuelve a comprobar los límites en cada creación.
 */
export function DemoImportOffer({ onWardrobesChanged }: { onWardrobesChanged: () => Promise<void> | void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [picks, setPicks] = useState<DemoPick[] | null>(() => demoPending.read());
  const [name, setName] = useState(() => t('Mi outfit de la demo'));
  const [shortage, setShortage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Lo ya creado si un intento se queda a medias: al reintentar no se duplica.
  const progress = useRef<{ wardrobeId: string | null; items: Record<string, string> }>({ wardrobeId: null, items: {} });

  useEffect(() => {
    if (!picks) return;
    let alive = true;
    Promise.all([plansApi.mine(), wardrobesApi.list()])
      .then(([plan, wardrobes]) => {
        if (alive) setShortage(demoPlanShortage(plan.usage, { items: picks.length, wardrobes: wardrobes.data.length ? 0 : 1 }));
      })
      .catch(() => undefined); // sin dato del plan: se intenta y el backend decide
    return () => {
      alive = false;
    };
  }, [picks]);

  if (!picks) return null;

  const close = () => {
    demoPending.dismiss();
    setPicks(null);
  };

  async function create() {
    if (!picks) return;
    if (shortage) {
      // Sin sitio en el plan: a la página de planes. Lo pendiente sigue en la
      // pestaña y se ofrecerá otra vez la próxima vez que se abra la web.
      setPicks(null);
      navigate('/account');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const types = await garmentTypesApi.list();
      const typeByKey = new Map<string, string>();
      for (const type of types) if (!typeByKey.has(type.modelKey)) typeByKey.set(type.modelKey, type.id);

      let wardrobeId = progress.current.wardrobeId ?? (await wardrobesApi.list()).data[0]?.id ?? null;
      if (!wardrobeId) {
        wardrobeId = (await wardrobesApi.create({ name: t('Mi armario') })).id;
      }
      progress.current.wardrobeId = wardrobeId;

      const itemIds: string[] = [];
      for (const pick of picks) {
        const garment = DEMO_BY_ID.get(pick.id);
        const garmentTypeId = garment && typeByKey.get(garment.modelKey);
        if (!garment || !garmentTypeId) continue; // tipo que este servidor no tiene
        let itemId = progress.current.items[pick.id];
        if (!itemId) {
          const item = await itemsApi.create({ wardrobeId, garmentTypeId, name: garment.name, color: pick.color, attributes: garment.attributes });
          itemId = item.id;
          progress.current.items[pick.id] = itemId;
        }
        itemIds.push(itemId);
      }
      if (!itemIds.length) throw new Error(t('No se pudo crear ninguna prenda del outfit.'));

      const outfit = await outfitsApi.create({
        name: name.trim() || t('Mi outfit de la demo'),
        items: itemIds.map((wardrobeItemId, position) => ({ wardrobeItemId, position })),
      });
      demoPending.clear();
      setPicks(null);
      toast.show(t('«{name}» creado en tu cuenta', { name: outfit.name }), { icon: 'spark', sound: 'success' });
      void onWardrobesChanged();
      navigate(`/outfits/${outfit.id}`);
    } catch (err) {
      setError(err);
      // Si se creó el armario o alguna prenda, que el menú lo enseñe ya.
      if (progress.current.wardrobeId) void onWardrobesChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      title={t('¿Guardamos tu outfit de la demo?')}
      confirmLabel={shortage ? t('Ver planes') : t('Crear outfit')}
      busy={busy}
      onConfirm={() => void create()}
      onClose={close}
    >
      <p>{t('Se añadirán {n} prendas a tu armario y un outfit con ellas.', { n: picks.length })}</p>
      <ul className="chips chips-small" aria-label={t('Prendas del outfit')}>
        {picks.map((p) => (
          <li key={p.id} className="chip">
            <span className="swatch" style={{ background: p.color }} aria-hidden="true" /> {DEMO_BY_ID.get(p.id)?.name}
          </li>
        ))}
      </ul>
      <label className="field">
        <span>{t('Nombre')}</span>
        <input maxLength={80} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      </label>
      {shortage && (
        <p className="note note-error" role="alert">
          {shortage}
        </p>
      )}
      <ErrorNote error={error} />
    </ConfirmDialog>
  );
}
