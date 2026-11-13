/// Web Worker: ejecuta la simulación de tela fuera del hilo principal.
import { simulateCloth, type SimParams, type SimPartIn } from './clothSim';

interface Request {
  id: number;
  parts: SimPartIn[];
  params: SimParams;
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null;
  postMessage: (message: unknown, transfer: Transferable[]) => void;
};

scope.onmessage = (e) => {
  const { id, parts, params } = e.data;
  try {
    const result = simulateCloth(parts, params);
    const transfer = result.positions.filter((p): p is Float32Array => !!p).map((p) => p.buffer);
    scope.postMessage({ id, positions: result.positions, ms: result.ms }, transfer);
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) }, []);
  }
};
