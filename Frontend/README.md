# MyOO: frontend

React 19, Vite, TypeScript y React Three Fiber. Interfaz minimalista en grises grafito: el único color de la pantalla es el de las prendas, que se dibujan como modelos 3D.

> Comprobado: `tsc -b` sin errores y la app funcionando con `npm run dev`. El build de producción (`npm run build`) aún no se ha probado.

## Arrancar

Antes, deja el backend funcionando en `http://localhost:3000` (ver `../Backend/README.md`).

```bash
cd Frontend
npm install
npm run dev        # http://localhost:5173
```

Vite reenvía `/api` al backend (ver `vite.config.ts`), así que no hace falta configurar nada más. Para entrar, usa la cuenta demo `demo@myout.dev` / `Demo1234!` que crea el seed.

```bash
npm run typecheck  # comprobación de tipos
npm run build      # build de producción en dist/
```

## App de Android e iOS

La misma web, empaquetada como app nativa con Capacitor 8 (`capacitor.config.ts`, `src/lib/native.ts`). Instalar, compilar el APK/AAB para Google Play y el IPA para la App Store, y los requisitos de cada tienda: **[MOVIL.md](MOVIL.md)**. La app necesita el backend publicado con HTTPS (`VITE_API_URL` en `.env.production`).

## Páginas

| Ruta | Qué hay |
| --- | --- |
| `/login`, `/register` | Acceso, con un maniquí 3D de ejemplo girando |
| `/` | **Inicio**: saludo, tu último outfit girando sobre el maniquí (con «Ver otro»), cifras (prendas, armarios, outfits), prendas añadidas recientemente, accesos por categoría, armarios y outfits. Sin armarios, guía de tres pasos |
| `/armario` (`?w=<armario>&cat=<categoría>&nueva=1`) | Rejilla de prendas en 3D (giran al pasar el ratón), filtros, búsqueda; crear armarios y prendas (`nueva=1` abre el editor de prenda nueva) |
| `/items/:id` | **Visor de prenda**: 3D a pantalla grande, giro y zoom, variantes de color, viento, "En maniquí", detalles y edición |
| `/outfits` | Outfits como miniaturas de maniquí 3D |
| `/outfits/new`, `/outfits/:id` | Editor: escena 3D grande donde las prendas se superponen en capas, con selector de prendas |
| `/estilista` | **Estilista**: propone outfits con tus prendas (estilo, ocasión, tiempo, armario) y deja notas tipo grafiti junto al maniquí; además, «Le falta a tu armario» |
| `/account` | Plan, uso frente a límites, cambio de plan simulado, historial y perfil |
| `/ideas` (`?idea=<id>`) | **Tablón de ideas**: proponer (con las parecidas que ya existen), votar, ordenar, filtrar por estado y buscar; respuesta del equipo |
| `/novedades` | **Novedades**: línea de tiempo con lo publicado (versión, etiquetas Nuevo / Mejorado / Arreglado) |
| `/admin` (`?tab=`) | **Panel de admin** (solo rol `ADMIN`): resumen, usuarios, ideas, denuncias, novedades y registro |
| `/monitor` | **Monitor** (solo rol `ADMIN`): estado de la API, tráfico, latencia, errores, rutas, proceso, base de datos, uso de la app y últimos eventos, en directo |

## Menú lateral (`components/Layout.tsx`)

- Arriba, siempre visibles: **Inicio** y **Armario** (la flecha despliega tus armarios y «+ Nuevo armario»).
- Grupos plegables: **Estilo** (Outfits, Calendario, Estilista, Maniquíes), **Colección** (Sneakers, Wishlist, Analítica), **Comunidad** (Mensajes, Personas, Batallas, Market si está activo, Ideas, Novedades) y **Admin** (Panel y Monitor, solo con rol `ADMIN`).
- El grupo de la página en la que estás se abre solo; lo que abres o cierras se recuerda en el navegador (`localStorage`, clave `myout.nav.open`). Un grupo cerrado muestra la suma de sus avisos (mensajes sin leer, solicitudes).
- Al pie: tu perfil (avatar y nombre) y el acceso a Cuenta. En el móvil es el mismo menú dentro del panel lateral, con zonas táctiles de 44 px.

## Cómo funciona el 3D

- `src/three/body.ts` define un **cuerpo paramétrico**: altura, hombros, pecho, cintura, cadera, volumen de pecho, vientre y glúteos, y grosor de brazos y piernas. El maniquí tiene cabeza ovalada, cuello inclinado, codos y rodillas algo flexionados, y manos y pies modelados. Hay 11 siluetas en dos grupos (campo `sex`): de hombre (Estándar, Delgado, Corpulento, Alto, Bajo y Atlético) y de mujer (Estándar, Delgada, Alta, Baja y Curvilínea). Para añadir otra, basta con sumar una entrada a `BODY_SHAPES`.
- `src/three/garments.ts` genera cada prenda **envolviendo ese cuerpo**: superficies de revolución alrededor del torso, brazos y piernas, más una holgura. Por eso las prendas son redondeadas y se adaptan a cualquier silueta. Los atributos cambian la forma (manga, corte, largo, caña de la bota...) y las prendas exteriores llevan más holgura, para que se superpongan en capas sin atravesarse.
- `src/three/surface.ts` genera superficies "por función" (forma según la altura y el ángulo). Así se modelan escotes, bajos curvos, pliegues y solapas.
- `src/three/fabric.ts` crea por código el relieve de cada tejido (punto, popelín, vaquero, lana, cuero, lona, nailon, seda) como *normal map* y *roughness map* tileables, con mipmaps y escala física fija. El atributo "material" de la prenda lo cambia (por ejemplo, "piel" da cuero, "lana" da paño y "seda" o "satén" da seda), y algunos cortes también (un vestido lencero es de seda).
- `src/three/cloth.ts` es el acabado común de todas las prendas:
  - **Oclusión ambiental horneada por vértice**: los valles de los pliegues y las uniones se oscurecen según la curvatura de la malla.
  - **Desgaste del vaquero** en las zonas que sobresalen.
  - **Material PBR** (`MeshPhysicalMaterial`), con *sheen* para las fibras, *clearcoat* suave en cuero y nailon, y reflejo anisótropo en la seda. El metal solo se usa en piezas metálicas.
  - **Jaspeado de la fibra**: el color varía un poco hilo a hilo (más en punto, lana y vaquero, donde imita los «slubs»); sin ello la tela parecía plástico.
  - **Antirrepetición** del relieve en los modelos de la biblioteca: cada textura se lee dos veces (desplazada y a otra escala) y se mezclan por manchas de ~25 cm, para que en primer plano no se vea la misma celda repetida.
  - **Interior más oscuro**: lo que se ve por el cuello o el bajo queda en sombra (prendas generadas por código, que son superficies abiertas y se pintan por las dos caras). Los modelos de la biblioteca son sólidos cerrados con grosor y se pintan solo por la cara delantera (`solid` en `makeClothMaterial`): con las dos caras, al deformarlos a otra silueta la capa interior asomaba por delante y salían manchas oscuras.
  - **Variación de color y rugosidad a gran escala**, para que no se note la repetición de la textura.
  - **Movimiento de tela**: viento suave y una inercia que retrasa los bajos al girar. Es una **aproximación visual en el vertex shader, no una simulación física**: no hay colisiones ni masas. Las zonas cosidas o apoyadas (hombros, cintura) no se mueven; bajos, mangas y faldas sí, y cada tejido según su caída (la seda más que el cuero). Solo desplaza hacia fuera, para no atravesar el cuerpo.
- `src/three/env.ts` aporta una iluminación de estudio con reflejos (sin descargar archivos HDR) y un mapeo de color neutro, para que el color que ves sea el que elegiste.
- **Luces de los outfits** (`StudioLights`): principal más baja y suave (desde arriba quemaba la cabeza y los hombros del maniquí), relleno frío y contraluz que separa la figura del fondo. En el editor de outfits, un charco de luz en el suelo (`makeFloorPool` en `showcase/studio.ts`) y una sombra de contacto anclan al maniquí.
- En los outfits la ropa se ve puesta sobre un maniquí; el maniquí se elige con el selector "Maniquí" (Hombre/Mujer y, dentro, la silueta) y se recuerda en el navegador. En el armario, cada prenda se ve sola, con la técnica del "maniquí invisible".
- **Interfaz**: iconos SVG propios (`components/Icon.tsx`); en el outfit las prendas se reordenan arrastrando el asa o con las flechas; mientras cargan las listas se ven fichas de relleno (`components/Skeleton.tsx`); desplegables propios (`components/Select.tsx`).
- Las miniaturas usan **un solo `<Canvas>` WebGL** fijo (`ViewCanvas`) y un `<View>` de drei por ficha, porque los navegadores solo permiten unos 16 contextos WebGL a la vez.
- Se respeta "reducir movimiento" del sistema operativo: sin giro automático, sin viento, sin entrada de cámara ni transiciones.

## Maniquíes con tus medidas (`/maniquies`)

Cada cuenta puede crear maniquíes con **medidas reales** (altura, ancho de hombros, contorno de pecho, cintura, cadera y brazo, en cm): con deslizadores para estirarlo o escribiendo la cifra, viéndolo en 3D con ropa de prueba. Se guardan en el backend (`/api/mannequins`) y el que se marca por defecto se usa en toda la app (armario, visor y outfits) y en todos los dispositivos. **Cuántos se pueden tener depende del plan** (recurso `MANNEQUINS`: Free 1, Básico 2, Plus 5, Premium ilimitados); las siluetas genéricas siguen disponibles para todos.

- `three/bodyMeasures.ts` traduce las medidas a la silueta paramétrica (`BodyShape`): la altura da la escala; los semianchos de pecho, cintura y cadera se ajustan hasta que el contorno de las secciones mide lo pedido (descontando los 9 mm que el maniquí esculpido queda por dentro); hombros = semiancho; el contorno del brazo da el grosor de brazos y piernas; con más cintura respecto a la cadera, más vientre.
- `lib/bodyPref.tsx` carga los maniquíes de la cuenta; la selección es «m:<id>» o el id de una silueta genérica. `BodySelector` los muestra primero.
- `makeBody` guarda en caché las siluetas temporales (id con «~», las de los deslizadores) solo las 16 últimas.

## Maniquí

**Por defecto, maniquí de tienda genérico** (`STYLE = 'tienda'` en `three/Mannequin.tsx`): cabeza «huevo» sin rasgos ni pelo, cuerpo liso, dedos juntos, lacado blanco roto satinado y sobre una peana de metal con varilla a la pantorrilla (`three/mannequinStand.ts`). Son los archivos `*_tienda*.glb` (generador `tienda.py`), con las mismas medidas que el realista que se describe abajo, así que la ropa encaja igual. Con `STYLE = 'realista'` se vuelve al esculpido:

Gris claro mate, como un maniquí de escaparate. Todo él está esculpido (generador en `prendas_casual_glb/generador/`, archivos en `public/models/maniqui/`) y se ajusta a la silueta elegida:
- **Cuerpo** (`cuerpo.glb`): tronco con relieve suave (pectorales, clavículas, línea alba, columna, omóplatos), brazos con deltoides, bíceps y antebrazo, piernas con rótula, gemelo y tobillos, y pies. Se modeló sobre el cuerpo de referencia con los brazos a 18° y se deforma a cada silueta con la región `body` de `libraryFit.ts`, la misma deformación que siguen las prendas, así que la ropa le encaja igual que antes.
- **Cabeza** (`cabeza.glb`): masculina, con ojos cerrados, nariz, labios, orejas y pelo corto esculpido, y un cuello (cono de 5,8 a 5,2 cm de radio, `REF_NECK` en `libraryFit.ts`) que entra en el cuerpo. Se ajusta con la región `head`, como las gorras y capuchas.
- **Manos** (`mano.glb`): relajadas, con dedos; la izquierda es el reflejo de la derecha.
- **Maniquí femenino** (`cuerpo_f.glb` y `cabeza_f.glb`, mismas manos al 96 %): se carga cuando la silueta es de mujer. Cuerpo con pecho, cintura marcada, cadera y glúteos más redondos, hombros y brazos más finos y cuello más estrecho (radio ×0,86, `NECK_FEMALE` en `libraryFit.ts`, que también usa `tightenCollar` para ceñir los cuellos). Cabeza más pequeña, de rasgos suaves, con el pelo recogido en un moño. Se deforma igual que el masculino, así que toda la ropa le vale.
- Las normales del cuerpo y de las prendas se deforman con la jacobiana de la deformación (no se recalculan): en la cintura femenina, muy estrechada, los triángulos largos daban bandas de sombra.
- En miniaturas se usan las versiones ligeras (`lod/`). El cuerpo ajustado se guarda en caché por silueta.
- Mientras cargan (o si faltan los archivos) se ve el maniquí liso generado por código (`buildMannequin` en `three/body.ts`).

En el cuerpo paramétrico, las siluetas de mujer llevan el glúteo hasta la entrepierna (las prendas generadas por código lo siguen) y los pantalones y shorts tienen un fondillo (`seatExtra` en `garments.ts`), para que el pliegue del glúteo del maniquí esculpido no asome.

La silueta «Estándar» de hombre: hombros 0,21, pecho 0,163, cintura 0,14 y cadera 0,161 (semianchos en metros), con la barbilla 5,2 cm por encima del arranque del cuello para que el cuello se vea. Los hombros suben hacia el cuello (trapecio) y las manos se colocan un 6 % mayores que la mano esculpida.

## Visor de prenda (`/items/:id`)

- **Carga diferida**: la página y su escena 3D van en trozos de código aparte (`React.lazy`).
- **Escena** (`src/three/showcase/ShowcaseStage.tsx`):
  - luz principal cálida con sombras suaves (PCF), relleno frío y contraluz;
  - ciclorama de estudio (suelo y fondo curvos en una pieza) gris medio;
  - oclusión ambiental en pantalla (GTAO) y salida con mapeo de tono neutro (`src/three/showcase/studio.ts`);
  - si caen los FPS, se desactivan el GTAO y las sombras antes de bajar la resolución.
- **Interacción**:
  - giro de 360° arrastrando y zoom suave con rueda o pellizco, con límites e inercia;
  - entrada de cámara al abrir y botón **Restablecer**;
  - giro automático lento que se pausa al tocar y se reanuda tras 2,5 s;
  - en móvil, el desplazamiento vertical se deja al navegador, así que la página sigue haciendo scroll: se gira deslizando en horizontal.
- **Variantes de color** con transición suave. Son una vista previa: «Guardar este color» lo guarda en la prenda.
- **Rendimiento**:
  - renderiza solo cuando algo se mueve (`frameloop="demand"`) y nada si el visor está fuera de pantalla o la pestaña oculta;
  - baja la resolución si caen los FPS (`PerformanceMonitor`);
  - la sombra de contacto se calcula una sola vez.
- **Estados**:
  - mientras se carga, se muestra un aviso y la barra de progreso del `.glb`;
  - si la prenda no existe, se indica;
  - si falla la API, hay un botón para reintentar;
  - si el `.glb` falla, aparece un aviso y se usa el modelo procedural;
  - **sin WebGL** se muestra la foto de la prenda (`imageUrl`) o su ficha.

## Nueva prenda: desde una foto y con detalles

En el formulario de prenda (`ItemEditor`):

- **Desde una foto** (`lib/photoGarment.ts` + `lib/photoAnalysis.ts`, motor propio en el navegador, sin IA externa; la foto no se sube): recorta la prenda del fondo (borde de la foto con su degradado de luz, o la transparencia de un PNG) y de la silueta saca el tipo (perneras → pantalón o corto; cintura recta que se abre → falda; capucha; largo y vuelo → vestido o abrigo; tapeta, cremallera, botones o delantera abierta → camisa o chaqueta; mangas y su largo → camiseta, jersey, top), el color (k-medias en Lab, sin sombras), las rayas, cuadros o lunares (perfiles por filas y columnas, con su tamaño) y los gráficos (logos, estampados: zonas compactas de otro color con borde nítido). Rellena tipo, atributos, color y estampado; los gráficos se recortan con fondo transparente, se guardan como imágenes del usuario (`/assets`) y el visor los coloca de frente sobre el modelo de Blender (`PhotoPlacer` en `GarmentViewer.tsx`) como detalles «Estampado». Todo se puede corregir antes de guardar. Funciona mejor con la prenda entera, de frente y sobre un fondo liso.
- **Parches, bordados y estampados**: «Añadir y poner detalles» guarda la prenda y abre el visor directamente en «Personalizar» para colocar parches, bordados, estampados, texto o dibujos sobre el 3D.
- **Ver y gestionar los detalles** (`components/DetailList.tsx`): en el visor, la sección «Parches, bordados y estampados (N)» lista cada detalle con su miniatura, tamaño y posición; pulsarlo lo resalta en el 3D, «Editar» abre Personalizar en ese detalle y «Quitar» lo borra al momento (con «Deshacer»). En Personalizar › Detalles la misma lista permite duplicar y quitar; las miniaturas del armario dicen cuántos detalles tiene cada prenda.
- **Carga**: mientras llega un modelo 3D, el escenario muestra un icono que gira (`LoadingScope` en `lib/loading.tsx`; `GarmentModel` y `Mannequin` avisan con `useReportLoading`); las miniaturas, con `useLibraryLoaded`.

## Personalización (`Personalizar` en el visor)

Todo se guarda en el campo `customization` de la prenda (JSON validado en el backend con formato cerrado). Qué se puede tocar depende del tipo de prenda (`customizationOptions` en `GET /garment-types`):

- **Colores**: botones, pespuntes, cremallera, herrajes, ribetes, forro, color secundario, suela y cordones.
- **Piezas**: activar o quitar bolsillos, solapas, hombreras, capucha, cinturón, mangas remangadas, etc.
- **Opciones**: estilo de botón (4 agujeros, 2 agujeros, de pie, automático, trenca, forrado), acabado del metal (plata, dorado, pavonado, latón, cobre, negro mate) y pespunte (sencillo, doble, sin pespunte visible).
- **Estampado de la tela** (pestaña «Colores»), totalmente configurable (`customization.pattern`):
  - 14 tipos: rayas, cuadros, cuadrícula, tablero, escocés, pata de gallo, espiga, zigzag, ondas, lunares, rombos, camuflaje, animal (leopardo) y tie-dye;
  - 22 estilos rápidos con miniatura (marinera, diplomática, diagonales, rugby, vichy, leñador, madrás…) y «Sorpréndeme» (uno al azar);
  - ajustes: 1–4 colores (el fondo es el color de la prenda), tamaño de la repetición (0,5–40 cm), grosor, cantidad (líneas por grupo, bandas, lunares por fila, manchas…), dirección (horizontal, vertical, diagonales o cualquier ángulo), intensidad, bordes difuminados, desplazamiento y zona (tela principal, paneles secundarios o toda la prenda);
  - vista plana de 40 cm en el panel con el mismo dibujo que el 3D;
  - cómo funciona: `lib/patterns.ts` dibuja una baldosa repetible cuyos 4 canales son la cobertura de cada color; `three/patternTexture.ts` la sube a la GPU y `clothPattern` (en `three/cloth.ts`) la proyecta en el espacio de la prenda desde delante, los lados y arriba. Colores, giro, tamaño, intensidad y desplazamiento son *uniforms* (cambiarlos no recompila nada);
  - vale para las prendas por código y para las de la biblioteca, también calzado, gorras y gorros;
  - las prendas antiguas con `options.pattern` / `patternSize` (y los colores `pattern` / `pattern2`) se siguen viendo igual: se convierten a su equivalente al dibujarlas, y al tocar el estampado se guardan en el formato nuevo;
  - un estampado de imagen propia (como el del dragón de una sudadera) se pone como detalle «Estampado» con tu imagen.
- **Detalles a mano** (máx. 30): parches, bordados, estampados, etiquetas, chapas, botones, remaches, tachuelas, bolsillos de parche y cremalleras decorativas.
  - Se colocan **haciendo clic sobre la prenda en 3D**. Después se pueden **arrastrar** con el ratón o el dedo: mientras se arrastran se deslizan pegados a la tela (la cámara no gira) y al soltarlos se vuelven a proyectar sobre la superficie. Pulsar un detalle lo selecciona. «Mover» sigue disponible (clic en el sitio nuevo).
  - Código: `three/GarmentDetails.tsx` (arrastre: captura del puntero, raycast contra la tela en coordenadas de la prenda, desplazamiento rígido provisional) → `onMoveDetail` en `ItemShowcasePage.tsx`, que actualiza el borrador.
  - Tamaño en cm, giro, colores y forma (rectangular, redondeada, circular, ovalada, escudo o **recortado, sin marco**).
  - Texto con 5 tipografías, o **imagen propia** (PNG/JPEG/WebP, máx. 2 MB) desde la galería de imágenes.
  - **Parche recortado (sin marco)**: con un PNG transparente, el parche tiene la silueta de la imagen (las zonas transparentes no se ven) y el relieve sigue esa silueta; con texto, la de las letras. Sin fondo ni ribete.
- **Dibujar sobre la prenda** (botón «Dibujar sobre la prenda» en la pestaña «Detalles»):
  - Se dibuja a mano alzada encima del visor 3D con rotulador, spray o goma, en 10 colores (o cualquier otro) y con el grosor que quieras; «Deshacer» y «Borrar».
  - Para dibujar en otro lado, «Girar vista» deja girar la prenda (solo sin trazos pendientes).
  - «Aplicar a la prenda»: el dibujo se recorta, se sube como PNG transparente a tus imágenes (el servidor guarda la imagen; la prenda solo su id) y se **proyecta sobre la tela desde ese punto de vista**, como un proyector: cubre torso y mangas a la vez y solo pinta la tela que mira hacia la cámara.
  - Queda como un detalle «Dibujo» (hasta 1 m): se puede mover, girar, cambiar de tamaño o quitar como los demás.
  - Código: `components/DrawPad.tsx` (capa 2D, trazos, exportación), `three/DrawBridge.tsx` (de la pantalla a coordenadas de la prenda), `projectDrawing` en `three/details.ts`.
  - Parches, bordados y estampados se proyectan sobre la tela como *decals*, con relieve (normal map) propio; las piezas sólidas (botones, remaches…) son geometría.

Los cambios son una vista previa hasta pulsar **Guardar**; **Descartar** vuelve a lo guardado.

Archivos: `components/CustomizationPanel.tsx`, `components/AssetPicker.tsx`, `components/DrawPad.tsx`, `three/DrawBridge.tsx`, `three/details.ts`, `three/GarmentDetails.tsx`, `three/partColors.ts`, `lib/customLabels.ts`.

## Realismo: simulación de tela

Las prendas superiores, vestidos y faldas se **simulan como tela** al cargarse (`three/clothSim.ts`, en un Web Worker para no bloquear la página):

- Método XPBD: distancias casi inextensibles, rigidez de flexión según el tejido (seda y punto caen y arrugan; vaquero, lona y cuero se mantienen), colisión con el cuerpo y los brazos, gravedad y rozamiento.
- La prenda queda sujeta por hombros y cintura y no puede alejarse más de unos centímetros de su forma original, así que caen pliegues reales sin que se deforme.
- Al terminar se recalcula la oclusión por curvatura, de modo que los pliegues tienen sombra propia.
- El resultado se guarda en memoria: volver a la misma prenda no repite el cálculo.

**Limitaciones honestas**:
- Es una caída única (se calcula una vez), no una tela que reacciona en tiempo real. El viento sigue siendo una aproximación visual en el shader.
- No hay autocolisión: la tela no choca consigo misma.
- Pantalones y shorts no se simulan, porque con perneras el resultado empeoraba.
- Las prendas sin modelo de la biblioteca siguen siendo procedurales (ver la sección siguiente).
- Las tipografías «Caligráfica» y «Universitaria» dependen de las fuentes instaladas en el sistema.

## Outfits: cómo se lleva cada prenda

En el editor de outfits, cada prenda tiene sus opciones de estilo. Se guardan en el outfit, no en la prenda: la misma camisa puede ir por dentro en un outfit y por fuera en otro. «Como está» deja la prenda tal cual.

| Prenda | Opciones |
| --- | --- |
| Camiseta, camisa, jersey/sudadera | **Cómo se lleva**: por fuera, metida por dentro, medio metida (solo delante), metida de un lado · **Mangas**: bajadas, remangadas (enrolladas), subidas al codo |
| Camisa, chaqueta, abrigo | **Delantera**: cerrada, abierta, desabrochada arriba (solo en los modelos 3D con la delantera abierta: camisa clásica, bomber, chaqueta con capucha, sobrecamisa y parka) |
| Vestido | Mangas |
| Pantalón | **Bajo**: normal, con vuelta, remangado · **Con botas**: por fuera o metido en las botas |
| Pantalón corto | Bajo |
| Jersey/sudadera, chaqueta, abrigo | **Capucha**: puesta o bajada (en los modelos 3D que la traen puesta: sudadera con capucha de punto, sudadera con media cremallera y chaqueta con capucha) |
| Gorra | **Visera**: hacia delante, hacia atrás, de lado |

Cómo se dibuja (`src/three/styling.ts`): se deforma la prenda ya ajustada al maniquí.
- **Por dentro**: de la cintura del pantalón hacia abajo, la tela se ciñe al cuerpo y queda oculta; justo encima se ahueca un poco. En «medio metida» y «de un lado», el bajo sube en diagonal hacia la cintura.
  - Se ciñe todo el grosor de la tela con el mismo factor, así sus dos caras no se juntan.
  - La cintura sale del pantalón o la falda del outfit; sin ninguno no se puede meter, y el editor lo avisa.
- **Mangas**: el final de la manga se comprime hacia el codo y forma un rollo o arrugas.
  - En los modelos de la biblioteca se sabe qué es manga por su pose A; en los demás, por la distancia al brazo y si la tela lo rodea.
- **Delantera**: cada mitad gira sobre el costado como una puerta. «Cerrada» junta las dos mitades.
- **Bajo**: sube y forma una banda más gruesa.
- **Botas**: la pernera se ciñe a la pierna y se oculta dentro de la caña; encima se acumula un poco de tela. La altura de la caña sale de las botas del outfit.
- **Capucha bajada**: lo que queda por encima de la base del cuello gira hacia atrás sobre la nuca; antes, los bordes de la cara rodean el cuello hacia los lados. Cerca del cuello el borde se dobla hacia fuera como un cuello y la capucha se recoge sobre la espalda, sin atravesarla.
- **Gorra**: gira sobre la cabeza.
- **Pantalón bajo una prenda por fuera**: por encima del bajo de la camiseta o la camisa, el pantalón se ciñe al cuerpo para que sus bolsillos no la atraviesen. Una chaqueta o un abrigo abiertos no cuentan, porque por delante se ve el pantalón.

Limitaciones:
- Es una aproximación visual: la tela metida no se simula.
- En siluetas extremas puede asomar algún pliegue.
- Las prendas generadas por código no se pueden abrir ni cerrar: su delantera es una sola superficie.
- Las capuchas que vienen bajadas (parka, las generadas por código) no se pueden subir.
- No hay prenda atada a la cintura ni sobre los hombros: harían falta modelos 3D con esas piezas.

## Prendas de Blender (sustituyen a las hechas por código)

- **Pantalones largos:** solo los 10 vaqueros de Blender (`models/prendas/street/19-28`). Cada corte usa el vaquero más parecido (`pantsModel` en `three/libraryCatalog.ts`): jogger y tapered el slim, cargo y paracaídas el baggy, palazzo el wide leg, etc., con el color y el tejido de la prenda. Los remaches solo salen en los vaqueros (o si se activan en la personalización). No hay pantalón por código de reserva y el editor no ofrece «Modelo 3D».
- **Camisetas:** 11 modelos de Blender en `models/prendas/camisetas` (`npm run models:camisetas`): clásica, oversize, slim, boxy, crop, longline, baby tee, raglán (mangas de otro color: color secundario), pico, henley (botones) y manga larga. `teeModel` elige la del corte, la manga y el cuello. Sin manga, muscle y polo salen de la colección «tops».
- **Sudaderas:** 8 modelos de Blender en `models/prendas/sudaderas` (`npm run models:sudaderas`), de felpa con puños y cintura de canalé: capucha clásica, capucha oversize, capucha crop, capucha con cremallera, cuello redondo, media cremallera, cuarto de cremallera y deportiva. `sweatModel` elige por cuello y corte (cremallera y cordones con su color).
- **Camisas:** 8 modelos de Blender en `models/prendas/camisas` (`npm run models:camisas`): formal, oxford (button-down), oversize, lino, franela, vaquera (broches: color `hardware`), cubana (cuello camp) y manga corta. `shirtModel` elige por cuello, manga, corte y tela. La camisa sin mangas sale de la colección «tops».
- **Jerséis y punto:** 7 modelos de Blender en `models/prendas/jerseis` (`npm run models:jerseis`), de lana en galga media o gruesa: cuello redondo, pico, cuello alto vuelto (también Perkins), cárdigan con botones, ochos (Punto «Ochos»), oversize de punto grueso y chaleco de punto (Cuello «Chaleco de punto»). `jerseyModel` elige por cuello, punto y corte. Ya no hay jerséis por código.
- **Chaquetas:** 12 modelos en `models/prendas/chaquetas` (`npm run models:chaquetas`): bomber, varsity, vaquera, piel, biker, plumífero, cortavientos, chándal, coach, forro polar, utility y chaleco acolchado. `jacketModel` (tabla `JACKETS`) elige por tipo; Harrington usa la bomber, campo y sobrecamisa la utility, anorak y con capucha el cortavientos. El **Cierre** cambia de modelo (`jacketClosureFile`): cada chaqueta tiene su versión `_abierta` y la del otro cierre (`_botones` en las de cremallera, `_cremallera` en las de broches); las americanas solo llevan botones. En los outfits, «Delantera abierta / cerrada» de estas chaquetas usa la versión abierta o la cerrada.
- **Abrigos:** 7 modelos en `models/prendas/abrigos` (`npm run models:abrigos`): gabardina, abrigo de lana, abrigo largo, parka, chaquetón, trenca y plumífero largo. `coatModel` elige por tipo y largo (`hemY` acorta si se pide más corto).
- **Tops:** `models/prendas/tops` (`npm run models:tops`): tirantes, tirantes de canalé, muscle, polo, body, corsé, halter, bandeau, chaleco de vestir y camisa sin mangas. Tipo nuevo «Top» (`topModel`); las camisetas sin manga, muscle y polo y la camisa sin mangas también salen de aquí.
- **Formal:** `models/prendas/formal` (`npm run models:formal`): americana, americana cruzada, chaqueta de traje y chaleco de traje cruzado.
- Ya no queda ninguna prenda de arriba hecha por código: todas son de Blender.
- Los modelos de Blender se marcan con `isBlenderModel`: si el archivo no carga, la prenda no se dibuja (no se cae al modelo por código).

## Biblioteca de modelos 3D

Las prendas se dibujan con **tus modelos .glb** cuando su tipo y su corte coinciden con uno de la biblioteca. Si no hay modelo, se generan por código. Un `modelUrl` propio de la prenda tiene siempre prioridad.

Hay cuatro colecciones y se usan todas:

| Colección | Origen | En la web | Brazos modelados a |
| --- | --- | --- | --- |
| Clásica | `prendas_3d_glb/` (18 prendas) | `public/models/prendas/` | 44° |
| Punto | `prendas_punto_glb/` (10 prendas) | `public/models/prendas/punto/` | 32° |
| Casual | `prendas_casual_glb/` (7 prendas y 3 de calzado, con su generador) | `public/models/prendas/casual/` | 32° |
| Street | `prendas_street_glb/` (8 prendas, 5 zapatillas, 4 gorras y gorro, con su generador) | `public/models/prendas/street/` | 32° |

**Colección de punto** (se usa por defecto cuando tiene la prenda):

| Prenda en la web | Modelo |
| --- | --- |
| Jersey con cuello redondo | `01_sudadera_cuello_redondo` |
| Camiseta de manga larga con bolsillo (pieza «Bolsillo de pecho» o «Modelo 3D: Colección punto») | `02_camiseta_manga_larga_bolsillo` |
| Jersey «Con capucha (sudadera)» | `03_sudadera_capucha` |
| Camiseta con manga «Larga raglán» | `04_camiseta_manga_larga_raglan` |
| Jersey de cuello alto o Perkins | `05_jersey_cuello_alto` |
| Camiseta de manga corta y cuello redondo | `06_camiseta` |
| Camiseta con cuello «Polo» | `07_polo` |
| Camiseta corte «Oversize» | `08_camiseta_oversize` |
| Camiseta con cuello «Pico» | `09_camiseta_cuello_v` |
| Camiseta «Sin manga» o corte «Muscle» | `10_camiseta_tirantes` |

**Colección clásica** (el resto, y lo que la de punto no tiene):

| Prenda en la web | Modelo |
| --- | --- |
| Camiseta, manga corta / manga larga lisa / corte *Longline* / sin mangas | `01_camiseta`, `02_camiseta_manga_larga`, `03_camiseta_larga`, `04_camiseta_sin_mangas` |
| Jersey «Con capucha y media cremallera» | `05_sudadera_capucha` |
| Chaqueta tipo «Anorak», «Con capucha (abierta)» o *Bomber* | `06_anorak`, `07_chaqueta_capucha`, `08_bomber` |
| Camisa de manga larga | `09_camisa` |
| Pantalón corto «Mallas (ciclista)» o *Cargo* | `10_mallas_cortas`, `17_bermuda_cargo` |
| Ropa interior: slip / bóxer corto / bóxer largo | `11_slip`, `12_boxer_corto`, `13_boxer_largo` |
| Pantalón *Jogger* / *Cargo* / *Slim*, *Skinny*, *Jegging* o *Tapered* | `14_jogger`, `15_pantalon_cargo`, `16_pantalon_slim` |
| Gorra de béisbol o *dad cap* (con «Modelo 3D: Colección clásica») | `18_gorra` |

**Colección casual** (las prendas de la referencia «10 outfits casual»). Sus modelos traen **piezas aparte** (botones, cremalleras, vivos, pelo de la capucha, remaches), cada una con su `extras.role`, así que su color se elige en «Colores»:

| Prenda en la web | Modelo | Piezas con color propio |
| --- | --- | --- |
| Camisa de manga corta (cuello clásico, button-down o italiano) | `casual/01_camisa_manga_corta` (dos bolsillos con solapa) | Botones |
| Camisa de manga larga (por defecto; la clásica abierta sigue con «Modelo 3D: Colección clásica») | `casual/02_camisa_manga_larga` (cerrada, con puños) | Botones |
| Chaqueta «Sobrecamisa» o «Chaqueta de campo» | `casual/03_sobrecamisa` (abierta, cuatro bolsillos) | Botones |
| Abrigo «Parka» (largo cadera o medio muslo) | `casual/04_parka` (capucha bajada con pelo, jareta, bolsillos de fuelle) | Pelo (ribetes), cremallera, broches |
| Chaqueta «Chándal (cremallera y vivos)» | `casual/05_chaqueta_chandal` | Vivos (ribetes), cremallera |
| Bufanda (tipo nuevo) | `casual/06_bufanda` (una vuelta y dos caídas, con flecos que se pueden quitar) | Flecos (ribetes) |
| Pantalón *Straight*, *Regular*, *Relaxed* o *Boyfriend* | `casual/07_vaquero_recto` (5 bolsillos, trabillas, canesú) | Remaches y botón (herrajes) |
| Zapatillas *Casual*, *Pista* o *Skate* | `casual/08_zapatillas` (suela de copa, lengüeta, cordones) | Suela, cordones (se pueden quitar) |
| Botas *Militar* o *Montaña* de caña al tobillo (o sin tipo) | `casual/09_botas_cordones` (suela de tacos, ojales) | Suela, cordones (se pueden quitar), ojales |
| Botas *Chelsea* o *De vestir* de caña al tobillo | `casual/10_botas_chelsea` (elástico lateral, tirador) | Suela, elástico (secundario), tirador (ribete, se puede quitar) |
| Gorra de béisbol o *dad cap* (o sin tipo) | `casual/11_gorra` (seis paneles, copa armada delante, visera curvada con pespuntes, ojales, botón, tira trasera con hebilla) | Hebilla (herrajes) |

**Colección street**. Como la casual, trae **piezas aparte** (cordones de la capucha y sus punteras, cremallera, franjas, refuerzos, etiqueta). Se usa sola para los cortes que son suyos:

| Prenda en la web | Modelo | Piezas con color propio |
| --- | --- | --- |
| Jersey «Con capucha (sudadera)» corte *Oversize* | `street/01_sudadera_oversize` (hombro caído, capucha bajada, bolsillo canguro, cordones con punteras y ojales) | Cordones (ribetes), punteras y ojales (herrajes) |
| Chaqueta «Acolchada / plumífero corto» y abrigo «Plumífero» por la cadera | `street/02_plumifero_corto` (canales acolchados, cuello alto, puños y bajo elásticos) | Cremallera |
| Chaqueta «Chaleco acolchado» (tipo nuevo) | `street/03_chaleco_acolchado` | Cremallera |
| Pantalón *Baggy* u *Oversize* | `street/04_cargo_baggy` (pernera ancha que se amontona en el tobillo, bolsillos cargo con solapa y broche) | Botón y broches (herrajes) |
| Pantalón corto «Baloncesto (largo y ancho)» (corte nuevo) | `street/05_shorts_baloncesto` (cintura elástica fruncida, cordón, franja lateral) | Franja y cordón (ribetes) |
| Zapatillas «Bota (caña alta)» | `street/06_zapatillas_altas` (caña acolchada, siete pares de ojales) | Suela, cordones (se pueden quitar), refuerzos de talón, puntera, ojalera y cuello (secundario) |
| Gorro (tipo nuevo, accesorio) | `street/07_gorro` (canalé con vuelta doble, modelado sobre las cabezas esculpidas como la gorra) | Etiqueta (ribete, se puede quitar) |
| Chaqueta «Universitaria (varsity)» | `street/08_chaqueta_varsity` (cuerpo de lana, mangas de piel, canalé con dos rayas, corchetes) | Mangas (secundario), rayas (ribetes), corchetes (herrajes) |
| Chaqueta «Cortavientos» | `street/09_cortavientos` (nailon, canesú en pico, puños elásticos) | Canesú (secundario), cremallera |
| Pantalón «Paracaídas» (corte nuevo) | `street/10_pantalon_paracaidas` (nailon amplio, tobillos fruncidos con cordón y tope) | Cordones (ribetes), topes (herrajes) |
| Gorra «Trucker (rejilla)» | `street/11_gorra_trucker` (frente de espuma, rejilla detrás, cierre de presión) | Rejilla (secundario), cierre (herrajes) |
| Gorra «Snapback (visera plana)» | `street/12_gorra_snapback` (copa alta y armada, visera plana) | Cierre de presión (herrajes) |
| Gorra «Cinco paneles» | `street/13_gorra_cinco_paneles` (copa baja, visera plana corta, cinta con hebilla) | Hebilla (herrajes) |
| Gorra «Pescador (bucket)» (tipo nuevo) | `street/14_gorro_pescador` (techo plano, ala caída con pespuntes) | — |
| Zapatillas *Skate* | `street/15_zapatillas_skate` (acolchadas, suela vulcanizada con puntera de goma) | Suela, cordones (se pueden quitar), refuerzos (secundario) |
| Zapatillas *Chunky* | `street/16_zapatillas_chunky` (suela gruesa por capas, paneles superpuestos) | Suela, cordones, paneles (secundario) |
| Zapatillas *Running* | `street/17_zapatillas_running` (punto, mediasuela con balancín) | Suela, cordones, contrafuerte (secundario) |
| Zapatillas *Sin cordones (slip-on)* | `street/18_zapatillas_slip_on` (elásticos a los lados) | Suela, elásticos (secundario) |

**Elegir el modelo**: en «Editar» prenda, el campo **«Modelo 3D»** ofrece:
- Automático: los cortes de la street (*Baggy*, paracaídas, baloncesto, plumífero, varsity, cortavientos, caña alta, skate, chunky, running, slip-on, gorras trucker, snapback, cinco paneles y pescador, sudadera *Oversize*) usan esa colección; el resto, punto si existe; si no, casual; si no, clásica.
- Colección punto, colección casual (camisas), colección street (jerséis con capucha, pantalones, pantalones cortos, chaquetas y abrigos: usa su modelo también con otros cortes; gorras) o colección clásica.
- Generado por código: admite colores por pieza.

El reparto está en `src/three/libraryCatalog.ts`. Los cortes *Slim*, *Relaxed*, *Boxy* y *Oversize* ajustan la holgura del modelo.

**Largo según el corte**: los modelos tienen el largo de una prenda normal (el bajo a la altura de la entrepierna). Los cortes que acaban en la cintura se acortan al construir la prenda (`HEM_HEIGHT` en `libraryCatalog.ts`, `shortenGeometry` en `libraryFit.ts`):
- *Boxy* (camisetas y camisas): el bajo a la altura de la cintura, cubriendo justo la pretina del pantalón.
- *Crop*: camisetas y camisas por encima de la cintura; jerséis con el elástico justo por encima; chaquetas a la cintura.
- *Bomber*: siempre a la cintura, con la tira elástica sobre la cadera alta.

Se acorta solo el tronco (las mangas no cambian): por encima del pecho no se toca nada, de ahí hacia abajo se comprime de forma progresiva y la tira del bajo (dobladillo y pespunte) sube entera. Las prendas generadas por código siguen las mismas alturas (boxy, crop, y cazadoras *bomber*, *biker*, vaquera, *Harrington* y *varsity* a la cintura).

**Preparación de los archivos** (script `scripts/prepare-garments.mjs`). Tus originales no se tocan:
- `npm run models`: la clásica (`../prendas_3d_glb` → `public/models/prendas`);
- `npm run models:punto`: la de punto (`../prendas_punto_glb` → `public/models/prendas/punto`);
- `npm run models:casual`: la casual (`../prendas_casual_glb` → `public/models/prendas/casual`);
- `npm run models:street`: la street (`../prendas_street_glb` → `public/models/prendas/street`);
- `npm run models:maniqui`: el maniquí (`../prendas_casual_glb/maniqui` → `public/models/maniqui`; su versión ligera tiene 30.000 triángulos, el tercer argumento del script).

El script:
- hornea la oclusión ambiental con trazado de rayos (axilas, cuello, pliegues, interior) en `COLOR_0`;
- simplifica con un error máximo de 0,35 mm (alta, para el visor) y genera una versión de 20.000 triángulos en `lod/` (miniaturas y outfits) con un error máximo de 1,2 mm (con más error salían manchas oscuras en las prendas);
- cuantiza y comprime con meshopt: de unos 3,5 MB a unos 450 KB (alta) y 110 KB (miniatura) por prenda;
- marca la tela como teñible;
- conserva cada pieza (material con `extras.role`) como una primitiva aparte. La oclusión se calcula con todas juntas.

El generador de la colección casual y del maniquí está en `prendas_casual_glb/generador/` (ver su `LEEME.md`); el de la street, en `prendas_street_glb/generador/`. Es el mismo sistema de campos de distancia que la colección de punto, con componentes por papel.

Si cambias o añades modelos, vuelve a ejecutar el script de su colección. Para una colección nueva, añade su carpeta y sus reglas en `libraryCatalog.ts` (con el ángulo de brazos con que se modeló).

**En la web:**
- El tejido (normal map, rugosidad, sheen) se proyecta en **triplanar**, porque los modelos no traen coordenadas UV. La oclusión del archivo se combina con la de curvatura.
- **Prenda sola**: se ve tal cual la modelaste, en pose A.
- **En el maniquí y los outfits**: se deforma para cada silueta (`src/three/libraryFit.ts`):
  - tronco por secciones;
  - mangas con un esqueleto de dos huesos (de la pose A a los brazos del maniquí);
  - perneras sobre el eje de cada pierna;
  - gorra a la cabeza: la casual (`casual/11_gorra`) se modeló sobre las cabezas esculpidas (la copa sigue la cabeza con el pelo, ~5 mm de holgura) y entra tal cual, en hombre y en mujer (el moño queda bajo la abertura de la tira). La clásica necesita `CAP_FIT` (sube 4 cm y se agranda un poco, porque se modeló sobre una cabeza más baja y pequeña). Con la visera hacia atrás o de lado, la gorra gira sobre la cabeza y cada punto del borde toma la altura que le toca (la visera hacia atrás baja a la nuca y la abertura sube a la frente); de lado, la copa se adapta al óvalo de la cabeza (`capFrame` en `libraryFit.ts`). El gorro de la street se modeló igual (sobre las dos cabezas, con pelo y orejas) y también entra tal cual;
  - calzado: sigue el eje de cada pierna hasta el tobillo (región `lower`).

  - el escote se ciñe al cuello del maniquí (`tightenCollar`): se mide el borde interior del cuello de la prenda por alturas y sectores y se acerca hasta dejar ~7 mm, sin meterlo nunca dentro del pecho, los hombros o la espalda; vale también para las prendas generadas por código.

  La parte de arriba se ensancha un poco (8 %) de cintura para abajo para caer por encima del pantalón, y por debajo del pecho no se ciñe a la cintura del maniquí: cuelga del pecho (si no, en las siluetas de cintura marcada hacía forma de campana).
  - hombros: los modelos traían la misma holgura en todas direcciones y la tela quedaba 2-4 cm por encima del hombro, como con hombreras; ahora se baja hasta apoyarse en él (salvo capuchas y cuellos altos);
  - mangas: el grosor se escala de forma progresiva del hombro a la muñeca y la holgura se afina hacia el puño (antes se estrechaban en el codo y se hinchaban debajo, como globos); junto al hombro el giro entra poco a poco. Los perfiles del cuerpo de referencia (tronco y radio de la pierna) se interpolan con curvas monótonas suaves: con la interpolación lineal se veían bandas horizontales en las superficies lisas.
- No se simulan (la caída ya está modelada).
- Los **detalles a mano** se proyectan sobre tu malla y siguen la misma deformación.

**Limitaciones:**
- Los modelos de las colecciones clásica y de punto son de **una sola pieza**: botones, costuras y cremalleras forman parte de la malla y toman el color de la prenda. En ellos «Personalizar» ofrece el estampado y los detalles.
  - Los de las colecciones casual y street traen piezas aparte, y el panel muestra solo los colores que tiene cada modelo (`LibraryEntry.colors`).
  - Si exportas tus propios modelos con materiales separados con `extras.role` (`button`, `zipper`, `trim`, `hardware`…), funcionan igual.
- Al bajar los brazos desde la pose A, las mangas quedan algo más holgadas que en el diseño original y la sisa se comprime. Se nota poco, pero es una aproximación (skinning lineal).
- Prendas diseñadas por separado pueden rozarse en algún punto al superponerlas en siluetas extremas (p. ej. «Corpulento»).

## Modelo propio por prenda (`modelUrl`)

Además de la biblioteca, cada prenda puede llevar su propio archivo. Cada prenda tiene un campo `modelUrl` en la base de datos (migración `add_model_url`), que se rellena en «Editar» con una URL `https://…/prenda.glb` o con una ruta `/models/prenda.glb`. Si es una ruta, el archivo va en `Frontend/public/models/`. Si `modelUrl` está vacío o el archivo falla, se usa el modelo de la biblioteca o el procedural.

Requisitos de cada archivo:

| Qué | Cómo |
| --- | --- |
| Formato | `.glb` (glTF 2.0 binario), o `.gltf` con sus texturas |
| Escala y ejes | Metros, Y hacia arriba, la prenda mirando a +Z, centrada |
| Materiales | PBR estándar de glTF (metallic-roughness) |
| Texturas | *Base color* (sRGB); *normal map*; mapa ORM (oclusión, rugosidad, metal en R, G y B). 2048 px como máximo para web, 1024 px en móvil. Tileables si el tejido se repite |
| Metal | `metallic = 1` solo en cremalleras, botones metálicos y hebillas; 0 en la tela |
| Color desde la web | Marca los materiales de tela con el *extra* `{"tintable": true}` (en Blender: propiedad personalizada del material + exportar "Custom Properties"). Sin la marca se respetan los colores del archivo y el visor oculta las muestras |
| Geometría | Grosor de tela real (no planos de una cara) y menos de unos 150.000 triángulos |
| Compresión (opcional) | Meshopt: funciona tal cual. Draco: copia `node_modules/three/examples/jsm/libs/draco/gltf/` a `public/draco/` (no se descarga nada de CDNs) |
| Alojamiento externo | El servidor debe permitir CORS para tu dominio |

Los modelos reales se muestran solos (modo "Prenda"). El modo "En maniquí" usa el modelo procedural, porque un archivo externo no está ajustado a las siluetas paramétricas.

## Estilista (`/estilista`)

- Elige estilo, ocasión, tiempo y armario, y pulsa «Proponer outfits»: el backend (`POST /stylist/outfits`) devuelve 4 propuestas que se ven sobre el maniquí 3D (flechas para pasar de una a otra). «Descubrir combinaciones nuevas» da prioridad a prendas que no usas.
- **Notas de grafiti**: cada consejo es una pegatina con cinta junto al maniquí. «Vale» lo aplica al outfit (añade la prenda, la cambia o cambia cómo se lleva: bajo doblado, camiseta metida, chaqueta abierta…), «Otra» pide otra prenda para el mismo consejo y la X lo descarta. En el móvil las notas van en una tira bajo el maniquí.
- Panel lateral: por qué funciona (razones y paleta), prendas con «Cambiar» (sustitutas del mismo hueco) y candado para fijarlas en la siguiente propuesta; «Me gusta», «No es para mí» y «Guardar outfit» (lo crea con el estilo de cada prenda).
- Todo lo que aceptas, descartas, cambias o guardas se envía a `POST /stylist/feedback` y ajusta las siguientes propuestas.
- La tipografía de las notas usa fuentes de rotulador del sistema (`Segoe Print` en Windows, `Marker Felt` en macOS); no se descarga ninguna fuente externa.

**Ficha de compra**: en el editor de prenda, «Dónde lo compraste» guarda marca, producto, tienda, plataforma, enlace, referencia, fecha y precio. En el visor (`/items/:id`) aparece en «Compra y estilo»; el enlace solo se pinta si es `http`/`https` y se abre con `rel="noopener noreferrer nofollow"`.

## Perfil (`/perfil`) y login con Google / Apple

- **Perfil**: portada y foto (se recortan al centro en el navegador antes de subirlas: 512×512 y 1600×560), nombre, `@usuario` (comprueba si está libre mientras escribes), bio, estilos, colores, tallas, web, Instagram y un **color de acento** que solo se usa en tu portada y en el trazo de tu nombre (la interfaz sigue en grises). Debajo: tus números, **cuentas conectadas**, **seguridad** (contraseña) y tus últimas publicaciones de Instagram si la conectas.
- **Entrar con Google / Apple**: botones en `/login` (solo aparecen los configurados en el backend). Son enlaces normales al backend; la vuelta llega a `/auth/callback#result=…` (`pages/AuthCallbackPage.tsx`), que canjea el código y borra el fragmento de la barra de direcciones.
- **Cuentas sin contraseña**: para crear contraseña o borrar la cuenta se confirma la identidad volviendo a entrar con Google/Apple (`lib/oauthFlow.ts` guarda la acción pendiente en `sessionStorage`).
- Las imágenes del usuario necesitan el token: `lib/assetUrl.ts` las descarga una vez y da una URL `blob:`.

## Personas, perfiles públicos y Mensajes

- **Mensajes** (`/mensajes`, `pages/ChatPage.tsx`): lista con no leídos, conversación con burbujas, outfits enviados (se ven en 3D), «Visto», «escribiendo…», borrar, cargar anteriores, nuevo chat y nuevo grupo (buscador de personas), info del grupo (nombre, miembros, admins, añadir, quitar, salir). En móvil, lista y conversación por separado.
- **Tiempo real** (`lib/realtime.tsx`): `RealtimeProvider` abre el WebSocket con un ticket, reconecta solo (1 s → 30 s) y reparte los eventos (`useRealtimeEvent`). Lleva los contadores del menú (mensajes sin leer y solicitudes). En desarrollo el proxy de Vite reenvía también los WebSocket (`ws: true` en `vite.config.ts`).
- **Personas** (`/personas`): buscar por @usuario o nombre, seguir y aceptar o rechazar solicitudes.
- **Perfil público** (`/u/:usuario`): portada, foto, bio, estilos, seguir / Solicitado / Siguiendo, Mensaje, bloquear, quitar seguidor; pestañas de outfits compartidos, seguidores y seguidos; muro «cuenta privada».
- **Privacidad** en `/perfil`: cuenta privada, quién puede escribirte y personas bloqueadas. Cifras de seguidores y seguidos.
- **Compartir un outfit**: interruptor «Compartir en mi perfil» en el editor; en la lista lleva la etiqueta «En tu perfil».
- Las fotos de otras personas se piden con el token (`lib/personImage.ts`).

## Ideas, novedades, avisos y admin

- **Campanita** (`components/community/NotificationBell.tsx`, junto al logo): número de avisos sin leer (llega por el WebSocket), lista con los últimos, «Marcar todo como leído» y, al pulsar uno, te lleva a su sitio.
- **Ideas** (`pages/IdeasPage.tsx`, `components/community/IdeaCard.tsx`): el voto se ve al momento y se deshace si falla. Un admin ve «Gestionar (admin)» en el menú de cada idea (estado, respuesta, fijar, ocultar, borrar).
- **Denunciar** (`components/community/ReportDialog.tsx`): en el menú «…» de un perfil, en la banderita de los mensajes de otras personas, en los outfits compartidos y en las ideas.
- **Admin** (`pages/AdminPage.tsx`): la entrada «Admin» del menú solo aparece con rol `ADMIN` (el backend lo comprueba igualmente). Desde un perfil, un admin tiene «Abrir en el panel de admin» y puede ocultar outfits compartidos.
- **Cuenta suspendida**: si la API responde 403 con `code: "banned"`, se cierra la sesión y la pantalla de acceso explica hasta cuándo y por qué (`lib/ban.ts`). Un outfit ocultado por un admin aparece en tu lista con «Oculto por moderación».

## Monitor (`/monitor`)

- `pages/MonitorPage.tsx`: se refresca solo (estado cada 5 s; base de datos y eventos cada 30 s; uso cada minuto) mientras la pestaña está a la vista; «En directo» lo pausa. Ventana de 1 h / 6 h / 24 h para el tráfico y 7 / 30 / 90 días para el uso.
- `components/monitor/TimeChart.tsx`: gráficos en SVG propio (sin librerías): columnas o línea, una serie por gráfico, cruz con tooltip, flechas del teclado para recorrer los puntos y el dibujo anterior atenuado mientras recarga.
- Estado con piloto + texto (nunca solo color): verde, ámbar (`--warn`) y rojo (`--danger`).

## Outfits (`/outfits`) y vestidor (`/outfits/new`, `/outfits/:id`)

- **Página de outfits**: fondo de neón (`components/fx/NeonScene.tsx`: tubos que parpadean, grafiti, polvo y parallax), «Fit del día» con tus favoritos, pestañas Todos/Favoritos, búsqueda, orden (recientes, antiguos, A–Z, **nota**), pegatinas de estilo con contadores, selector de maniquí y fichas con nota, favorito, editar, duplicar y eliminar.
- **Vestidor**: prendas por huecos a la izquierda, maniquí en el centro (con la nota en directo arriba a la derecha) y a la derecha la ficha con dos pestañas: **Ficha** (nombre, estilo, favorito, ocasión, temporada, prendas) y **Rating**.
- **OUTFIT RATING** (`components/rating/`): dial animado de 0 a 100 con el color del nivel, desglose de las cuatro categorías (cada una se abre para ver sus reglas), comentarios, consejos (los concretos tienen botón **Probar**, que aplica el cambio en el maniquí), insignias, historial y **Recalcular**. Mientras eliges prendas, la nota se pide a `POST /outfits/ratings/preview` medio segundo después de cada cambio, sin guardar nada. La nota la calcula el backend con reglas (ver el README del backend).
- **Comparar**: botón «Comparar» en `/outfits`, eliges de 2 a 4 fichas y se abre un cara a cara con la nota de cada uno y el ganador de cada categoría.
- Sonidos opcionales (apagados por defecto) con el botón del altavoz; avisos con `components/fx/Toast.tsx`.

## Calendario (`/calendario`): OUTFIT CALENDAR

- Vistas **mes**, **semana** y **día** (con animación al cambiar). En el mes cada día lleva una miniatura plana del outfit (`components/calendar/OutfitGlyph.tsx`: una figura pintada con el color de cada prenda en su sitio, ligera para 42 días), su nombre y la pegatina del estilo; en la semana, el maniquí 3D de cada día.
- Al pulsar un día se abre un panel (en el móvil, una hoja desde abajo) con el outfit en 3D, nota, evento especial, «Marcar como usado», aviso de repetición y acciones (cambiar outfit, editarlo, quitarlo del día). Para asignar: recomendados para ese día arriba, buscador de tus outfits y **Crear un outfit nuevo para este día** (abre el vestidor con `?date=` y, al crearlo, lo pone en el calendario y vuelve).
- Columna derecha: recordatorio de hoy, próximos 7 días, eventos con cuenta atrás, outfits que se repiten, recomendados sin estrenar y estadísticas.
- Las fechas van como «YYYY-MM-DD» en tu hora local (`lib/dates.ts`). Todo se guarda en el backend (tabla `CalendarEntry`).

## Analítica (`/analitica`): STYLE ANALYTICS

Panel con tus cifras, destacados, STYLE INSIGHTS, estilos (barra rayada = estilo deducido), colores (ranking con el color real, reparto, combinaciones y menos usados), evolución semanal o mensual (columnas con aviso al pasar el ratón o al enfocar) y mezcla de estilos por mes, uso de cada tipo de prenda, prendas sin combinar y marcas. Los gráficos son HTML/SVG propios (`components/analytics/Charts.tsx`), con colores de serie que pasan el validador de daltonismo sobre el fondo oscuro. Se recarga al entrar, al volver a la pestaña y con «Actualizar». Sin datos, sale un cartel vacío (nunca cifras de ejemplo).

## Wishlist (`/wishlist` y `/wishlist/:id`)

- **Colección:** tarjetas con tu foto (o el modelo 3D si no hay), estado con color, icono y nombre, categoría, precio con su tendencia y mini gráfica, «En tu precio» si está en el objetivo y sello «Comprado». Al pasar el ratón se levanta la tarjeta y aparecen los botones para cambiar el estado al momento. Filtros por estado y categoría (con recuentos), búsqueda y orden (recientes, precio, nombre). Al guardar uno nuevo, la tarjeta entra con un golpe de pegatina.
- **Presupuesto:** valor de lo pendiente, comprado, objetivo, lo ahorrado y lo que falta (para el objetivo y para comprarlo todo). Avisa de los artículos en otra moneda (no se convierten) y de que no hay servicios de seguimiento de precios conectados.
- **Añadir / editar** (`components/wishlist/WishForm.tsx`): foto subida (PNG, JPEG o WebP, máx. 2 MB) o URL, nombre, categoría, marca, talla, precio y moneda, precio objetivo, color, modelo 3D, enlace, tienda, estado, notas, armario de destino y «Seguir el precio».
- **Ficha** (`pages/WishItemPage.tsx`): foto o 3D, estado, precio actual, más bajo y objetivo, historial en escalón (`components/wishlist/PriceChart.tsx`: un precio vale hasta el siguiente; línea discontinua del objetivo; aviso al pasar el ratón o con el teclado), apuntar y borrar precios, «Probar en un outfit» (abre el vestidor con `?with=<id>`) y, cuando está comprado, **Pasar al armario**.
- **Vestidor:** el burro trae también la wishlist, con el filtro «Todo / Las tengo / Wishlist»; esas prendas llevan borde discontinuo rosa y la etiqueta «Deseo», y el contador del escenario dice cuántas faltan por comprar. «Sorpréndeme» solo usa lo que tienes. En Outfits, las tarjetas marcan «N por comprar».

## Sneakers (`/sneakers` y `/sneakers/:id`): SNEAKER COLLECTION

**Página principal: tres pestañas**
- **Mi colección:** galería de tarjetas grandes.
  - Cada tarjeta lleva tu foto (o el 3D con tu color), la etiqueta de la marca (solo texto, sin logotipos), el estado con puntos y su nombre, la talla, los usos y los outfits.
  - Efectos: inclinación, un foco que sigue al ratón, un halo del color de la zapatilla y caída con destello al añadir un par.
- **Quiero conseguir:** la wishlist de sneakers. Las tarjetas tienen borde discontinuo rosa y la cinta «Wishlist», con precio y objetivo.
- **Dashboard** (`components/sneakers/SneakerDashboard.tsx`):
  - total de pares;
  - marca más repetida y color predominante (indica si hay empate);
  - gasto por moneda;
  - modelo más usado y par menos usado;
  - distribución por marcas y por estado;
  - colores;
  - las que combinan con más outfits (con enlace a esos outfits).

**Filtros:** marca (con recuentos), búsqueda, modelo, talla, color (por nombre, con muestra), estado y orden (recientes, marca, modelo, más usadas y menos usadas). En el móvil, las filas de filtros se deslizan.

**Zapatillas del armario sin ficha:** salen en un aviso y se fichan con un clic, sin duplicar la prenda.

**Formulario** (`components/sneakers/SneakerForm.tsx`):
- Campos: foto (subida o URL), marca, modelo, colorway, talla, color, estado, fecha y precio de compra, usos iniciales, tienda, modelo 3D (calzado) y notas.
- Si el servidor responde «ya tienes este par», se ven los pares iguales y el botón «Tengo otro par igual: guardarlo».
- Mientras guarda, el botón queda desactivado.

**Ficha** (`pages/SneakerItemPage.tsx`):
- foto o 3D;
- usos con «+1 uso» y «−1», con el desglose de usos apuntados y usos del calendario;
- outfits y prendas distintas con las que se ha combinado;
- datos de compra y notas;
- botones «Crear outfit con estas» (`/outfits/new?with=<id>`), «Ver sus outfits» (`/outfits?item=<id>`), editar, eliminar o «quitar de la colección pero dejarlas en mi armario».

**Integración con outfits**
- **Vestidor:** en «Todo» y en «Pies» sale la fila «Tu colección de sneakers». Al elegir un par, sustituye al calzado que hubiera puesto. En el burro, las zapatillas fichadas llevan la etiqueta de su marca.
- **Outfits:** una fila de filtros «Con…» muestra solo los outfits que llevan unas zapatillas concretas. Se guarda en la URL como `?item=`.

## Batallas (`/batallas`, `/batallas/:id`): STREETWEAR BATTLES

- Retos 1 vs 1: lanzas un reto con uno de tus outfits (a alguien o abierto a cualquiera) y el rival responde con el suyo. La comunidad vota 48 h.
- Pestañas: En juego, Retos abiertos, Te retan, Mis batallas y Resultados. Al lado, el ranking (podio + puestos).
- «Retar» en el perfil de otra persona abre el reto con esa persona elegida (`/batallas?retar=<id>`).
- El marcador se oculta hasta que votas (o si participas). Nadie vota en su propia batalla.
- Animaciones: los outfits entran desde los lados y el «VS» choca con una onda; al votar, chispas, «+1» y la barra se desliza; corona y celebración para el ganador.

## Street Market (`/market`, `/market/:id`): apagado, «Próximamente»

- Está terminado (anuncios para vender o intercambiar, fotos, favoritos, contacto por el chat, «Vender» desde una prenda o unas zapatillas) pero **apagado** hasta su lanzamiento: `FEATURES.market = false` en `src/lib/features.ts`.
- Mientras está apagado: no sale en el menú, `/market` lleva a Novedades → «Próximamente» y no hay botones «Vender».
- Para encenderlo: `market: true` aquí y `MARKET_ENABLED=true` en el backend.

## Armario (`/armario`): catálogo streetwear

- **Cabecera:**
  - pegatina «My collection»;
  - título grande con sombra roja y burdeos y trazo de spray;
  - contador de prendas;
  - botón «Añadir prenda» de neón.
- **Barra de información** con datos reales (`GET /wardrobe-items/facets`): prendas, categorías, favoritas y última añadida (abre su ficha).
- **Filtros, todos en la URL:**
  - categoría, como etiquetas con su número; en móvil se desplazan en horizontal;
  - panel «Filtros» con color (grupos presentes), marca, temporada, tipo de prenda y solo favoritas;
  - orden: recientes, antiguas, nombre o favoritas primero.
  - Los filtros activos salen como pastillas que se pueden quitar.
- **Vistas:** cuadrícula, compacta y catálogo. Se recuerdan en este navegador (`localStorage`, `myout.wardrobe.view`).
- **Fichas** (`components/wardrobe/GarmentCard.tsx`):
  - modelo 3D protagonista, cinta arriba y «Nueva» (menos de 7 días);
  - nombre, categoría, tipo, marca y color con su nombre (`lib/colors.ts`, la misma tabla que el estilista).
  - El corazón de favorita y el menú «⋯» (Editar / Eliminar) van fuera del escenario 3D, porque el lienzo compartido se pinta encima del HTML. El menú se abre en una capa aparte.
- **Ficha ampliada** (`GarmentDetail.tsx`, ventana):
  - visor 3D propio que se gira arrastrando, y tu foto si la tiene;
  - marca, color, temporada, talla, armario, fecha, compra, estilos y notas;
  - botones «Añadir a un outfit» (`/outfits/new?with=<id>`), «Editar», «Ficha completa» (`/items/:id`) y «Eliminar» (con confirmación).
  - En móvil ocupa toda la pantalla.
- **Armario vacío:** composición con percha y prendas flotando, «Tu armario está esperando» y «Añadir mi primera prenda».
- **Animaciones:** entrada escalonada, elevación con brillo y reflejo, modelo que crece, iconos que aparecen al pasar el ratón, latido al marcar favorita y fundido al cambiar de filtro. Con «reducir movimiento» no hay animaciones.

## Estilista (`/estilista`): virtual stylist

- **Cabecera** «Virtual stylist» con el título grande y trazo de spray.
- **Controles** en tres bloques (Estilo, Ocasión, Tiempo) con etiquetas e iconos; en móvil se desplazan en horizontal. Botón «Proponer outfits» con barra de carga.
- **Escenario** (`OutfitStage` con `rig`): arrastrar para girar, zoom con rueda, pellizco o botones, vistas Frente / Lado / Espalda, giro automático y un balanceo suave cuando está parado. No hay poses: el maniquí es una malla fija.
- **Probador** (`components/stylist/SwapTray.tsx`): al pulsar «Cambiar» salen las prendas compatibles de tu armario; al tocar una, el maniquí se la prueba, y el cambio se aplica al confirmar.
- **Bloqueo:** el candado de cada prenda la envía en `lockedItemIds`, y el estilista no la sustituye.
- **Análisis** (`StyleAnalysis.tsx`): paleta, motivos y cuatro indicadores (color, equilibrio, estilo y detalles), más ocasión y tiempo.
- **Notas** (`StickyNote.tsx`): ¡OJO!, TRUCO, IDEA y ¡BIEN!, con papel, cinta y letra a mano; vienen del motor.
- **Le falta a tu armario** (`MissingPieces.tsx`): prenda sugerida, prioridad, outfits completos que desbloquea (recuento real) y «Añadir a la wishlist» (sin precio ni enlace).

## Inicio, Mensajes y Personas: mismo lenguaje que el armario

- Las tres páginas reutilizan la paleta `--wd-*`, la pegatina (`.wd-kicker`), el título (`.wd-title`) y los botones del armario. Estilos al final de `styles.css`, bajo `.hm`, `.ch` y `.pp`.
- **Inicio (`/`):** saludo grande con tu nombre en naranja, cifras con contador y acceso al estilista, escaparate con el maniquí y tu último outfit, recientes con las fichas del armario (`GarmentCard` sin botones), categorías con icono, armarios y outfits.
- **Mensajes (`/mensajes`):** misma lógica (tiempo real, envío, grupos, denuncias). Cabecera «Direct line», filtro de conversaciones por nombre (aparece con más de 3), burbujas propias en naranja, avisos de grupo como pastilla y estado vacío animado. Página traducida.
- **Personas (`/personas`):** buscador grande con línea de escaneo mientras busca, resultados y solicitudes como tarjetas con aro de neón, y estados «Encuentra a tu gente» y «Nadie con ese nombre». Página traducida.

## Idiomas: español e inglés

- `src/i18n/index.ts`: `t('Texto en español')` devuelve la traducción. **El texto en español es la clave**; las traducciones al inglés están en `src/i18n/en.ts`. Si falta una, se ve el español (en desarrollo sale un aviso en la consola).
  - Variables: `t('Hola, {name}', { name })`. Plurales: `tn(n, '{n} prenda', '{n} prendas')`.
  - Contexto para palabras que se traducen distinto: `t('Bajo##estilo')` («Hem») frente a `t('Bajo')` («Low»). En español se ve sin el `##…`.
- El idioma se decide al cargar la página: el de la cuenta (`User.locale`) → el guardado en este navegador → el del navegador (inglés si lo pide; si no, español). Cambiarlo recarga la página, así `t()` vale en cualquier sitio (también en constantes).
- Se cambia en **Cuenta → Tus datos → Idioma** (se guarda en la cuenta) y en la pantalla de acceso (ES / EN).
- Fechas, números y monedas usan `LOCALE_TAG` (`es-ES` o `en-GB`).
- Los textos del catálogo que llegan del backend en español (etiquetas de campos y opciones, nombres de tipos de prenda) se traducen al recibirlos (`localize` en `api/client.ts`). Lo que escribe la gente (nombres de prendas, outfits, ideas, novedades) no se traduce.
- `npm run i18n:check` lista los textos que aún no tienen traducción al inglés.
- **Estado:** traducidos el menú, el acceso, la cuenta, el inicio, el armario (prendas, editor, personalización) y los outfits/vestidor. El resto de pantallas se traduce en las siguientes entregas.

## Estilo neón y animaciones (toda la app)

- **Fondo global** (`components/fx/NeonScene.tsx`): la pared de hormigón con firmas de grafiti, tubos de neón rojo que parpadean, fluorescentes fríos, suelo de baldosa y polvo flotando. Se monta una sola vez en `App.tsx`, así que es el mismo en todas las páginas de la app (el login conserva su calle de noche) y no se reinicia al navegar. Se mueve un poco con el ratón y el scroll.
- **Colores:** los de siempre (superficies gris oscuro, blanco hueso y rojo neón `--fx-neon`). Las animaciones no cambian colores ni componentes.
- **Sistema de animaciones**, sin librerías (CSS + Web Animations API; solo `transform`, `opacity` y `filter`):
  - `lib/motion.ts`: `withTransition()` (transiciones suaves al cambiar filtros o pestañas, con View Transitions si el navegador las soporta), `animateOut()`, `burst()` y `burstAt()` (chispas rojas y blancas al confirmar), y `reducedMotion()`, `canHover()` y `lowPower()`.
  - `components/fx/GlobalFx.tsx`, montado una vez:
    - las tarjetas se elevan e inclinan un poco hacia el cursor y recogen un reflejo rojo;
    - onda al pulsar botones, pestañas y filtros;
    - aparición al hacer scroll (la animación de entrada espera hasta que la tarjeta se ve);
    - línea roja arriba al cambiar de sección.
  - Clases reutilizables: `cy-fade-up` (con `--i` para escalonar) y `cy-pop`.
  - Los modales se cierran con animación; los avisos de «hecho» sueltan un anillo y chispas.
  - En el móvil, el menú es un panel lateral deslizante (botón ☰).
- **Rendimiento y accesibilidad:** sin inclinación ni luces de hover en pantallas táctiles; con «reducir movimiento» del sistema, todo queda quieto; el polvo se para cuando la pestaña no se ve.

## Rendimiento, chat y datos

- Cada página se carga la primera vez que se abre (`React.lazy` en `App.tsx`, con un `Suspense` alrededor del `Outlet` del menú). En el paquete inicial quedan inicio, acceso y la vuelta del login.
- Chat sin WebSocket (en Vercel no hay conexión en tiempo real): mientras `useRealtime().status` no es `online`, la conversación abierta pide los mensajes nuevos cada 4 s, la lista cada 10 s y los contadores (mensajes, solicitudes, avisos) cada 30 s, solo con la pestaña a la vista.
- «Cerrar sesión» avisa al servidor (`POST /auth/logout`): el token deja de valer en todos los dispositivos.
- Cuenta → «Descargar mis datos»: baja un JSON con todo lo de la cuenta.
- GitHub Actions (`.github/workflows/ci.yml`): en cada push a main se comprueban las traducciones, los tipos y el build del frontend, y los tipos y los tests unitarios del backend.

## Personalizar (`/personalizar`, `lib/preferences.tsx`)

- Cada usuario configura la web: **color neón** (naranja, rojo, rosa, violeta, azul, verde o un color propio), **menú** (menú compacto de solo iconos en escritorio, entradas ocultas, favoritas fijadas arriba con su orden y orden de los grupos), **efectos** (brillo neón completo/suave/apagado, fondo animado/quieto/liso, animaciones todas/reducidas) y **lectura y 3D** (tamaño del texto, densidad cómoda/compacta, calidad 3D alta/ahorro de batería).
- Se guarda en la cuenta: `PUT /api/users/me/preferences` (formato cerrado, validado en `Backend/src/users/preferences.ts`; llega con `GET /users/me` en `preferences`). También se guarda en este navegador (`myout.prefs`, con el id de la cuenta) y se aplica antes del primer pintado. Si la cuenta aún no tiene ajustes, se usan los del navegador solo si eran de esa misma cuenta.
- Se aplica con variables CSS en `<html>`: paleta `--neon`…`--neon-5` (y `-rgb` para transparencias: `rgb(var(--neon-rgb) / 0.5)`), `--neon-hi` y `--neon-deep`; y atributos `data-neon`, `data-bg`, `data-motion`, `data-text`, `data-density`, `data-menu`, `data-quality` (bloque «Personalizar» al final de `styles.css`). **Para colores de acento nuevos, usa siempre estas variables**, nunca el naranja escrito a mano.
- El menú sale de `components/navCatalog.ts` (los `id` se guardan en las cuentas: no renombrarlos). Inicio, Armario, tu perfil y Admin no se pueden ocultar.
- Los colores propios muy claros se oscurecen lo justo para que el texto blanco encima se lea (contraste ≥ 3:1).
- **El logo y el icono también cambian de color** (`lib/brandColors.ts`): se cambian los 5 tonos naranja-rojo de los degradados de `logo.svg` / `mark.svg` por los de la paleta y se usan como `data:` URL (siguen siendo `<img>`). También el icono de la pestaña (`BrandFavicon`) y el centro del QR del perfil. Con el naranja de siempre se usan los archivos tal cual.

## Iconos de la web y de la app

- Web: `public/brand/mark.svg` (las «OO» del logo) como favicon, más PNG en `public/brand/icons/` (32 px, `apple-touch-icon` de 180 px, 192/512 px y 512 px *maskable*), `public/favicon.ico` y `public/manifest.webmanifest`.
- App (Capacitor): `assets/icon-only.png`, `icon-foreground.png`, `icon-background.png`, `splash.png` y `splash-dark.png`, con el logo nuevo sobre fondo grafito. `npm run cap:assets` genera todos los tamaños.

## Miniaturas 3D: canvas compartido (`three/ViewCanvas.tsx`, `three/SceneView.tsx`)

- Todas las miniaturas (prendas y outfits de las listas) se pintan en un único canvas WebGL. Cada miniatura es un `<SceneView>` que marca su hueco en el HTML (sustituye al `View` de drei).
- **Sin bailes al hacer scroll:** el canvas ya no es fijo; va en una capa que ocupa toda la página (`.view-layer`, recorta lo que sobra) y se recoloca donde está la pantalla en cada fotograma. Así el navegador lo desplaza junto con las tarjetas aunque aún no se haya repintado. Es un 35 % más alto que la pantalla por arriba y por abajo, y solo se repinta al pasar medio margen.
- Cada miniatura se recorta con sus contenedores con scroll (carruseles, paneles), y el scroll dentro de ellos repinta al momento.
- **Solo se dibuja cuando algo cambia** (`frameloop="demand"`): en reposo no hay trabajo. Un vigilante ligero (`requestAnimationFrame`) pide un fotograma si una tarjeta se mueve o cambia de tamaño (hover, animaciones de entrada); el giro (`Turntable`) pide fotogramas solo mientras gira y se ve.
- **Solo lo que está cerca:** el 3D de cada miniatura se monta al acercarse a la pantalla (60 % de margen), dos por fotograma y primero las del centro, y se desmonta a más de 2,2 pantallas. Una lista de 60 prendas ya no carga ni construye las 60 de golpe.
- Resolución máxima 2× en escritorio y 1,5× en pantallas táctiles.
- **Prendas construidas en caché** (`three/buildCache.ts`): la misma prenda con el mismo cuerpo se reutiliza (al volver con el scroll, prendas repetidas, la misma prenda en varios outfits). Cada uso recibe su copia de las geometrías; máximo 48 MB / 80 prendas, se descarta primero la menos usada.
- El horneado del sombreado y el suavizado de color recorren arrays planos (mismo resultado, ~1,5× más rápido); al llegar un modelo, se construye en una transición de React (una prenda por tarea); `checkShaderErrors` solo en desarrollo; las fichas del armario están memorizadas con acciones estables.

## QR del perfil

- Cada perfil tiene su QR: botón «QR» en `/u/:usuario` (el tuyo y el de los demás) y «Tu QR» en `/perfil`. Al escanearlo se abre `https://<web>/u/<usuario>` (o el id si no tiene @usuario). En la app nativa se usa el origen de `VITE_API_URL`, no `localhost`.
- `lib/qr.ts` genera el QR sin dependencias (modo byte, corrección H para poder poner el icono de MyOO en el centro). Probado decodificando con OpenCV (lector básico y el de WeChat) en versiones 1-30 y los cuatro niveles, también la captura de pantalla y la imagen descargada.
- El QR va oscuro sobre claro, con margen y ojos cuadrados clásicos: con ojos redondeados y el logo, algunos lectores fallaban.
- «Descargar imagen» crea un PNG de 1080 px con el QR y el @usuario; también «Copiar enlace» y «Compartir» (si el navegador lo permite).
- Si quien escanea no tiene sesión, entra y vuelve a esa página (antes iba siempre al inicio).

## Marca: MyOO

- El proyecto se llama **MyOO** (antes MyOut). Cambian los textos visibles, el título de la página, el nombre de la app nativa (`appName`) y el título de la API.
- Se mantienen a propósito: las claves del navegador (`myout.token`, `myout.locale`, `myout.body…`, para no cerrar sesiones ni perder preferencias), el `appId` de Capacitor (`com.myout.app`), la carpeta local, el dominio `myout.vercel.app` y el usuario de demo local.
- Logo (`public/brand/logo.svg`): throw-up de grafiti, «MYOO» en letras de burbuja cromadas que gotean, con borde naranja-rojo. Icono (`public/brand/mark.svg`): las dos O en el mismo estilo. Es SVG propio, sin fuentes externas, para que también sirva de máscara en la pared del login.

## Estructura

```
src/
├── api/          cliente fetch, tipos y endpoints
├── auth/         AuthContext (token JWT en localStorage)
├── three/        cuerpo, prendas, tejidos (fabric/cloth), visores, maniquí
│   └── showcase/ escena del visor de prenda
├── components/   Layout (barra lateral), fichas, editor de prendas, modal
├── lib/          preferencias, WebGL/“reducir movimiento”/visibilidad (device.ts)
├── pages/        Armario, Visor de prenda, Outfits, Editor de outfits, Cuenta, Acceso
└── styles.css    tokens de color y tipografía (Archivo, con eje de anchura)
```

**Nota de seguridad:** guardar el token en `localStorage` es sencillo, pero cualquier script de la página puede leerlo. Por eso es clave evitar XSS (React ya escapa el contenido). Una alternativa más robusta, para una fase posterior, es una cookie `httpOnly`.

## Estilo unificado (`.ux`): tanda 1

Outfits, vestidor (`/outfits/new`, `/outfits/:id`), calendario y ficha de prenda (`/items/:id`) usan ya el estilo del inicio. Cada página lleva `ux` y su prefijo junto a la clase antigua: `.ft` (outfits), `.dr` (vestidor), `.cl` (calendario y su panel del día) y `.sc` (ficha).

- `.ux` define la paleta `--wd-*` y redirige las variables antiguas (`--fx-neon`, `--fx-panel`...) a la nueva, así las piezas propias (filtros, fichas, celdas del calendario) cambian de color sin tocarlas. El verde «usado» del calendario se mantiene como señal de estado.
- Cabecera: `.wd-kicker` + `.wd-title.ux-title` + `.ux-lede`; cifras reales en `.wd-stats.ux-stats` (outfits: fits, favoritos, estilos; calendario: usados en 30 días, racha, cumplidos, sin estrenar, que salen de la columna lateral).
- Secciones numeradas con `components/street/SectionHead.tsx`; en paneles estrechos (columna del calendario, panel de la ficha, vestidor) el número sale de un contador CSS.
- Estados vacíos con `components/street/EmptyStage.tsx` (la composición del armario) y `NoMatch`.
- Botones `wd-add` / `wd-btn-line`: el fondo va por `--wd-bg` con `.ux.ux.ux .btn.btn:is(...)` para ganar a `.main .btn:not(...)`.
- A 390 px: sin scroll horizontal, filtros desplazables y zonas táctiles de 44 px. Con «reducir movimiento» no hay animaciones.
- El calendario ya está traducido (antes tenía los textos fijos en español).

### Tanda 2: Wishlist, Sneakers y Analítica

- Prefijos: `.wh` (wishlist y su ficha), `.sk` (sneakers y su ficha) y `.at` (analítica), junto a sus clases de siempre (`.wl`, `.snk`, `.an`).
- Cabecera, cifras (`.wd-stats`), botones, estados vacíos (`EmptyStage` / `NoMatch`) y secciones numeradas como en la tanda 1. Las reglas comunes de la tanda 1 se han ampliado con `:is(.ft, .wh, .sk)` en vez de copiarlas.
- Se conservan los elementos propios: colores de estado de la wishlist, presupuesto y medidores, historial de precios, dashboard de zapatillas y gráficas de la analítica (sus cifras pasan a una barra como `.wd-stats` y cada tarjeta lleva su número con un contador CSS).
- Estas páginas y sus formularios estaban sin traducir: ya van con `t()` / `tn()`. Las marcas de zapatillas (Nike, Adidas…) no se traducen. Siguen en español los textos que genera el servidor (consejos de la analítica, nombres de colores).

### Tanda 3: Batallas, Maniquíes y Perfil público

- Prefijos: `.ba` (`/batallas` y `/batallas/:id`), `.mn` (`/maniquies`) y `.pv` (`/u/:usuario`).
- Batallas: pegatina «Streetwear battles», cifras reales del resumen (victorias, racha, en juego), sección numerada por pestaña y ranking como sección 02; pestañas vacías con `NoMatch` (acepta ya un `icon`). Las tarjetas, el ranking y el reto pendiente son paneles de cristal.
- Maniquíes: cabecera como el inicio, cifras (maniquíes y límite del plan), «Tus maniquíes» (01) y «Medidas» / «Nuevo maniquí» (02). En una columna las fichas pasan a filas sin cortarse.
- Perfil público: se mantienen la portada, el avatar con cinta y el nombre en grafiti; las pestañas Outfits / Seguidores / Siguiendo son ahora la barra de cifras (con CountUp) y siguen cambiando de pestaña. Bloqueo, cuenta privada y listas vacías usan `NoMatch`.
- Traducidos los textos que faltaban (tiempo restante y avisos de voto de las batallas, etiquetas de las denuncias del perfil).

### Tanda 4: Cuenta, Ideas, Novedades, Admin, Monitor y vuelta del login

- Prefijos: `.ac` (`/account`), `.ia` (`/ideas`), `.nv` (`/novedades`), `.adm` (`/admin`), `.mo` (`/monitor`) y `.cb` (`/auth/callback`).
- Cuenta: pegatina y nombre como el inicio, cifras de uso del plan (con CountUp), secciones 01-04 (tu cuenta, planes, historial, eliminar). Los planes y precios son los de la base de datos; el cambio de plan sigue siendo simulado.
- Ideas: el tablón (`IdeaBoard`) lleva una sección numerada con el orden elegido y el número de ideas; en el panel de admin se usa con `numbered={false}` porque ya la pone la pestaña.
- Novedades: «Próximamente» (01) y «Publicadas» (02) en línea de tiempo naranja.
- Admin: pestañas como botones, sección numerada por pestaña, cifras del resumen con CountUp y estados vacíos con `NoMatch`.
- Monitor: secciones Estado y tráfico / Base de datos y actividad / Uso de la app; las gráficas usan el naranja (los errores siguen en rojo).
- Admin, Monitor, Ideas y la tarjeta de ideas estaban sin traducir: ya van con `t()` / `tn()`, igual que «hace 5 min» / «ayer». Siguen en español los textos que manda el servidor (comprobaciones del monitor) y lo que escribe la gente (ideas, novedades).
