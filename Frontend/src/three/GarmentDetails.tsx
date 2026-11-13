import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { CustomDetail } from '../api/types';
import { loadAssetImage } from '../lib/assetImages';
import { makeBody, type Body } from './body';
import { applyClothShader, type ClothMotion } from './cloth';
import { clothTargets, decalOrientation, detailPieces, drawDetail, hitCloth, isDecal, mapToBody, projectDecal, projectDrawing, type DetailTextures } from './details';
import type { GarmentBuild } from './garments';
import { METAL_LOOK } from './partColors';
import type { MetalFinish } from '../api/types';

interface Rendered {
  key: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/** Punto de apoyo de un detalle sobre la tela (desde donde se arrastra). */
interface Anchor {
  p: THREE.Vector3;
  n: THREE.Vector3;
}

type Vec3 = [number, number, number];

/** Lo que usamos de los controles de cámara (OrbitControls con makeDefault). */
interface CameraControls {
  enabled: boolean;
}

/** Separación sobre la tela mientras se arrastra (el detalle no se hunde). */
const DRAG_LIFT = 0.003;

/** Aspecto de cada tipo de calco. */
const DECAL_LOOK: Record<string, { roughness: number; sheen: number; normal: number }> = {
  patch: { roughness: 0.86, sheen: 0.45, normal: 0.9 },
  embroidery: { roughness: 0.62, sheen: 0.8, normal: 1.2 },
  print: { roughness: 0.55, sheen: 0, normal: 0.3 },
  label: { roughness: 0.75, sheen: 0.4, normal: 0.5 },
  pocket: { roughness: 0.88, sheen: 0.3, normal: 0.8 },
  drawing: { roughness: 0.6, sheen: 0.1, normal: 0.25 },
};

/**
 * Dibuja los detalles colocados a mano sobre la prenda (`build`). Las
 * posiciones se guardaron para la silueta estándar y aquí se trasladan a
 * `body`. Si se da `selectedId`, marca ese detalle con un anillo.
 *
 * Con `onMoveDetail`, cada detalle se puede arrastrar por la tela: mientras se
 * arrastra se desliza tal cual (sin recalcular), pegado a la superficie bajo
 * el puntero, y al soltarlo se vuelve a proyectar en su sitio nuevo.
 */
export function GarmentDetails({
  build,
  details,
  body,
  env,
  motion,
  metal,
  selectedId,
  version = 0,
  onSelectDetail,
  onMoveDetail,
}: {
  build: GarmentBuild;
  details: CustomDetail[];
  body: Body;
  env: THREE.Texture | null;
  motion: ClothMotion | null;
  metal?: MetalFinish;
  selectedId?: string | null;
  /** Cambia cuando la tela se ha movido (simulación): hay que reproyectar. */
  version?: number;
  /** Pulsar un detalle (para seleccionarlo). */
  onSelectDetail?: (id: string) => void;
  /** Soltar un detalle arrastrado: punto y normal en coordenadas de la prenda. */
  onMoveDetail?: (id: string, point: Vec3, normal: Vec3) => void;
}) {
  const targets = useMemo(() => clothTargets(build.parts), [build]);
  const [items, setItems] = useState<{ list: Rendered[]; anchors: Map<string, Anchor> }>({ list: [], anchors: new Map() });
  const detailsKey = JSON.stringify(details);
  const standard = body === makeBody();
  /** Posición y normal guardadas → cuerpo actual. */
  const place = useMemo(
    () =>
      (d: CustomDetail): { p: THREE.Vector3; n: THREE.Vector3 } => {
        const p = new THREE.Vector3(...d.position);
        const n = new THREE.Vector3(...d.normal).normalize();
        // Modelo de la biblioteca: misma deformación que la prenda.
        if (build.library) return build.library.mapDetail(p, n);
        return { p: standard ? p : mapToBody(p, body), n };
      },
    [build, body, standard],
  );

  useEffect(() => {
    let alive = true;
    const created: Rendered[] = [];
    const anchors = new Map<string, Anchor>();
    const textures: THREE.Texture[] = [];
    const finish = METAL_LOOK[metal ?? 'silver'];

    const material = (kind: 'decal' | 'metal' | 'base' | 'thread' | 'face', d: CustomDetail, tex?: DetailTextures) => {
      let m: THREE.MeshPhysicalMaterial;
      if (kind === 'metal') {
        m = new THREE.MeshPhysicalMaterial({ color: d.color, metalness: 1, roughness: finish.roughness, envMap: env, envMapIntensity: 0.9 });
      } else if (kind === 'decal' || kind === 'face') {
        const look = DECAL_LOOK[d.kind] ?? DECAL_LOOK.print;
        m = new THREE.MeshPhysicalMaterial({
          map: tex?.map ?? null,
          normalMap: tex?.normalMap ?? null,
          normalScale: new THREE.Vector2(look.normal, look.normal),
          roughness: look.roughness,
          sheen: look.sheen,
          sheenRoughness: 0.5,
          transparent: true,
          // El dibujo tiene bordes suaves (spray): se funde con la tela.
          alphaTest: d.kind === 'drawing' ? 0.03 : 0.4,
          depthWrite: d.kind !== 'drawing',
          envMap: env,
          envMapIntensity: 0.55,
          // Encima de la tela, sin parpadeos
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        });
      } else {
        m = new THREE.MeshPhysicalMaterial({
          color: kind === 'thread' ? new THREE.Color(d.secondaryColor ?? d.color).offsetHSL(0, 0, -0.15) : d.color,
          roughness: kind === 'thread' ? 0.8 : 0.45,
          clearcoat: kind === 'base' ? 0.3 : 0,
          envMap: env,
          envMapIntensity: 0.55,
        });
      }
      applyClothShader(m, { macro: 0, motion, lining: null, interior: false });
      return m;
    };

    (async () => {
      for (const d of details) {
        const { p, n } = place(d);
        if (isDecal(d.kind)) {
          const image = d.assetId ? await loadAssetImage(d.assetId) : null;
          if (!alive) return;
          // Un dibujo sin su imagen (borrada) no tiene nada que pintar.
          if (d.kind === 'drawing' && !image) {
            anchors.set(d.id, { p, n });
            continue;
          }
          const tex = drawDetail(d, image);
          textures.push(tex.map, tex.normalMap);
          const w = tex.aspect >= 1 ? d.size : d.size * tex.aspect;
          const h = tex.aspect >= 1 ? d.size / tex.aspect : d.size;
          // El dibujo se proyecta en la dirección en que se dibujó; el resto, sobre la tela bajo el punto.
          const g = d.kind === 'drawing' ? projectDrawing(targets, p, n, w, h, d.rotation) : projectDecal(targets, p, n, w, h, d.rotation);
          if (g) created.push({ key: d.id, geometry: g, material: material('decal', d, tex) });
          const hit = hitCloth(targets, p, n);
          anchors.set(d.id, hit ? { p: hit.point, n: hit.normal } : { p, n });
        } else {
          const hit = hitCloth(targets, p, n);
          const at = hit ? hit.point : p;
          const nn = hit ? hit.normal : n;
          anchors.set(d.id, { p: at, n: nn });
          let faceTex: DetailTextures | undefined;
          if (d.kind === 'pin') {
            const image = d.assetId ? await loadAssetImage(d.assetId) : null;
            if (!alive) return;
            faceTex = drawDetail({ ...d, kind: 'patch', shape: 'circle', secondaryColor: d.secondaryColor ?? '#F2F2F2' }, image);
            textures.push(faceTex.map, faceTex.normalMap);
          }
          for (const piece of detailPieces(d, at, nn, targets)) {
            created.push({ key: d.id, geometry: piece.geometry, material: material(piece.look, d, faceTex) });
          }
        }
      }
      if (alive) setItems({ list: created, anchors });
    })();

    return () => {
      alive = false;
      created.forEach((it) => {
        it.geometry.dispose();
        it.material.dispose();
      });
      textures.forEach((t) => t.dispose());
    };
    // detailsKey representa el contenido de details
  }, [detailsKey, targets, env, motion, metal, place, version]);

  // Anillo de selección
  const marker = useMemo(() => {
    const d = details.find((x) => x.id === selectedId);
    if (!d) return null;
    const { p, n } = place(d);
    const hit = hitCloth(targets, p, n);
    const g = new THREE.TorusGeometry(Math.max(0.012, d.size * 0.62), 0.0012, 6, 48);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit?.normal ?? n));
    const at = (hit?.point ?? p).clone().addScaledVector(hit?.normal ?? n, 0.003);
    g.translate(at.x, at.y, at.z);
    return g;
    // detailsKey representa el contenido de details
  }, [selectedId, detailsKey, targets, place, version]);
  useEffect(() => () => marker?.dispose(), [marker]);

  // --- Arrastrar ----------------------------------------------------------
  const controls = useThree((s) => s.controls) as unknown as CameraControls | null;
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const root = useRef<THREE.Group>(null);
  const groups = useRef(new Map<string, THREE.Group>());
  const markerGroup = useRef<THREE.Group>(null);
  const drag = useRef<{ id: string; pointerId: number; x: number; y: number; moving: boolean; anchor: Anchor; to: Anchor | null } | null>(null);
  const draggable = !!onMoveDetail;

  // En pantallas táctiles, el lienzo deja el desplazamiento vertical a la
  // página; mientras se editan detalles, el dedo tiene que poder arrastrarlos.
  useEffect(() => {
    if (!draggable) return;
    const el = gl.domElement;
    const before = el.style.touchAction;
    el.style.touchAction = 'none';
    return () => {
      el.style.touchAction = before;
      el.style.cursor = '';
    };
  }, [draggable, gl]);

  // Al llegar los detalles recalculados (p. ej. tras soltar), quitamos el
  // desplazamiento provisional del arrastre.
  useLayoutEffect(() => {
    for (const g of groups.current.values()) resetMatrix(g);
    invalidate();
  }, [items, invalidate]);
  useLayoutEffect(() => {
    if (markerGroup.current) resetMatrix(markerGroup.current);
    invalidate();
  }, [marker, invalidate]);

  const local = useMemo(() => ({ inv: new THREE.Matrix4(), ray: new THREE.Ray(), caster: new THREE.Raycaster() }), []);

  /** Punto de la tela bajo el puntero (coordenadas de la prenda). */
  const hitUnderPointer = (e: ThreeEvent<PointerEvent>): Anchor | null => {
    if (!root.current) return null;
    local.inv.copy(root.current.matrixWorld).invert();
    local.ray.copy(e.ray).applyMatrix4(local.inv);
    local.caster.ray.copy(local.ray);
    local.caster.far = Infinity;
    const hit = local.caster.intersectObjects(targets, false)[0];
    if (!hit?.face) return null;
    const n = hit.face.normal.clone();
    if (n.dot(local.ray.direction) > 0) n.negate();
    return { p: hit.point.clone(), n };
  };

  /** Mueve el detalle (y su anillo) de `from` a `to` como una pieza rígida. */
  const follow = (id: string, from: Anchor, to: Anchor) => {
    const qFrom = new THREE.Quaternion().setFromEuler(decalOrientation(from.n, 0));
    const qTo = new THREE.Quaternion().setFromEuler(decalOrientation(to.n, 0));
    const q = qTo.multiply(qFrom.invert());
    const lifted = to.p.clone().addScaledVector(to.n, DRAG_LIFT);
    const m = new THREE.Matrix4()
      .makeTranslation(lifted.x, lifted.y, lifted.z)
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
      .multiply(new THREE.Matrix4().makeTranslation(-from.p.x, -from.p.y, -from.p.z));
    const targetsToMove = [groups.current.get(id), id === selectedId ? markerGroup.current : null];
    for (const g of targetsToMove) {
      if (!g) continue;
      g.matrixAutoUpdate = false;
      g.matrix.copy(m);
      g.matrixWorldNeedsUpdate = true;
    }
    invalidate();
  };

  const finish = (commit: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (controls) controls.enabled = true;
    gl.domElement.style.cursor = '';
    if (commit && d.to && onMoveDetail) {
      const r = (v: number) => Math.round(v * 1e4) / 1e4;
      const n = d.to.n.clone().normalize();
      onMoveDetail(d.id, [r(d.to.p.x), r(d.to.p.y), r(d.to.p.z)], [r(n.x), r(n.y), r(n.z)]);
    } else {
      // Sin moverse (o cancelado): vuelve a su sitio.
      const g = groups.current.get(d.id);
      if (g) resetMatrix(g);
      if (markerGroup.current) resetMatrix(markerGroup.current);
      invalidate();
    }
  };

  const handlers = (id: string) =>
    draggable
      ? {
          onPointerDown: (e: ThreeEvent<PointerEvent>) => {
            if (e.button !== 0 || drag.current) return;
            const anchor = items.anchors.get(id);
            if (!anchor) return;
            e.stopPropagation();
            // Que la cámara no gire mientras se arrastra el detalle.
            if (controls) controls.enabled = false;
            (e.target as unknown as Element).setPointerCapture(e.pointerId);
            drag.current = { id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, moving: false, anchor, to: null };
            gl.domElement.style.cursor = 'grabbing';
            onSelectDetail?.(id);
          },
          onPointerMove: (e: ThreeEvent<PointerEvent>) => {
            const d = drag.current;
            if (!d || d.id !== id || e.pointerId !== d.pointerId) return;
            e.stopPropagation();
            // Unos píxeles de margen: un simple clic no mueve el detalle.
            if (!d.moving && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
            d.moving = true;
            const to = hitUnderPointer(e);
            // Fuera de la prenda: el detalle se queda en el último punto válido.
            if (!to) return;
            d.to = to;
            follow(id, d.anchor, to);
          },
          onPointerUp: (e: ThreeEvent<PointerEvent>) => {
            const d = drag.current;
            if (!d || d.id !== id || e.pointerId !== d.pointerId) return;
            e.stopPropagation();
            (e.target as unknown as Element).releasePointerCapture(e.pointerId);
            finish(true);
          },
          onPointerCancel: () => finish(false),
          onLostPointerCapture: () => finish(true),
          // Un clic sobre un detalle lo selecciona; no coloca nada debajo.
          onClick: (e: ThreeEvent<MouseEvent>) => e.stopPropagation(),
          onPointerOver: (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            if (!drag.current) gl.domElement.style.cursor = 'grab';
          },
          onPointerOut: () => {
            if (!drag.current) gl.domElement.style.cursor = '';
          },
        }
      : {};

  // Si el editor desaparece a mitad de un arrastre, devolvemos la cámara.
  useEffect(
    () => () => {
      if (drag.current && controls) controls.enabled = true;
    },
    [controls],
  );

  const ids = [...new Set(items.list.map((it) => it.key))];

  return (
    <group ref={root}>
      {ids.map((id) => (
        <group
          key={id}
          ref={(g) => {
            if (g) groups.current.set(id, g);
            else groups.current.delete(id);
          }}
          {...handlers(id)}
        >
          {items.list.map((it, i) =>
            it.key === id ? <mesh key={i} geometry={it.geometry} material={it.material} castShadow /> : null,
          )}
        </group>
      ))}
      {marker && (
        <group ref={markerGroup}>
          <mesh geometry={marker} raycast={noRaycast}>
            <meshBasicMaterial color="#F2F2F2" depthTest={false} transparent opacity={0.9} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function resetMatrix(g: THREE.Object3D) {
  if (g.matrixAutoUpdate) return;
  g.matrixAutoUpdate = true;
  g.updateMatrix();
  g.matrixWorldNeedsUpdate = true;
}

/** El anillo de selección no intercepta el puntero. */
function noRaycast() {}
