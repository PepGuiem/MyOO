import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useReportLoading } from '../lib/loading';
import * as THREE from 'three';
import { buildMannequin, handFrame, type Body, type Limb } from './body';
import { useStudioEnv } from './env';
import { loadLibrary, type LibraryPart } from './garmentLibrary';
import { fitGeometry } from './libraryFit';
import { makeStand } from './mannequinStand';

/**
 * Piezas esculpidas del maniquí (generador: `prendas_casual_glb/generador`):
 * - cuerpo: tronco, brazos y piernas, en el espacio del cuerpo de referencia y
 *   con los brazos a BODY_ARM_DEG; se ajusta a cada silueta con la región `body`
 *   de libraryFit (como las prendas);
 * - cabeza con cuello (región `head`, como las gorras);
 * - mano derecha (muñeca en el origen, dedos hacia −Y, dorso hacia +X y pulgar
 *   hacia +Z). La izquierda es su reflejo.
 * Cada pieza tiene su versión ligera en `lod/` (miniaturas).
 *
 * Hay dos juegos con las mismas medidas (las prendas encajan igual en los dos):
 * - `tienda` (por defecto): maniquí de escaparate genérico, cabeza «huevo» sin
 *   rasgos ni pelo, cuerpo liso y dedos juntos (tienda.py);
 * - `realista`: con cara, pelo, orejas y anatomía (cuerpo.py, cabeza.py).
 */
const BASE = '/models/maniqui/';
const BODY_ARM_DEG = 18;

type Style = 'tienda' | 'realista';
const STYLE: Style = 'tienda';
const FILES: Record<Style, { body: string; bodyF: string; head: string; headF: string; hand: string }> = {
  tienda: {
    body: 'cuerpo_tienda.glb',
    bodyF: 'cuerpo_tienda_f.glb',
    head: 'cabeza_tienda.glb',
    headF: 'cabeza_tienda_f.glb',
    hand: 'mano_tienda.glb',
  },
  realista: { body: 'cuerpo.glb', bodyF: 'cuerpo_f.glb', head: 'cabeza.glb', headF: 'cabeza_f.glb', hand: 'mano.glb' },
};

/** Acabado de escaparate: fibra lacada en blanco roto, satinada. */
const FINISH = {
  tienda: { color: '#E7E6E2', roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.22, envMapIntensity: 0.7 },
  realista: { color: '#D7D6D2', roughness: 0.62, clearcoat: 0.12, clearcoatRoughness: 0.6, envMapIntensity: 0.45 },
}[STYLE];

type Detail = 'low' | 'high';
interface Sculpted {
  body: LibraryPart[] | null;
  head: LibraryPart[];
  hand: LibraryPart[];
}

const url = (name: string, detail: Detail) => BASE + (detail === 'low' ? 'lod/' : '') + name;

function useSculpted(detail: Detail, sex: 'male' | 'female'): Sculpted | null {
  const [parts, setParts] = useState<{ key: string; parts: Sculpted } | null>(null);
  const [pending, setPending] = useState(true);
  const key = `${sex}|${detail}`;
  // Icono de carga del escenario mientras llega el maniquí
  useReportLoading(pending);
  useEffect(() => {
    let alive = true;
    setPending(true);
    const f = FILES[STYLE];
    Promise.all([
      // Sin cuerpo esculpido (archivo antiguo) se usa el cuerpo liso generado por código.
      loadLibrary(url(sex === 'female' ? f.bodyF : f.body, detail)).catch(() => null),
      loadLibrary(url(sex === 'female' ? f.headF : f.head, detail)),
      loadLibrary(url(f.hand, detail)),
    ]).then(
      ([body, head, hand]) => alive && setParts({ key, parts: { body, head, hand } }),
      (err: unknown) => console.warn('No se pudo cargar el maniquí esculpido; se usa el liso', err),
    ).finally(() => {
      if (alive) setPending(false);
    });
    return () => {
      alive = false;
    };
  }, [detail, sex, key]);
  // Mientras carga el otro maniquí (al cambiar de silueta) se ve el liso, no el anterior.
  return parts?.key === key ? parts.parts : null;
}

/** Cuerpo esculpido ajustado a cada silueta: una vez por cuerpo y archivo. */
const fittedCache = new WeakMap<Body, Map<THREE.BufferGeometry, THREE.BufferGeometry>>();
function fittedBody(base: THREE.BufferGeometry, body: Body): THREE.BufferGeometry {
  let byBase = fittedCache.get(body);
  if (!byBase) {
    byBase = new Map();
    fittedCache.set(body, byBase);
  }
  let g = byBase.get(base);
  if (!g) {
    g = withAoColor(fitGeometry(base, body, { region: 'body', fit: 1, layer: 0, armDeg: BODY_ARM_DEG }));
    g.userData.shared = true;
    byBase.set(base, g);
  }
  return g;
}

/** Oclusión del archivo (atributo `ao`) como color de vértice. */
function withAoColor(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ao = g.getAttribute('ao') as THREE.BufferAttribute | undefined;
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = ao ? 0.35 + 0.65 * ao.getX(i) : 1;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Coloca la mano esculpida en la muñeca de `arm`, con el tamaño del cuerpo. */
function placeHand(base: THREE.BufferGeometry, body: Body, arm: Limb): THREE.BufferGeometry {
  const g = base.clone();
  const { wrist, dir, out, front } = handFrame(arm);
  // Algo más grande que la mano esculpida (se veía pequeña para el cuerpo).
  const k = body.shape.sex === 'female' ? 0.96 : 1.06;
  const kLen = body.s * k;
  const kW = Math.sqrt(body.limb) * (0.9 + 0.1 * body.s) * k;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    p.copy(wrist)
      .addScaledVector(dir, -y * kLen)
      .addScaledVector(out, x * kW)
      .addScaledVector(front, z * kW);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  // La mano izquierda es un reflejo: hay que dar la vuelta a los triángulos.
  if (arm.side < 0 && g.index) {
    const idx = g.index.array as Uint32Array | Uint16Array;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t + 1];
      idx[t + 1] = idx[t + 2];
      idx[t + 2] = a;
    }
    g.index.needsUpdate = true;
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Maniquí de escaparate: cuerpo, cabeza y manos esculpidos, ajustados a la
 * silueta `body`, sobre su peana (`stand`). Mientras cargan se ve el maniquí liso
 * generado por código. `detail` = 'low' usa las versiones ligeras (miniaturas).
 */
export function Mannequin({ body, detail = 'high', stand = true }: { body: Body; detail?: Detail; stand?: boolean }) {
  const env = useStudioEnv();
  const sculpted = useSculpted(detail, body.shape.sex);
  const invalidate = useThree((s) => s.invalidate);
  // Cuerpo liso generado por código mientras carga el esculpido (o si falta).
  const geometries = useMemo(
    () => (sculpted?.body ? [] : buildMannequin(body, { sculpted: !!sculpted })),
    [body, sculpted],
  );
  const extra = useMemo(() => {
    if (!sculpted) return [];
    const out: THREE.BufferGeometry[] = [];
    if (sculpted.body) for (const part of sculpted.body) out.push(fittedBody(part.geometry, body));
    for (const part of sculpted.head) out.push(withAoColor(fitGeometry(part.geometry, body, { region: 'head', fit: 1, layer: 0 })));
    for (const arm of body.arms) for (const part of sculpted.hand) out.push(withAoColor(placeHand(part.geometry, body, arm)));
    return out;
  }, [sculpted, body]);
  useEffect(() => {
    if (sculpted) invalidate();
  }, [sculpted, invalidate]);

  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        ...FINISH,
        sheen: 0.15,
        sheenRoughness: 0.8,
        envMap: env,
        side: THREE.DoubleSide,
      }),
    [env],
  );

  const standGeo = useMemo(() => (stand ? makeStand(body, detail) : null), [stand, body, detail]);
  const standMaterials = useMemo(
    () => ({
      // peana de metal pavonado y varilla de acero cepillado
      base: new THREE.MeshPhysicalMaterial({ color: '#1d1d20', metalness: 0.85, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15, envMap: env, envMapIntensity: 0.8 }),
      rod: new THREE.MeshStandardMaterial({ color: '#b7b7bc', metalness: 1, roughness: 0.25, envMap: env, envMapIntensity: 1 }),
    }),
    [env],
  );
  useLayoutEffect(
    () => () => {
      standGeo?.base.dispose();
      standGeo?.rod.dispose();
    },
    [standGeo],
  );
  useLayoutEffect(
    () => () => {
      standMaterials.base.dispose();
      standMaterials.rod.dispose();
    },
    [standMaterials],
  );
  const sculptMaterial = useMemo(() => {
    const m = material.clone();
    m.vertexColors = true;
    return m;
  }, [material]);

  useLayoutEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  // El cuerpo ajustado se comparte entre maniquíes (caché por silueta): no se libera.
  useLayoutEffect(() => () => extra.forEach((g) => !g.userData.shared && g.dispose()), [extra]);
  useLayoutEffect(
    () => () => {
      material.dispose();
      sculptMaterial.dispose();
    },
    [material, sculptMaterial],
  );

  return (
    <group>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g} material={material} castShadow receiveShadow />
      ))}
      {extra.map((g, i) => (
        <mesh key={`s${i}`} geometry={g} material={sculptMaterial} castShadow receiveShadow />
      ))}
      {standGeo && (
        <>
          <mesh geometry={standGeo.base} material={standMaterials.base} receiveShadow />
          <mesh geometry={standGeo.rod} material={standMaterials.rod} castShadow />
        </>
      )}
    </group>
  );
}
