import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { decalOrientation } from './details';

/** Nombre del grupo de la prenda (sus coordenadas son las de los detalles). */
export const GARMENT_ROOT = 'garment-root';

type Vec3 = [number, number, number];

/** Dónde queda un dibujo hecho sobre la pantalla, en coordenadas de la prenda. */
export interface DrawProjection {
  position: Vec3;
  /** Dirección desde la que se dibujó (hacia la cámara). */
  normal: Vec3;
  /** Lado mayor del dibujo (m). */
  size: number;
  rotation: number;
}

/** Recuadro y puntos del dibujo, en píxeles de la ventana (clientX/Y). */
export interface DrawFootprint {
  rect: { left: number; top: number; width: number; height: number };
  samples: { x: number; y: number }[];
}

export type DrawProjector = (footprint: DrawFootprint) => DrawProjection | null;

const MAX_SAMPLES = 240;

/**
 * Dentro del Canvas: ofrece una función que lleva un dibujo hecho en una capa
 * 2D encima del visor a la prenda. El dibujo se proyecta desde la cámara, como
 * un proyector: el centro del recuadro, a la profundidad de la tela que hay
 * debajo de los trazos, y su tamaño real a esa distancia.
 */
export function DrawBridge({ onReady }: { onReady: (projector: DrawProjector | null) => void }) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const projector: DrawProjector = ({ rect, samples }) => {
      const root = scene.getObjectByName(GARMENT_ROOT);
      if (!root) return null;
      root.updateWorldMatrix(true, true);
      camera.updateMatrixWorld();
      const box = gl.domElement.getBoundingClientRect();
      if (!box.width || !box.height) return null;
      const ndc = (x: number, y: number) => new THREE.Vector2(((x - box.left) / box.width) * 2 - 1, -((y - box.top) / box.height) * 2 + 1);
      const camPos = camera.getWorldPosition(new THREE.Vector3());
      const forward = camera.getWorldDirection(new THREE.Vector3());
      /** Profundidad (a lo largo de la mirada) de la tela bajo un punto de la pantalla. */
      const depthAt = (x: number, y: number): number | null => {
        raycaster.setFromCamera(ndc(x, y), camera);
        const hit = raycaster.intersectObject(root, true).find((h) => (h.object as THREE.Mesh).isMesh && h.object.visible);
        return hit ? hit.point.clone().sub(camPos).dot(forward) : null;
      };
      const rayAt = (x: number, y: number, depth: number) => {
        raycaster.setFromCamera(ndc(x, y), camera);
        const d = raycaster.ray.direction;
        return camPos.clone().addScaledVector(d, depth / Math.max(1e-4, d.dot(forward)));
      };

      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let depth = depthAt(cx, cy);
      if (depth === null) {
        // El centro cae fuera de la prenda: la profundidad típica de los trazos.
        const step = Math.max(1, Math.floor(samples.length / MAX_SAMPLES));
        const depths: number[] = [];
        for (let i = 0; i < samples.length; i += step) {
          const dd = depthAt(samples[i].x, samples[i].y);
          if (dd !== null) depths.push(dd);
        }
        if (!depths.length) return null;
        depths.sort((a, b) => a - b);
        depth = depths[Math.floor(depths.length / 2)];
      }

      const center = rayAt(cx, cy, depth);
      const left = rayAt(rect.left, cy, depth);
      const right = rayAt(rect.left + rect.width, cy, depth);
      const top = rayAt(cx, rect.top, depth);
      const bottom = rayAt(cx, rect.top + rect.height, depth);
      const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));

      // A coordenadas de la prenda (el grupo puede estar girado y escalado).
      const toLocal = (v: THREE.Vector3) => root.worldToLocal(v.clone());
      const p = toLocal(center);
      const w = toLocal(right).distanceTo(toLocal(left));
      const h = toLocal(bottom).distanceTo(toLocal(top));
      const n = toLocal(center.clone().sub(forward)).sub(p).normalize();
      const up = toLocal(center.clone().add(camUp)).sub(p);
      up.addScaledVector(n, -up.dot(n)).normalize();

      // Giro para que el «arriba» del dibujo sea el de la pantalla.
      const q0 = new THREE.Quaternion().setFromEuler(decalOrientation(n, 0));
      const up0 = new THREE.Vector3(0, 1, 0).applyQuaternion(q0);
      const rotation = Math.atan2(n.dot(new THREE.Vector3().crossVectors(up0, up)), up0.dot(up));

      const r = (v: number) => Math.round(v * 1e4) / 1e4;
      return {
        position: [r(p.x), r(p.y), r(p.z)],
        normal: [r(n.x), r(n.y), r(n.z)],
        size: r(Math.max(w, h)),
        rotation: r(rotation),
      };
    };
    onReady(projector);
    return () => onReady(null);
  }, [scene, camera, gl, onReady]);

  return null;
}
