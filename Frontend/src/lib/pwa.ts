import { useSyncExternalStore } from 'react';
import { isNative } from './native';

/**
 * Web instalable (PWA): registro del service worker (public/sw.js), aviso de
 * versión nueva y botón «Instalar la app».
 *
 * - El service worker solo se registra en producción (en desarrollo molestaría
 *   con la caché) y nunca dentro de la app nativa (Capacitor ya lleva la web).
 * - El navegador avisa de que se puede instalar con «beforeinstallprompt»
 *   (Chrome, Edge, Samsung…). Lo guardamos para lanzarlo desde nuestro botón.
 *   Safari en iOS no tiene ese evento: allí se enseña una ayuda (Compartir →
 *   Añadir a pantalla de inicio).
 */

/** Evento de Chrome para instalar (no está en los tipos de TypeScript). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaState {
  /** Hay una versión nueva esperando (o ya activa en otra pestaña): toca recargar. */
  updateReady: boolean;
  /** El navegador deja instalar desde nuestro botón. */
  canPrompt: boolean;
  /** Se acaba de instalar en esta visita. */
  installed: boolean;
}

let state: PwaState = { updateReady: false, canPrompt: false, installed: false };
let installEvent: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
let reloading = false;
const listeners = new Set<() => void>();

function patch(next: Partial<PwaState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => state;

/** Estado de la PWA (se actualiza solo). */
export function usePwa(): PwaState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** ¿Se está usando ya como app instalada (pantalla de inicio)? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone/iPad (los iPad modernos dicen ser un Mac, pero son táctiles). */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** ¿Tiene sentido ofrecer la instalación aquí? */
export function installAvailable(s: PwaState): 'prompt' | 'ios' | null {
  if (isNative || s.installed || isStandalone()) return null;
  if (s.canPrompt) return 'prompt';
  return isIos() ? 'ios' : null;
}

/** Abre el diálogo de instalación del navegador. true si la persona acepta. */
export async function promptInstall(): Promise<boolean> {
  const event = installEvent;
  if (!event) return false;
  // El evento solo se puede usar una vez.
  installEvent = null;
  patch({ canPrompt: false });
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') patch({ installed: true });
    return outcome === 'accepted';
  } catch {
    return false;
  }
}

/** Activa la versión nueva y recarga la página. */
export function applyUpdate(): void {
  // Si otra pestaña ya la activó, basta con recargar.
  if (waitingWorker && waitingWorker.state === 'installed') {
    reloading = true;
    // Al activarse, «controllerchange» recarga la página (ver initPwa).
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    // Por si el navegador no llega a avisar: recarga igualmente al rato.
    window.setTimeout(() => window.location.reload(), 3000);
  } else {
    window.location.reload();
  }
}

// --- Recordar que se cerró el aviso de instalar (no vuelve en un tiempo) ---------

const DISMISS_KEY = 'myout.pwa.installDismissed';
const DISMISS_DAYS = 30;

export function installDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function dismissInstall(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // sin almacenamiento (modo privado): se ocultará solo en esta visita
  }
}

// --- Arranque --------------------------------------------------------------------

/** Cada cuánto se mira si hay versión nueva con la pestaña abierta. */
const UPDATE_EVERY_MS = 30 * 60 * 1000;

function watchRegistration(reg: ServiceWorkerRegistration): void {
  const sw = navigator.serviceWorker;
  // Ya había una versión esperando de una visita anterior.
  if (reg.waiting && sw.controller) {
    waitingWorker = reg.waiting;
    patch({ updateReady: true });
  }
  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      // Sin controller es la primera instalación: no hay nada que actualizar.
      if (installing.state === 'installed' && sw.controller) {
        waitingWorker = installing;
        patch({ updateReady: true });
      }
    });
  });

  // Con la pestaña abierta mucho rato: comprobar de vez en cuando y al volver a ella.
  let lastCheck = Date.now();
  const check = () => {
    if (document.hidden || Date.now() - lastCheck < UPDATE_EVERY_MS) return;
    lastCheck = Date.now();
    reg.update().catch(() => undefined);
  };
  window.setInterval(check, UPDATE_EVERY_MS);
  document.addEventListener('visibilitychange', check);
}

/** Se llama una vez al arrancar (main.tsx). */
export function initPwa(): void {
  if (typeof window === 'undefined' || isNative) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Sin el aviso automático del navegador: lo ofrece nuestro botón.
    e.preventDefault();
    installEvent = e as BeforeInstallPromptEvent;
    patch({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    patch({ canPrompt: false, installed: true });
  });

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  const hadController = !!sw.controller;

  sw.addEventListener('controllerchange', () => {
    if (reloading) {
      window.location.reload();
      return;
    }
    // Otra pestaña activó la versión nueva: aquí se avisa, sin recargar a la fuerza.
    if (hadController) patch({ updateReady: true });
  });

  // Después de la carga, para no competir con lo que necesita la primera pantalla.
  const register = () => {
    sw.register('/sw.js', { scope: '/' })
      .then(watchRegistration)
      .catch(() => undefined);
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
