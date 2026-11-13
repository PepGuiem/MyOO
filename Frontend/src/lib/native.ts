import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

/**
 * Integración con la app nativa (Capacitor, Android e iOS). En el navegador no
 * hace nada: la web sigue siendo la misma.
 */

/** true dentro de la app de Android/iOS, false en el navegador. */
export const isNative = Capacitor.isNativePlatform();
/** 'android' | 'ios' | 'web' */
export const platform = Capacitor.getPlatform();

export async function initNative(): Promise<void> {
  if (!isNative) return;
  // Clases para los ajustes de CSS de la app (zonas seguras, etc.).
  document.documentElement.classList.add('is-native', `is-${platform}`);
  // Pantalla completa hasta los bordes (las zonas seguras se respetan en CSS).
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (viewport && !viewport.content.includes('viewport-fit')) viewport.content += ', viewport-fit=cover';

  const [{ App }, { SplashScreen }] = await Promise.all([import('@capacitor/app'), import('@capacitor/splash-screen')]);

  // Texto claro en las barras del sistema (la interfaz es oscura).
  await SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => undefined);

  // Botón «atrás» de Android: vuelve en el historial; en la primera pantalla, sale.
  await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.exitApp();
  });

  // La pantalla de carga se quita cuando React ya ha pintado.
  requestAnimationFrame(() => void SplashScreen.hide());
}
