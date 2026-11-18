# MyOut: backend

API REST para gestionar armarios, prendas y outfits. NestJS 11, Prisma ORM 6 y PostgreSQL 17 (en Docker).

> ⚠️ **Estado de verificación.** Este código se escribió en un entorno sin acceso a npm, así que **todavía no se ha instalado, compilado ni ejecutado**. Lo primero es seguir los pasos de "Puesta en marcha" y ejecutar `npm run typecheck`, `npm test` y `npm run test:e2e`. Si algo falla, el error real indica dónde hay que corregir.

---

## Puesta en marcha (Windows, macOS o Linux)

Requisitos: **Node.js 20.19+ (recomendado 22 LTS)**, **Docker Desktop** arrancado y **Git**.

```bash
cd Backend

# 1. Variables de entorno (valores locales de ejemplo)
cp .env.example .env            # en PowerShell: Copy-Item .env.example .env
cp .env.test.example .env.test  # en PowerShell: Copy-Item .env.test.example .env.test
#    Edita JWT_SECRET en .env con un valor largo y aleatorio:
#    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 2. Dependencias (también genera el cliente de Prisma)
npm install

# 3. PostgreSQL local en Docker
npm run db:up                   # docker compose up -d
docker compose ps               # espera a que ponga "healthy"

# 4. Primera migración: crea las tablas en myout_dev
npx prisma migrate dev --name init

# 5. Datos de prueba (planes, tipos de prenda y usuario demo)
npm run db:seed

# 6. Arrancar la API en modo desarrollo
npm run start:dev
```

- API: http://localhost:3000/api
- Swagger (documentación interactiva): http://localhost:3000/api/docs
- Salud: http://localhost:3000/api/health
- Usuario demo (solo local): `demo@myout.dev` / `Demo1234!`

### Comprobaciones

```bash
npm run typecheck   # comprobación de tipos de TypeScript
npm run format      # da formato con Prettier (hazlo antes del lint)
npm run lint        # ESLint
npm test            # tests unitarios (no necesitan base de datos)
npm run test:e2e    # tests de integración contra la base de datos myout_test
npm run build       # compila a dist/
```

`test:e2e` aplica las migraciones a `myout_test` y **borra sus datos** en cada ejecución. Por seguridad, los tests se niegan a arrancar si `DATABASE_URL` no termina en `_test`.

### Base de datos: comandos útiles

| Comando | Qué hace |
| --- | --- |
| `npm run db:up` / `npm run db:down` | Arranca o para PostgreSQL. **Los datos se conservan** en el volumen `myout_pgdata`. |
| `npx prisma migrate dev --name <cambio>` | Crea y aplica una migración nueva tras editar `schema.prisma`. |
| `npm run db:seed` | Vuelve a sembrar los datos. Es idempotente: no duplica nada. |
| `npm run db:studio` | Abre Prisma Studio para ver las tablas en el navegador. |

⚠️ Comandos **destructivos** (borran datos; úsalos solo si sabes lo que haces):
- `docker compose down -v`: elimina el volumen, es decir, **toda** la base de datos local.
- `npx prisma migrate reset`: borra y recrea la base de datos y vuelve a ejecutar el seed.

> La base de datos de test `myout_test` la crea el script `docker/initdb/01-create-test-db.sql` **solo la primera vez** que se crea el volumen. Si ya tenías el volumen de antes, créala a mano:
> `docker exec -it myout-postgres psql -U myout -d myout_dev -c "CREATE DATABASE myout_test;"`

---

## Qué se ha construido

Equivale a las fases 2 a 10 de `AGENTS.md` (las 11 a 13 quedan pendientes).

| Módulo | Endpoints | Notas |
| --- | --- | --- |
| `auth` | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout` | Argon2id, JWT de 1 h, límite de 10 intentos por minuto e IP |
| `users` | `GET /users/me`, `PATCH /users/me` | Solo se puede cambiar `displayName` |
| `plans` | `GET /plans` (público), `GET /plans/me` | Plan efectivo, límites y uso actual |
| `subscriptions` | `GET /subscriptions`, `POST /subscriptions/change-plan` | Cambio **simulado** (sin pagos) con historial |
| `garment-types` | `GET /garment-types`, `GET /garment-types/:id` (públicos) | Incluye el esquema de atributos de cada tipo |
| `wardrobes` | CRUD en `/wardrobes` | Paginado; nombre único por usuario |
| `wardrobe-items` | CRUD en `/wardrobe-items` | Filtros: `wardrobeId`, `garmentTypeId`, `category`, `season`, `search` |
| `outfits` | CRUD en `/outfits` | `items` sin duplicados (máx. 20); `PATCH` con `items` reemplaza la lista |
| `assets` | `POST /assets` (multipart, campo `file`), `GET /assets`, `GET /assets/:id/content`, `DELETE /assets/:id` | Imágenes del usuario para logos y estampados. Ver «Personalización e imágenes» |
| `stylist` | `GET /stylist/vocabulary`, `POST /stylist/outfits`, `POST /stylist/alternatives`, `GET /stylist/insights`, `POST /stylist/feedback` | Estilista con motor propio (sin IA externa). Ver «Estilista y datos de compra» |
| `health` | `GET /health` | Comprueba la conexión con la base de datos |

Todas las rutas llevan el prefijo `/api` y, salvo las marcadas como públicas, necesitan la cabecera `Authorization: Bearer <token>`.

### Estructura

```
Backend/
├── docker-compose.yml        PostgreSQL 17 con volumen y healthcheck
├── docker/initdb/            crea la base de datos de test
├── prisma/
│   ├── schema.prisma         modelo de datos (tablas, relaciones, índices)
│   ├── seed.ts               npm run db:seed
│   └── seed-data.ts          planes, tipos de prenda y datos demo
├── src/
│   ├── main.ts               arranque + Swagger
│   ├── app.module.ts         módulos, validación y filtro de errores globales
│   ├── app.setup.ts          prefijo /api, helmet y CORS (compartido con los tests)
│   ├── config/               validación de variables de entorno
│   ├── prisma/               PrismaService (conexión a la BD)
│   ├── common/               decoradores, paginación, filtro de errores
│   ├── auth/ users/ plans/ subscriptions/
│   ├── garment-types/ wardrobes/ wardrobe-items/ outfits/
│   └── health/
└── test/                     tests e2e (supertest + BD real)
```

Cada módulo sigue el mismo patrón: **controller** (rutas HTTP), **service** (reglas de negocio y acceso a datos) y **dto/** (forma y validación de los datos de entrada).

---

## Cómo funciona, paso a paso

### Una petición protegida, por ejemplo `POST /api/wardrobes`

1. **AuthGuard** (global) lee `Authorization: Bearer ...`, verifica la firma y la caducidad del JWT y comprueba que el usuario sigue existiendo. Guarda `{ id, email }` en `request.user`.
2. **ValidationPipe** (global) convierte el JSON en un `CreateWardrobeDto`, aplica `@Transform` (por ejemplo, `trim`) y valida con `class-validator`. Los campos desconocidos producen un 400.
3. El **controller** recibe el usuario con `@CurrentUser()`. Nunca usamos un `userId` que envíe el cliente.
4. El **service** abre una **transacción**:
   - `PlansService.assertCanCreate()` bloquea la fila del usuario (`SELECT ... FOR UPDATE`), calcula su plan efectivo, cuenta sus armarios y lanza un 403 `PlanLimitReached` si se pasaría del límite.
   - Crea el armario dentro de la misma transacción.
5. Si algo lanza una excepción, **AllExceptionsFilter** la convierte en una respuesta con formato fijo:
   ```json
   { "statusCode": 409, "error": "Conflict", "message": "...", "path": "/api/wardrobes", "timestamp": "..." }
   ```

### Reglas de negocio

- **Propiedad de los recursos.** Todas las consultas filtran por `id` **y** `userId`. Un recurso de otro usuario devuelve un 404, igual que uno que no existe, para no revelar que existe. Además, la base de datos lo garantiza con **claves foráneas compuestas**: `WardrobeItem(wardrobeId, userId) → Wardrobe(id, userId)` y `OutfitItem(wardrobeItemId, userId) → WardrobeItem(id, userId)`. Es imposible, incluso con un error en el código, meter en tu outfit una prenda de otro usuario.
- **Límites de plan**:
  - Son por usuario en total, no por armario.
  - "Ilimitado" se representa de forma explícita con `PlanLimit.isUnlimited = true`.
  - Si un plan no define un recurso, su límite es 0.
  - Sin suscripción activa se aplica el plan con `isDefault = true` (FREE).
  - Bajar de plan no borra datos: se pueden consultar y borrar, pero no crear nuevos hasta quedar por debajo del límite.
- **Concurrencia.** El bloqueo `FOR UPDATE` hace que, si llegan dos creaciones a la vez, la segunda espere a que termine la primera y cuente ya el recurso nuevo. Hay un test e2e que lanza 6 peticiones simultáneas con límite 2.
- **Historial de suscripciones.** Cambiar de plan marca la suscripción activa como `CANCELED` (con fecha) y crea una nueva `ACTIVE`. No se borra nada.
- **Atributos variables.** Cada `GarmentType` tiene un `attributeSchema` (JSON) que dice qué atributos admite (enum, texto, número o booleano). El backend valida `attributes` contra él (`src/garment-types/attribute-schema.ts`) y rechaza claves desconocidas. Si se cambia el tipo de una prenda, sus atributos se revalidan con el esquema del tipo nuevo.
- **Imágenes.** Solo se guarda `imageUrl` (validada como http/https). La subida a un almacenamiento externo es la fase 11.

---

## Conceptos nuevos que aparecen

**TypeScript**
- *Modo estricto* (`strict: true`): obliga a tratar `null`/`undefined` y prohíbe el `any` implícito.
- `!` en los DTO (`name!: string`): le dice a TypeScript "este campo lo rellena otro (class-transformer)".
- `satisfies`: comprueba que un objeto cumple un tipo sin perder su tipo exacto (se usa con los `select` de Prisma).
- *Tipos unión* y `switch` exhaustivo (`AttributeField`, `LimitedResource`).

**NestJS**
- *Módulos, controllers, providers* e *inyección de dependencias*: Nest crea los servicios y los pasa por el constructor.
- *Guards* (`AuthGuard`, `ThrottlerGuard`): deciden si una petición puede continuar.
- *Pipes* (`ValidationPipe`, `ParseUUIDPipe`): transforman y validan la entrada.
- *Exception filters*: dan formato a los errores.
- *Decoradores propios*: `@Public()` y `@CurrentUser()`.
- `APP_GUARD`, `APP_PIPE` y `APP_FILTER`: registran esas piezas de forma global.

**SQL y PostgreSQL**
- Claves foráneas compuestas, `UNIQUE` compuesto, índices.
- `ON DELETE CASCADE` (al borrar un armario se borran sus prendas) frente a `RESTRICT` (no se puede borrar un plan con suscripciones).
- Transacciones y bloqueo de filas con `SELECT ... FOR UPDATE`.

**Prisma**
- `schema.prisma` → `prisma migrate dev` genera SQL versionado en `prisma/migrations/`. **No edites una migración ya aplicada**: crea otra.
- `select` para devolver solo los campos públicos (nunca `passwordHash`).
- `$transaction([...])` (lote) y `$transaction(async (tx) => ...)` (interactiva).
- Códigos de error: `P2002` (único), `P2003` (clave foránea) y `P2025` (no encontrado).

---

## Seguridad: decisiones y limitaciones

- Las contraseñas se guardan como hash **Argon2id**. Cuando el email no existe, el login verifica contra un hash "señuelo" para que la respuesta tarde lo mismo.
- **JWT sin revocación.** El "logout" consiste en que el cliente borre el token; el token sigue siendo válido hasta que caduca (1 h por defecto). Para revocarlo de verdad harían falta refresh tokens en la base de datos o una lista de revocados.
- Tienes `helmet` (cabeceras de seguridad), CORS limitado a `CORS_ORIGIN` y *rate limiting* en `/auth`.
- Los errores 500 se registran en el log del servidor (solo método y ruta) y el cliente solo ve "Internal server error".
- `.env` está en `.gitignore`. `.env.example` contiene solo valores locales ficticios.

### Dependencias añadidas y para qué sirven

| Paquete | Por qué |
| --- | --- |
| `@nestjs/config` | Leer y validar `.env` |
| `@nestjs/jwt` | Firmar y verificar tokens |
| `@nestjs/swagger` | Documentación OpenAPI |
| `@nestjs/throttler` | Limitar intentos de login y registro |
| `argon2` | Hash de contraseñas (Argon2id) |
| `class-validator`, `class-transformer` | Validar y transformar DTO |
| `helmet` | Cabeceras HTTP de seguridad |
| `dotenv-cli` (dev) | Ejecutar los tests e2e con `.env.test` |

**¿Por qué Prisma 6 y no 7?** Prisma 7 cambia la configuración (`prisma.config.ts`, adaptadores de driver obligatorios y cliente generado en ESM) y la integración con NestJS en CommonJS necesita ajustes extra. Prisma 6 funciona directamente con esta configuración. Migrar a la versión 7 debería ser una fase propia, siguiendo la guía oficial de actualización.

---

## Catálogo y modelos 3D de la biblioteca

El catálogo (`prisma/garment-catalog.ts`) incluye las opciones que usan los modelos de `prendas_3d_glb` en la web:
- tipo **Ropa interior** (`UNDERWEAR`, slip, bóxer corto y bóxer largo);
- cuello «Con capucha (sudadera)» en el jersey;
- tipos «Anorak» y «Con capucha (abierta)» en la chaqueta;
- corte «Mallas (ciclista)» en el pantalón corto;
- manga «Larga raglán» en la camiseta y cuello «Con capucha y media cremallera» en el jersey;
- campo **«Modelo 3D»** (`model3d`) en las prendas con modelos de biblioteca: automático, colección punto, colección casual (camisas), colección clásica o generado por código. Lo tienen también el abrigo y el pantalón;
- colección casual (`prendas_casual_glb`):
  - tipo **Bufanda** (`SCARF`, accesorio, punto fino o grueso);
  - tipo de chaqueta «Chándal (cremallera y vivos)» (`track`).

Son valores nuevos: no cambia ninguno existente ni hace falta migración. Basta con `npm run db:seed`, que también añade prendas y outfits demo. Qué modelo usa cada prenda lo decide el frontend (`Frontend/src/three/libraryCatalog.ts`).

**Prendas y outfits demo de la colección casual** (ids `320`–`335` y `406`–`410`):
- prendas: camisa de cuadros, camisetas de rayas, sobrecamisa verde oliva, bufanda escocesa, parka negra con pelo, chaqueta de chándal con vivos verdes, camisa azul marino, sudadera retro, jersey gris y tres vaqueros;
- 5 outfits: «Cuadros de verano», «Rayas y vaquero», «Capas de otoño», «Parka de invierno» y «Chándal urbano».

Con los 5 outfits anteriores, el usuario demo llega a los 10 que permite el plan gratuito; el resto de prendas quedan en el armario para combinarlas.

## Estilo de las prendas en un outfit

`OutfitItem.styling` (migración `20261024160000_outfit_item_styling`, JSON con `{}` por defecto) guarda cómo se lleva cada prenda en ese outfit. Se envía en `items[].styling` al crear o editar el outfit:

```json
{ "wardrobeItemId": "…", "styling": { "tuck": "in", "sleeves": "rolled" } }
```

- Opciones y valores en `src/outfits/styling.ts`: `tuck`, `sleeves`, `front`, `hem`, `boots`, `visor` y `hood` (capucha puesta o bajada), cada una disponible solo en ciertos tipos de prenda.
- `GET /garment-types` las devuelve como `stylingOptions` (clave, etiqueta y valores), para que el frontend no las repita.
- Se validan con formato cerrado según el tipo de cada prenda: una clave de otra prenda o un valor desconocido devuelven 400.
- El seed da estilo a tres outfits demo (camiseta medio metida, camisa por dentro y remangada, gorra hacia atrás).

Tests: `src/outfits/styling.spec.ts` y `test/outfit-styling.e2e-spec.ts`.

## Personalización e imágenes

**Personalización de prendas.** `WardrobeItem.customization` es un JSON (migración `customization_and_assets`) con `colors`, `parts`, `options` y `details`. Se envía en `POST`/`PATCH /wardrobe-items`.
- `src/customization/customization-options.ts` define qué admite cada modelo (colores, piezas, opciones) y los límites. `GET /garment-types` lo expone como `customizationOptions`.
- `src/customization/customization.ts` lo valida con **formato cerrado**: claves desconocidas rechazadas, colores `#RRGGBB`, números finitos dentro de rango, normales unitarias, texto sin caracteres de control ni de dirección (bidi), máx. 30 detalles y 40 caracteres de texto, ids únicos.
- Si un detalle usa una imagen (`assetId`), se comprueba que la imagen es **del mismo usuario**.
- Al cambiar el tipo de prenda se descartan las opciones que el nuevo tipo no admite.
- **Estampado de la tela** (opciones `pattern` y `patternSize`, colores `pattern` y `pattern2`):
  - estampados: liso, rayas, marinera, raya diplomática, vichy, cuadros, escocés y bloques retro;
  - tamaños: pequeño, mediano y grande;
  - disponible en las prendas de tela, no en calzado, gorra ni ropa interior.

**Imágenes (`assets`).**
- Se aceptan PNG, JPEG y WebP de hasta **2 MB** y **4096 px** por lado, y **100 imágenes por usuario**. El tipo se detecta por los *magic bytes* del archivo, no por la extensión ni por el `Content-Type` del cliente.
- El archivo va al almacenamiento (`StorageService`) y la base de datos guarda solo la referencia (`storageKey`, tipo, tamaño, dimensiones).
- `GET /assets/:id/content` exige el token y responde con `nosniff`, `Content-Security-Policy: sandbox` y caché privada.
- No se puede borrar una imagen que use alguna prenda (409).
- Driver actual: **disco local** en `STORAGE_DIR` (por defecto `storage/`, ignorado en git; los tests usan `storage-test/`). Es solo para desarrollo: en producción hay que implementar `StorageService` con S3/R2/MinIO.
- Limitación: al borrar un usuario se borran sus filas `Asset` en cascada, pero no sus archivos del disco.

Tests: `src/customization/customization.spec.ts`, `src/assets/image-info.spec.ts` (unitarios) y `test/assets-customization.e2e-spec.ts`.

---

## Estilista y datos de compra

**Datos de compra de una prenda** (`WardrobeItem`, todos opcionales): `styles` (hasta 4 de `casual`, `streetwear`, `minimalist`, `old_money`, `formal`, `sporty`, `vintage`, `elegant`, `y2k`, `smart_casual`), `productName`, `storeName`, `purchasePlatform` (`store`, `online`, `marketplace`, `second_hand`, `gift`, `other`), `productUrl` (solo `http`/`https`), `productRef`, `purchasePrice` (decimal, 2 decimales), `currency` (ISO de 3 letras; `EUR` si se da precio al crear) y `purchaseDate` (`AAAA-MM-DD`). En `PATCH`, `null` borra el campo. La marca sigue en `attributes.brand`.

**Motor del estilista** (`src/stylist/engine.ts`): funciones puras, deterministas con la misma `seed`, sin servicios externos.

- Clasifica cada prenda: hueco (arriba, capa, abajo, vestido, abrigo, calzado, cabeza, cuello), familia de color (neutro, tierra, color) a partir del HSL, nombre del color, nivel de arreglo (0 a 1) y estilos (los que puso el usuario o deducidos del tipo y los atributos). La ropa interior nunca entra en un outfit.
- Puntúa combinaciones por armonía de color, estampados que chocan, estilo y ocasión pedidos, tiempo (`cold`, `cool`, `mild`, `hot`), temporada y preferencias aprendidas. Elige varias propuestas distintas entre sí (diversidad tipo MMR).
- Devuelve razones («por qué funciona»), paleta y consejos con acción: `add` (añadir una prenda), `swap` (cambiar una por otra) y `styling` (doblar el bajo, meter la camiseta, abrir la chaqueta, remangar). Los consejos que el usuario rechaza a menudo dejan de salir.
- `alternatives` propone sustitutas del mismo hueco; `insights` analiza el armario (qué falta, colores y estilos dominantes, prendas sin usar).

**Aprendizaje**: `POST /stylist/feedback` guarda señales (`LIKE`, `DISLIKE`, `SAVE`, `WEAR`, `ACCEPT_TIP`, `REJECT_TIP`, `SWAP`) en `StylistFeedback`. Al generar se leen las 500 últimas y cuántas veces aparece cada prenda en outfits guardados. Todas las prendas que llegan en una petición se comprueban contra el usuario autenticado (400 si alguna no es suya).

Migración: `prisma/migrations/20261107200000_purchase_info_and_stylist`. Tests: `src/stylist/engine.spec.ts` (unitarios) y `test/stylist.e2e-spec.ts` (e2e, pendiente de ejecutar).

Limitación: las filas de `StylistFeedback` no se purgan todavía (solo se leen las 500 últimas).

---

## Perfil, login con Google / Apple e Instagram

### Qué hay

- **Perfil ampliado** (`PATCH /api/users/me`): `@usuario` único, bio, pronombres, ciudad, web, `@` de Instagram, estilos (los mismos del estilista, hasta 5), colores favoritos, tallas, color de acento, **foto de perfil** y **portada** (imágenes subidas con `POST /api/assets`; solo propias). Al cambiar la foto, la anterior se borra. `GET /api/users/me/username-available?username=` dice si un `@` está libre.
- **Login con Google y Apple** (OpenID Connect). Una cuenta creada así no tiene contraseña: puede crearla en `POST /api/users/me/password`.
- **Cuentas conectadas** (`AuthAccount`): Google, Apple e Instagram. `DELETE /api/users/me/accounts/:provider` desconecta, pero nunca deja la cuenta sin forma de entrar.
- **Instagram** (API de Instagram con inicio de sesión de Instagram): solo cuentas **profesionales** (creador o empresa); Meta cerró el acceso a las personales en diciembre de 2024. `GET /api/users/me/instagram` devuelve el perfil y las 12 últimas publicaciones; `POST /api/users/me/instagram/use-photo` copia su foto de perfil. Para cuentas personales queda el campo `instagramHandle` (un enlace).

### Cómo funciona el flujo (paso a paso)

1. El navegador va a `GET /api/auth/oauth/google/start`. El backend crea un `OAuthFlow` con un `state` aleatorio (en la base de datos solo su **hash**), un `nonce` y un **PKCE** (Google), pone una cookie `HttpOnly` que ata el flujo a ese navegador y redirige a Google.
2. Google vuelve a `/api/auth/oauth/google/callback?code=…&state=…` (Apple vuelve con un **POST** de formulario). El backend comprueba state, caducidad, que no se haya usado y la cookie; **canjea el código en el servidor** (el secreto nunca llega al navegador) y **verifica el ID token**: firma con las claves públicas del proveedor, `iss`, `aud`, `exp` y `nonce` (`src/oauth/oidc.ts`).
3. Redirige al frontend con un código de **un solo uso** en el fragmento: `/auth/callback#result=…`. El fragmento no se envía a ningún servidor ni queda en los logs.
4. El frontend lo canjea: `POST /api/auth/oauth/exchange` (login → token de MyOut) o, con sesión, `POST /api/auth/oauth/exchange/me` (conectar cuenta o confirmar identidad). Conectar una cuenta exige la sesión del **mismo** usuario que empezó: si alguien te manda su enlace, no se conecta nada.

### Decisiones de seguridad

- **Unir por email solo si el proveedor lo verifica.** Además, como el registro con contraseña no verifica el email, si al unir la cuenta tenía contraseña y su email nunca se verificó, **se quita la contraseña** (protección contra "pre-account takeover": alguien pudo registrarse antes con tu email). El usuario lo ve en el perfil y puede crear otra.
- **Sin contraseña, las acciones delicadas piden volver a entrar** con Google/Apple (`intent: reauth`): borrar la cuenta y crear contraseña. Un token de sesión robado no basta.
- **Tokens de Instagram cifrados** con AES-256-GCM (`TOKEN_ENCRYPTION_KEY`); nunca se devuelven en la API. Los de Google/Apple no se guardan.
- Las fotos de Google/Instagram se descargan solo de sus dominios, por HTTPS, sin redirecciones y con límite de 2 MB (evita SSRF).
- Sin dependencias nuevas: `@nestjs/jwt` (ya instalado) verifica los ID tokens y firma el client secret de Apple; el resto es `node:crypto` y `fetch`.

### Configuración (todo opcional; sin variables, el botón no aparece)

Variables en `.env` (ver `.env.example`). Redirect URIs que hay que registrar en cada consola:

```
<OAUTH_PUBLIC_API_URL>/auth/oauth/google/callback
<OAUTH_PUBLIC_API_URL>/auth/oauth/apple/callback
<OAUTH_PUBLIC_API_URL>/auth/oauth/instagram/callback
```

En desarrollo `OAUTH_PUBLIC_API_URL=http://localhost:5173/api` (pasa por el proxy de Vite, así la cookie del flujo queda en el mismo origen que la web).

- **Google**: Google Cloud Console → APIs y servicios → Credenciales → ID de cliente OAuth (aplicación web). Funciona con `http://localhost`.
- **Apple**: cuenta de Apple Developer (de pago). Crea un *Services ID* (es `APPLE_CLIENT_ID`), activa *Sign in with Apple*, y una *Key* (.p8). Apple **exige HTTPS y un dominio real** (no `localhost`): en local usa un túnel HTTPS y pon su URL en `FRONTEND_URL` y `OAUTH_PUBLIC_API_URL` (y en `server.allowedHosts` de Vite). Guarda la .p8 fuera del repositorio (`*.p8` está en `.gitignore`).
- **Instagram**: Meta for Developers → crea una app → producto Instagram → *API con inicio de sesión de Instagram*. Permiso `instagram_business_basic`. Necesita también `TOKEN_ENCRYPTION_KEY`.

### Comandos

```bash
npm run db:migrate      # aplica la migración 20261110180000_profile_and_oauth (local)
npm test                # unitarias
npm run test:e2e        # e2e (incluye test/profile-oauth.e2e-spec.ts)
```

## Red social: seguidores, privacidad y chats en tiempo real

### Qué hay
- **Privacidad** (en `PATCH /api/users/me`): `isPrivate` (cuenta privada) y `messagePolicy` (quién puede escribirte: `EVERYONE`, `FOLLOWING` —por defecto— o `NOBODY`).
- **Seguidores** (`/api/people/...`): seguir es inmediato en cuentas públicas y una **solicitud** en las privadas (`/api/follow-requests`, aceptar o rechazar). Al pasar a pública, las pendientes se aceptan. También quitar a un seguidor.
- **Bloqueos**: deja de seguirse en los dos sentidos, no se ven (su perfil da 404), no se escriben y no aparecen en la búsqueda.
- **Perfiles de otras personas** (`GET /api/people/:id-o-@usuario`): foto, nombre y bio siempre; outfits compartidos, seguidores, seguidos, web, estilos y portada solo si el perfil es público o le sigues. Las tallas nunca se muestran a otros.
- **Outfits compartidos**: `isShared` en el outfit. Al verlos otros no se envían datos de compra ni `modelUrl` (una URL externa podría rastrear a quien mira).
- **Chats** (`/api/conversations`): 1 a 1 y grupos (hasta 32), texto y outfits (se guarda una copia). No leídos, «Visto», «escribiendo…», borrar tus mensajes, grupos con creador/admins, añadir, quitar, renombrar y salir (si sale el creador, pasa a otro).
- **Tiempo real** con WebSocket en `/api/ws` (librería `ws`, mismo puerto que la API).

### Reglas de quién puede escribir (`src/social/relations.service.ts`)
1. Nunca con un bloqueo de por medio.
2. Empezar un chat o añadir a un grupo: lo decide el ajuste de **quien recibe** (todos / solo las personas que sigue / nadie).
3. En un 1 a 1 ya empezado puedes **contestar** a quien te escribió aunque su ajuste no lo permitiera al revés.
4. En un grupo escribe cualquier miembro.

### Cómo funciona el WebSocket (paso a paso)
1. El navegador no puede enviar `Authorization` al abrir un WebSocket. Pide un **ticket** con su token: `POST /api/realtime/ticket` (30 s, un solo uso, solo se guarda su hash).
2. Abre `ws(s)://<web>/api/ws?ticket=...`. El servidor comprueba el **Origin** (que sea la web de MyOut: evita que otra página use tu sesión) y gasta el ticket.
3. Los envíos van por REST (validados con DTO, con sus errores HTTP) y el servidor **avisa** por el WebSocket a los miembros: `message`, `message_deleted`, `read`, `typing`, `conversation`, `follow_request`, `new_follower`, `follow_accepted`.
4. Del navegador solo llega `typing` (y `ping`). Límites: 4 KB por mensaje, 40 por 10 s, 6 conexiones por usuario, 15 mensajes de chat por 10 s.
5. Ping cada 30 s (se cortan las conexiones muertas) y la conexión se cierra cuando caduca el token de sesión; el frontend reconecta solo.

**Limitación:** las conexiones y los tickets viven en la memoria del proceso. Con varias instancias del backend haría falta Redis (pub/sub) para repartir los eventos.

### Dependencia nueva
- `ws` (y `@types/ws` en desarrollo): servidor WebSocket estándar y muy usado en Node. Se usa directamente (sin `@nestjs/websockets`) para que el flujo quede explícito en `src/realtime/realtime.gateway.ts`.

### Comandos
```bash
npm install            # instala ws y @types/ws
npm run db:migrate     # migración 20261110200000_social_and_chat (local)
npm test               # incluye realtime.gateway.spec.ts (WebSocket real en un puerto libre)
npm run test:e2e       # incluye test/social-chat.e2e-spec.ts
```

## Ideas, denuncias, novedades, avisos y administración

### Qué hay
- **Tablón de ideas** (`/api/ideas`): proponer (máx. 5 al día; quien propone la vota a la vez), votar y quitar el voto (uno por persona, recuento en `voteCount`), ordenar por votos o recientes, filtrar por estado y buscar. La autora puede borrarla mientras está `NEW` y sin respuesta.
- **Denuncias** (`POST /api/reports`): de un perfil, un mensaje, un outfit compartido o una idea. Solo se puede denunciar lo que tú puedes ver (un mensaje, solo si estás en esa conversación) y se guarda una **copia** de lo denunciado. Una persona denuncia una vez lo mismo (repetir devuelve la misma denuncia).
- **Novedades** (`GET /api/releases`): solo lo publicado. Los borradores los ve el admin.
- **Avisos / campanita** (`/api/notifications`, `/unread`, `POST /read`): se guardan en la base de datos y, si estás conectado, llegan al momento por el WebSocket como `{ type: "notification" }`. Tipos: novedad publicada, respuesta o cambio de estado en una idea, solicitudes y nuevos seguidores, denuncia revisada. Los enlaces solo pueden ser rutas internas.
- **Panel de admin** (`/api/admin/*`, solo rol `ADMIN`): resumen, cuentas (buscar, ficha con denuncias e historial), **suspender** (con motivo y días, o indefinida) y levantar, gestionar ideas (estado, respuesta pública, fijar, ocultar, borrar), denuncias (resolver, descartar, reabrir; avisar a quien denunció), ocultar outfits, borrar mensajes **denunciados**, novedades (borrador → publicar con aviso a todas las cuentas, retirar, borrar) y **registro** de todo lo que hacen los admins (`AdminAction`).

### Cómo se hace alguien admin
Solo desde el servidor, nunca por la web:
```bash
npm run admin:grant -- tu@email.com            # dar el rol (la cuenta tiene que existir)
npm run admin:grant -- tu@email.com --revoke   # quitarlo
npm run admin:grant -- --list                  # ver quién es admin
```
El script (`prisma/admin-grant.ts`) usa la `DATABASE_URL` de tu `.env` y enseña a qué base de datos se conecta antes de cambiar nada.

### Decisiones de seguridad y privacidad
- El rol y la suspensión se leen de la base de datos **en cada petición** (`AuthGuard`), no del token: quitar el rol o suspender vale al momento.
- Suspender: el `AuthGuard` responde 403 con `code: "banned"`, motivo y fecha; no se emite token nuevo (ni con contraseña ni con Google/Apple); se cierran sus WebSockets (código 4004); su perfil da 404 y no sale en búsquedas.
- Un admin no puede suspenderse ni suspender a otro admin (primero se le quita el rol con el script).
- **El admin no puede leer chats.** Solo ve la copia de un mensaje que alguien de esa conversación ha denunciado, y solo puede borrar mensajes denunciados.
- Al revisar una denuncia, quien denunció recibe un aviso genérico (no se le cuenta qué medidas se han tomado).
- El registro `AdminAction` no tiene claves foráneas a propósito: se conserva aunque se borre una cuenta.

### Comandos
```bash
npm run db:migrate     # migración 20261112190000_admin_ideas_releases (local)
npm run admin:grant -- tu@email.com
npm test               # ban.spec, admin.guard.spec, admin.service.spec, ideas.service.spec
npm run test:e2e       # incluye test/admin-ideas.e2e-spec.ts
```

**Limitación:** avisar de una novedad a todas las cuentas se hace dentro de la petición, por tandas de 1000. Con muchísimos usuarios convendría pasarlo a una cola de trabajos.

## Monitor para admins (`/api/admin/monitor/*`)

Solo rol `ADMIN`. Lo usa la página `/monitor` del frontend.

- `GET /live?range=1h|6h|24h`: estado general y comprobaciones (base de datos, errores 5xx, latencia p95, bucle de eventos, memoria, denuncias pendientes; umbrales en `src/monitoring/checks.ts`), peticiones por minuto con 4xx/5xx y p50/p95, rutas más usadas de la última hora, últimos errores 5xx, proceso (memoria, CPU, retardo del bucle) y conexiones en tiempo real.
- `GET /database`: ping, versión de PostgreSQL, tamaño, conexiones y tablas más grandes.
- `GET /activity?days=7|30|90`: activos diarios/semanales/mensuales, altas, outfits, prendas, mensajes, ideas y denuncias por día (en hora de Madrid) y totales.
- `GET /feed`: últimos eventos (altas, denuncias, ideas, novedades, acciones de admin).

**Cómo se mide**
- `src/monitoring/metrics.middleware.ts` mide cada petición (código, tiempo y el **patrón** de la ruta, p. ej. `/api/ideas/:id`; nunca la URL real, cuerpos, cabeceras ni quién llama). Las métricas viven en memoria (24 h por minuto) y se pierden al reiniciar; con varias instancias cada una vería solo lo suyo.
- Del error 5xx solo se guarda la clase (p. ej. `PrismaClientKnownRequestError`), nunca el mensaje.
- Activos: la tabla `DailyActive` guarda una fila por usuario y día (la primera petición autenticada del día; el resto solo mira un Set en memoria).

```bash
npm run db:migrate     # migración 20261112210000_monitoring (tabla DailyActive)
npm test               # metrics.spec, checks.spec, activity.service.spec
npm run test:e2e       # incluye test/monitoring.e2e-spec.ts
```

## Outfits: estilos, favoritos y OUTFIT RATING

**Estilos y favoritos.** `Outfit.style` (STREETWEAR, TECHWEAR, OLD_MONEY, CASUAL, SKATE, GRUNGE, Y2K, MINIMAL, TRAP, LUXURY_STREETWEAR) e `isFavorite`. `GET /api/outfits` acepta `style`, `favorite=true`, `search` y `sort=new|old|name|score`; `GET /api/outfits/summary` da las cifras de los filtros y `POST /api/outfits/:id/duplicate` copia un outfit (cuenta para el límite del plan).

**OUTFIT RATING** (`src/outfits/rating/`): nota automática de 0 a 100, en cuatro categorías de 25 puntos.

| Categoría | Qué mira (reglas de `rules-engine.ts`) |
|---|---|
| Combinación de colores | Armonía en la rueda de color (neutros, un acento, monocromo, análogos, complementarios, colores que chocan), contraste claro-oscuro arriba/abajo, tono sobre tono, tonos tierra, color que se repite, estampados que compiten y lo que pide cada estilo (old money y minimal: colores apagados; techwear: paleta oscura). |
| Coherencia del estilo | Cuántas prendas encajan con el estilo marcado (o con el que se detecta), nivel de arreglo medio frente al del estilo, dispersión entre la prenda más arreglada y la más informal, y la ocasión si se reconoce («fiesta», «curro», «boda»...). |
| Equilibrio de prendas | Arriba, abajo y calzado; piezas duplicadas (dos pantalones, dos calzados); juego de volúmenes (ancho/ajustado); capas según la temporada; prendas de otra temporada; número de piezas. |
| Accesorios y detalles | Número de accesorios, si encajan con el estilo y si ponen o repiten el color; cómo se lleva cada prenda (por dentro, remangada...); personalización; un estampado protagonista; calzado que pone el color. |

Niveles: 0-39 Beginner, 40-59 Casual, 60-79 Good Style, 80-94 Fashion Killer, 95-100 Streetwear Legend. Cada regla deja una comprobación con sus puntos y un texto: de ahí salen el desglose, los comentarios y los consejos. Los consejos concretos («añade estas zapatillas: +6») se calculan probando las prendas del armario con el mismo motor, así que los puntos que prometen son exactos. Reutiliza las funciones del estilista (`src/stylist/engine.ts`: color, nivel de arreglo, estilos deducidos). No usa ninguna IA.

- Se calcula al crear, editar (solo si cambian prendas, estilo, ocasión o temporada) y duplicar, fuera de la transacción: si fallara, el outfit se guarda igual. Los outfits antiguos se puntúan la primera vez que salen en la lista.
- `OutfitRating` guarda el historial; solo añade fila si cambia la **huella** (SHA-256 de prendas, colores, atributos, cómo se llevan, estilo, ocasión, temporada y motor). `Outfit.ratingScore`/`ratingTier`/`ratedAt` copian la última nota para listar y ordenar.
- Rutas: `GET /api/outfits/:id/rating` (última nota; `stale: true` si algo cambió, p. ej. el color de una prenda), `POST /api/outfits/:id/rating` (recalcular), `GET /api/outfits/:id/ratings` (historial), `POST /api/outfits/ratings/preview` (nota de una combinación sin guardar, la usa el vestidor en directo) y `GET /api/outfits/ratings/compare?ids=a,b` (2 a 4 outfits).

**Preparado para IA.** El motor es un proveedor con la interfaz `RatingEngine` (`rating.types.ts`) y el token `OUTFIT_RATING_ENGINE` (`outfits.module.ts`). Un motor futuro solo tiene que devolver el mismo `RatingResult` y registrarse en lugar de `RulesRatingEngine` (o envolverlo: calcular con las reglas y reescribir los comentarios). Cada fila del historial guarda qué motor la calculó (`engine`: «rules@1»), y al cambiar de motor cambia la huella, así que las notas se recalculan solas.

```bash
npm run db:migrate     # migraciones 20261112220000_outfit_style_favorite y 20261113170000_outfit_rating
npm test               # incluye src/outfits/rating/rules-engine.spec.ts
npm run test:e2e       # test/outfits.e2e-spec.ts (estilos, favoritos, duplicar y OUTFIT RATING)
```

## OUTFIT CALENDAR (`/api/calendar`)

Qué outfit te pones cada día. Tabla `CalendarEntry` (usuario, outfit, día `DATE` sin hora ni zona horaria, nota, evento especial opcional con nombre y tipo, y `wornAt` cuando lo marcas como usado). El outfit va con clave foránea compuesta (`outfitId` + `userId`), así que la base de datos impide poner un outfit de otra persona; si borras el outfit, se borran sus días del calendario. Máximo 4 outfits por día (p. ej. el del día y el de un evento por la noche).

- `GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` (máx. 62 días): días con el outfit completo (para la vista previa) y `repeat` si se repite.
- `POST /api/calendar`, `PATCH /api/calendar/:id` (fecha, outfit, nota, evento, `worn`), `DELETE /api/calendar/:id`. Solo se puede marcar como usado un día que ya ha llegado (se admite hasta «mañana» en UTC porque el servidor no sabe tu zona horaria).
- `GET /api/calendar/insights?today=YYYY-MM-DD`: estadísticas, repeticiones, próximos 7 días y eventos de los próximos 60.
- `GET /api/calendar/suggestions?date=YYYY-MM-DD`: outfits recomendados para ese día.

**Reglas** (`src/calendar/calendar.rules.ts`, funciones puras con tests):
- Repetición: aviso si el mismo outfit vuelve a salir en 6 días o menos, o 4 veces o más en 30 días (más fuerte con 2 días o menos, o 5 veces).
- Recomendaciones: suman los outfits sin estrenar (o sin usar hace tiempo), la nota de OUTFIT RATING, que vayan con la estación del día y ser favorito; restan los que ya están planificados cerca. Fuera los que ya tienes en los 3 días de alrededor.
- Estadísticas: usados en 30 días, racha de días seguidos, % de días planificados que se cumplieron, outfits nunca usados, usos por día de la semana, por estilo (90 días) y los más usados.

```bash
npm run db:migrate     # migración 20261113180000_outfit_calendar
npm test               # incluye src/calendar/calendar.rules.spec.ts
npm run test:e2e       # incluye test/calendar.e2e-spec.ts
```

## STYLE ANALYTICS (`GET /api/analytics?tz=Europe/Madrid`)

Tus hábitos de vestir calculados al pedirlos, con tus prendas, outfits y días marcados como usados en el calendario. No se guarda ningún resumen: cada petición cuenta lo que hay en ese momento, así que se actualiza solo al crear, editar o borrar prendas y outfits. Todas las consultas van filtradas por el usuario autenticado; nadie puede ver las cifras de otra persona. `tz` (zona IANA del navegador) decide qué es «este mes» y dónde empiezan las semanas.

- **Cifras:** prendas, outfits, outfits de este mes (y del anterior), usados en 30 días, favoritos y nota media de OUTFIT RATING.
- **Destacados:** estilo más usado, color más usado, marca más frecuente (de `attributes.brand`, con el % de prendas que la tienen) y prenda que sale en más outfits.
- **Estilos:** % de outfits de cada uno de los 10 estilos. Si un outfit no tiene estilo marcado, se usa el que deduce el motor de OUTFIT RATING por sus prendas, y se indica cuántos son deducidos.
- **Colores:** cada prenda cuenta una vez por outfit en el que sale, agrupada por nombre de color (los del estilista). Ranking, reparto neutros / tierras / color, pares de colores que salen juntos y los menos usados (incluidos los que tienes y nunca combinas).
- **Evolución:** últimas 12 semanas y 12 meses (outfits creados, prendas añadidas, usados) y mezcla de estilos por mes.
- **STYLE INSIGHTS** (`src/analytics/analytics.rules.ts`): reglas con umbrales sobre tus datos, por ejemplo un color en el 40 % o más de lo que combinas, un estilo en el 55 % o más, un tipo de prenda del que se usa menos de un tercio, prendas sin combinar, una prenda en la mitad de tus outfits, un estilo que sube 25 puntos este mes, el estilo con mejor nota media, meses sin crear outfits o pocas prendas con marca. Si no hay datos, no sale nada.

```bash
npm test               # incluye src/analytics/analytics.rules.spec.ts
npm run test:e2e       # incluye test/analytics.e2e-spec.ts
```

## WISHLIST (`/api/wishlist`)

Prendas y zapatillas que quieres comprar. Cada artículo es una prenda (`WardrobeItem`) con `wishlistStatus` distinto de null, así que tiene modelo 3D y se puede usar en outfits. El armario, el estilista, OUTFIT RATING (sus consejos), STYLE ANALYTICS, el recuento de prendas de cada armario y el límite de prendas del plan **solo cuentan las prendas con `wishlistStatus = null`**. `GET /api/wardrobe-items` tampoco las devuelve salvo con `?wishlist=include` (vestidor) o `?wishlist=only`. Tope: 500 artículos por persona. Todo va filtrado por el usuario autenticado (otra persona recibe 404).

- `GET /api/wishlist` (`status`, `category`, `search`, `sort=new|price_asc|price_desc|name`), `POST`, `GET/PATCH/DELETE /:id`.
- Categorías: SNEAKERS, HOODIES, TSHIRTS, PANTS, JACKETS, ACCESSORIES, OTHER. Cada una tiene un tipo de prenda por defecto para el 3D (en OTHER hay que elegirlo con `garmentTypeId`). Estados: WANT (Lo quiero), SAVING (Ahorrando), PENDING (Pendiente de comprar), PURCHASED (Comprado).
- Foto: un asset subido a `/api/assets` (`photoAssetId`; no se puede borrar mientras la use una prenda y se borra si la cambias o quitas el artículo) o una URL (`imageUrl`). El enlace de compra lo pone el usuario y **el servidor nunca lo visita**.
- **Precios:** `currentPrice` es el último apuntado; cada precio queda en `WishlistPrice` (`GET/POST /:id/prices`, `DELETE /:id/prices/:priceId`). Un artículo tiene una sola moneda. Si un precio baja hasta el precio objetivo (`targetPrice`) o por debajo, llega un aviso `PRICE_DROP` a la campanita (una vez por bajada).
- **Seguimiento de precios (preparado, sin servicios):** `src/wishlist/price-tracking.ts` define la interfaz `PriceTracker` (`supports(url)`, `fetchPrice(url)`) y el token `PRICE_TRACKERS`, que hoy es una lista vacía. `POST /api/wishlist/prices/refresh` pide precios para los artículos con `trackPrice` y, sin servicios, devuelve `{ trackers: 0, updated: 0, ... }`: no se inventan precios ni disponibilidad. Para añadir uno, registra una clase que cumpla la interfaz en `wishlist.module.ts`; los precios que traiga se guardan con `source = TRACKER`.
- **Presupuesto:** `GET /api/wishlist/summary` y `PUT /api/wishlist/budget` (`budget`, `saved`, `currency`). Devuelve el valor de lo pendiente, lo gastado (comprados en la lista + pasados al armario), el objetivo, lo ahorrado, lo que falta para el objetivo y para comprarlo todo. Se suma en céntimos y solo en la moneda del presupuesto; los importes en otras monedas se devuelven aparte (no se convierten).
- **Comprado → armario:** `POST /:id/move` (`wardrobeId`, `purchasePrice`, `purchaseDate`, `storeName`) comprueba el límite de prendas del plan, pone `wishlistStatus = null`, guarda la compra y `fromWishlistAt`. Conserva su 3D, sus outfits y su historial.

Migración: `prisma/migrations/20261113190000_wishlist` (añade columnas a `WardrobeItem`, las tablas `WishlistPrice` y `WishlistSettings` y el aviso `PRICE_DROP`).

```bash
npm run db:migrate     # aplica la migración de la wishlist en tu base local
npm test               # incluye src/wishlist/wishlist.rules.spec.ts
npm run test:e2e       # incluye test/wishlist.e2e-spec.ts
```

## SNEAKER COLLECTION (`/api/sneakers`)

Colección de zapatillas de cada usuario. Cada par es una prenda (`WardrobeItem`, tipo «Zapatillas» u otro calzado) con su **ficha** en la tabla `SneakerDetails` (1:1, clave foránea compuesta con el usuario):
- **Ficha:** marca (`NIKE`, `JORDAN`, `ADIDAS`, `NEW_BALANCE`, `ASICS`, `PUMA`, `SALOMON`, `CONVERSE`, `VANS` u `OTHER` con `brandName`), modelo, colorway, estado de conservación (`DEADSTOCK`, `LIKE_NEW`, `GOOD`, `WORN`, `BEAT`) y usos apuntados a mano (`wearCount`).
- **Datos de la prenda:** foto (`photoAssetId` o `imageUrl`), talla, color, fecha y precio de compra, tienda y notas.

Como es una prenda, sirve en outfits, en el calendario, en el 3D y en la analítica. Si la prenda tiene `wishlistStatus`, es un par de la **wishlist de sneakers** (se gestiona también desde `/api/wishlist`, categoría SNEAKERS). La app no trae catálogo de modelos ni imágenes: todo lo escribe el usuario.

**Endpoints**
- `GET /api/sneakers`: listado.
  - `scope=owned|wish`;
  - filtros `brand`, `condition`, `size`, `search`;
  - orden `sort=new|old|name|brand`.
- `POST /api/sneakers`: crea un par.
  - `scope: 'wish'` lo guarda en la wishlist, con `price`, `targetPrice` y `productUrl`.
- `GET/PATCH/DELETE /api/sneakers/:id`: ver, editar o borrar.
  - `DELETE` borra la prenda entera.
  - Con `?keepItem=true` solo quita la ficha y la prenda sigue en el armario.
- `POST /api/sneakers/:id/wear` con `{ delta: 1 | -1 }`: suma o resta un uso manual (nunca baja de 0).
- `GET /api/sneakers/candidates` y `POST /api/sneakers/adopt/:itemId`: zapatillas que ya estaban en el armario sin ficha. Se les añade la ficha sin crear otra prenda.
- `GET /api/sneakers/stats`: dashboard con:
  - total de pares;
  - marca más repetida y color predominante (con `tie` si hay empate);
  - gasto por moneda, sin convertir;
  - modelo más utilizado y par menos utilizado;
  - distribución por marcas y por estado;
  - «las que combinan con más outfits» (outfits guardados que las llevan y cuántas prendas distintas las acompañan).
- `GET /api/outfits?itemId=<id>`: solo los outfits que llevan esa prenda.

**Usos:** usos = contador manual + días distintos del calendario marcados como usados con un outfit que las lleva. Los dos se devuelven por separado (`uses.manual`, `uses.calendar`) para no contar nada dos veces.

**Duplicados:** al crear, editar o fichar un par, se bloquea a ese usuario dentro de la transacción (`pg_advisory_xact_lock`) y se busca otro par con la misma marca, modelo, colorway y talla. La comparación no distingue mayúsculas, acentos ni signos.
- Si lo hay, responde **409** con `code: 'duplicate_sneaker'` y la lista `duplicates`.
- Con `allowDuplicate: true` se guarda igualmente (por si tienes dos pares iguales).
- Añadir a la wishlist un par que ya tienes también da 409.
- El bloqueo evita además el doble envío por un doble clic.

Migración: `prisma/migrations/20261113200000_sneaker_collection`. Reglas puras (con tests) en `src/sneakers/sneakers.rules.ts`.

```bash
npm run db:migrate     # aplica la migración de la colección en tu base local
npm test               # incluye src/sneakers/sneakers.rules.spec.ts
npm run test:e2e       # incluye test/sneakers.e2e-spec.ts
```

## STREETWEAR BATTLES (`/api/battles`)

- Retos 1 vs 1 entre outfits: `POST /battles` (con `opponentId` o abierto), `POST /battles/:id/accept` (con tu outfit), `decline`, `DELETE` (retirar) y `POST /battles/:id/vote`.
- Cada lado guarda una copia del outfit (sin datos de compra). Votación de 48 h; 72 h para aceptar un reto.
- Un voto por persona (clave primaria) y nunca en tu batalla; el voto y el contador van en una transacción con actualización condicionada.
- Las batallas vencidas se cierran con `UPDATE … RETURNING` (cada minuto y al consultar): cada una se cierra y se avisa una sola vez.
- Ranking: `GET /battles/leaderboard`. Resumen: `GET /battles/summary`.
- Avisos nuevos: `BATTLE_CHALLENGE`, `BATTLE_ACCEPTED`, `BATTLE_RESULT`.

## STREET MARKET (`/api/market`): apagado

- Anuncios para vender o intercambiar (fotos propias, precio, talla, estado, ciudad), favoritos y contacto por el chat (`POST /market/:id/contact`). Sin pagos dentro de la app.
- **Apagado por defecto**: sin `MARKET_ENABLED=true` en el `.env`, todas sus rutas responden 404 con `code: "coming_soon"` (`market-enabled.guard.ts`). Los e2e del market lo encienden solos.
- Los admins pueden ocultar anuncios denunciados (`POST/DELETE /admin/listings/:id/hide`).

## Idiomas

- `User.locale` (`ES` por defecto, o `EN`); migración `20261114100000_user_locale`. Las cuentas que ya existen siguen en español.
- Se cambia con `PATCH /users/me { "locale": "EN" }` y se elige al registrarse (`POST /auth/register { …, "locale": "EN" }`).
- Pendiente (siguientes entregas): que los avisos, el estilista y el OUTFIT RATING generen sus textos en el idioma de cada cuenta.

## Armario: favoritas, filtros y resumen (`/api/wardrobe-items`)

- Migración `20261114120000_item_favorite`: columna `WardrobeItem.isFavorite` (por defecto `false`; no toca las prendas existentes).
- `PUT /wardrobe-items/:id/favorite` y `DELETE /wardrobe-items/:id/favorite`: marcar y desmarcar (idempotentes, solo prendas propias; 404 si no es tuya).
- `GET /wardrobe-items` acepta además:
  - `favorite=true`;
  - `brand` (sin distinguir mayúsculas; marca de `attributes.brand` o de la ficha de zapatilla);
  - `color` (grupo: `black`, `white`, `grey`, `beige`, `brown`, `blue`, `green`, `red`, `pink`, `orange`, `yellow`, `purple`; sale del nombre de color del estilista);
  - `sort` (`newest`, `oldest`, `name`, `favorites`).
  - Ya existían `season` y `garmentTypeId`.
- `GET /wardrobe-items/facets?wardrobeId=`: total, favoritas, categorías, tipos, marcas, grupos de color, temporadas y última prenda añadida. Solo prendas del armario (no las de la wishlist).
- Lógica en `src/wardrobe-items/item-facets.ts`, con tests unitarios. Hay e2e en `test/wardrobes-items.e2e-spec.ts`.

## Estilista: sugerencias con ganancia real (`GET /api/stylist/insights`)

- Cada aviso que se resuelve con una prenda lleva `suggestion`: hueco, categoría de wishlist, color orientativo y `gain` (`before` / `after`).
- `gain` cuenta combinaciones con tus prendas: (arriba × abajo + vestidos) × calzado × (abrigos + 1). Es un recuento, no mira colores ni estilos. Para accesorios es `null`.
- `stats.combinations`: combinaciones posibles hoy.

## Despliegue en Vercel (servicios)

`vercel.json` (en la raíz del repositorio) despliega las dos carpetas como un único proyecto de Vercel con dos servicios y un solo dominio:

| Servicio | Carpeta | Público en | Qué es |
| --- | --- | --- | --- |
| `backend` | `Backend/` | `/api/*` | API NestJS (Vercel Functions). Recibe la ruta completa (`/api/...`), que coincide con `setGlobalPrefix('api')`. |
| `frontend` | `Frontend/` | todo lo demás | Web estática de Vite (`dist/`). Las rutas del cliente (`/outfits/o1`...) caen en `index.html`. |

Dirección fija de producción: **https://myout.vercel.app** (siempre apunta al último despliegue; las URL largas de cada despliegue se quedan con su versión). El navegador llama a `/api` en el mismo dominio (`VITE_API_URL` sin definir), así que no hay llamadas de servidor a servidor ni *bindings*.

Variables de entorno del servicio `backend` (en el panel de Vercel, nunca en el repositorio): `DATABASE_URL` (PostgreSQL accesible desde internet), `JWT_SECRET`, `CORS_ORIGIN`, `FRONTEND_URL` y `OAUTH_PUBLIC_API_URL` (con el dominio de Vercel), y las de Google / Apple si se usan.

Limitaciones conocidas en Vercel:

- **Chat en tiempo real**: las funciones de Vercel no aceptan WebSockets; los mensajes llegan al recargar, no al instante.
- **Imágenes subidas**: `LocalDiskStorage` escribe en disco y en Vercel el disco no es persistente. Hace falta un almacenamiento de objetos (Vercel Blob, S3, R2...).
- **Migraciones**: el build del servicio `backend` ejecuta `prisma migrate deploy` (script `vercel:migrate`) con la conexión directa de Neon (`DATABASE_URL_UNPOOLED`) antes de compilar, y después `prisma/seed-reference.ts` (planes y tipos de prenda, sin el usuario de demo; idempotente). Ojo: los despliegues de *preview* usan la misma base de datos que producción.
- **Base de datos**: Neon, conectada desde la pestaña Storage de Vercel (crea `DATABASE_URL`, `DATABASE_URL_UNPOOLED` y otras).
- El límite de intentos usa la IP real del usuario (`trust proxy` solo cuando existe la variable `VERCEL`).
- **Dependencias en la función**: Vercel tiene un fallo abierto con NestJS en «services» ([vercel/vercel#17712](https://github.com/vercel/vercel/issues/17712)) que deja `node_modules` fuera de su sitio. `src/vercel-module-paths.ts` (importado lo primero en `main.ts`) busca la carpeta y la añade a `NODE_PATH`, y `src/vercel-deps.ts` importa todas las dependencias desde un archivo sin decoradores para que Vercel las incluya. **Si añades una dependencia al backend, añádela también en `vercel-deps.ts`.** Solo actúan con la variable `VERCEL`.
- `postinstall` ejecuta `prisma generate` (Vercel instala sin build propio de Prisma).

## Pendiente y siguientes pasos

1. **Ejecutar las comprobaciones** de la sección anterior y corregir lo que falle (el código no se ha podido ejecutar todavía).
2. Revisar la migración generada (`prisma/migrations/*_init/migration.sql`) y hacer el primer commit.
3. Swagger: añadir clases de respuesta (`@ApiOkResponse`) para documentar también los cuerpos de respuesta.
4. Fase 11: la subida de imágenes ya existe con driver de disco local; falta el driver de S3/R2/MinIO y borrar los archivos al borrar un usuario.
5. Fase 12: diseñar las suscripciones de pago antes de integrar Stripe en modo test.
6. Fase 13: configuración de producción, logs estructurados, copias de seguridad.
7. Garantizar a nivel de base de datos "una sola suscripción ACTIVE por usuario" con un índice único parcial (requiere SQL manual en una migración).
