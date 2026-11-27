/**
 * Cola de simulaciones de tela en un Web Worker (una cada vez), con caché en
 * memoria por prenda + silueta + capa. La prenda que se está viendo en
 * grande pasa delante de las miniaturas.
 */
import type { SimPlan } from './clothPlan';

type Positions = (Float32Array | null)[];

interface Job {
  id: number;
  plan: SimPlan;
  priority: number;
  resolve: (p: Positions | null) => void;
}

let worker: Worker | null = null;
let busy: Job | null = null;
const queue: Job[] = [];
const cache = new Map<string, Promise<Positions | null>>();
let nextId = 1;

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./clothSim.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  worker.onmessage = (e: MessageEvent<{ id: number; positions?: Positions; error?: string; ms?: number }>) => {
    const job = busy;
    busy = null;
    if (job && job.id === e.data.id) job.resolve(e.data.error ? null : (e.data.positions ?? null));
    pump();
  };
  worker.onerror = () => {
    // Si el worker falla, seguimos sin simulación (modelo procedural).
    busy?.resolve(null);
    busy = null;
    pump();
  };
  return worker;
}

function pump() {
  if (busy || queue.length === 0) return;
  const w = getWorker();
  if (!w) {
    queue.splice(0).forEach((j) => j.resolve(null));
    return;
  }
  // Primero la de más prioridad; a igualdad, la más reciente.
  queue.sort((a, b) => a.priority - b.priority || a.id - b.id);
  const job = queue.pop()!;
  busy = job;
  // Copias: las geometrías originales siguen en uso mientras tanto.
  const parts = job.plan.parts.map((p) => ({ ...p, positions: p.positions.slice(), index: p.mode === 'cloth' && p.index ? p.index.slice() : null }));
  const transfer = parts.flatMap((p) => [p.positions.buffer, ...(p.index ? [p.index.buffer] : [])]);
  w.postMessage({ id: job.id, parts, params: job.plan.params }, transfer);
}

/** Simulaciones en cola o en marcha (la imagen para compartir espera a que acaben). */
export function pendingSimulations(): number {
  return queue.length + (busy ? 1 : 0);
}

/** Pide la simulación (o la devuelve de la caché). `priority` mayor = antes. */
export function requestSimulation(key: string, plan: SimPlan, priority: number): Promise<Positions | null> {
  const cached = cache.get(key);
  if (cached) {
    // Si estaba en cola, sube su prioridad.
    const queued = queue.find((j) => (j as Job & { key?: string }).key === key);
    if (queued) queued.priority = Math.max(queued.priority, priority);
    return cached;
  }
  const promise = new Promise<Positions | null>((resolve) => {
    const job: Job & { key: string } = { id: nextId++, plan, priority, resolve, key };
    queue.push(job);
    pump();
  });
  cache.set(key, promise);
  // Caché limitada (las simulaciones ocupan memoria).
  if (cache.size > 60) cache.delete(cache.keys().next().value as string);
  return promise;
}
