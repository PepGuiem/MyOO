import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { CustomDetail, GarmentLike } from '../api/types';
import { MAX_DETAIL_SIZE } from '../lib/customLabels';
import { LoadingScope } from '../lib/loading';
import { GARMENT_ROOT } from './DrawBridge';
import { setupRenderer } from './env';
import { Fit, GarmentModel, StudioLights } from './GarmentModel';

const FOV = 32;
const BASE_DISTANCE = 3.8;

/**
 * Aleja la cámara cuando el visor es más alto que ancho: con la distancia fija,
 * en un visor estrecho las mangas se salían por los lados.
 */
function FitWidth() {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  useEffect(() => {
    const halfTan = Math.tan(((FOV / 2) * Math.PI) / 180);
    const needed = 1.0 / (halfTan * aspect); // media anchura visible de ~1 m (prenda de 1,7 m + margen)
    const d = Math.max(BASE_DISTANCE, needed);
    camera.position.setLength(d);
    camera.updateProjectionMatrix();
  }, [camera, aspect]);
  return null;
}

/** Gráficos recortados de una foto que hay que colocar sobre la prenda. */
export interface PhotoPlacement {
  key: string;
  /** Tipo de prenda que tiene que estar en el visor antes de colocarlos. */
  modelKey: string;
  /** ¿Se espera el modelo de Blender (y no el generado mientras carga)? */
  library: boolean;
  graphics: { assetId: string; u: number; v: number; w: number; h: number; color: string }[];
}

/**
 * Coloca los gráficos de la foto en la prenda del visor: cuando el modelo ya
 * ha cargado (su tamaño no cambia durante unos fotogramas), proyecta cada
 * gráfico de frente, en la misma posición relativa que tenía en la foto.
 */
export function PhotoPlacer({ request, onPlaced }: { request: PhotoPlacement; onPlaced: (key: string, details: CustomDetail[]) => void }) {
  const scene = useThree((s) => s.scene);
  const st = useRef({ key: '', sig: '', stable: 0, since: 0 });
  useFrame(({ clock }) => {
    const s = st.current;
    if (s.key === request.key) return;
    const root = scene.getObjectByName(GARMENT_ROOT);
    if (!root || root.userData.modelKey !== request.modelKey || (request.library && !root.userData.library)) {
      s.stable = 0;
      return;
    }
    root.updateWorldMatrix(true, true);
    const inv = root.matrixWorld.clone().invert();
    // Solo la tela (las piezas son hijas directas; los detalles van aparte)
    const meshes = root.children.filter((o): o is THREE.Mesh => (o as THREE.Mesh).isMesh && o.visible);
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    const rel = new THREE.Matrix4();
    for (const m of meshes) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      tmp.copy(m.geometry.boundingBox!).applyMatrix4(rel.multiplyMatrices(inv, m.matrixWorld));
      box.union(tmp);
    }
    if (box.isEmpty()) return;
    const sig = [...box.min.toArray(), ...box.max.toArray()].map((v) => v.toFixed(3)).join(',');
    if (sig !== s.sig) {
      s.sig = sig;
      s.stable = 0;
      s.since = clock.elapsedTime;
      return;
    }
    if (++s.stable < 8 || clock.elapsedTime - s.since < 0.6) return;
    s.key = request.key;
    const size = box.getSize(new THREE.Vector3());
    const cx = (box.min.x + box.max.x) / 2;
    const ray = new THREE.Raycaster();
    const details: CustomDetail[] = [];
    request.graphics.forEach((g, i) => {
      const origin = new THREE.Vector3(cx + (g.u - 0.5) * size.x, box.max.y - g.v * size.y, box.max.z + 0.3).applyMatrix4(root.matrixWorld);
      const dir = new THREE.Vector3(0, 0, -1).transformDirection(root.matrixWorld);
      ray.set(origin, dir);
      const hit = ray.intersectObjects(meshes, false)[0];
      if (!hit || !hit.face) return;
      const p = hit.point.clone().applyMatrix4(inv);
      const n = hit.face.normal.clone();
      if (n.z < 0) n.negate();
      const r = (v: number) => Math.round(v * 1e4) / 1e4;
      details.push({
        id: `ph${i}${Date.now().toString(36)}`,
        kind: 'print',
        position: [r(p.x), r(p.y), r(p.z)],
        normal: [r(n.x), r(n.y), r(n.z)],
        rotation: 0,
        size: r(Math.min(MAX_DETAIL_SIZE, Math.max(0.02, Math.max(g.w * size.x, g.h * size.y)))),
        color: g.color,
        assetId: g.assetId,
      });
    });
    onPlaced(request.key, details);
  });
  return null;
}

/** Visor grande con su propio Canvas: se puede girar arrastrando. */
export function GarmentViewer({
  garment,
  place,
  onPlaced,
}: {
  garment: GarmentLike;
  /** Gráficos de una foto que colocar sobre la prenda (formulario de prenda). */
  place?: PhotoPlacement | null;
  onPlaced?: (key: string, details: CustomDetail[]) => void;
}) {
  return (
    <LoadingScope label="Cargando modelo 3D…">
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0.2, BASE_DISTANCE], fov: FOV }} gl={{ alpha: true }} onCreated={setupRenderer}>
      <FitWidth />
      <StudioLights shadows />
      <group rotation={[0, -0.35, 0]}>
        <Fit size={1.7}>
          <GarmentModel garment={garment} presentation detail="high" />
        </Fit>
      </group>
      <ContactShadows position={[0, -1.05, 0]} opacity={0.45} scale={4} blur={2.4} far={2} />
      <OrbitControls enablePan={false} minDistance={2.4} maxDistance={8} makeDefault />
      {place && onPlaced && <PhotoPlacer request={place} onPlaced={onPlaced} />}
    </Canvas>
    </LoadingScope>
  );
}
