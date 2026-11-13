import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import type { GarmentLike, Styling } from '../api/types';
import { useReportLoading } from '../lib/loading';
import { makeBody, type Body } from './body';
import { createClothMotion, makeClothMaterial, setPatternUniforms, stepInertia, swayProfile, type ClothMotion, type PatternUniforms } from './cloth';
import { applySimResult, simPlan } from './clothPlan';
import { GARMENT_ROOT } from './DrawBridge';
import { GarmentDetails } from './GarmentDetails';
import { requestSimulation } from './simClient';
import { useStudioEnv } from './env';
import type { FabricKind } from './fabric';
import { buildGarment, garmentMinY, type GarmentBuild } from './garments';
import { applyStyling, stylingNeeded, type OutfitContext } from './styling';
import { buildLibraryGarment, libraryModel, libraryUrl, loadLibrary, type LibraryDetail, type LibraryPart } from './garmentLibrary';
import { isBlenderModel, LIBRARY_PART_ROLE } from './libraryCatalog';
import { tightenCollar } from './libraryFit';

/** Prendas con escote o cuello que se ciñen al cuello del maniquí. */
const COLLARED = ['tshirt', 'shirt', 'sweater', 'jacket', 'coat', 'dress'];
import { liningColor, partHasPattern, partLook, patternLook } from './partColors';

/** Dirección del viento en el mundo (x, z): sopla de delante-izquierda. */
const WORLD_WIND = new THREE.Vector3(0.75, 0, 0.66).normalize();

/**
 * Dibuja una prenda a partir de su color, tipo (modelKey) y atributos,
 * ajustada al cuerpo `body` (por defecto, la silueta estándar).
 * `layer` separa prendas de la misma categoría al superponerlas.
 * `motion` prepara el movimiento de tela (aproximación visual por shader, no
 * simulación física) y `wind` (0–1) fija su intensidad; al cambiar `wind` el
 * movimiento entra o se apaga suavemente, sin recompilar materiales.
 */
export function GarmentModel({
  garment,
  body,
  layer = 0,
  presentation = false,
  motion = false,
  wind = 1,
  onPick,
  selectedDetailId,
  onSelectDetail,
  onMoveDetail,
  simulate = true,
  simPriority = 0,
  detail = 'low',
  library = true,
  onBuilt,
  styling,
  outfit,
}: {
  garment: GarmentLike;
  body?: Body;
  layer?: number;
  presentation?: boolean;
  motion?: boolean;
  wind?: number;
  /**
   * Clic sobre la tela (sin arrastrar): punto y normal en coordenadas de la
   * prenda. Se usa para colocar detalles.
   */
  onPick?: (point: [number, number, number], normal: [number, number, number]) => void;
  /** Detalle resaltado (editor de personalización). */
  selectedDetailId?: string | null;
  /** Pulsar un detalle colocado (para seleccionarlo). */
  onSelectDetail?: (id: string) => void;
  /**
   * Arrastrar un detalle por la tela: al soltarlo, su punto y normal nuevos en
   * coordenadas de la prenda (como `onPick`). Sin esta función no se arrastra.
   */
  onMoveDetail?: (id: string, point: [number, number, number], normal: [number, number, number]) => void;
  /** Caída simulada de la tela (en segundo plano, ver clothSim.ts). */
  simulate?: boolean;
  /** Prioridad en la cola de simulación (la prenda en grande, antes). */
  simPriority?: number;
  /** Detalle del modelo de la biblioteca: 'low' en miniaturas, 'high' en grande. */
  detail?: LibraryDetail;
  /** Usar el modelo 3D de la biblioteca si hay uno para esta prenda. */
  library?: boolean;
  /** Avisa cuando la prenda ya tiene forma (p. ej. para recalcular sombras). */
  onBuilt?: (build: GarmentBuild) => void;
  /** Solo en outfits: cómo se lleva la prenda y datos del resto del outfit. */
  styling?: Styling;
  outfit?: OutfitContext;
}) {
  const { modelKey } = garment.garmentType;
  const custom = garment.customization;
  const attrsKey = JSON.stringify(garment.attributes ?? {});
  // Solo lo que cambia la FORMA obliga a reconstruir (los colores no).
  const shapeKey = JSON.stringify([custom?.parts ?? {}, custom?.options?.buttonStyle ?? null, custom?.options?.stitchStyle ?? null]);
  const fitBody = body ?? makeBody();

  // ¿Hay un modelo 3D de la biblioteca para esta prenda? (garmentLibrary.ts)
  const entry = useMemo(
    () => (library ? libraryModel(modelKey, garment.attributes ?? {}, custom?.parts) : null),
    // attrsKey y shapeKey representan el contenido de attributes y de las piezas
    [library, modelKey, attrsKey, shapeKey],
  );
  const url = entry ? libraryUrl(entry, detail) : null;
  const [loaded, setLoaded] = useState<{ url: string; parts: LibraryPart[] | null } | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    loadLibrary(url).then(
      (parts) => alive && setLoaded({ url, parts }),
      (err: unknown) => {
        // Si el archivo no carga, seguimos con el modelo generado por código.
        console.warn('No se pudo cargar el modelo 3D', url, err);
        if (alive) setLoaded({ url, parts: null });
      },
    );
    return () => {
      alive = false;
    };
  }, [url]);
  const libParts = url && loaded?.url === url ? loaded.parts : undefined;
  // Icono de carga del escenario mientras llega el modelo 3D
  useReportLoading(!!url && libParts === undefined);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (libParts !== undefined) invalidate();
  }, [libParts, invalidate]);

  const build = useMemo<GarmentBuild | null>(
    () => {
      if (entry && libParts === undefined) return null; // cargando
      const [parts, buttonStyle, stitchStyle] = JSON.parse(shapeKey) as [Record<string, boolean>, never, never];
      if (entry && libParts) {
        // Piezas que el modelo permite quitar (p. ej. los flecos de la bufanda, que
        // son su "ribete", o los cordones y el tirador del calzado).
        const removed = new Set((entry.parts ?? []).filter((k) => parts[k] === false).map((k) => LIBRARY_PART_ROLE[k]));
        for (const role of entry.hidden ?? []) removed.add(role);
        const kept = removed.size ? libParts.filter((p) => !removed.has(p.role)) : libParts;
        return buildLibraryGarment(entry, kept, modelKey, garment.attributes ?? {}, body ?? null, layer);
      }
      // Pantalones y camisetas solo existen como modelos de Blender: si el
      // archivo no carga, no se pinta uno generado por código.
      if (modelKey === 'pants' || (entry && isBlenderModel(entry))) return null;
      const built = buildGarment(modelKey, garment.attributes ?? {}, fitBody, layer, { parts, buttonStyle, stitchStyle });
      // Sobre el maniquí, el escote abraza su cuello (como en los modelos de la biblioteca).
      if (body && COLLARED.includes(modelKey)) tightenCollar(built.parts.map((p) => p.geometry), body, layer);
      return built;
    },
    // attrsKey y shapeKey representan el contenido de attributes y customization
    [entry, libParts, modelKey, attrsKey, shapeKey, fitBody, body, layer],
  );

  const onBuiltRef = useRef(onBuilt);
  onBuiltRef.current = onBuilt;
  useEffect(() => {
    if (build) onBuiltRef.current?.(build);
  }, [build]);

  if (!build) return null;
  return (
    <GarmentMeshes
      build={build}
      garment={garment}
      body={fitBody}
      layer={layer}
      presentation={presentation}
      motion={motion}
      wind={wind}
      onPick={onPick}
      selectedDetailId={selectedDetailId}
      onSelectDetail={onSelectDetail}
      onMoveDetail={onMoveDetail}
      simulate={simulate && !build.library}
      simPriority={simPriority}
      simKey={`${modelKey}|${attrsKey}|${shapeKey}|${fitBody.shape.id}|${fitBody.armSpread}|${layer}`}
      styling={body ? styling : undefined}
      outfit={outfit}
    />
  );
}

/** Dibuja una prenda ya construida (procedural o de la biblioteca). */
function GarmentMeshes({
  build: baseBuild,
  garment,
  body: fitBody,
  layer,
  presentation,
  motion,
  wind,
  onPick,
  selectedDetailId,
  onSelectDetail,
  onMoveDetail,
  simulate,
  simPriority,
  simKey,
  styling,
  outfit,
}: {
  build: GarmentBuild;
  garment: GarmentLike;
  body: Body;
  layer: number;
  presentation: boolean;
  motion: boolean;
  wind: number;
  onPick?: (point: [number, number, number], normal: [number, number, number]) => void;
  selectedDetailId?: string | null;
  onSelectDetail?: (id: string) => void;
  onMoveDetail?: (id: string, point: [number, number, number], normal: [number, number, number]) => void;
  simulate: boolean;
  simPriority: number;
  simKey: string;
  styling?: Styling;
  outfit?: OutfitContext;
}) {
  const { modelKey } = garment.garmentType;
  const custom = garment.customization;

  // Uniforms del movimiento (uno por prenda). null = prenda rígida (calzado...).
  const cloth = useMemo<ClothMotion | null>(() => {
    if (!motion) return null;
    const profile = swayProfile(modelKey, fitBody, baseBuild.fabric, garmentMinY(baseBuild));
    return profile ? createClothMotion(profile) : null;
  }, [motion, modelKey, fitBody, baseBuild]);

  const env = useStudioEnv();

  // Caída simulada: se calcula en un Web Worker y se aplica cuando llega. Mientras
  // tanto se ve la forma diseñada (carga progresiva).
  const [simVersion, setSimVersion] = useState(0);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!simulate) return;
    const plan = simPlan(modelKey, baseBuild, fitBody, layer);
    if (!plan) return;
    let alive = true;
    void requestSimulation(simKey, plan, simPriority).then((positions) => {
      if (!alive || !positions) return;
      applySimResult(baseBuild, positions);
      setSimVersion((v) => v + 1);
      invalidate();
    });
    return () => {
      alive = false;
    };
    // baseBuild ya representa modelKey, atributos, forma y cuerpo
  }, [baseBuild, simulate]);

  // Cómo se lleva en el outfit (por dentro, remangada...): copia deformada.
  // Se rehace al llegar la caída simulada (simVersion).
  const stylingKey = JSON.stringify(styling ?? {});
  const outfitKey = JSON.stringify(outfit ?? null);
  const build = useMemo(
    () => (stylingNeeded(modelKey, styling, outfit) ? applyStyling(baseBuild, modelKey, styling ?? {}, fitBody, outfit ?? { waistY: null, bootTop: null }, layer) : baseBuild),
    // stylingKey y outfitKey representan el contenido de styling y outfit
    [baseBuild, simVersion, stylingKey, outfitKey, modelKey, fitBody, layer],
  );

  // Un material por combinación de papel, tono, tejido y forro (PBR, ver
  // cloth.ts). Los colores se aplican aparte para animar sus cambios.
  const colorKey = JSON.stringify([garment.color, custom?.colors ?? {}, custom?.options?.metal ?? null, custom?.options?.patternSize ?? null, custom?.options?.pattern ?? null, custom?.pattern ?? null]);
  // El estampado (rayas, cuadros...) va en la tela que diga su zona. Ponerlo,
  // quitarlo o cambiar de zona crea materiales nuevos; el resto (textura,
  // colores, giro, tamaño...) se actualiza abajo sin recompilar.
  const patternTarget = useMemo(() => patternLook(garment.color, custom)?.spec.target ?? null, [colorKey]);
  const { materials, partKeys } = useMemo(() => {
    const map = new Map<string, THREE.MeshPhysicalMaterial>();
    const keys: string[] = [];
    const pattern = patternLook(garment.color, custom);
    for (const part of build.parts) {
      const fabric: FabricKind | 'none' = part.metal ? 'none' : (part.fabric ?? build.fabric);
      const look = partLook(garment.color, part, build.fabric, custom);
      const patterned = !!pattern && partHasPattern(part, pattern.spec.target);
      const key = `${look.key}:${fabric}:${part.lined ? 'L' : ''}:${patterned ? 'P' : ''}`;
      keys.push(key);
      if (map.has(key)) continue;
      map.set(
        key,
        makeClothMaterial({
          color: look.color,
          fabric,
          metal: look.metal,
          metalRoughness: look.roughness,
          lining: part.lined ? liningColor(garment.color, custom) : null,
          env,
          motion: cloth,
          triplanar: !!build.library,
          solid: !!build.library,
          pattern: patterned ? pattern : null,
        }),
      );
    }
    return { materials: map, partKeys: keys };
    // El color inicial se fija aquí; los cambios posteriores se animan abajo.
  }, [build, env, cloth, patternTarget]);

  // Transición suave de color: guardamos el color destino de cada material
  // (y de su forro) y lo perseguimos en useFrame.
  const targets = useMemo(() => {
    const t = new Map<THREE.Color, THREE.Color>();
    const look = patternLook(garment.color, custom);
    build.parts.forEach((part, i) => {
      const m = materials.get(partKeys[i]);
      if (!m || t.has(m.color)) return;
      t.set(m.color, partLook(garment.color, part, build.fabric, custom).color);
      const lining = m.userData.lining as { value: THREE.Color } | undefined;
      if (part.lined && lining) t.set(lining.value, liningColor(garment.color, custom));
      const pat = m.userData.pattern as PatternUniforms | undefined;
      if (pat && look) {
        // Textura, giro, tamaño e intensidad, al momento; los colores, con transición.
        setPatternUniforms(pat, look, false);
        [pat.uPatC0, pat.uPatC1, pat.uPatC2, pat.uPatC3].forEach((u, k) => t.set(u.value, look.colors[k] ?? look.colors[0]));
      }
    });
    return t;
    // colorKey representa el contenido de los colores y del estampado
  }, [materials, partKeys, build, colorKey]);
  // Con frameloop="demand", pedimos un fotograma para ver el cambio.
  useEffect(() => invalidate(), [targets, invalidate]);

  // El acabado del metal cambia también su rugosidad.
  useLayoutEffect(() => {
    build.parts.forEach((part, i) => {
      const m = materials.get(partKeys[i]);
      const look = partLook(garment.color, part, build.fabric, custom);
      if (m && look.metal && look.roughness !== undefined) m.roughness = look.roughness;
    });
    // colorKey representa el contenido de los colores y el acabado
  }, [materials, partKeys, build, colorKey]);

  // Movimiento: tiempo, viento en el espacio de la prenda e inercia al girar.
  const group = useRef<THREE.Group>(null);
  const spin = useRef({ last: NaN, x: 0, v: 0 });
  const local = useMemo(() => ({ v: new THREE.Vector3(), q: new THREE.Quaternion(), m: new THREE.Matrix4() }), []);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20);
    let animating = false;
    for (const [current, target] of targets) {
      if (current.equals(target)) continue;
      current.lerp(target, Math.min(1, delta * 7));
      if (Math.abs(current.r - target.r) + Math.abs(current.g - target.g) + Math.abs(current.b - target.b) < 0.003) {
        current.copy(target);
      }
      animating = true;
    }
    if (cloth && group.current) {
      cloth.uTime.value += delta;
      const diff = wind - cloth.uMotion.value;
      cloth.uMotion.value = Math.abs(diff) < 0.002 ? wind : cloth.uMotion.value + diff * Math.min(1, delta * 1.5);
      if (cloth.uMotion.value > 0 || diff !== 0) animating = true;
      updateCloth(cloth, state.camera, group.current, delta);
    }
    // Con frameloop="demand" pedimos más fotogramas mientras algo se anima.
    if (animating) state.invalidate();
  });

  function updateCloth(cloth: ClothMotion, camera: THREE.Camera, g: THREE.Group, delta: number) {
    // Cámara y viento en coordenadas de la prenda.
    local.m.copy(g.matrixWorld).invert();
    local.v.copy(camera.position).applyMatrix4(local.m);
    const angle = Math.atan2(local.v.x, local.v.z);
    const s = spin.current;
    let w = 0;
    if (!Number.isNaN(s.last)) {
      let d = angle - s.last;
      d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      w = d / Math.max(delta, 1e-3);
    }
    s.last = angle;
    stepInertia(s, w, delta);
    cloth.uLag.value = s.x;
    g.getWorldQuaternion(local.q).invert();
    local.v.copy(WORLD_WIND).applyQuaternion(local.q);
    cloth.uWind.value.set(local.v.x, local.v.z).normalize();
  }

  // Liberamos memoria de GPU cuando cambia la prenda o se desmonta.
  useLayoutEffect(
    () => () => {
      const seen = new Set<THREE.BufferGeometry>();
      for (const part of build.parts) {
        if (!seen.has(part.geometry)) part.geometry.dispose();
        seen.add(part.geometry);
      }
    },
    [build],
  );
  useLayoutEffect(
    () => () => {
      for (const part of baseBuild.parts) part.geometry.dispose();
    },
    [baseBuild],
  );
  // (Los normal/roughness maps se comparten entre prendas y no se liberan aquí.)
  useLayoutEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  const handleClick = onPick
    ? (e: ThreeEvent<MouseEvent>) => {
        // Si se arrastró para girar, no es un clic.
        if (e.delta > 6 || !group.current || !e.face) return;
        e.stopPropagation();
        const local = group.current.worldToLocal(e.point.clone());
        // Las piezas son hijas directas del grupo: su normal ya está en coordenadas de la prenda.
        const n = e.face.normal.clone();
        const toCamera = group.current.worldToLocal(e.ray.origin.clone()).sub(local);
        if (n.dot(toCamera) < 0) n.negate();
        const r = (v: number) => Math.round(v * 1e4) / 1e4;
        onPick([r(local.x), r(local.y), r(local.z)], [r(n.x), r(n.y), r(n.z)]);
      }
    : undefined;

  const details = custom?.details ?? [];

  return (
    <group ref={group} name={GARMENT_ROOT} userData={{ modelKey, library: !!build.library }} rotation={presentation ? build.presentation ?? [0, 0, 0] : [0, 0, 0]} onClick={handleClick}>
      {details.length > 0 && (
        <GarmentDetails
          build={build}
          details={details}
          body={fitBody}
          env={env}
          motion={cloth}
          metal={custom?.options?.metal}
          selectedId={selectedDetailId}
          version={simVersion}
          onSelectDetail={onSelectDetail}
          onMoveDetail={onMoveDetail}
        />
      )}
      {build.parts.map((part, i) => (
        <mesh
          key={i}
          geometry={part.geometry}
          material={materials.get(partKeys[i])}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}

/**
 * Escala y centra su contenido para que quepa en una caja de `size` unidades.
 * Así todas las prendas se ven a un tamaño parecido en las miniaturas.
 */
export function Fit({ size = 1.5, children }: { size?: number; children: ReactNode }) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const signature = useRef('');

  const measure = () => {
    if (!outer.current || !inner.current) return false;
    // Firma del contenido: si una prenda termina de cargar, se vuelve a encajar.
    let sig = '';
    inner.current.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) sig += m.geometry.uuid;
    });
    if (sig === signature.current) return false;
    signature.current = sig;
    inner.current.position.set(0, 0, 0);
    outer.current.scale.setScalar(1);
    outer.current.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(inner.current);
    if (box.isEmpty()) return true;
    const dims = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = size / Math.max(dims.x, dims.y, 0.001);
    inner.current.position.set(-center.x, -center.y, -center.z);
    outer.current.scale.setScalar(scale);
    return true;
  };

  useLayoutEffect(() => {
    signature.current = '';
    measure();
  });
  useFrame((state) => {
    if (measure()) state.invalidate();
  });

  return (
    <group ref={outer}>
      <group ref={inner}>{children}</group>
    </group>
  );
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Gira el contenido mientras `active` sea true y vuelve suavemente a la pose
 * inicial al terminar. Respeta "reducir movimiento" del sistema.
 */
export function Turntable({
  active,
  base = -0.35,
  speed = 0.9,
  children,
}: {
  active: boolean;
  base?: number;
  speed?: number;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const reduced = useMemo(prefersReducedMotion, []);

  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    if (active && !reduced) {
      g.rotation.y += delta * speed;
    } else {
      // Vuelve a la pose base por el camino más corto.
      const twoPi = Math.PI * 2;
      const diff = ((((base - g.rotation.y) % twoPi) + twoPi + Math.PI) % twoPi) - Math.PI;
      g.rotation.y += diff * Math.min(1, delta * 6);
    }
  });

  return (
    <group ref={ref} rotation={[0, base, 0]}>
      {children}
    </group>
  );
}

/** Iluminación de estudio neutra, pensada para fondos gris oscuro. */
export function StudioLights({ shadows = false }: { shadows?: boolean }) {
  // Principal algo más baja y menos intensa que antes (desde muy arriba
  // quemaba la cabeza y los hombros del maniquí, que es casi blanco), y un
  // contraluz frío que separa la figura del fondo oscuro.
  return (
    <>
      <hemisphereLight args={['#f4f2ee', '#26262a', 0.5]} />
      <directionalLight
        position={[2.2, 2.9, 3.4]}
        intensity={1.25}
        color="#fff6ec"
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
        shadow-radius={4}
        shadow-camera-left={-1.6}
        shadow-camera-right={1.6}
        shadow-camera-top={2.2}
        shadow-camera-bottom={-0.4}
      />
      <directionalLight position={[-3, 1.4, 1.6]} intensity={0.5} color="#cfd3dc" />
      <directionalLight position={[-1.2, 2.6, -3.2]} intensity={0.9} color="#e8ecff" />
      <directionalLight position={[0, -2, 3]} intensity={0.2} />
    </>
  );
}
