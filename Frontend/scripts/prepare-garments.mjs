#!/usr/bin/env node
/**
 * Prepara los modelos 3D de prendas (.glb) para la web.
 *
 * Uso (desde la carpeta Frontend):
 *   node scripts/prepare-garments.mjs [entrada] [salida] [triángulos de la versión ligera] [fracción de la alta]
 *   (por defecto: ../prendas_3d_glb  ->  public/models/prendas)
 *
 * Para cada archivo de entrada genera dos versiones:
 *   salida/<nombre>.glb       detalle alto (visor de prenda, maniquí grande)
 *   salida/lod/<nombre>.glb   detalle bajo (miniaturas del armario y outfits)
 *
 * Qué hace:
 *  1. Hornea la OCLUSIÓN AMBIENTAL por vértice con trazado de rayos (los
 *     pliegues, axilas, cuello e interior de la prenda quedan en sombra) y la
 *     guarda en COLOR_0. La web la combina con su propio sombreado.
 *  2. Simplifica la malla (meshoptimizer) con un error máximo en metros, así
 *     se conservan costuras y pliegues.
 *  3. Cuantiza (KHR_mesh_quantization) y comprime (EXT_meshopt_compression).
 *     El visor ya trae el decodificador; no hace falta nada más.
 *  4. Marca el material de tela como teñible ({"tintable": true}) para que la
 *     web pueda cambiarle el color.
 *
 *  5. Relieve horneado en Blender (opcional): si en `<salida>/tex/` hay mapas
 *     normales de la prenda (los prepara scripts/prepare-textures.py), se
 *     conservan las UV de las piezas con textura (TEXCOORD_0, y su máscara en el
 *     canal alfa de COLOR_0) y se apuntan los mapas en `asset.extras.detail`.
 *     Qué piezas llevan textura: las que tienen `normalTexture` en el propio
 *     archivo (calzado) o, con `--pbr=<carpeta>`, las que coinciden con las
 *     piezas texturizadas de `<carpeta>/<nombre>_pbr.glb` (sudaderas v2).
 *
 * Opciones: `--pbr=<carpeta>` (ver 5), `--rib=<expresión>` (mallas de canalé
 * de la versión PBR, por nombre; ver ribPattern), `--tex=<carpeta>` (dónde están los
 * mapas; por defecto `<salida>/tex`) y `--only=<nombre>[,<nombre>...]` (solo
 * esos archivos; el resto del catálogo se conserva).
 *
 * Si el archivo trae varios materiales con `extras.role` (botones, cremallera,
 * vivos, remaches...), cada papel se conserva como una primitiva con su
 * material, para que la web los coloree por separado. La oclusión se calcula
 * con todas las piezas juntas.
 *
 * Los archivos originales no se modifican. Usa paquetes que ya están en
 * node_modules como dependencias de drei (meshoptimizer y three-mesh-bvh).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh/src/index.js';
import { MeshoptEncoder } from 'meshoptimizer/meshopt_encoder.module.js';
import { MeshoptSimplifier } from 'meshoptimizer/meshopt_simplifier.module.js';

// Argumentos: los que empiezan por -- son opciones (--pbr=..., --tex=...); el resto, por orden.
const FLAGS = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...v] = a.slice(2).split('=');
      return [k, v.join('=') || 'true'];
    }),
);
const ARGS = [null, null, ...process.argv.slice(2).filter((a) => !a.startsWith('--'))];
const IN = resolve(ARGS[2] ?? '../prendas_3d_glb');
const OUT = resolve(ARGS[3] ?? 'public/models/prendas');
const PBR_DIR = FLAGS.pbr ? resolve(FLAGS.pbr) : null;
const TEX_DIR = resolve(FLAGS.tex ?? join(OUT, 'tex'));
/** Tamaños de los mapas de relieve (prepare-textures.py): 512 para miniaturas, 1024 de cerca. */
const DETAIL_SIZES = [512, 1024];

/** Niveles de detalle: triángulos objetivo (fracción o número) y error máximo (m). */
// El tercer argumento (opcional) cambia los triángulos de la versión ligera
// (el maniquí entero necesita más que una prenda) y el cuarto, la fracción de
// triángulos que se queda la versión alta (0,55 por defecto; las camisetas de
// Blender, muy densas, con 0,25).
const LODS = [
  { dir: '', ratio: Number(ARGS[5]) || 0.55, error: 0.00035 },
  // Error máximo 1,2 mm: con 4 mm la cara de fuera de la tela (que solo está a
  // 4 mm de la de dentro) se hundía por detrás de ella y se veían manchas oscuras.
  { dir: 'lod', tris: Number(ARGS[4]) || 20000, error: 0.0012 },
];

const AO_RAYS = 24;
const AO_NEAR = 0.05; // oclusión cercana: pliegues, costuras, axilas
const AO_FAR = 0.3; // oclusión lejana: interior de la prenda, bajo la capucha
// Los rayos salen algo separados de la superficie (2 mm): con 0,8 mm, en los
// bajos y puños (donde la tela con grosor se dobla hacia dentro) muchos
// nacían dentro del grosor y chocaban con la capa interior: motas oscuras.
const AO_OFFSET = 0.002;
// Choques que no cuentan como oclusión si están a menos de esto: con la cara
// trasera de un triángulo (el rayo salió por dentro del grosor de la tela) o
// casi paralelos al rayo (rozan la tela vecina en los cantos doblados).
const AO_SELF = 0.008;

// ---------------------------------------------------------------------------
// Lectura del .glb (posición, normal e índices de cada primitiva)
// ---------------------------------------------------------------------------

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const ARRAYS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

/**
 * Lee un .glb. `ref` (opcional): posiciones de las piezas con textura de su
 * versión PBR de Blender (y de qué tipo: 1 tela, 2 canalé), para saber qué
 * piezas de este archivo la llevan. `rib` (opcional): expresión que dice qué
 * mallas (por nombre) son de canalé.
 *
 * `mask` por vértice: 0 sin relieve, 1 con relieve, 2 con relieve y canalé.
 */
function readGlb(path, ref = null, rib = null) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: no es un .glb`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLen));
  if (json.extensionsRequired?.length) throw new Error(`${path}: ya está comprimido (${json.extensionsRequired.join(', ')})`);

  const read = (index) => {
    const acc = json.accessors[index];
    const view = json.bufferViews[acc.bufferView];
    const Arr = ARRAYS[acc.componentType];
    const n = COMPONENTS[acc.type];
    const stride = view.byteStride ?? n * Arr.BYTES_PER_ELEMENT;
    const out = new Float64Array(acc.count * n);
    // Accesores normalizados (UV cuantizadas, colores): a 0..1 / -1..1.
    const norm = acc.normalized ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[acc.componentType] : 0;
    const dv = new DataView(bin.buffer, bin.byteOffset + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0));
    const get = {
      5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o), 5122: (o) => dv.getInt16(o, true),
      5123: (o) => dv.getUint16(o, true), 5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true),
    }[acc.componentType];
    for (let i = 0; i < acc.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = get(i * stride + k * Arr.BYTES_PER_ELEMENT);
    if (norm) for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, out[i] / norm);
    return out;
  };

  // Unimos todas las primitivas en una sola malla (aplicando la matriz de cada nodo)
  // y apuntamos qué triángulos son de cada papel (material con extras.role).
  const positions = [];
  const normals = [];
  const indices = [];
  const triRole = [];
  const uvs = [];
  const mask = [];
  let base = 0;
  const roleOf = (prim) => {
    const mat = prim.material !== undefined ? json.materials?.[prim.material] : undefined;
    const role = typeof mat?.extras?.role === 'string' ? mat.extras.role : 'body';
    // La etiqueta interior (sudaderas v2) va con la tela: en la web no tiene color propio.
    return role === 'label' ? 'body' : role;
  };
  const visit = (nodeIndex, parent) => {
    const node = json.nodes[nodeIndex];
    const m = new THREE.Matrix4();
    if (node.matrix) m.fromArray(node.matrix);
    else m.compose(new THREE.Vector3(...(node.translation ?? [0, 0, 0])), new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(node.scale ?? [1, 1, 1])));
    const world = parent.clone().multiply(m);
    const nm = new THREE.Matrix3().getNormalMatrix(world);
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        if ((prim.mode ?? 4) !== 4) continue;
        const P = read(prim.attributes.POSITION);
        const N = prim.attributes.NORMAL !== undefined ? read(prim.attributes.NORMAL) : null;
        const count = P.length / 3;
        const v = new THREE.Vector3();
        for (let i = 0; i < count; i++) {
          v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(world);
          positions.push(v.x, v.y, v.z);
          if (N) {
            v.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]).applyMatrix3(nm).normalize();
            normals.push(v.x, v.y, v.z);
          } else normals.push(0, 0, 0);
        }
        // UV del relieve horneado: las del normalTexture del material o, si se
        // da `ref`, TEXCOORD_0 de las piezas que coinciden con las texturizadas.
        const mat = prim.material !== undefined ? json.materials?.[prim.material] : undefined;
        let uvSet = mat?.normalTexture ? (mat.normalTexture.texCoord ?? 0) : -1;
        let kinds = null;
        if (uvSet < 0 && ref && prim.attributes.TEXCOORD_0 !== undefined) {
          let hits = 0;
          kinds = new Uint8Array(count);
          const T0 = read(prim.attributes.TEXCOORD_0);
          for (let i = 0; i < count; i++) {
            v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(world);
            const k = ref.get(posKey(v.x, v.y, v.z, T0[i * 2], T0[i * 2 + 1]));
            if (k) hits++;
            kinds[i] = k || 1;
          }
          if (hits >= count * 0.5) uvSet = 0;
        }
        const UV = uvSet >= 0 && prim.attributes[`TEXCOORD_${uvSet}`] !== undefined ? read(prim.attributes[`TEXCOORD_${uvSet}`]) : null;
        const ribMesh = !!UV && !!rib && rib.test(json.meshes[node.mesh].name ?? '');
        for (let i = 0; i < count; i++) {
          uvs.push(UV ? UV[i * 2] : 0, UV ? UV[i * 2 + 1] : 0);
          mask.push(!UV ? 0 : ribMesh ? 2 : kinds && uvSet === 0 ? kinds[i] : 1);
        }
        const I = prim.indices !== undefined ? read(prim.indices) : Array.from({ length: count }, (_, i) => i);
        for (const i of I) indices.push(base + i);
        const role = roleOf(prim);
        for (let t = 0; t < I.length / 3; t++) triRole.push(role);
        base += count;
      }
    }
    for (const c of node.children ?? []) visit(c, world);
  };
  const scene = json.scenes[json.scene ?? 0];
  for (const n of scene.nodes) visit(n, new THREE.Matrix4());
  const name = json.scenes?.[json.scene ?? 0]?.name ?? json.materials?.[0]?.name ?? json.meshes?.[0]?.name ?? basename(path, '.glb');
  return {
    name,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    mask: new Uint8Array(mask),
    indices: new Uint32Array(indices),
    triRole,
  };
}

/**
 * Clave de un vértice: posición redondeada a 0,2 mm y UV (para comparar dos
 * exportaciones; con la UV, los vértices repetidos de una costura entre dos
 * piezas no se confunden).
 */
function posKey(x, y, z, u, v) {
  return `${Math.round(x * 5000)},${Math.round(y * 5000)},${Math.round(z * 5000)},${Math.round(u * 8192)},${Math.round(v * 8192)}`;
}

/** Posiciones (y tipo: 1 tela, 2 canalé) de las piezas con textura de la versión PBR (`<nombre>_pbr.glb`). */
function texturedPositions(pbrPath, rib) {
  const ref = readGlb(pbrPath, null, rib);
  const map = new Map();
  for (let i = 0; i < ref.mask.length; i++) if (ref.mask[i]) map.set(posKey(ref.positions[i * 3], ref.positions[i * 3 + 1], ref.positions[i * 3 + 2], ref.uvs[i * 2], ref.uvs[i * 2 + 1]), ref.mask[i]);
  return map;
}

/**
 * Qué mallas de la versión PBR son de canalé (cintura, puños, cuello...). Con
 * `--rib=<expresión>` se cambia. Si la prenda trae `<nombre>_ejes.json` (las
 * sudaderas v2) y su cuello es alzado de felpa (`"cuello": "alzado"`), el
 * cuello no cuenta como canalé.
 */
function ribPattern(base) {
  let src = FLAGS.rib ?? 'cintura|pu[nñ]o|cuello|canal|rib|cuff|waistband|collar';
  const ejes = join(IN, `${base}_ejes.json`);
  if (!FLAGS.rib && existsSync(ejes)) {
    try {
      if (JSON.parse(readFileSync(ejes, 'utf8')).cuello === 'alzado') src = src.replace('|cuello', '').replace('|collar', '');
    } catch {
      // sin datos: la expresión de siempre
    }
  }
  return new RegExp(src, 'i');
}

/**
 * Metros que mide una unidad de UV en la prenda (raíz de área real / área UV
 * de los triángulos con textura). La web repite su textura de tejido en esas
 * UV a la misma escala física que en el resto de prendas.
 */
function uvMeters(mesh) {
  let world = 0;
  let uv = 0;
  const { positions: P, uvs: U, mask, indices: I } = mesh;
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [I[t], I[t + 1], I[t + 2]];
    if (!mask[a] || !mask[b] || !mask[c]) continue;
    const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
    const e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
    world += Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) / 2;
    uv += Math.abs((U[b * 2] - U[a * 2]) * (U[c * 2 + 1] - U[a * 2 + 1]) - (U[c * 2] - U[a * 2]) * (U[b * 2 + 1] - U[a * 2 + 1])) / 2;
  }
  return uv > 0 ? Math.sqrt(world / uv) : 0;
}

/** Separa la malla por papel: cada grupo con sus propios vértices. */
function splitByRole(mesh) {
  const roles = [...new Set(mesh.triRole)];
  // La tela primero (primitiva 0), el resto en orden de aparición.
  roles.sort((a, b) => (a === 'body' ? -1 : b === 'body' ? 1 : 0));
  return roles.map((role) => {
    const map = new Map();
    const P = [];
    const N = [];
    const U = [];
    const M = [];
    const src = [];
    const I = [];
    for (let t = 0; t < mesh.triRole.length; t++) {
      if (mesh.triRole[t] !== role) continue;
      for (let k = 0; k < 3; k++) {
        const v = mesh.indices[t * 3 + k];
        let j = map.get(v);
        if (j === undefined) {
          j = src.length;
          map.set(v, j);
          src.push(v);
          P.push(mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]);
          N.push(mesh.normals[v * 3], mesh.normals[v * 3 + 1], mesh.normals[v * 3 + 2]);
          U.push(mesh.uvs[v * 2], mesh.uvs[v * 2 + 1]);
          M.push(mesh.mask[v]);
        }
        I.push(j);
      }
    }
    return { role, positions: new Float32Array(P), normals: new Float32Array(N), uvs: new Float32Array(U), mask: new Uint8Array(M), indices: new Uint32Array(I), src };
  });
}

// ---------------------------------------------------------------------------
// Oclusión ambiental por trazado de rayos
// ---------------------------------------------------------------------------

function bakeAO(mesh) {
  const { positions, normals, indices } = mesh;
  const n = positions.length / 3;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  // MeshBVH reordena el índice que recibe: le damos una copia (el orden de los
  // triángulos dice de qué pieza es cada uno).
  geo.setIndex(new THREE.BufferAttribute(indices.slice(), 1));
  const bvh = new MeshBVH(geo, { maxLeafTris: 8 });

  // Si faltan normales, las calculamos de la malla.
  if (normals.every((x) => x === 0)) {
    geo.computeVertexNormals();
    normals.set(geo.getAttribute('normal').array);
  }

  // Direcciones con distribución coseno (espiral de Fibonacci en el hemisferio).
  const dirs = [];
  for (let i = 0; i < AO_RAYS; i++) {
    const u = (i + 0.5) / AO_RAYS;
    const r = Math.sqrt(u);
    const phi = i * 2.399963;
    dirs.push([r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(1 - u)]);
  }

  const ao = new Float32Array(n);
  const ray = new THREE.Ray();
  const N = new THREE.Vector3();
  const T = new THREE.Vector3();
  const B = new THREE.Vector3();
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < n; i++) {
    N.set(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]).normalize();
    T.set(Math.abs(N.y) < 0.9 ? 0 : 1, Math.abs(N.y) < 0.9 ? 1 : 0, 0).cross(N).normalize();
    B.crossVectors(N, T);
    // Giro aleatorio del patrón por vértice (evita bandas).
    const a = rand() * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    let near = 0;
    let far = 0;
    for (const [dx0, dy0, dz] of dirs) {
      const dx = dx0 * ca - dy0 * sa;
      const dy = dx0 * sa + dy0 * ca;
      ray.origin.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]).addScaledVector(N, AO_OFFSET);
      ray.direction.set(0, 0, 0).addScaledVector(T, dx).addScaledVector(B, dy).addScaledVector(N, dz).normalize();
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, AO_FAR);
      if (!hit) continue;
      if (hit.distance < AO_SELF && hit.face) {
        // Cara trasera (salió por dentro del grosor) o choque rasante: no es sombra.
        if (hit.face.normal.dot(ray.direction) > -0.12) continue;
      }
      if (hit.distance < AO_NEAR) near += 1 - hit.distance / AO_NEAR;
      far += 1 - hit.distance / AO_FAR;
    }
    near /= AO_RAYS;
    far /= AO_RAYS;
    ao[i] = Math.min(1, Math.max(0.18, 1 - 1.15 * near - 0.55 * far));
  }

  const nb = Array.from({ length: n }, () => []);
  for (let t = 0; t < indices.length; t += 3) {
    const [a1, b1, c1] = [indices[t], indices[t + 1], indices[t + 2]];
    nb[a1].push(b1, c1);
    nb[b1].push(a1, c1);
    nb[c1].push(a1, b1);
  }
  // Motas sueltas: un vértice mucho más oscuro que la mediana de sus vecinos
  // (un par de rayos con mala suerte) toma el valor de esa mediana.
  const fixed = Float32Array.from(ao);
  for (let i = 0; i < n; i++) {
    if (nb[i].length < 2) continue;
    const vals = nb[i].map((j) => ao[j]).sort((x, y) => x - y);
    const median = vals[vals.length >> 1];
    if (ao[i] < median - 0.12) fixed[i] = median;
  }
  // Suavizado (dos pasadas con los vecinos).
  let cur = fixed;
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = cur[i] * 2;
      for (const j of nb[i]) s += cur[j];
      next[i] = s / (nb[i].length + 2);
    }
    cur = next;
  }
  return cur;
}

// ---------------------------------------------------------------------------
// Simplificación, reordenación, cuantización y compresión
// ---------------------------------------------------------------------------

function lod(mesh, ao, spec, share = 1) {
  const tris = mesh.indices.length / 3;
  // La versión ligera nunca tiene más triángulos que la alta (LODS[0]).
  const cap = Math.round(tris * LODS[0].ratio);
  const target = Math.min(tris, spec.tris ? Math.min(cap, Math.max(120, Math.round(spec.tris * share))) : Math.round(tris * spec.ratio));
  let [idx] = MeshoptSimplifier.simplify(new Uint32Array(mesh.indices), mesh.positions, 3, target * 3, spec.error, ['ErrorAbsolute']);
  idx = new Uint32Array(idx);
  // Optimiza el orden para la caché de la GPU y compacta los vértices usados.
  const [remap, unique] = MeshoptEncoder.reorderMesh(idx, true, false);
  const P = new Float32Array(unique * 3);
  const Nn = new Float32Array(unique * 3);
  const A = new Float32Array(unique);
  const U = new Float32Array(unique * 2);
  const M = new Uint8Array(unique);
  for (let i = 0; i < remap.length; i++) {
    const j = remap[i];
    if (j === 0xffffffff) continue;
    P.set(mesh.positions.subarray(i * 3, i * 3 + 3), j * 3);
    Nn.set(mesh.normals.subarray(i * 3, i * 3 + 3), j * 3);
    U.set(mesh.uvs.subarray(i * 2, i * 2 + 2), j * 2);
    M[j] = mesh.mask[i];
    A[j] = ao[i];
  }
  return { positions: P, normals: Nn, uvs: U, mask: M, ao: A, indices: idx, count: unique };
}

const MATERIAL_LOOK = {
  body: { name: 'Tela', color: [0.83, 0.83, 0.8, 1], metal: 0, rough: 0.9 },
  button: { name: 'Botones', color: [0.2, 0.2, 0.21, 1], metal: 0, rough: 0.45 },
  trim: { name: 'Ribetes', color: [0.6, 0.55, 0.45, 1], metal: 0, rough: 0.9 },
  zipper: { name: 'Cremallera', color: [0.7, 0.7, 0.68, 1], metal: 1, rough: 0.35 },
  hardware: { name: 'Herrajes', color: [0.72, 0.62, 0.4, 1], metal: 1, rough: 0.3 },
  stitch: { name: 'Pespuntes', color: [0.79, 0.63, 0.35, 1], metal: 0, rough: 0.8 },
};

/**
 * Escribe el .glb: una primitiva (y un material) por papel. `groups`: [{ role, mesh }].
 * `detail` (opcional): mapas de relieve; entonces se guardan también las UV.
 */
function writeGlb(path, name, groups, meta, detail = null) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { mesh: m } of groups) for (let i = 0; i < m.count; i++) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], m.positions[i * 3 + k]);
    max[k] = Math.max(max[k], m.positions[i * 3 + k]);
  }
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const scale = extent / 65535;

  const chunks = [];
  let offset = 0;
  let rawOffset = 0;
  const views = [];
  const accessors = [];
  const primitives = [];
  const materials = [];
  const addView = (data, stride, n, mode, target) => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const enc = MeshoptEncoder.encodeGltfBuffer(bytes, n, stride, mode);
    chunks.push(enc);
    const pad = (4 - (enc.length % 4)) % 4;
    if (pad) chunks.push(new Uint8Array(pad));
    views.push({
      buffer: 1,
      byteOffset: rawOffset,
      byteLength: bytes.length,
      ...(mode === 'ATTRIBUTES' ? { byteStride: stride } : {}),
      target,
      extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: offset, byteLength: enc.length, byteStride: stride, count: n, mode } },
    });
    offset += enc.length + pad;
    rawOffset += bytes.length + ((4 - (bytes.length % 4)) % 4);
    return views.length - 1;
  };

  for (const { role, mesh: m } of groups) {
    const count = m.count;
    // Posición: uint16 x3 (+ relleno), deshecho por la escala/traslación del nodo.
    const pos = new Uint16Array(count * 4);
    const qmin = [65535, 65535, 65535];
    const qmax = [0, 0, 0];
    for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) {
      const q = Math.round((m.positions[i * 3 + k] - min[k]) / scale);
      pos[i * 4 + k] = q;
      qmin[k] = Math.min(qmin[k], q);
      qmax[k] = Math.max(qmax[k], q);
    }
    // Normal: int8 normalizado x3 (+ relleno).
    const nor = new Int8Array(count * 4);
    for (let i = 0; i < count; i++) {
      const l = Math.hypot(m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]) || 1;
      for (let k = 0; k < 3; k++) nor[i * 4 + k] = Math.round((m.normals[i * 3 + k] / l) * 127);
    }
    // COLOR_0 = oclusión ambiental (gris), uint8 normalizado. Con relieve, el
    // alfa dice qué vértices tienen UV de la textura: 0 ninguno, 128 tela,
    // 255 canalé (la web le pone el tejido de canalé).
    const withUv = !!detail && m.mask.some((x) => x);
    const col = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) {
      const v = Math.round(m.ao[i] * 255);
      col[i * 4] = v;
      col[i * 4 + 1] = v;
      col[i * 4 + 2] = v;
      col[i * 4 + 3] = withUv ? [0, 128, 255][m.mask[i]] : 255;
    }
    const wide = count > 65535;
    const ind = wide ? new Uint32Array(m.indices) : new Uint16Array(m.indices);
    const vPos = addView(pos, 8, count, 'ATTRIBUTES', 34962);
    const vNor = addView(nor, 4, count, 'ATTRIBUTES', 34962);
    const vCol = addView(col, 4, count, 'ATTRIBUTES', 34962);
    const vInd = addView(ind, wide ? 4 : 2, ind.length, 'TRIANGLES', 34963);
    const a0 = accessors.length;
    accessors.push(
      { bufferView: vPos, componentType: 5123, count, type: 'VEC3', min: qmin, max: qmax },
      { bufferView: vNor, componentType: 5120, normalized: true, count, type: 'VEC3' },
      { bufferView: vCol, componentType: 5121, normalized: true, count, type: 'VEC4' },
      { bufferView: vInd, componentType: wide ? 5125 : 5123, count: ind.length, type: 'SCALAR' },
    );
    // UV: uint16 normalizado si caben en 0..1 (lo normal en un atlas horneado); si no, float.
    let uvAccessor = -1;
    if (withUv) {
      const fits = m.uvs.every((x) => x >= 0 && x <= 1);
      const data = fits ? Uint16Array.from(m.uvs, (x) => Math.round(x * 65535)) : Float32Array.from(m.uvs);
      const vUv = addView(data, fits ? 4 : 8, count, 'ATTRIBUTES', 34962);
      uvAccessor = accessors.length;
      accessors.push(fits ? { bufferView: vUv, componentType: 5123, normalized: true, count, type: 'VEC2' } : { bufferView: vUv, componentType: 5126, count, type: 'VEC2' });
    }
    const look = MATERIAL_LOOK[role] ?? MATERIAL_LOOK.trim;
    materials.push({
      name: look.name,
      doubleSided: true,
      pbrMetallicRoughness: { baseColorFactor: look.color, metallicFactor: look.metal, roughnessFactor: look.rough },
      extras: { tintable: role === 'body', role },
    });
    primitives.push({
      attributes: { POSITION: a0, NORMAL: a0 + 1, COLOR_0: a0 + 2, ...(uvAccessor >= 0 ? { TEXCOORD_0: uvAccessor } : {}) },
      indices: a0 + 3,
      material: materials.length - 1,
    });
  }

  const json = {
    asset: { version: '2.0', generator: 'MyOut prepare-garments', extras: detail ? { ...meta, detail } : meta },
    extensionsUsed: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
    extensionsRequired: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
    scene: 0,
    scenes: [{ name, nodes: [0] }],
    nodes: [{ name, mesh: 0, translation: min, scale: [scale, scale, scale] }],
    meshes: [{ name, primitives }],
    materials,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: offset }, { byteLength: rawOffset, extensions: { EXT_meshopt_compression: { fallback: true } } }],
  };
  let jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jpad = (4 - (jsonBytes.length % 4)) % 4;
  jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(jpad, 0x20)]);
  const bin = Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)));
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonBytes.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  writeFileSync(path, Buffer.concat([header, jh, jsonBytes, bh, bin]));
}

// ---------------------------------------------------------------------------

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

// Los pespuntes (`_costuras`) y las versiones de Blender (`_pbr`) no son para la web.
// --only=<nombre> (sin .glb, se admiten varios separados por comas): solo esos archivos.
const ONLY = FLAGS.only ? new Set(FLAGS.only.split(',').map((x) => x.replace(/\.glb$/i, ''))) : null;
const files = readdirSync(IN)
  .filter((f) => f.toLowerCase().endsWith('.glb') && !/_(costuras|pbr)\.glb$/i.test(f))
  .filter((f) => !ONLY || ONLY.has(f.replace(/\.glb$/i, '')))
  .sort();
if (!files.length) {
  console.error(`No hay archivos .glb en ${IN}`);
  process.exit(1);
}
for (const spec of LODS) mkdirSync(join(OUT, spec.dir), { recursive: true });

const catalog = [];
for (const file of files) {
  const t0 = Date.now();
  const base = file.replace(/\.glb$/i, '');
  // ¿Tiene mapas de relieve? (prepare-textures.py los deja en TEX_DIR)
  const texFiles = DETAIL_SIZES.map((s) => join(TEX_DIR, `${base}_n${s}.webp`));
  const hasTex = texFiles.every((f) => existsSync(f));
  const pbrPath = PBR_DIR ? join(PBR_DIR, `${base}_pbr.glb`) : null;
  const ref = hasTex && pbrPath && existsSync(pbrPath) ? texturedPositions(pbrPath, ribPattern(base)) : null;
  const mesh = readGlb(join(IN, file), ref);
  const meters = hasTex ? uvMeters(mesh) : 0;
  const ao = bakeAO(mesh);
  const parts = splitByRole(mesh);
  const totalTris = mesh.indices.length / 3;
  const entry = { archivo: file, prenda: mesh.name, original: { triangulos: totalTris, bytes: statSync(join(IN, file)).size } };
  if (parts.length > 1) entry.piezas = parts.map((p) => p.role);
  if (meters > 0) entry.relieve = { uvMetros: Number(meters.toFixed(4)), bytes: texFiles.reduce((n, f) => n + statSync(f).size, 0) };
  for (const spec of LODS) {
    const groups = parts.map((p) => {
      const pao = new Float32Array(p.src.length);
      for (let i = 0; i < p.src.length; i++) pao[i] = ao[p.src[i]];
      // Las piezas pequeñas (botones...) conservan más detalle relativo en la versión ligera.
      const share = Math.max(0.02, p.indices.length / 3 / totalTris);
      return { role: p.role, mesh: lod(p, pao, spec, share) };
    });
    const out = join(OUT, spec.dir, file);
    // Rutas de los mapas relativas al .glb (la versión ligera está un nivel más abajo).
    const rel = relative(join(OUT, spec.dir), TEX_DIR).split(sep).join('/');
    const detail = meters > 0
      ? { uvMeters: Number(meters.toFixed(4)), normal: Object.fromEntries(DETAIL_SIZES.map((s) => [s, `${rel ? `${rel}/` : ''}${base}_n${s}.webp`])) }
      : null;
    writeGlb(out, mesh.name, groups, { origen: file, nivel: spec.dir || 'alto' }, detail);
    entry[spec.dir || 'alto'] = { triangulos: groups.reduce((n, g) => n + g.mesh.indices.length / 3, 0), bytes: statSync(out).size };
  }
  catalog.push(entry);
  console.log(
    `${file}: ${entry.original.triangulos} -> ${entry.alto.triangulos} / ${entry.lod.triangulos} triángulos, ` +
      `${(entry.alto.bytes / 1024).toFixed(0)} KB / ${(entry.lod.bytes / 1024).toFixed(0)} KB (${((Date.now() - t0) / 1000).toFixed(1)} s)`,
  );
}
// Con --only se actualizan solo esas entradas del catálogo.
let fullCatalog = catalog;
if (ONLY && existsSync(join(OUT, 'catalogo.json'))) {
  const old = JSON.parse(readFileSync(join(OUT, 'catalogo.json'), 'utf8'));
  const done = new Set(catalog.map((e) => e.archivo));
  fullCatalog = [...old.filter((e) => !done.has(e.archivo)), ...catalog].sort((a, b) => a.archivo.localeCompare(b.archivo));
}
writeFileSync(join(OUT, 'catalogo.json'), JSON.stringify(fullCatalog, null, 1));
