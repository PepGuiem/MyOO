/**
 * Carga diferida del motor 3D (three.js, @react-three/fiber y drei).
 *
 * El 3D pesa más de un megabyte, así que no va en el paquete de arranque: lo
 * descargan solo las páginas que lo usan. Aquí están las funciones `import()`
 * de esas piezas (las mismas que usan `lazy()` en App y Layout; el navegador
 * guarda cada módulo, así que llamarlas dos veces no descarga nada de nuevo)
 * y una precarga en ratos libres para que, al entrar al armario, no haya que
 * esperar.
 */

export const loadHomePage = () => import('../pages/HomePage');
export const loadWardrobePage = () => import('../pages/WardrobePage');
export const loadViewCanvas = () => import('../three/ViewCanvas');

/** ¿El usuario pidió ahorrar datos o va con una conexión muy lenta? */
function saveData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g');
}

let preloaded = false;

/**
 * Precarga el 3D cuando el navegador esté libre (requestIdleCallback), para
 * las páginas sin 3D (menú, cuenta, login…). Solo una vez por visita, y nunca
 * con «ahorro de datos». Devuelve una función para cancelarla si aún no empezó.
 */
export function preload3dWhenIdle(): () => void {
  if (preloaded || typeof window === 'undefined' || saveData()) return () => {};
  const run = () => {
    if (preloaded) return;
    preloaded = true;
    // Los errores (sin red, despliegue nuevo) no importan aquí: la página que
    // lo necesite lo volverá a pedir y enseñará su propio aviso.
    for (const load of [loadViewCanvas, loadWardrobePage, loadHomePage]) load().catch(() => undefined);
  };
  if (typeof window.requestIdleCallback === 'function') {
    // Tras el arranque: como mucho 4 s de espera si el navegador nunca está libre.
    const id = window.requestIdleCallback(run, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  // Safari no tiene requestIdleCallback: un poco después de cargar.
  const id = window.setTimeout(run, 1500);
  return () => window.clearTimeout(id);
}
