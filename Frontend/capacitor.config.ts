import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App nativa de Android e iOS con Capacitor: envuelve la web compilada (dist/).
 * Guía completa en MOVIL.md.
 *
 * La API NO va dentro de la app: la app llama al backend publicado en internet
 * (VITE_API_URL en .env.production) y el backend tiene que aceptar los orígenes
 * de la app en CORS_ORIGIN (https://localhost en Android, capacitor://localhost en iOS).
 */
const config: CapacitorConfig = {
  // Identificador único en las tiendas. No se puede cambiar después de publicar.
  appId: 'com.myout.app',
  appName: 'MyOO',
  webDir: 'dist',
  backgroundColor: '#19191b',
  android: {
    // Solo HTTPS hacia la API (sin tráfico en claro).
    allowMixedContent: false,
  },
  ios: {
    // La web ocupa toda la pantalla; las zonas seguras se respetan en CSS.
    contentInset: 'never',
    scrollEnabled: true,
  },
  plugins: {
    SystemBars: {
      // Android: Capacitor pone --safe-area-inset-* en CSS (también en WebView antiguos).
      insetsHandling: 'css',
      // Texto claro sobre la interfaz oscura.
      style: 'DARK',
    },
    SplashScreen: {
      // Se quita desde el código (lib/native.ts) cuando React ya ha pintado.
      launchAutoHide: false,
      backgroundColor: '#19191b',
      showSpinner: false,
    },
  },
};

export default config;
