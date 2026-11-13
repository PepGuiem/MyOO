import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Entorno de estudio para reflejos suaves (iluminación basada en imagen).
 * Se genera por código con RoomEnvironment, sin descargar archivos HDR,
 * y se calcula una sola vez por renderer.
 */
const cache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

export function useStudioEnv(): THREE.Texture {
  const gl = useThree((s) => s.gl);
  let tex = cache.get(gl);
  if (!tex) {
    const pmrem = new THREE.PMREMGenerator(gl);
    tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    cache.set(gl, tex);
  }
  return tex;
}

/** Ajustes de color del renderer: mapeo neutro, que respeta el color elegido. */
export function setupRenderer({ gl }: { gl: THREE.WebGLRenderer }): void {
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1;
}
