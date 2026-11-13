/**
 * Estudio fotográfico del visor (código puro de three.js, sin React):
 * - Fondo "ciclorama": suelo que sube en curva hasta la pared, sin esquina,
 *   como en un plató de fotografía de moda. Recibe las sombras.
 * - Luz principal con sombras suaves (la prenda se sombrea a sí misma:
 *   el cuello sobre el pecho, las mangas sobre el torso, los pliegues).
 * - Oclusión ambiental en pantalla (GTAO) para el contacto entre capas,
 *   pliegues profundos y costuras.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { paramSurface } from '../surface';

/**
 * Color (albedo) del plató. Es más claro que el gris de la interfaz porque
 * la luz lo oscurece: una vez iluminado queda en el mismo tono.
 */
export const STUDIO_COLOR = '#6b6b6e';

/**
 * Ciclorama: suelo plano delante, curva de radio `cove` y pared detrás.
 * `floorY` es la altura del suelo; `back` la distancia de la pared.
 */
export function makeCyclorama(floorY: number, back = 2.2, cove = 1.4, color: THREE.ColorRepresentation = STUDIO_COLOR): THREE.Mesh {
  const width = 14;
  const zFront = 5;
  const wall = 6;
  // Perfil (z, y): suelo -> curva de radio `cove` -> pared en z = -back
  const zc = -back + cove;
  const l1 = zFront - zc;
  const l2 = (Math.PI / 2) * cove;
  const total = l1 + l2 + wall;
  const g = paramSurface({
    rows: 64,
    cols: 2,
    closed: false,
    point: (u, phi) => {
      const x = (phi - 0.5) * width;
      const d = u * total;
      if (d <= l1) return [x, floorY, zFront - d];
      if (d <= l1 + l2) {
        const a = (d - l1) / cove;
        return [x, floorY + cove - Math.cos(a) * cove, zc - Math.sin(a) * cove];
      }
      return [x, floorY + cove + (d - l1 - l2), -back];
    },
  });
  g.deleteAttribute('color');
  // Las caras miran hacia la cámara (+Z / +Y).
  g.computeVertexNormals();
  const n = g.getAttribute('normal');
  if (n.getY(0) < 0) {
    const idx = g.getIndex()!;
    const arr = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = t;
    }
    g.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({ color, roughness: 0.96, metalness: 0 }),
  );
  mesh.receiveShadow = true;
  mesh.name = 'cyclorama';
  return mesh;
}

/** Ajusta la luz principal para sombras suaves y nítidas sobre la prenda. */
export function setupKeyShadow(light: THREE.DirectionalLight, radius = 1.4): void {
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  const cam = light.shadow.camera;
  cam.left = -radius;
  cam.right = radius;
  cam.top = radius;
  cam.bottom = -radius;
  cam.near = 0.5;
  cam.far = 12;
  cam.updateProjectionMatrix();
  // Sin "acné" en la tela fina y sin que la sombra se despegue del contacto
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.012;
  light.shadow.radius = 3;
}

export interface StudioComposer {
  composer: EffectComposer;
  ao: GTAOPass;
  setSize: (w: number, h: number, pixelRatio: number) => void;
  dispose: () => void;
}

/** Render con oclusión ambiental (GTAO) y salida con mapeo de tono. */
export function makeStudioComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): StudioComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, width, height);
  ao.output = GTAOPass.OUTPUT.Default;
  ao.blendIntensity = 0.85;
  ao.updateGtaoMaterial({ radius: 0.09, distanceExponent: 1.6, thickness: 0.6, scale: 1.15, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  composer.addPass(ao);
  composer.addPass(new OutputPass());
  return {
    composer,
    ao,
    setSize: (w, h, pr) => {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
    },
    dispose: () => {
      ao.dispose();
      composer.dispose();
    },
  };
}

/**
 * Charco de luz en el suelo bajo el maniquí: un disco con un degradado radial
 * que se funde con el fondo. Ancla la figura (sin él parecía flotar en el
 * fondo oscuro) sin dibujar un suelo con bordes.
 */
export function makeFloorPool(floorY: number, radius = 1.3, color: THREE.ColorRepresentation = '#6a6a70'): THREE.Mesh {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) / size - 0.5;
      const y = (j + 0.5) / size - 0.5;
      const r = Math.min(1, Math.hypot(x, y) * 2);
      // Caída suave (gaussiana) hasta 0 en el borde.
      const a = Math.exp(-r * r * 3.2) * (1 - r * r);
      const k = (j * size + i) * 4;
      data[k] = data[k + 1] = data[k + 2] = 255;
      data[k + 3] = Math.round(Math.max(0, a) * 255);
    }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, alphaMap: tex, transparent: true, depthWrite: false });
  // El mapa alfa usa el canal verde: copiamos la opacidad ahí.
  for (let k = 0; k < data.length; k += 4) data[k + 1] = data[k + 3];
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = floorY - 0.001;
  mesh.receiveShadow = true;
  mesh.renderOrder = -1;
  mesh.userData.noShadow = true;
  mesh.name = 'floor-pool';
  return mesh;
}
