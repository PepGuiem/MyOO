import { ContactShadows, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { makeCyclorama, makeStudioComposer, setupKeyShadow } from './studio';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GarmentLike } from '../../api/types';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { makeBody, type BodyShape } from '../body';
import { setupRenderer } from '../env';
import { Fit, GarmentModel } from '../GarmentModel';
import { GltfGarment } from '../GltfGarment';
import { Mannequin } from '../Mannequin';
import { DrawBridge, type DrawProjector } from '../DrawBridge';
import { LoadingScope } from '../../lib/loading';

export type StageMode = 'garment' | 'mannequin';

export interface ShowcaseStageProps {
  garment: GarmentLike;
  /** Si hay un .glb real, se usa en el modo "prenda". */
  modelUrl: string | null;
  /** Color que se está previsualizando (puede no ser el guardado). */
  color: string;
  mode: StageMode;
  shape: BodyShape;
  wind: boolean;
  autoRotate: boolean;
  reduced: boolean;
  /** false = fuera de pantalla o pestaña oculta: no se pinta nada. */
  active: boolean;
  /** Cada vez que cambia, la cámara vuelve suavemente a la vista inicial. */
  resetSignal: number;
  onModelLoaded?: (info: { tintable: boolean }) => void;
  onModelError?: (error: Error) => void;
  /** Clic sobre la prenda (modo "prenda"): para colocar detalles. */
  onPick?: (point: [number, number, number], normal: [number, number, number]) => void;
  selectedDetailId?: string | null;
  /** Pulsar / arrastrar un detalle colocado (modo "prenda", al personalizar). */
  onSelectDetail?: (id: string) => void;
  onMoveDetail?: (id: string, point: [number, number, number], normal: [number, number, number]) => void;
  /** Recibe la función que lleva un dibujo hecho sobre el visor a la prenda. */
  onDrawProjector?: (projector: DrawProjector | null) => void;
}

/** Encuadres: posición de cámara y punto al que mira. */
const VIEWS: Record<StageMode, { home: THREE.Vector3; target: THREE.Vector3; floor: number }> = {
  garment: { home: new THREE.Vector3(0, 0.12, 4.1), target: new THREE.Vector3(0, 0, 0), floor: -0.86 },
  mannequin: { home: new THREE.Vector3(0, 1.1, 4.3), target: new THREE.Vector3(0, 0.95, 0), floor: 0 },
};

/**
 * Escenario del visor de prenda: un Canvas propio con iluminación de estudio
 * (principal, relleno y contraluz), sombra de contacto, cámara orbital con
 * inercia, giro automático que se pausa al interactuar, y calidad adaptativa.
 */
export function ShowcaseStage(p: ShowcaseStageProps) {
  const view = VIEWS[p.mode];
  const maxDpr = typeof window === 'undefined' ? 1.5 : Math.min(2, window.devicePixelRatio || 1);
  const [dpr, setDpr] = useState(maxDpr);
  // Oclusión ambiental: se apaga sola si el equipo no llega a buena fluidez.
  const [fx, setFx] = useState(true);
  // La sombra de contacto se calcula una vez; al llegar el .glb se recalcula.
  const [shadowTick, setShadowTick] = useState(0);
  // La sombra de contacto se pinta una vez: se repite cuando la prenda cambia de forma.
  const bumpShadow = useCallback(() => setShadowTick((t) => t + 1), []);
  const { onModelLoaded } = p;
  const handleLoaded = useCallback(
    (info: { tintable: boolean }) => {
      setShadowTick((t) => t + 1);
      onModelLoaded?.(info);
    },
    [onModelLoaded],
  );

  return (
    <LoadingScope label="Cargando modelo 3D…">
    <Canvas
      // Solo se pinta cuando hace falta (al moverse algo) y nunca fuera de pantalla.
      frameloop={p.active ? 'demand' : 'never'}
      // Sombras suaves: la prenda se sombrea a sí misma y sobre el suelo.
      shadows="soft"
      dpr={dpr}
      camera={{ position: view.home.toArray(), fov: 30, near: 0.05, far: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={setupRenderer}
      role="img"
      aria-label="Vista 3D de la prenda"
    >
      <PerformanceMonitor
        // Si los FPS bajan, reducimos la resolución (y luego quitamos la
        // oclusión ambiental); si sobran, la subimos.
        onDecline={() => (dpr > 1 ? setDpr(1) : setFx(false))}
        onIncline={() => setDpr(maxDpr)}
        flipflops={3}
        onFallback={() => {
          setDpr(1);
          setFx(false);
        }}
      />
      <ShowcaseLights target={view.target} />
      <Cyclorama floor={view.floor} />
      <PostFX enabled={fx} />
      <Subject {...p} onModelLoaded={handleLoaded} onBuilt={bumpShadow} />
      <ContactShadows
        key={`${p.mode}:${p.modelUrl ?? ''}:${shadowTick}`}
        position={[0, view.floor + 0.002, 0]}
        opacity={0.38}
        scale={p.mode === 'mannequin' ? 2.6 : 3.2}
        blur={2.6}
        far={1.6}
        resolution={512}
        color="#050506"
        // La sombra se calcula una vez por prenda (la cámara gira, la prenda no).
        frames={1}
      />
      <OrbitControls
        makeDefault
        target={view.target.toArray()}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.7}
        zoomSpeed={0.6}
        minDistance={p.mode === 'mannequin' ? 1.4 : 1.5}
        maxDistance={p.mode === 'mannequin' ? 6.5 : 6}
        minPolarAngle={Math.PI * 0.18}
        maxPolarAngle={Math.PI * 0.62}
      />
      <CameraRig
        key={p.mode}
        home={view.home}
        target={view.target}
        resetSignal={p.resetSignal}
        autoRotate={p.autoRotate}
        reduced={p.reduced}
      />
      {p.onDrawProjector && <DrawBridge onReady={p.onDrawProjector} />}
      <Invalidate deps={[p.active, p.color, p.mode, p.wind, p.shape.id, dpr]} />
    </Canvas>
    </LoadingScope>
  );
}

/** Lo que se muestra: la prenda sola (procedural o .glb) o sobre el maniquí. */
function Subject(p: ShowcaseStageProps & { onBuilt?: () => void }) {
  const garment = useMemo(() => ({ ...p.garment, color: p.color }), [p.garment, p.color]);
  const wind = p.wind ? 1 : 0;

  if (p.mode === 'mannequin') {
    const body = makeBody(p.shape);
    return (
      <group rotation={[0, -0.3, 0]}>
        <Mannequin body={body} />
        <GarmentModel garment={garment} body={body} motion wind={wind} simPriority={10} detail="high" onBuilt={p.onBuilt} />
      </group>
    );
  }

  const procedural = (
    <Fit size={1.7}>
      <GarmentModel
        garment={garment}
        presentation
        motion
        wind={wind}
        simPriority={10}
        detail="high"
        onBuilt={p.onBuilt}
        onPick={p.onPick}
        selectedDetailId={p.selectedDetailId}
        onSelectDetail={p.onSelectDetail}
        onMoveDetail={p.onMoveDetail}
      />
    </Fit>
  );

  return (
    <group rotation={[0, -0.3, 0]}>
      {p.modelUrl ? (
        // El ErrorBoundary cubre errores inesperados al pintar el archivo; un
        // archivo que no carga lo gestiona GltfGarment (onError) sin lanzar.
        <ErrorBoundary key={p.modelUrl} resetKey={p.modelUrl} fallback={procedural} onError={p.onModelError}>
          {/* Carga progresiva: mientras llega el .glb se ve el modelo procedural. */}
          <GltfGarment
            url={p.modelUrl}
            color={p.color}
            fallback={procedural}
            onLoaded={p.onModelLoaded}
            onError={p.onModelError}
          />
        </ErrorBoundary>
      ) : (
        procedural
      )}
    </group>
  );
}

/**
 * Iluminación de estudio: luz principal cálida y suave, relleno frío para no
 * perder detalle en las sombras, contraluz para separar la prenda del fondo.
 * Los reflejos suaves salen del entorno (RoomEnvironment, ver env.ts).
 */
export function ShowcaseLights({ target }: { target: THREE.Vector3 }) {
  const key = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    const light = key.current;
    if (!light) return;
    setupKeyShadow(light, 1.4);
    light.position.set(target.x + 2.6, target.y + 3.4, target.z + 2.8);
    light.target.position.copy(target);
    scene.add(light.target);
    return () => {
      scene.remove(light.target);
    };
  }, [target, scene]);
  return (
    <>
      <hemisphereLight args={['#f1efe9', '#2a2a2c', 0.42]} />
      {/* Principal: cálida, suave y con sombras */}
      <directionalLight ref={key} intensity={1.65} color="#fff4e8" />
      {/* Relleno: frío y bajo, para no perder detalle en las sombras */}
      <directionalLight position={[-3.2, 1.2, 1.8]} intensity={0.55} color="#d6deeb" />
      {/* Contraluz: separa la prenda del fondo */}
      <directionalLight position={[0.6, 2.6, -3.6]} intensity={1.5} color="#eef1ff" />
      <directionalLight position={[0, -2, 2.5]} intensity={0.18} />
    </>
  );
}

/** Plató de fotografía: suelo y pared unidos en curva, que recibe las sombras. */
function Cyclorama({ floor }: { floor: number }) {
  const mesh = useMemo(() => makeCyclorama(floor), [floor]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
    [mesh],
  );
  return <primitive object={mesh} />;
}

/**
 * Render con oclusión ambiental (GTAO). Con prioridad 1 en useFrame, R3F deja
 * de pintar por su cuenta y pintamos nosotros (con o sin efecto).
 */
function PostFX({ enabled }: { enabled: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const viewportDpr = useThree((s) => s.viewport.dpr);
  const studio = useMemo(
    () => (enabled ? makeStudioComposer(gl, scene, camera, size.width, size.height) : null),
    // El tamaño se ajusta aparte (setSize) sin recrear el compositor.
    [enabled, gl, scene, camera],
  );
  useEffect(() => {
    studio?.setSize(size.width, size.height, viewportDpr);
  }, [studio, size, viewportDpr]);
  useEffect(() => () => studio?.dispose(), [studio]);
  useFrame(() => {
    if (studio) studio.composer.render();
    else gl.render(scene, camera);
  }, 1);
  return null;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);

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
 * Cámara: entrada cinematográfica al abrir, vuelta suave a la vista inicial
 * (resetSignal) y giro automático lento que se pausa mientras el usuario
 * interactúa y se reanuda tras unos segundos sin tocar nada.
 */
function CameraRig({
  home,
  target,
  resetSignal,
  autoRotate,
  reduced,
}: {
  home: THREE.Vector3;
  target: THREE.Vector3;
  resetSignal: number;
  autoRotate: boolean;
  reduced: boolean;
}) {
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  const anim = useRef<{ from: THREE.Spherical; fromTarget: THREE.Vector3; to: THREE.Spherical; t: number; dur: number } | null>(null);
  const idle = useRef({ interacting: false, last: 0, speed: 0 });

  const startFlight = (from: THREE.Vector3, fromTarget: THREE.Vector3, dur: number) => {
    const fromS = new THREE.Spherical().setFromVector3(from.clone().sub(fromTarget));
    const toS = new THREE.Spherical().setFromVector3(home.clone().sub(target));
    // Giro por el camino más corto.
    const twoPi = Math.PI * 2;
    toS.theta = fromS.theta + ((((toS.theta - fromS.theta) % twoPi) + twoPi + Math.PI) % twoPi) - Math.PI;
    anim.current = { from: fromS, fromTarget: fromTarget.clone(), to: toS, t: 0, dur };
    invalidate();
  };

  const jumpHome = () => {
    if (!controls) return;
    anim.current = null;
    camera.position.copy(home);
    controls.target.copy(target);
    controls.update();
    invalidate();
  };

  // Al montar: eventos de interacción, gestos táctiles y entrada de cámara.
  useEffect(() => {
    if (!controls) return;
    // OrbitControls bloquea todos los gestos táctiles; dejamos el desplazamiento
    // vertical al navegador para no romper el scroll de la página en móvil
    // (girar = arrastrar en horizontal; acercar = pellizcar).
    gl.domElement.style.touchAction = 'pan-y';
    const onStart = () => {
      idle.current.interacting = true;
      anim.current = null;
    };
    const onEnd = () => {
      idle.current.interacting = false;
      idle.current.last = performance.now();
      invalidate();
    };
    controls.addEventListener('start', onStart);
    controls.addEventListener('end', onEnd);

    if (reduced) jumpHome();
    else {
      const from = home.clone().sub(target).applyAxisAngle(Y_AXIS, 0.7).multiplyScalar(1.35).add(target);
      from.y += 0.45;
      controls.target.copy(target);
      startFlight(from, target, 1.8);
    }
    return () => {
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
    };
    // Solo al montar (o si cambian los controles).
  }, [controls]);

  // Restablecer vista.
  useEffect(() => {
    if (!resetSignal || !controls) return;
    if (reduced) jumpHome();
    else startFlight(camera.position.clone(), controls.target.clone(), 1.1);
  }, [resetSignal]);

  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, delta) => {
    if (!controls) return;
    const a = anim.current;
    if (a) {
      a.t = Math.min(1, a.t + delta / a.dur);
      const k = a.t < 1 ? 1 - Math.pow(1 - a.t, 3) : 1; // ease-out cúbico
      const s = new THREE.Spherical(
        THREE.MathUtils.lerp(a.from.radius, a.to.radius, k),
        THREE.MathUtils.lerp(a.from.phi, a.to.phi, k),
        THREE.MathUtils.lerp(a.from.theta, a.to.theta, k),
      );
      controls.target.lerpVectors(a.fromTarget, target, k);
      camera.position.copy(tmp.setFromSpherical(s).add(controls.target));
      if (a.t >= 1) anim.current = null;
      state.invalidate();
    }

    // Giro automático: entra y sale con suavidad (sin tirones).
    const i = idle.current;
    const wanted = autoRotate && !reduced && !anim.current && !i.interacting && performance.now() - i.last > 2500 ? 1 : 0;
    i.speed += (wanted - i.speed) * Math.min(1, delta * 1.2);
    if (i.speed < 0.002 && wanted === 0) i.speed = 0;
    controls.autoRotate = i.speed > 0;
    controls.autoRotateSpeed = 0.6 * i.speed;
    if (controls.autoRotate) state.invalidate();
    // Si el giro está esperando a que pase el tiempo de reposo, seguimos
    // pidiendo fotogramas para poder reanudarlo.
    else if (autoRotate && !reduced && !i.interacting) state.invalidate();
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
