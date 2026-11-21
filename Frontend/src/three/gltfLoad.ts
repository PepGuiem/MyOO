import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Carga de .glb con caché propia (en vez de useGLTF de drei): un archivo que
 * falla es un caso esperado, así que no lanzamos el error dentro de React
 * (R3F lo mostraría en consola como "no capturado"); lo avisamos con
 * `onError` y seguimos mostrando el modelo procedural.
 *
 * Compresión admitida:
 * - Meshopt (EXT_meshopt_compression): decodificador incluido, no hace falta nada.
 * - Draco (KHR_draco_mesh_compression): copia la carpeta
 *   node_modules/three/examples/jsm/libs/draco/gltf/ a public/draco/
 *   (no se descarga nada de CDNs externos).
 */
let loader: GLTFLoader | null = null;
function gltfLoader(): GLTFLoader {
  if (!loader) {
    const draco = new DRACOLoader().setDecoderPath('/draco/');
    loader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

const cache = new Map<string, Promise<GLTF>>();
export function loadGltf(url: string): Promise<GLTF> {
  let p = cache.get(url);
  if (!p) {
    p = gltfLoader().loadAsync(url);
    // Si falla, se quita de la caché para poder reintentar en otra visita.
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

/**
 * Carga sin guardar el resultado en la caché de arriba. Para quien guarda su
 * propia versión ya procesada (garmentLibrary.ts): así no quedan en memoria
 * dos copias de cada modelo (la original decodificada y la preparada).
 */
export function loadGltfUncached(url: string): Promise<GLTF> {
  const hit = cache.get(url);
  return hit ?? gltfLoader().loadAsync(url);
}
