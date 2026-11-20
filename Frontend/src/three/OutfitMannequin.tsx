import { ContactShadows, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import type { GarmentCategory, GarmentLike } from '../api/types';
import { makeBody, type BodyShape } from './body';
import { setupRenderer } from './env';
import { GarmentModel, StudioLights, Turntable } from './GarmentModel';
import { SceneView } from './SceneView';
import type { GarmentBuild } from './garments';
import type { OutfitContext } from './styling';
import { FRONT_GAP, jacketForStyling, libraryModel } from './libraryCatalog';
import { Mannequin } from './Mannequin';
import { LoadingScope } from '../lib/loading';
import { makeFloorPool } from './showcase/studio';

/**
 * Viste el maniquí. Cada prenda se genera para ESTE cuerpo, así que encaja en
 * cualquier silueta. Las capas exteriores (abrigos) ya tienen más holgura;
 * si hay dos prendas de la misma categoría, la segunda va un poco más por fuera.
 *
 * Algunos estilos dependen del resto del outfit: "por dentro" necesita la
 * cintura del pantalón y "metido en las botas", la altura de la caña. Cada
 * prenda avisa de su forma al construirse (onBuilt) y de ahí se sacan.
 */
/** ¿La prenda de abrigo se lleva abierta (por diseño del modelo o por estilo)? */
function wornOpen(garment: GarmentLike): boolean {
  const front = garment.styling?.front;
  if (front === 'closed') return false;
  if (front === 'open' || front === 'top_open') return true;
  if (garment.attributes?.closure === 'open') return true;
  const entry = libraryModel(garment.garmentType.modelKey, garment.attributes ?? {}, garment.customization?.parts);
  return !!entry && entry.file in FRONT_GAP;
}

function Dressed({ garments, shape, motion = false, detail = 'low' }: { garments: GarmentLike[]; shape?: BodyShape; motion?: boolean; detail?: 'low' | 'high' }) {
  // Brazos algo más separados que en el visor: las mangas caen por fuera del
  // pantalón en lugar de atravesarlo a la altura de la cadera.
  const body = makeBody(shape, OUTFIT_ARM_SPREAD);
  const layered = useMemo(() => {
    const perCategory: Partial<Record<GarmentCategory, number>> = {};
    // La ropa de abrigo va por encima de todo lo de arriba (camisetas, camisas,
    // jerséis, vestidos): si no, una camiseta de la biblioteca asomaba por los
    // hombros de una chaqueta generada por código, que tenía la misma capa.
    const under = garments.filter((g) => g.garmentType.category === 'TOP' || g.garmentType.category === 'FULL_BODY').length;
    return garments.map((raw) => {
      // Chaquetas de Blender: abrir o cerrar la delantera cambia de modelo.
      const garment = jacketForStyling(raw);
      const cat = garment.garmentType.category;
      const index = perCategory[cat] ?? 0;
      perCategory[cat] = index + 1;
      const layer = cat === 'OUTERWEAR' ? Math.min(3, under + index) : index;
      return { garment, layer };
    });
  }, [garments]);

  // Altura superior de cada prenda (por índice), para la cintura y las botas.
  const [tops, setTops] = useState<Record<number, number>>({});
  const [hems, setHems] = useState<Record<number, number>>({});
  const report = useCallback((i: number, build: GarmentBuild) => {
    const top = garmentTopY(build);
    if (top !== null) setTops((prev) => (Math.abs((prev[i] ?? -1) - top) < 1e-4 ? prev : { ...prev, [i]: top }));
    const hem = garmentHemY(build);
    if (hem !== null) setHems((prev) => (Math.abs((prev[i] ?? -1) - hem) < 1e-4 ? prev : { ...prev, [i]: hem }));
  }, []);
  const outfit = useMemo<OutfitContext>(() => {
    let waistY: number | null = null;
    let bootTop: number | null = null;
    let coverY: number | null = null;
    layered.forEach(({ garment }, i) => {
      // Bajo de la parte de arriba que va por fuera (tapa la cintura del pantalón).
      const hem = hems[i];
      const cat = garment.garmentType.category;
      const tuck = garment.styling?.tuck;
      // Una chaqueta o abrigo abierto deja ver el pantalón por delante: solo
      // cuenta si va cerrado.
      const covers = cat === 'TOP' || (cat === 'OUTERWEAR' && !wornOpen(garment));
      if (hem !== undefined && covers && (!tuck || tuck === 'out')) {
        coverY = coverY === null ? hem : Math.min(coverY, hem);
      }
      const top = tops[i];
      if (top === undefined) return;
      const key = garment.garmentType.modelKey;
      if (garment.garmentType.category === 'BOTTOM' && key !== 'underwear') waistY = Math.max(waistY ?? -Infinity, top - 0.006);
      if (key === 'boots') bootTop = Math.max(bootTop ?? -Infinity, top - 0.004);
    });
    // Si alguna va metida (aunque sea en parte), el pantalón se ve: no se ciñe.
    const anyTucked = layered.some(({ garment }) => garment.styling?.tuck && garment.styling.tuck !== 'out');
    return { waistY, bootTop, coverY: anyTucked ? null : coverY };
  }, [layered, tops, hems]);

  return (
    <group>
      <Mannequin body={body} detail={detail} />
      {layered.map(({ garment, layer }, i) => (
        <GarmentModel
          key={i}
          garment={garment}
          body={body}
          layer={layer}
          motion={motion}
          detail={detail}
          styling={garment.styling}
          outfit={outfit}
          onBuilt={(b) => report(i, b)}
        />
      ))}
    </group>
  );
}

/**
 * Altura del borde superior de una prenda. No es el punto más alto: las
 * trabillas o un cordón sobresalen de la pretina; se toma la altura que
 * deja por encima solo el 2,5 % de los vértices.
 */
function garmentTopY(build: GarmentBuild): number | null {
  const ys: number[] = [];
  for (const part of build.parts) {
    const pos = part.geometry.getAttribute('position');
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) ys.push(pos.getY(i));
  }
  if (!ys.length) return null;
  ys.sort((a, b) => a - b);
  return ys[Math.min(ys.length - 1, Math.floor(ys.length * 0.975))];
}

/**
 * Altura del bajo de una prenda de arriba: el punto más bajo cerca del centro
 * (delante o detrás), para no confundirlo con los puños de las mangas.
 */
function garmentHemY(build: GarmentBuild): number | null {
  let min = Infinity;
  for (const part of build.parts) {
    const pos = part.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getX(i)) < 0.08 && pos.getY(i) < min) min = pos.getY(i);
  }
  return Number.isFinite(min) ? min : null;
}

/** Separación extra de los brazos en los outfits (rad, unos 5°). */
const OUTFIT_ARM_SPREAD = 0.09;

// Encuadre fijo (sin autoescalar), para que se note la diferencia entre
// un maniquí alto y uno bajo. Los pies están en y = 0.
const EYE_Y = 0.95;

/** Miniatura de un outfit para las listas (usa el ViewCanvas compartido). */
export function OutfitView({
  garments,
  shape,
  active,
  className,
  speed = 0.7,
  distance = 4.7,
}: {
  garments: GarmentLike[];
  shape?: BodyShape;
  active: boolean;
  className?: string;
  /** Velocidad del giro (rad/s) mientras está activa. */
  speed?: number;
  /** Distancia de la cámara (más cerca = maniquí más grande). */
  distance?: number;
}) {
  return (
    <SceneView className={className}>
      <PerspectiveCamera makeDefault position={[0, EYE_Y, distance]} fov={30} />
      <StudioLights />
      <Turntable active={active} base={-0.3} speed={speed}>
        <Dressed garments={garments} shape={shape} />
      </Turntable>
    </SceneView>
  );
}

/** Escena grande del editor de outfits, con giro lento y control con el ratón. */
/**
 * Escenario con el maniquí vestido. `distance`: lo lejos que empieza la
 * cámara (más cerca = maniquí más grande; el editor de maniquíes lo acerca).
 */
export function OutfitStage({
  garments,
  shape,
  distance = 4.6,
  rig,
}: {
  garments: GarmentLike[];
  shape?: BodyShape;
  distance?: number;
  /** Control de cámara desde fuera (vistas, zoom y giro); opcional. */
  rig?: StageRig;
}) {
  const reduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const spin = rig ? rig.spin : true;
  return (
    <LoadingScope label="Vistiendo el maniquí…">
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, EYE_Y + 0.12, distance], fov: 32 }} gl={{ alpha: true }} onCreated={setupRenderer}>
      <StudioLights shadows />
      <group rotation={[0, BASE_TURN, 0]}>
        <IdleSway active={!!rig && !spin && !reduced}>
          <Dressed garments={garments} shape={shape} motion={!reduced} detail="high" />
        </IdleSway>
      </group>
      {rig && <CameraRig rig={rig} instant={!!reduced} />}
      <FloorPool />
      <ContactShadows position={[0, 0.002, 0]} opacity={0.7} scale={2.4} blur={2.2} far={1.2} color="#050506" />
      <OrbitControls
        target={[0, EYE_Y, 0]}
        enablePan={false}
        minDistance={2}
        maxDistance={7}
        maxPolarAngle={Math.PI * 0.55}
        autoRotate={!reduced && spin}
        autoRotateSpeed={0.6}
        makeDefault
      />
    </Canvas>
    </LoadingScope>
  );
}

/** Giro inicial del maniquí (de tres cuartos). */
const BASE_TURN = -0.3;

export type StageView = 'front' | 'side' | 'back';

/**
 * Mando de la cámara del escenario: `viewTick` y `zoomTick` cambian para
 * pedir una vista (frente, lado o espalda) o un paso de zoom (`zoomDir`).
 */
export interface StageRig {
  view: StageView | null;
  viewTick: number;
  zoomDir: 1 | -1 | 0;
  zoomTick: number;
  spin: boolean;
}

/** Ángulo de cámara (azimut) para ver el maniquí de frente, de lado o de espaldas. */
const VIEW_ANGLE: Record<StageView, number> = {
  front: BASE_TURN,
  side: BASE_TURN + Math.PI / 2,
  back: BASE_TURN + Math.PI,
};

/** Lo que usamos de OrbitControls (three-stdlib). */
interface Orbit {
  target: THREE.Vector3;
  getAzimuthalAngle(): number;
  setAzimuthalAngle(angle: number): void;
  update(): boolean;
  addEventListener(type: 'start', listener: () => void): void;
  removeEventListener(type: 'start', listener: () => void): void;
}

/** Lleva la cámara con suavidad a la vista o al zoom pedidos. */
function CameraRig({ rig, instant }: { rig: StageRig; instant: boolean }) {
  const controls = useThree((s) => s.controls) as unknown as Orbit | null;
  const camera = useThree((s) => s.camera);
  const goal = useRef<{ az: number | null; dist: number | null }>({ az: null, dist: null });

  useEffect(() => {
    if (rig.view) goal.current.az = VIEW_ANGLE[rig.view];
  }, [rig.view, rig.viewTick]);

  // Si la persona arrastra o hace zoom, manda su gesto: se sueltan los destinos.
  useEffect(() => {
    if (!controls) return;
    const stop = () => {
      goal.current.az = null;
      goal.current.dist = null;
    };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useEffect(() => {
    if (!controls || !rig.zoomDir) return;
    const d = camera.position.distanceTo(controls.target);
    goal.current.dist = Math.min(7, Math.max(2, d * (rig.zoomDir > 0 ? 0.8 : 1.25)));
    // Solo cuando se pide un paso nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rig.zoomTick]);

  useFrame((_, dt) => {
    if (!controls) return;
    const k = instant ? 1 : 1 - Math.exp(-dt * 7);
    const g = goal.current;
    if (g.az !== null) {
      const cur = controls.getAzimuthalAngle();
      const delta = Math.atan2(Math.sin(g.az - cur), Math.cos(g.az - cur));
      if (Math.abs(delta) < 0.003) {
        controls.setAzimuthalAngle(g.az);
        g.az = null;
      } else controls.setAzimuthalAngle(cur + delta * k);
    }
    if (g.dist !== null) {
      const off = camera.position.clone().sub(controls.target);
      const d = off.length();
      const next = d + (g.dist - d) * k;
      off.setLength(next);
      camera.position.copy(controls.target).add(off);
      controls.update();
      if (Math.abs(next - g.dist) < 0.01) g.dist = null;
    }
  });
  return null;
}

/** Balanceo muy suave del maniquí cuando no gira (como si respirara). */
function IdleSway({ active, children }: { active: boolean; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const target = active ? Math.sin(clock.elapsedTime * 0.55) * 0.045 : 0;
    g.rotation.y += (target - g.rotation.y) * 0.08;
  });
  return <group ref={ref}>{children}</group>;
}

/** Charco de luz en el suelo: ancla al maniquí (antes parecía flotar). */
function FloorPool() {
  const mesh = useMemo(() => makeFloorPool(0), []);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      const m = mesh.material as THREE.MeshStandardMaterial;
      m.alphaMap?.dispose();
      m.dispose();
    },
    [mesh],
  );
  return <primitive object={mesh} />;
}
