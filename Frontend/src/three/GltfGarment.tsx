import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadGltf } from './gltfLoad';
import { Fit } from './GarmentModel';

/**
 * Prenda a partir de un modelo 3D real (.glb / .gltf).
 *
 * Qué se espera del archivo (ver README, sección "Modelos 3D reales"):
 * - Materiales PBR estándar de glTF: baseColor, normal, y occlusion/roughness/
 *   metallic (ORM). Metallic solo en piezas de metal.
 * - Unidades en metros, eje Y hacia arriba, la prenda mirando a +Z.
 * - Para poder cambiar el color desde la web, marca los materiales de tela con
 *   el "extra" de glTF `{"tintable": true}` (en Blender: propiedad
 *   personalizada `tintable` del material). Sin esa marca el color del
 *   archivo se respeta tal cual.
 *
 * Carga progresiva: mientras llega el archivo se ve `fallback` (el modelo
 * procedural); si falla, se sigue viendo `fallback` y se avisa con `onError`.
 */
export function GltfGarment({
  url,
  color,
  fallback,
  fitSize = 1.7,
  onLoaded,
  onError,
}: {
  url: string;
  color: string;
  fallback: ReactNode;
  /** Tamaño al que se escala el modelo (como el procedural). */
  fitSize?: number;
  /** Avisa cuando el modelo está listo y si se le puede cambiar el color. */
  onLoaded?: (info: { tintable: boolean }) => void;
  onError?: (error: Error) => void;
}) {
  const [loaded, setLoaded] = useState<{ url: string; gltf: GLTF } | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let alive = true;
    loadGltf(url).then(
      (gltf) => alive && setLoaded({ url, gltf }),
      (err: unknown) => {
        if (alive) onErrorRef.current?.(err instanceof Error ? err : new Error(String(err)));
      },
    );
    return () => {
      alive = false;
    };
  }, [url]);

  if (!loaded || loaded.url !== url) return <>{fallback}</>;
  return (
    <Fit size={fitSize}>
      <GltfScene gltf={loaded.gltf} color={color} onLoaded={onLoaded} />
    </Fit>
  );
}

function GltfScene({
  gltf,
  color,
  onLoaded,
}: {
  gltf: GLTF;
  color: string;
  onLoaded?: (info: { tintable: boolean }) => void;
}) {

  // Copia propia de la escena y de los materiales teñibles: la caché guarda el
  // original en caché y no queremos modificarlo.
  const { scene, tintable } = useMemo(() => {
    const root = gltf.scene.clone(true);
    const tints: THREE.MeshStandardMaterial[] = [];
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = list.map((m) => {
        const std = m as THREE.MeshStandardMaterial;
        if (!std.userData?.tintable || !('color' in std)) return m;
        const copy = std.clone();
        tints.push(copy);
        return copy;
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    });
    return { scene: root, tintable: tints };
  }, [gltf]);

  useEffect(() => () => tintable.forEach((m) => m.dispose()), [tintable]);
  useEffect(() => onLoaded?.({ tintable: tintable.length > 0 }), [onLoaded, tintable]);

  const target = useMemo(() => new THREE.Color(color), [color]);
  useFrame((state, delta) => {
    let animating = false;
    for (const m of tintable) {
      if (m.color.equals(target)) continue;
      m.color.lerp(target, Math.min(1, delta * 7));
      if (Math.abs(m.color.r - target.r) + Math.abs(m.color.g - target.g) + Math.abs(m.color.b - target.b) < 0.003) {
        m.color.copy(target);
      }
      animating = true;
    }
    if (animating) state.invalidate();
  });

  return <primitive object={scene} />;
}
