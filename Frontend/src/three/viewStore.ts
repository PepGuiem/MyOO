import type { RootState } from '@react-three/fiber';
import { createContext, type ReactNode } from 'react';
import * as THREE from 'three';

/**
 * Registro de las miniaturas 3D de la página (cada una es un hueco en el HTML
 * que pinta el canvas compartido). Lo comparten `SceneView` (lado HTML) y
 * `ViewCanvas` (lado WebGL).
 */
export interface ViewEntry {
  id: number;
  el: HTMLElement;
  /** Contenido 3D (cámara, luces, modelo). */
  content: ReactNode;
  /** Escena propia de la miniatura. */
  scene: THREE.Scene;
  /** Estado del portal (para leer su cámara). */
  get: (() => RootState) | null;
  /** Cerca de la pantalla: se sigue su posición y se pinta. */
  near: boolean;
  /** El 3D está montado (se monta al acercarse y se desmonta lejos). */
  mounted: boolean;
  /** Se pintó en el último fotograma (si no, no hace falta animarla). */
  onCanvas: boolean;
  /** Contenedores con overflow que la recortan (carruseles, paneles). */
  clips: HTMLElement[] | null;
  /** Cuándo se calcularon (se rehacen cada poco por si cambia el CSS). */
  clipsAt: number;
  /** Posición en el documento la última vez que se pintó. */
  last: { x: number; y: number; w: number; h: number } | null;
  /** Tamaño que ve el contenido 3D (useThree().size). */
  size: { width: number; height: number };
  version: number;
  listeners: Set<() => void>;
}

let nextId = 1;
export const views = new Map<number, ViewEntry>();
const storeListeners = new Set<() => void>();
let storeVersion = 0;

/** El canvas compartido escucha altas, bajas y montajes. */
export function subscribeViews(cb: () => void): () => void {
  storeListeners.add(cb);
  return () => storeListeners.delete(cb);
}
export const viewsVersion = () => storeVersion;
function emitStore() {
  storeVersion++;
  storeListeners.forEach((l) => l());
  requestDraw();
}

export function createEntry(el: HTMLElement, content: ReactNode): ViewEntry {
  const entry: ViewEntry = {
    id: nextId++,
    el,
    content,
    scene: new THREE.Scene(),
    get: null,
    near: false,
    mounted: false,
    onCanvas: false,
    clips: null,
    clipsAt: 0,
    last: null,
    size: { width: el.clientWidth || 1, height: el.clientHeight || 1 },
    version: 0,
    listeners: new Set(),
  };
  views.set(entry.id, entry);
  emitStore();
  return entry;
}

export function removeEntry(entry: ViewEntry): void {
  views.delete(entry.id);
  emitStore();
}

/** Cambió el contenido de una miniatura (p. ej. empieza a girar). */
export function touchEntry(entry: ViewEntry): void {
  entry.version++;
  entry.listeners.forEach((l) => l());
  requestDraw();
}

export function setNear(entry: ViewEntry, near: boolean): void {
  if (entry.near === near && (!near || entry.mounted)) return;
  entry.near = near;
  if (near && !entry.mounted) queueMount(entry);
  else requestDraw();
  wake();
}

// Montar una miniatura construye su modelo (ajuste al maniquí, materiales):
// se reparten, dos por fotograma y primero las más cercanas al centro de la
// pantalla, para que el scroll no se trabe al entrar muchas a la vez.
const MOUNTS_PER_FRAME = 2;
const mountQueue = new Set<ViewEntry>();
let mountRaf = 0;

function queueMount(entry: ViewEntry) {
  mountQueue.add(entry);
  if (!mountRaf) mountRaf = requestAnimationFrame(flushMounts);
}

function flushMounts() {
  mountRaf = 0;
  const mid = window.innerHeight / 2;
  const ready = [...mountQueue]
    .filter((e) => {
      if (e.near && !e.mounted && views.has(e.id)) return true;
      mountQueue.delete(e);
      return false;
    })
    .map((e) => {
      const r = e.el.getBoundingClientRect();
      return { e, d: Math.abs(r.top + r.height / 2 - mid) };
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, MOUNTS_PER_FRAME);
  for (const { e } of ready) {
    mountQueue.delete(e);
    e.mounted = true;
  }
  if (ready.length) emitStore();
  if (mountQueue.size) mountRaf = requestAnimationFrame(flushMounts);
}

/** Lejos de la pantalla: se desmonta para liberar memoria y trabajo. */
export function setFar(entry: ViewEntry): void {
  if (!entry.mounted || entry.near) return;
  entry.mounted = false;
  entry.get = null;
  entry.last = null;
  emitStore();
}

// ---------------------------------------------------------------------------
// Petición de fotogramas: el canvas compartido registra aquí su `invalidate`.

let invalidate: (() => void) | null = null;
let wakeWatcher: (() => void) | null = null;
export function bindCanvas(fn: (() => void) | null, wakeFn: (() => void) | null): void {
  invalidate = fn;
  wakeWatcher = wakeFn;
}
/** Última vez que cambió algo (alta, contenido, cercanía): mientras sea reciente, se repinta de vez en cuando por si termina de cargar algo. */
export let lastActivity = 0;
export function requestDraw(): void {
  lastActivity = performance.now();
  invalidate?.();
}
function wake() {
  wakeWatcher?.();
}

/** Para que una pieza 3D sepa en qué miniatura está (p. ej. el giro). */
export const ViewEntryContext = createContext<ViewEntry | null>(null);
