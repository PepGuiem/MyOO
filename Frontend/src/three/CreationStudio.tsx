import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import * as THREE from 'three';
import type { CustomDetail, GarmentLike } from '../api/types';
import { t } from '../i18n';
import { LoadingScope } from '../lib/loading';
import { setupRenderer } from './env';
import { Fit, GarmentModel } from './GarmentModel';
import { PhotoPlacer, type PhotoPlacement } from './GarmentViewer';
import { makeFloorPool, setupKeyShadow } from './showcase/studio';

/**
 * Plató del editor de prendas («Nueva prenda» / «Editar prenda»): la prenda
 * flota sobre una peana giratoria con un aro de neón, una sombra de contacto
 * y un charco de luz en el suelo; el fondo (pared del estudio) lo pinta el CSS
 * por detrás del lienzo transparente.
 *
 * Rendimiento: solo se pinta cuando algo cambia (frameloop="demand"): al
 * girar con el ratón, durante la entrada de cámara, con el giro automático
 * encendido o mientras se colocan los gráficos de una foto.
 */

const FOV = 30;
/** Altura del suelo y de la cara de arriba de la peana. */
const FLOOR = -1.04;
const PLINTH_H = 0.05;
const PLINTH_TOP = FLOOR + PLINTH_H;
const PLINTH_R = 0.88;
/** Altura a la que flota la prenda sobre la peana. */
const HOVER = 0.1;
/** Punto al que mira la cámara: algo por debajo del centro, para que se vea la peana. */
const TARGET = new THREE.Vector3(0, -0.12, 0);
/** Alto (px) que ocupan las etiquetas de arriba y la barra de abajo del plató. */
const HUD_PX = 215;
/** Dirección de la vista inicial (de frente y un poco desde arriba). */
const HOME_DIR = new THREE.Vector3(0, 0.1, 1).normalize();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
/** Color de la peana: grafito, como los paneles de la interfaz. */
const PLINTH_COLOR = '#3a3a40';
/** Acento de la app (naranja). Solo en el aro: no ilumina la prenda. */
const NEON = '#ff4d00';

export interface CreationStudioProps {
  garment: GarmentLike;
  /** Gráficos de una foto que colocar sobre la prenda. */
  place?: PhotoPlacement | null;
  onPlaced?: (key: string, details: CustomDetail[]) => void;
  /** Giro automático lento (peana giratoria). */
  spin: boolean;
  /** Cada vez que cambia, la cámara vuelve suavemente a la vista inicial. */
  resetSignal: number;
  /** «Reducir movimiento»: sin entrada de cámara ni giro. */
  reduced: boolean;
}

export function CreationStudio({ garment, place, onPlaced, spin, resetSignal, reduced }: CreationStudioProps) {
  // La sombra de contacto se calcula una vez por forma de prenda (no en cada fotograma).
  const [shadowTick, setShadowTick] = useState(0);
  const bumpShadow = useCallback(() => setShadowTick((n) => n + 1), []);
  const garmentRef = useRef<THREE.Group>(null);

  return (
    <LoadingScope label={t('Cargando modelo 3D…')}>
      <Canvas
        // Mientras se colocan los gráficos de una foto hay que medir la prenda en
        // cada fotograma; el resto del tiempo, solo cuando algo cambia.
        frameloop={place ? 'always' : 'demand'}
        shadows="soft"
        dpr={[1, 2]}
        camera={{ position: TARGET.clone().addScaledVector(HOME_DIR, 4.6).toArray(), fov: FOV, near: 0.05, far: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={setupRenderer}
        role="img"
        aria-label={t('Vista 3D de la prenda')}
      >
        <StageLights />
        <group ref={garmentRef} rotation={[0, -0.35, 0]}>
          <Fit size={1.7}>
            <GarmentModel garment={garment} presentation detail="high" onBuilt={bumpShadow} />
          </Fit>
        </group>
        <FloorFollow subject={garmentRef} onMove={bumpShadow}>
          <Plinth />
          <ContactShadows
            key={shadowTick}
            position={[0, PLINTH_TOP + 0.003, 0]}
            opacity={0.55}
            scale={PLINTH_R * 2.1}
            blur={2.2}
            far={1.2}
            resolution={512}
            color="#050506"
            frames={1}
          />
        </FloorFollow>
        <OrbitControls
          makeDefault
          target={TARGET.toArray()}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.7}
          zoomSpeed={0.6}
          minDistance={2.4}
          maxDistance={8}
          minPolarAngle={Math.PI * 0.2}
          maxPolarAngle={Math.PI * 0.56}
        />
        <StageRig spin={spin} resetSignal={resetSignal} reduced={reduced} />
        {place && onPlaced && <PhotoPlacer request={place} onPlaced={onPlaced} />}
        <Invalidate deps={[garment]} />
      </Canvas>
    </LoadingScope>
  );
}

/**
 * Luces neutras (blancas): principal con sombra suave, relleno bajo y un
 * contraluz que despega la silueta del fondo oscuro. La suma de la luz que
 * llega de frente está calibrada para que el color de la prenda se vea como
 * la muestra del formulario (sin lavarlo ni teñirlo).
 */
function StageLights() {
  const key = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    const light = key.current;
    if (!light) return;
    setupKeyShadow(light, 1.3);
    light.target.position.copy(TARGET);
    scene.add(light.target);
    return () => {
      scene.remove(light.target);
    };
  }, [scene]);
  return (
    <>
      <hemisphereLight args={['#f4f4f4', '#26262a', 0.3]} />
      <directionalLight ref={key} position={[2.4, 3.1, 3.2]} intensity={1.05} color="#ffffff" />
      <directionalLight position={[-3.2, 1.1, 2]} intensity={0.3} color="#f2f4f7" />
      <directionalLight position={[0.5, 2.4, -3.6]} intensity={1.35} color="#ffffff" />
      <directionalLight position={[0, -2, 2.5]} intensity={0.1} />
    </>
  );
}

/** Peana giratoria: disco grafito, aro de neón en el canto y charco de luz en el suelo. */
function Plinth() {
  const parts = useMemo(() => {
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(PLINTH_R, PLINTH_R + 0.03, PLINTH_H, 96, 1),
      new THREE.MeshStandardMaterial({ color: PLINTH_COLOR, roughness: 0.62, metalness: 0.18 }),
    );
    disc.position.y = FLOOR + PLINTH_H / 2;
    disc.receiveShadow = false;
    disc.castShadow = false;

    // Aro de neón en el borde de arriba (material sin luz: no tiñe la prenda).
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(PLINTH_R - 0.004, 0.0048, 8, 160),
      new THREE.MeshBasicMaterial({ color: NEON, toneMapped: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = PLINTH_TOP + 0.001;

    // Línea fina interior, como la marca de una plataforma giratoria.
    const inner = new THREE.Mesh(
      new THREE.RingGeometry(PLINTH_R * 0.8, PLINTH_R * 0.8 + 0.005, 128),
      new THREE.MeshBasicMaterial({ color: '#f1eee9', transparent: true, opacity: 0.12, depthWrite: false }),
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = PLINTH_TOP + 0.0015;

    // Halo naranja muy tenue en el suelo, alrededor de la peana.
    const halo = makeFloorPool(FLOOR, PLINTH_R * 1.55, NEON);
    const haloMat = halo.material as THREE.MeshStandardMaterial;
    haloMat.emissive = new THREE.Color(NEON);
    haloMat.emissiveIntensity = 0.16;
    haloMat.opacity = 0.35;
    halo.position.y = FLOOR + 0.0005;

    // Charco de luz gris que funde el suelo con el fondo.
    const pool = makeFloorPool(FLOOR, 2.4, '#55555c');
    return [pool, halo, disc, ring, inner];
  }, []);

  useEffect(
    () => () => {
      for (const m of parts) {
        m.geometry.dispose();
        const mat = m.material as THREE.Material & { alphaMap?: THREE.Texture | null };
        mat.alphaMap?.dispose();
        mat.dispose();
      }
    },
    [parts],
  );

  return (
    <>
      {parts.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </>
  );
}

/**
 * Sube o baja la peana (y su sombra) hasta justo debajo de la prenda, sea cual
 * sea su forma: Fit la centra en el origen, así que una gorra quedaría muy por
 * encima del suelo. Se mueve el suelo y no la prenda (Fit mide en coordenadas
 * del mundo y no admite que se desplace a su padre). Se mide con las cajas de
 * las geometrías (barato) solo en los fotogramas que se pintan.
 */
function FloorFollow({ subject, onMove, children }: { subject: RefObject<THREE.Group | null>; onMove?: () => void; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const box = useMemo(() => new THREE.Box3(), []);
  useFrame((state) => {
    const g = ref.current;
    const s = subject.current;
    if (!g || !s) return;
    box.setFromObject(s);
    if (box.isEmpty()) return;
    const y = THREE.MathUtils.clamp(box.min.y - HOVER - PLINTH_TOP, -0.25, 0.6);
    if (Math.abs(y - g.position.y) < 1e-3) return;
    g.position.y = y;
    // Ha cambiado de altura: otro fotograma y la sombra de contacto, de nuevo.
    state.invalidate();
    onMove?.();
  });
  return <group ref={ref}>{children}</group>;
}

/** Lo que usamos de OrbitControls (drei lo registra en el estado con makeDefault). */
interface Controls {
  target: THREE.Vector3;
  autoRotate: boolean;
  autoRotateSpeed: number;
  update(): void;
  addEventListener(type: 'start' | 'end', listener: () => void): void;
  removeEventListener(type: 'start' | 'end', listener: () => void): void;
}

/**
 * Cámara del plató:
 * - Distancia según la forma del visor (en uno estrecho, más lejos, para que
 *   no se corten las mangas ni la peana).
 * - Entrada suave al abrir (salvo con «reducir movimiento»).
 * - Vuelta a la vista inicial (resetSignal) y giro automático opcional.
 */
function StageRig({ spin, resetSignal, reduced }: { spin: boolean; resetSignal: number; reduced: boolean }) {
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => Math.max(1, s.size.height));

  // Distancia: que quepan ~2,4 m de ancho (prenda + aire) y, de alto, la prenda
  // con su peana (~2,1 m) en la franja libre entre las etiquetas de arriba y la
  // barra de abajo (~215 px en total): en un visor bajo, la cámara se aleja.
  const distance = useMemo(() => {
    const halfTan = Math.tan(((FOV / 2) * Math.PI) / 180);
    const free = Math.max(0.45, (height - HUD_PX) / height);
    return Math.max(1.2 / (halfTan * (width / height)), 2.1 / free / 2 / halfTan);
  }, [width, height]);
  const home = useMemo(() => TARGET.clone().addScaledVector(HOME_DIR, distance), [distance]);

  const anim = useRef<{ from: THREE.Spherical; to: THREE.Spherical; t: number; dur: number } | null>(null);
  const started = useRef(false);

  const flyTo = (from: THREE.Vector3, dur: number) => {
    const fromS = new THREE.Spherical().setFromVector3(from.clone().sub(TARGET));
    const toS = new THREE.Spherical().setFromVector3(home.clone().sub(TARGET));
    // Giro por el camino más corto.
    const twoPi = Math.PI * 2;
    toS.theta = fromS.theta + ((((toS.theta - fromS.theta) % twoPi) + twoPi + Math.PI) % twoPi) - Math.PI;
    anim.current = { from: fromS, to: toS, t: 0, dur };
    invalidate();
  };

  // Al montar: entrada de cámara. Si cambia el tamaño: misma dirección, distancia nueva.
  useEffect(() => {
    if (!controls) return;
    controls.target.copy(TARGET);
    if (!started.current) {
      started.current = true;
      if (reduced) {
        camera.position.copy(home);
      } else {
        const from = home.clone().sub(TARGET).applyAxisAngle(Y_AXIS, 0.55).multiplyScalar(1.28).add(TARGET);
        from.y += 0.35;
        camera.position.copy(from);
        flyTo(from, 1.5);
      }
    } else if (anim.current) {
      // A mitad de la entrada: que acabe a la distancia nueva.
      anim.current.to.radius = distance;
    } else {
      camera.position.sub(TARGET).setLength(distance).add(TARGET);
    }
    controls.update();
    invalidate();
    // flyTo/home dependen de distance, que ya está en las dependencias.
  }, [controls, distance]);

  // Al tocar la prenda, la entrada de cámara se corta (no pelea con el usuario).
  useEffect(() => {
    if (!controls) return;
    const stop = () => {
      anim.current = null;
    };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  // «Vista inicial»
  useEffect(() => {
    if (!resetSignal || !controls) return;
    if (reduced) {
      anim.current = null;
      camera.position.copy(home);
      controls.update();
      invalidate();
    } else flyTo(camera.position.clone(), 0.9);
  }, [resetSignal]);

  // Giro automático: un fotograma para arrancarlo (luego se pide en cada uno).
  useEffect(() => {
    if (!controls) return;
    controls.autoRotate = spin && !reduced;
    controls.autoRotateSpeed = 1.1;
    invalidate();
  }, [controls, spin, reduced, invalidate]);

  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, delta) => {
    if (!controls) return;
    const a = anim.current;
    if (a) {
      // Por tiempo (con un tope): en un equipo lento acaba a su hora, a saltos.
      a.t = Math.min(1, a.t + Math.min(delta, 0.1) / a.dur);
      const k = 1 - Math.pow(1 - a.t, 3); // ease-out cúbico
      const s = new THREE.Spherical(
        THREE.MathUtils.lerp(a.from.radius, a.to.radius, k),
        THREE.MathUtils.lerp(a.from.phi, a.to.phi, k),
        THREE.MathUtils.lerp(a.from.theta, a.to.theta, k),
      );
      camera.position.copy(tmp.setFromSpherical(s).add(controls.target));
      if (a.t >= 1) anim.current = null;
      state.invalidate();
    }
    if (controls.autoRotate) state.invalidate();
  });

  return null;
}

/** Pide un fotograma cuando cambia algo (con frameloop="demand"). */
function Invalidate({ deps }: { deps: unknown[] }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
  }, deps);
  return null;
}
