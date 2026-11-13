/**
 * Acabado "realista" de las prendas, compartido por todas las vistas:
 *
 * 1. bakeShading(): calcula por vértice una OCLUSIÓN AMBIENTAL aproximada a
 *    partir de la curvatura (los valles de los pliegues y las uniones quedan
 *    más oscuros) y, en el vaquero, un DESGASTE más claro en las zonas que
 *    sobresalen. Se guarda como color de vértice: no cuesta nada al pintar.
 *
 * 2. makeClothMaterial(): material PBR (MeshPhysicalMaterial) con normal map y
 *    roughness map del tejido, y un pequeño shader añadido que:
 *    - rompe la repetición de la textura con variación de color y rugosidad
 *      a gran escala (ruido 3D que no se repite),
 *    - oscurece el interior de la prenda (lo que se ve por el cuello o el bajo),
 *    - y, si se le pasa `motion`, mueve la tela con viento e inercia.
 *
 * IMPORTANTE: el movimiento es una APROXIMACIÓN VISUAL en el vertex shader
 * (desplazamientos suaves ponderados por zonas), no una simulación física de
 * tejido: no hay colisiones ni masas. Las zonas cosidas o apoyadas en el
 * cuerpo (hombros, cintura) no se mueven; los bajos y mangas, un poco.
 */
import * as THREE from 'three';
import type { Body } from './body';
import { FABRIC_LOOK, fabricNormalMap, fabricRoughnessMap, type FabricKind } from './fabric';
import { TEX_DENSITY } from './surface';

type FabricOrNone = FabricKind | 'none';

// ---------------------------------------------------------------------------
// 1. Sombreado horneado por vértice
// ---------------------------------------------------------------------------

/** Cuánto aclara el desgaste las zonas salientes (solo vaquero, de momento). */
const WEAR: Partial<Record<FabricKind, number>> = { denim: 0.16, leather: 0.05 };

/**
 * Calcula oclusión ambiental por curvatura y desgaste, y lo guarda en el
 * atributo `color`. También orienta la malla para que sus normales apunten
 * hacia fuera (así el shader distingue el interior de la prenda).
 */
export function bakeShading(g: THREE.BufferGeometry, fabric: FabricOrNone, flat = false): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count;
  const colors = new Float32Array(n * 3).fill(1);
  const index = g.getIndex();
  if (!index || flat) {
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return;
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const idx = index.array;

  // ¿Las normales apuntan hacia fuera? Para una superficie cerrada,
  // Σ n·(p − centro) > 0 si apuntan hacia fuera.
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += pos.getX(i);
    cy += pos.getY(i);
    cz += pos.getZ(i);
  }
  cx /= n;
  cy /= n;
  cz /= n;
  let orient = 0;
  for (let i = 0; i < n; i++) {
    orient +=
      nor.getX(i) * (pos.getX(i) - cx) + nor.getY(i) * (pos.getY(i) - cy) + nor.getZ(i) * (pos.getZ(i) - cz);
  }
  if (orient < 0) {
    // Invertimos el sentido de los triángulos y las normales.
    for (let t = 0; t < idx.length; t += 3) {
      const b = idx[t + 1];
      idx[t + 1] = idx[t + 2];
      idx[t + 2] = b;
    }
    index.needsUpdate = true;
    for (let i = 0; i < n; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
    nor.needsUpdate = true;
  }

  // Curvatura media aproximada: promedio, sobre las aristas de cada vértice,
  // de la curvatura normal en esa dirección: 2·(q − p)·n / |q − p|².
  // Positiva = cóncavo (valle de un pliegue); negativa = convexo (cresta).
  // (Por arista y no con el laplaciano, porque las mallas son anisótropas:
  // aristas cortas alrededor y largas a lo largo.)
  const ksum = new Float32Array(n);
  const cnt = new Float32Array(n);
  const neighbors: number[][] = Array.from({ length: n }, () => []);
  const addEdge = (a: number, b: number) => {
    const dx = pos.getX(b) - pos.getX(a);
    const dy = pos.getY(b) - pos.getY(a);
    const dz = pos.getZ(b) - pos.getZ(a);
    const l2 = dx * dx + dy * dy + dz * dz;
    if (l2 < 1e-12) return;
    ksum[a] += (2 * (dx * nor.getX(a) + dy * nor.getY(a) + dz * nor.getZ(a))) / l2;
    cnt[a] += 1;
    neighbors[a].push(b);
  };
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    addEdge(a, b); addEdge(b, a);
    addEdge(b, c); addEdge(c, b);
    addEdge(c, a); addEdge(a, c);
  }
  let curv: Float32Array = new Float32Array(n);
  for (let i = 0; i < n; i++) if (cnt[i]) curv[i] = ksum[i] / cnt[i];
  // Suavizado: la oclusión real es difusa, no un dibujo de líneas.
  const smooth = (src: Float32Array, passes: number) => {
    let cur = src;
    for (let pass = 0; pass < passes; pass++) {
      const next = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const nb = neighbors[i];
        let s = cur[i] * 2;
        for (const j of nb) s += cur[j];
        next[i] = s / (nb.length + 2);
      }
      cur = next;
    }
    return cur;
  };
  curv = smooth(curv, 3);
  // Concavidad RELATIVA: un valle de pliegue sobre un cuerpo convexo sigue
  // siendo convexo en absoluto, pero menos que su entorno.
  const broad = smooth(curv, 14);

  const wear = fabric === 'none' ? 0 : (WEAR[fabric] ?? 0);
  for (let i = 0; i < n; i++) {
    const rel = curv[i] - broad[i];
    const ao = 1 - Math.min(0.38, Math.max(0, rel) * 0.032 + Math.max(0, curv[i]) * 0.008);
    const lift = wear * Math.min(1, Math.max(0, -rel) * 0.05);
    const v = ao * (1 + lift);
    colors[i * 3] = v;
    colors[i * 3 + 1] = v;
    colors[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// ---------------------------------------------------------------------------
// 2. Movimiento (perfil por prenda y uniforms compartidos)
// ---------------------------------------------------------------------------

/** Dónde y cuánto se mueve una prenda. */
export interface SwayProfile {
  /** Altura donde empieza a moverse (por encima, quieta). */
  start: number;
  /** Altura donde el movimiento es máximo (el bajo). */
  full: number;
  /** Amplitud máxima en metros. */
  amp: number;
  /** Mangas: |x| a partir del cual se mueven y cuánto (0 = nada). */
  armX: number;
  arm: number;
}

/** Cuánto "vuela" cada tejido (la seda cae y se mueve más que el cuero). */
const FLOW: Record<FabricKind, number> = {
  silk: 1.45,
  jersey: 1.1,
  woven: 1,
  nylon: 0.9,
  knit: 0.75,
  wool: 0.7,
  canvas: 0.6,
  denim: 0.5,
  leather: 0.4,
};

/**
 * Perfil de movimiento de una prenda. `minY` es el punto más bajo de la
 * prenda (su bajo). Calzado y gorras no se mueven.
 */
export function swayProfile(modelKey: string, body: Body, fabric: FabricKind, minY: number): SwayProfile | null {
  const y = body.y;
  const armX = body.torso(y.chest) + 0.035;
  const f = FLOW[fabric] ?? 1;
  switch (modelKey) {
    case 'tshirt':
    case 'shirt':
    case 'sweater':
      return { start: y.chest, full: minY, amp: 0.009 * f, armX, arm: 0.55 };
    case 'jacket':
    case 'coat':
      return { start: y.waist + 0.04, full: minY, amp: 0.011 * f, armX, arm: 0.35 };
    case 'dress':
      return { start: y.hip, full: minY, amp: 0.016 * f, armX, arm: 0.5 };
    case 'skirt':
      return { start: y.hip, full: minY, amp: 0.018 * f, armX: 99, arm: 0 };
    case 'shorts':
      return { start: y.crotch, full: minY, amp: 0.006 * f, armX: 99, arm: 0 };
    case 'pants':
      return { start: y.knee, full: minY, amp: 0.004 * f, armX: 99, arm: 0 };
    default:
      return null;
  }
}

/** Uniforms del movimiento de UNA prenda (compartidos por sus materiales). */
export interface ClothMotion {
  uTime: { value: number };
  /** 0 = quieta, 1 = en movimiento (se interpola para entrar y salir suave). */
  uMotion: { value: number };
  /** Dirección del viento en el espacio de la prenda (x, z). */
  uWind: { value: THREE.Vector2 };
  /** Desplazamiento tangencial por inercia al girar (metros, con signo). */
  uLag: { value: number };
  /** start, full, amp. */
  uSway: { value: THREE.Vector3 };
  /** armX, arm. */
  uArm: { value: THREE.Vector2 };
}

export function createClothMotion(p: SwayProfile): ClothMotion {
  return {
    uTime: { value: 0 },
    uMotion: { value: 0 },
    uWind: { value: new THREE.Vector2(0.8, 0.6) },
    uLag: { value: 0 },
    uSway: { value: new THREE.Vector3(p.start, p.full, p.amp) },
    uArm: { value: new THREE.Vector2(p.armX, p.arm) },
  };
}

/**
 * Inercia de la prenda: un muelle amortiguado que "persigue" la velocidad de
 * giro de la cámara alrededor de la prenda, así los bajos se retrasan al girar
 * y oscilan un poco al parar. Actualiza `state` (x = desplazamiento, v = velocidad).
 */
export function stepInertia(
  state: { x: number; v: number },
  angularVelocity: number,
  dt: number,
): void {
  const target = THREE.MathUtils.clamp(-angularVelocity * 0.01, -0.018, 0.018);
  const k = 38;
  const c = 2 * Math.sqrt(k) * 0.32; // poco amortiguado: un par de rebotes suaves
  const a = k * (target - state.x) - c * state.v;
  state.v += a * dt;
  state.x += state.v * dt;
}

// ---------------------------------------------------------------------------
// 3. Material
// ---------------------------------------------------------------------------

/** Variación de color a gran escala (rompe la repetición de la textura). */
const MACRO: Record<FabricOrNone, number> = {
  denim: 0.075,
  leather: 0.05,
  wool: 0.04,
  canvas: 0.04,
  knit: 0.03,
  jersey: 0.025,
  woven: 0.025,
  nylon: 0.02,
  silk: 0.02,
  none: 0,
};

/**
 * Variación fina del color de la fibra (aspecto «jaspeado»: hilos algo más
 * claros u oscuros). Sin ella, el color era perfectamente uniforme y la tela
 * parecía plástico; en el vaquero imita los «slubs» del hilo.
 */
const HEATHER: Record<FabricOrNone, number> = {
  knit: 0.09,
  wool: 0.06,
  denim: 0.08,
  jersey: 0.05,
  canvas: 0.04,
  woven: 0.03,
  leather: 0.02,
  nylon: 0.015,
  silk: 0.01,
  none: 0,
};

const NOISE_GLSL = /* glsl */ `
float clothHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float clothNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(clothHash(i), clothHash(i + vec3(1, 0, 0)), f.x),
        mix(clothHash(i + vec3(0, 1, 0)), clothHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(clothHash(i + vec3(0, 0, 1)), clothHash(i + vec3(1, 0, 1)), f.x),
        mix(clothHash(i + vec3(0, 1, 1)), clothHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
`;

const MOTION_GLSL = /* glsl */ `
{
  // Peso: 0 en zonas cosidas/apoyadas, 1 en el bajo; las mangas aparte.
  float sw = 1.0 - smoothstep(uSway.y, uSway.x, transformed.y);
  sw *= sw;
  sw = max(sw, uArm.y * smoothstep(uArm.x, uArm.x + 0.12, abs(transformed.x)));
  vec2 rad = transformed.xz;
  float rl = max(length(rad), 1e-4);
  vec2 rdir = rad / rl;
  vec2 tdir = vec2(-rdir.y, rdir.x);
  float th = atan(rad.y, rad.x);
  float t = uTime;
  // Ondas lentas que recorren la prenda + rachas + ondulación fina.
  float wave = 0.5 + 0.5 * sin(t * 1.9 + th * 3.0 + transformed.y * 11.0) * sin(t * 0.71 + th * 1.7 - transformed.y * 4.0);
  float gust = 0.55 + 0.45 * sin(t * 0.43) * sin(t * 0.17 + 1.3);
  float lee = 0.6 + 0.4 * dot(rdir, uWind);
  float ripple = 0.22 * sin(t * 5.3 + th * 9.0 + transformed.y * 34.0);
  float amt = sw * uSway.z * uMotion;
  // Solo hacia fuera (nunca hacia el cuerpo) para no atravesarlo.
  transformed.xz += rdir * (amt * gust * lee * (wave + ripple * wave));
  transformed.xz += tdir * (sw * uLag * uMotion);
  transformed.y += amt * 0.3 * (wave - 0.5);
}
`;

/**
 * Estampado de la tela (lib/patterns.ts): una baldosa repetible cuyos 4
 * canales son la cobertura de cada color. Se proyecta en el espacio de la
 * prenda (metros) desde delante, los lados y arriba, mezclando según la
 * orientación de la superficie (no hace falta que la malla tenga UV).
 */
export interface PatternUniforms {
  uPatTex: { value: THREE.Texture };
  /** cos(giro), sin(giro), 1 / tamaño de la repetición, intensidad. */
  uPatXf: { value: THREE.Vector4 };
  uPatOff: { value: THREE.Vector2 };
  uPatC0: { value: THREE.Color };
  uPatC1: { value: THREE.Color };
  uPatC2: { value: THREE.Color };
  uPatC3: { value: THREE.Color };
}

/** Estampado ya resuelto (colores en THREE.Color) para un material. */
export interface PatternLook {
  texture: THREE.Texture;
  /** Grados. */
  angle: number;
  /** Metros que mide una repetición. */
  size: number;
  opacity: number;
  offset: [number, number];
  colors: THREE.Color[];
}

/** Rellena (o actualiza) los uniforms de un estampado. */
export function setPatternUniforms(u: PatternUniforms, look: PatternLook, setColors = true): void {
  u.uPatTex.value = look.texture;
  const r = (look.angle * Math.PI) / 180;
  u.uPatXf.value.set(Math.cos(r), Math.sin(r), 1 / look.size, look.opacity);
  u.uPatOff.value.set(look.offset[0], look.offset[1]);
  if (setColors) {
    const slots = [u.uPatC0, u.uPatC1, u.uPatC2, u.uPatC3];
    slots.forEach((s, i) => s.value.copy(look.colors[i] ?? look.colors[0]));
  }
}

function makePatternUniforms(look: PatternLook): PatternUniforms {
  const u: PatternUniforms = {
    uPatTex: { value: look.texture },
    uPatXf: { value: new THREE.Vector4() },
    uPatOff: { value: new THREE.Vector2() },
    uPatC0: { value: new THREE.Color() },
    uPatC1: { value: new THREE.Color() },
    uPatC2: { value: new THREE.Color() },
    uPatC3: { value: new THREE.Color() },
  };
  setPatternUniforms(u, look);
  return u;
}

const PATTERN_GLSL = /* glsl */ `
uniform sampler2D uPatTex;
uniform vec4 uPatXf;
uniform vec2 uPatOff;
uniform vec3 uPatC0;
uniform vec3 uPatC1;
uniform vec3 uPatC2;
uniform vec3 uPatC3;
vec2 patUV(vec2 q) {
  return vec2(q.x * uPatXf.x + q.y * uPatXf.y, -q.x * uPatXf.y + q.y * uPatXf.x) * uPatXf.z + uPatOff;
}
vec3 clothPattern(vec3 base, vec3 p, vec3 n) {
  // Transición corta entre proyecciones: el estampado tiene bordes nítidos y,
  // si se mezclan dos vistas en una zona ancha, salen manchas «fantasma»
  // (lengüetas de zapatillas, hombros, copa de la gorra).
  vec3 a = pow(abs(normalize(n)), vec3(12.0));
  a /= (a.x + a.y + a.z + 1e-5);
  // Delante y detrás (x, y), costados (z, y) y arriba o abajo (x, z). La
  // horizontal se invierte en la espalda y en el costado izquierdo, para que
  // vista desde fuera la tela tenga la misma orientación por todos lados.
  float sz = n.z < 0.0 ? -1.0 : 1.0;
  float sx = n.x < 0.0 ? 1.0 : -1.0;
  vec4 w = texture2D(uPatTex, patUV(vec2(p.x * sz, p.y))) * a.z
         + texture2D(uPatTex, patUV(vec2(p.z * sx, p.y))) * a.x
         + texture2D(uPatTex, patUV(p.xz)) * a.y;
  w *= uPatXf.w;
  vec3 c = mix(base, uPatC0, w.r);
  c = mix(c, uPatC1, w.g);
  c = mix(c, uPatC2, w.b);
  c = mix(c, uPatC3, w.a);
  return c;
}
`;

// Antirrepetición: cada textura se lee también desplazada y a otra escala, y
// las dos lecturas se mezclan según un ruido de baja frecuencia (manchas de
// ~25 cm). Así no se ve la misma celda repetida en primer plano.
const TRI_SETUP_GLSL = /* glsl */ `
vec3 triW = pow(abs(normalize(vClothNormal)), vec3(4.0));
triW /= (triW.x + triW.y + triW.z + 1e-5);
vec2 triX = vClothPos.zy * uTriScale;
vec2 triY = vClothPos.xz * uTriScale;
vec2 triZ = vClothPos.xy * uTriScale;
float triMix = smoothstep(0.3, 0.7, clothNoise(vClothPos * 4.0 + 3.1));
#define TRI_ALT(uv) ((uv) * 0.93 + vec2(0.37, 0.71))
`;

const TRI_ROUGHNESS_GLSL = /* glsl */ `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
roughnessFactor *=
  mix(texture2D(roughnessMap, triX).g, texture2D(roughnessMap, TRI_ALT(triX)).g, triMix) * triW.x +
  mix(texture2D(roughnessMap, triY).g, texture2D(roughnessMap, TRI_ALT(triY)).g, triMix) * triW.y +
  mix(texture2D(roughnessMap, triZ).g, texture2D(roughnessMap, TRI_ALT(triZ)).g, triMix) * triW.z;
#endif
`;

const TRI_NORMAL_GLSL = /* glsl */ `
#ifdef USE_NORMALMAP_TANGENTSPACE
{
  vec3 triN = vec3(0.0);
  vec3 mN;
  mat3 fr;
  mN = mix(texture2D(normalMap, triX).xyz, texture2D(normalMap, TRI_ALT(triX)).xyz, triMix) * 2.0 - 1.0; mN.xy *= normalScale;
  fr = getTangentFrame(-vViewPosition, normal, triX); fr[0] *= faceDirection; fr[1] *= faceDirection;
  triN += triW.x * normalize(fr * mN);
  mN = mix(texture2D(normalMap, triY).xyz, texture2D(normalMap, TRI_ALT(triY)).xyz, triMix) * 2.0 - 1.0; mN.xy *= normalScale;
  fr = getTangentFrame(-vViewPosition, normal, triY); fr[0] *= faceDirection; fr[1] *= faceDirection;
  triN += triW.y * normalize(fr * mN);
  mN = mix(texture2D(normalMap, triZ).xyz, texture2D(normalMap, TRI_ALT(triZ)).xyz, triMix) * 2.0 - 1.0; mN.xy *= normalScale;
  fr = getTangentFrame(-vViewPosition, normal, triZ); fr[0] *= faceDirection; fr[1] *= faceDirection;
  triN += triW.z * normalize(fr * mN);
  normal = normalize(triN);
}
#endif
`;

export interface ClothMaterialOptions {
  color: THREE.ColorRepresentation;
  fabric: FabricOrNone;
  metal?: boolean;
  /** Rugosidad del metal (según el acabado). */
  metalRoughness?: number;
  /** Prenda sólida y cerrada (con grosor): solo se pinta la cara delantera. */
  solid?: boolean;
  /** Color del forro: si se da, la cara interior se ve con él. */
  lining?: THREE.Color | null;
  env?: THREE.Texture | null;
  motion?: ClothMotion | null;
  /**
   * Proyección triplanar del tejido (para mallas sin coordenadas UV, como los
   * modelos de la biblioteca): la textura se proyecta desde los tres ejes y
   * se mezcla según la orientación de la superficie.
   */
  triplanar?: boolean;
  /** Estampado de la tela (rayas, cuadros...). Sin valor, liso. */
  pattern?: PatternLook | null;
}

/** Material PBR de una pieza de prenda. */
export function makeClothMaterial(o: ClothMaterialOptions): THREE.MeshPhysicalMaterial {
  const fabric = o.metal ? 'none' : o.fabric;
  const look = fabric === 'none' ? null : FABRIC_LOOK[fabric];
  const m = new THREE.MeshPhysicalMaterial({
    color: o.color,
    // El roughness map vale 0,75–1: compensamos para que la media sea la del tejido.
    roughness: o.metal ? (o.metalRoughness ?? 0.3) : look ? Math.min(1, look.roughness * 1.1) : 0.7,
    // Metálico SOLO en piezas de metal (cremalleras, ojales, hebillas).
    metalness: o.metal ? 1 : 0,
    sheen: look?.sheen ?? 0,
    sheenRoughness: look?.sheenRoughness ?? 0.6,
    sheenColor: new THREE.Color('#ffffff'),
    clearcoat: look?.clearcoat ?? 0,
    clearcoatRoughness: 0.45,
    anisotropy: look?.anisotropy ?? 0,
    envMap: o.env ?? null,
    envMapIntensity: o.metal ? 0.9 : 0.55,
    vertexColors: true,
    // Las prendas procedurales son superficies abiertas: se ve también su cara
    // interior. Las de la biblioteca (GLB) son sólidos cerrados con grosor: su
    // capa interior ya mira hacia dentro, así que basta la cara delantera. Con
    // las dos caras, al deformarlas a otro cuerpo (sobre todo el femenino) la
    // capa interior asoma por delante y salen manchas oscuras.
    side: o.solid ? THREE.FrontSide : THREE.DoubleSide,
  });
  if (look && fabric !== 'none') {
    m.normalMap = fabricNormalMap(fabric);
    m.normalScale.set(look.normalScale, look.normalScale);
    m.roughnessMap = fabricRoughnessMap(fabric);
  }

  const pattern: PatternUniforms | null = o.pattern ? makePatternUniforms(o.pattern) : null;
  if (pattern) m.userData.pattern = pattern;
  applyClothShader(m, { macro: MACRO[fabric], heather: HEATHER[fabric], motion: o.motion ?? null, lining: o.lining ?? null, interior: !o.solid, triplanar: !!o.triplanar, pattern });
  return m;
}

/**
 * Añade a un material el shader común de las prendas: variación a gran
 * escala, interior en sombra o con forro y, si se da `motion`, el movimiento
 * de tela. Lo usan también los detalles (parches, botones...) para moverse
 * exactamente igual que la tela sobre la que están.
 */
export function applyClothShader(
  m: THREE.MeshPhysicalMaterial,
  o: { macro: number; heather?: number; motion: ClothMotion | null; lining: THREE.Color | null; interior: boolean; triplanar?: boolean; pattern?: PatternUniforms | null },
): void {
  const macro = o.macro;
  const motion = o.motion;
  // El color del forro se guarda en userData para poder animarlo como el resto.
  const lining = { value: (o.lining ?? new THREE.Color(0, 0, 0)).clone() };
  m.userData.lining = lining;
  const lined = !!o.lining;
  const interior = o.interior;
  const tri = !!o.triplanar;
  const pattern = o.pattern ?? null;
  const heather = o.heather ?? 0;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uMacro = { value: macro };
    if (pattern) Object.assign(shader.uniforms, pattern);
    shader.uniforms.uTriScale = { value: TEX_DENSITY };
    shader.uniforms.uLining = lining;
    if (motion) Object.assign(shader.uniforms, motion);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vClothPos;
varying vec3 vClothNormal;
${motion ? 'uniform float uTime; uniform float uMotion; uniform vec2 uWind; uniform float uLag; uniform vec3 uSway; uniform vec2 uArm;' : ''}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vClothPos = transformed;
vClothNormal = objectNormal;
${motion ? MOTION_GLSL : ''}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vClothPos;
varying vec3 vClothNormal;
uniform float uMacro;
uniform vec3 uLining;
uniform float uTriScale;
${NOISE_GLSL}
${pattern ? PATTERN_GLSL : ''}`,
      )
      .replace(
        '#include <color_fragment>',
        `${pattern ? 'diffuseColor.rgb = clothPattern(diffuseColor.rgb, vClothPos, vClothNormal);' : ''}
#include <color_fragment>
${tri ? TRI_SETUP_GLSL : ''}
float clothMacro = clothNoise(vClothPos * 11.0) * 0.6 + clothNoise(vClothPos * 29.0 + 7.0) * 0.4;
diffuseColor.rgb *= 1.0 + uMacro * (clothMacro * 2.0 - 1.0);
${heather > 0 ? `diffuseColor.rgb *= 1.0 + ${heather.toFixed(3)} * (clothNoise(vClothPos * vec3(260.0, 70.0, 260.0)) * 2.0 - 1.0) * (0.6 + 0.4 * clothNoise(vClothPos * 900.0));` : ''}
// Interior de la prenda: forro (si lo tiene) y siempre algo en sombra.
${interior ? `if (!gl_FrontFacing) diffuseColor.rgb = ${lined ? 'uLining * 0.82' : 'diffuseColor.rgb * 0.55'};` : ''}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `${tri ? TRI_ROUGHNESS_GLSL : '#include <roughnessmap_fragment>'}
roughnessFactor = clamp(roughnessFactor * (1.0 + uMacro * 1.4 * (clothMacro - 0.5)), 0.04, 1.0);`,
      );
    if (tri) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', TRI_NORMAL_GLSL);
  };
  m.customProgramCacheKey = () => `cloth:${heather}:${motion ? 'm' : 's'}:${lined ? 'l' : ''}:${interior ? 'i' : ''}:${tri ? 't' : ''}:${pattern ? 'p' : ''}`;
}
