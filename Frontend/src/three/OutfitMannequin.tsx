import { ContactShadows, OrbitControls, PerspectiveCamera, View } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { GarmentCategory, GarmentLike } from '../api/types';
import { makeBody, type BodyShape } from './body';
import { setupRenderer } from './env';
import { GarmentModel, StudioLights, Turntable } from './GarmentModel';
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
    <View className={className}>
      <PerspectiveCamera makeDefault position={[0, EYE_Y, distance]} fov={30} />
      <StudioLights />
      <Turntable active={active} base={-0.3} speed={speed}>
        <Dressed garments={garments} shape={shape} />
      </Turntable>
    </View>
  );
}

/** Escena grande del editor de outfits, con giro lento y control con el ratón. */
/**
 * Escenario con el maniquí vestido. `distance`: lo lejos que empieza la
 * cámara (más cerca = maniquí más grande; el editor de maniquíes lo acerca).
 */
export function OutfitStage({ garments, shape, distance = 4.6 }: { garments: GarmentLike[]; shape?: BodyShape; distance?: number }) {
  const reduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return (
    <LoadingScope label="Vistiendo el maniquí…">
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, EYE_Y + 0.12, distance], fov: 32 }} gl={{ alpha: true }} onCreated={setupRenderer}>
      <StudioLights shadows />
      <group rotation={[0, -0.3, 0]}>
        <Dressed garments={garments} shape={shape} motion={!reduced} detail="high" />
      </group>
      <FloorPool />
      <ContactShadows position={[0, 0.002, 0]} opacity={0.7} scale={2.4} blur={2.2} far={1.2} color="#050506" />
      <OrbitControls
        target={[0, EYE_Y, 0]}
        enablePan={false}
        minDistance={2}
        maxDistance={7}
        maxPolarAngle={Math.PI * 0.55}
        autoRotate={!reduced}
        autoRotateSpeed={0.6}
        makeDefault
      />
    </Canvas>
    </LoadingScope>
  );
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
