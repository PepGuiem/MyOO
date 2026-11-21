# MyOO en Android e iOS (Capacitor)

La app del móvil es la misma web envuelta con [Capacitor](https://capacitorjs.com): Capacitor mete la web compilada (`dist/`) dentro de una app nativa de Android y de iOS. Todo lo que cambies en la web llega a la app al volver a compilarla.

> **APK, AAB e IPA**
> - **APK**: el instalable de Android. Sirve para instalarlo directamente en un móvil y probarlo.
> - **AAB** (Android App Bundle): lo que pide **Google Play** para publicar. Es obligatorio desde 2021.
> - **IPA**: lo que se sube a la **App Store**. Solo se puede generar con **Xcode en un Mac**, o con un servicio de compilación en la nube.

## Qué está ya preparado en el proyecto

| Archivo | Qué hace |
| --- | --- |
| `capacitor.config.ts` | Identificador `com.myout.app`, nombre «MyOO», fondo oscuro, barras del sistema con texto claro y pantalla de carga |
| `package.json` | Dependencias de Capacitor 8 y los scripts `cap:sync`, `cap:android`, `cap:ios` y `cap:assets` |
| `src/lib/native.ts` | Dentro de la app (no en la web): marca `<html class="is-native">`, pone la app a pantalla completa respetando la muesca y la barra de gestos, hace que el botón «atrás» de Android vuelva atrás (y salga en la primera pantalla) y quita la pantalla de carga al arrancar |
| `src/styles.css` (sección «App de Android/iOS») | Zonas seguras (barra de estado, muesca, barra de gestos) |
| `assets/` | Imágenes de origen del icono (las «OO» del logo MyOO sobre fondo grafito) y de la pantalla de carga (el logo completo). `npm run cap:assets` genera con ellas todos los tamaños |
| Cuenta → «Eliminar la cuenta» | Borra la cuenta y todos sus datos. Apple y Google lo **exigen** a las apps que permiten registrarse (backend: `DELETE /api/users/me`, que pide la contraseña) |
| Cuenta → planes | En la app **no se muestra el cambio de plan**: Apple y Google obligan a cobrar las suscripciones digitales con su propio sistema de pagos. En la web sigue igual |

## Lo que necesitas

- **Node.js 22 o superior** (lo pide Capacitor 8).
- **Android Studio 2025.2.1 o superior**, con el SDK de Android. Trae su propio Java.
- **Cuenta de Google Play Console**: pago único de 25 USD.
- Para iOS:
  - **Apple Developer Program**: 99 USD al año.
  - Un **Mac con Xcode 26 o superior**. Si no tienes Mac, sirve un servicio de compilación en la nube con Capacitor, como Codemagic, Ionic Appflow o Capawesome Cloud.
- **El backend publicado en internet con HTTPS** (paso 0).

## 0. Publicar el backend (imprescindible)

En el móvil, la app no puede llamar a `localhost` ni usar el proxy de Vite: necesita la API en una dirección pública con HTTPS, por ejemplo `https://api.tu-dominio.com/api`. Sin esto, la app se abre, pero no se puede entrar ni registrarse.

Hace falta:

- **Un PostgreSQL gestionado.** Las migraciones se aplican con `npx prisma migrate deploy`. **Nunca** se usa `migrate reset` contra producción: borra la base de datos.
- **Un almacenamiento de objetos para las imágenes** (S3, R2, MinIO…). Hoy las imágenes se guardan en disco local (`LocalDiskStorage`), que en la mayoría de servidores en la nube se pierde al reiniciar. Hay que implementar el driver: está pendiente en `estado-y-decisiones.md`.
- **Las variables de entorno de producción:**
  - `NODE_ENV=production`;
  - un `JWT_SECRET` largo y nuevo (nunca el de desarrollo);
  - `ALLOW_SIMULATED_PLAN_CHANGE=false`;
  - `CORS_ORIGIN` con los orígenes de la web y de la app:

    ```
    CORS_ORIGIN=https://tu-web.com,https://localhost,capacitor://localhost
    ```

    `https://localhost` es el origen de la app en Android y `capacitor://localhost` el de iOS.
- **Una página web con la política de privacidad.** Las dos tiendas piden su URL. Google Play pide además una URL donde se pueda solicitar el borrado de la cuenta.

## 1. Instalar y configurar (una vez)

```bash
cd Frontend
npm install
```

Crea en `Frontend/` un archivo **`.env.production`** (no se sube a git) con la URL pública de la API. Vite lo usa en `npm run build`:

```
VITE_API_URL=https://api.tu-dominio.com/api
```

Crea los proyectos nativos (las carpetas `android/` e `ios/`; se suben al repositorio):

```bash
npm run build
npx cap add android
npx cap add ios          # solo en un Mac
npm run cap:assets       # iconos y pantallas de carga en todos los tamaños
```

Ajuste para iOS: en `ios/App/App/Info.plist`, añade `UIViewControllerBasedStatusBarAppearance` con el valor `YES`. Lo pide la barra de estado de Capacitor 8.

## 2. Android

```bash
npm run cap:android      # compila la web, la copia a android/ y abre Android Studio
```

- **Probar en el móvil:** activa la depuración USB, conéctalo y pulsa ▶ en Android Studio. También funciona con un emulador; con el emulador MuMu, primero `adb connect 127.0.0.1:7555`.
- **APK para instalar a mano:** *Build → Generate Signed App Bundle or APK → APK*.
- **AAB para Google Play:** *Build → Generate Signed App Bundle or APK → Android App Bundle*.
  - La primera vez, crea el **almacén de claves** (*keystore*). Guárdalo en un lugar seguro con sus contraseñas: sin él no podrás publicar actualizaciones. **No lo subas al repositorio.**
  - Elige la variante **release**. El AAB queda en `android/app/release/`.
- **En cada versión nueva** sube `versionCode` (un número entero que siempre crece) y `versionName` (por ejemplo «1.0.1») en `android/app/build.gradle`.

**En Google Play Console:**

1. Crea la app y rellena la ficha: descripción, icono de 512 px, imagen destacada de 1024×500 y capturas del móvil.
2. Rellena estos formularios:
   - política de privacidad;
   - **Seguridad de los datos**: se guardan el correo, las prendas y las imágenes que sube el usuario; hay borrado de cuenta;
   - clasificación de contenido;
   - público objetivo;
   - **acceso a la app**: una cuenta de prueba para el revisor, creada en el servidor de producción y sin datos reales.
3. Las cuentas de desarrollador **personales** nuevas deben hacer antes una **prueba cerrada con al menos 12 testers durante 14 días** antes de poder publicar en producción.
4. Sube el AAB a una pista de pruebas y después a Producción.

## 3. iOS (en un Mac)

```bash
npm run cap:ios          # compila la web, la copia a ios/ y abre Xcode
```

1. En Xcode, en el target *App* → *Signing & Capabilities*, elige tu equipo (Team) de Apple Developer. El *Bundle Identifier* es `com.myout.app`.
2. Prueba en un iPhone o en el simulador con ▶.
3. Sube la versión: *Product → Archive → Distribute App → App Store Connect*. En cada envío sube *Build* (y *Version* cuando cambie).
4. En App Store Connect:
   - rellena la ficha con capturas de iPhone de 6,9″ (y de iPad, si se activa);
   - política de privacidad;
   - **etiquetas de privacidad**;
   - una **cuenta de prueba para la revisión**;
   - prueba primero con TestFlight.

Sin Mac, los servicios en la nube compilan el IPA a partir del repositorio. Igualmente necesitas la cuenta de Apple Developer y subir los certificados que te pidan.

## 4. Publicar una actualización

```bash
npm run cap:sync         # build de la web + copia a android/ e ios/
```

Después, genera un AAB o IPA nuevo con el número de versión subido.

## Problemas frecuentes

- **«No se puede conectar con la API»**: revisa `VITE_API_URL` en `.env.production` (tiene que ser HTTPS y pública) y vuelve a ejecutar `npm run cap:sync`.
- **Errores de CORS en la consola**: faltan `https://localhost` o `capacitor://localhost` en el `CORS_ORIGIN` del backend.
- **El 3D va lento en móviles antiguos**: la app usa WebGL igual que la web; en móviles de gama baja conviene probar las miniaturas y el visor.
- **El botón «Usar la cuenta de prueba local» no aparece**: es correcto. Solo existe en desarrollo (`npm run dev`), nunca en la app.
