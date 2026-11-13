# Generador de la colección street

Mismo sistema que la colección casual (`../../prendas_casual_glb/generador`): las prendas se modelan como campos de distancia (SDF) sobre el cuerpo de referencia de 1,78 m, con los brazos a 32°, y se extraen con *marching cubes* por componentes. Cada pieza lleva su papel en `extras.role` del material y la web la colorea por separado:

| Papel | Piezas |
| --- | --- |
| `body` | La tela o la piel (teñible) |
| `secondary` | Mangas de piel de la varsity, canesú del cortavientos, rejilla de la trucker, refuerzos y elásticos de las zapatillas |
| `trim` | Cordones de la capucha y de la cintura, franja lateral, etiqueta del gorro, rayas del canalé de la varsity, cordones de los tobillos |
| `zipper` | Cremallera y tirador |
| `hardware` | Punteras de los cordones, ojales, botones, broches, corchetes, topes de cordón, cierres de las gorras |
| `sole`, `lace` | Suela y cordones de las zapatillas |

## Prendas

| Archivo | Prenda |
| --- | --- |
| `01_sudadera_oversize.glb` | Sudadera oversize: hombro caído, mangas que se amontonan en el puño, capucha bajada sobre la espalda, bolsillo canguro, cordones con punteras metálicas y ojales |
| `02_plumifero_corto.glb` | Plumífero corto (por la cadera alta): canales acolchados en el cuerpo y a lo largo de las mangas, cuello alto, puños y bajo elásticos, cremallera con tirador |
| `03_chaleco_acolchado.glb` | Chaleco acolchado: los mismos canales, sisa ribeteada y cremallera |
| `04_cargo_baggy.glb` | Cargo baggy: pernera ancha que se amontona en el tobillo, bolsillos cargo con solapa y broche, bolsillos traseros con solapa, trabillas y bragueta |
| `05_shorts_baloncesto.glb` | Pantalón corto de baloncesto: largo hasta la rodilla y ancho, cintura elástica fruncida con cordón, franja lateral |
| `06_zapatillas_altas.glb` | Zapatillas de baloncesto de caña alta: caña acolchada, siete pares de ojales, refuerzos de talón, puntera, ojalera y cuello |
| `07_gorro.glb` | Gorro de punto con vuelta doble y etiqueta tejida. Se modela sobre las cabezas esculpidas del maniquí (hombre y mujer, con pelo y orejas), así que en la web se coloca en la cabeza sin ajustes |
| `08_chaqueta_varsity.glb` | Chaqueta varsity: cuerpo de lana, mangas de piel (pieza aparte), cuello, puños y bajo de canalé con dos rayas, corchetes y bolsillos de ribete |
| `09_cortavientos.glb` | Cortavientos de nailon arrugado: canesú en pico de otro color que cruza las mangas, cuello alto, puños elásticos fruncidos, cremallera |
| `10_pantalon_paracaidas.glb` | Pantalón paracaídas: nailon amplio, cintura elástica, tobillos recogidos con jareta y cordón elástico con tope, bolsillos de muslo |
| `11_gorra_trucker.glb` | Gorra trucker: frente alto de espuma y rejilla detrás (pieza aparte), cierre de presión |
| `12_gorra_snapback.glb` | Snapback: copa alta y armada, visera plana, ojales bordados, cierre de presión |
| `13_gorra_cinco_paneles.glb` | Gorra de cinco paneles: copa baja, visera plana corta, cinta con hebilla |
| `14_gorro_pescador.glb` | Gorro de pescador (bucket): copa de techo plano y ala caída con pespuntes |
| `15_zapatillas_skate.glb` | Zapatillas de skate: acolchadas, lengüeta gruesa, suela vulcanizada con puntera de goma, refuerzos de ante |
| `16_zapatillas_chunky.glb` | Zapatillas chunky: suela gruesa por capas, paneles superpuestos |
| `17_zapatillas_running.glb` | Zapatillas running: empeine de punto, mediasuela con balancín más alta en el talón |
| `18_zapatillas_slip_on.glb` | Zapatillas slip-on: sin cordones, con elásticos a los lados de la pala |
| `19_vaquero_baggy.glb` | Vaquero baggy de cinco bolsillos: tiro algo bajo, cadera amplia, pernera muy ancha y algo curvada, bajo más largo por detrás que se amontona sobre la zapatilla. Cinturilla con doble pespunte, siete trabillas (piezas aparte), bragueta en J, bolsillos delanteros de boca curva, monedero, canesú en V, bolsillos traseros de parche, botón y remaches (`hardware`) y etiqueta de piel (`trim`). Pliegues de caída, rodilla, corva, bigotes de la entrepierna y acumulación en el bajo. En la web se usa con el corte baggy u oversize cuando el material es vaquero |
| `20_vaquero_clasico.glb` | Vaquero clásico (corte regular): pernera recta que se estrecha un poco, tiro medio, lavado índigo medio-oscuro |
| `21_vaquero_skinny.glb` | Skinny: ceñido de cadera a tobillo, bajo estrecho con algo de acumulación en el tobillo, índigo oscuro |
| `22_vaquero_slim.glb` | Slim: ajustado en el muslo y algo estrecho hacia el tobillo |
| `23_vaquero_recto.glb` | Recto: el mismo ancho de la rodilla al tobillo |
| `24_vaquero_wide_leg.glb` | Wide leg: tiro alto, cadera amplia y pernera muy ancha hasta el suelo |
| `25_vaquero_flare.glb` | De campana: ceñido hasta la rodilla y abierto hacia el bajo, tiro algo alto |
| `26_vaquero_bootcut.glb` | Bootcut: ajustado arriba y con una campana suave para ir sobre botas |
| `27_vaquero_mom.glb` | Mom jeans: tiro alto, cadera holgada, tobillo estrecho y corto, lavado claro |
| `28_vaquero_boyfriend.glb` | Boyfriend: holgado, tiro algo bajo y bajo vuelto |

Del 19 al 28 salen del mismo generador (`vaquero_baggy.py`, tabla `STYLES`): cada corte fija los radios de la pernera (cadera, rodilla, pantorrilla, tobillo y bajo), la holgura, la altura del tiro, el largo, la curva de la pierna, los pliegues y el lavado de Blender. Los bolsillos, el canesú y los remaches se recolocan solos con la altura del tiro y el ancho de la cadera de cada corte. En la web, un pantalón de denim usa el de su corte (regular, skinny, slim, straight, wide, flare, bootcut, mom, boyfriend o relaxed, baggy u oversize).

## Requisitos

Los mismos que la colección casual: Python 3 con `numpy`, `scipy`, `scikit-image` y `pillow`; Node con las dependencias del Frontend instaladas (la simplificación usa `meshoptimizer`), y el rasterizador de las vistas previas compilado:

```bash
gcc -O3 -shared -fPIC -o libraster.so raster.c
```

## Uso (desde esta carpeta)

```bash
# Prendas 01-05: <ids|all> <rejilla en m> <triángulos> <carpeta npz/png> <carpeta GLB>
python3 build_street.py all 0.003 120000 /tmp/street_npz ..

# Zapatillas de caña alta (carpeta de vistas previas, carpeta GLB)
python3 build_calzado.py /tmp/calzado_png ..

# Gorro (carpeta de vistas previas, carpeta GLB)
python3 build_gorro.py /tmp/gorro_png ..

# Prendas 08-10 (varsity, cortavientos, paracaídas)
python3 build_street2.py all 0.003 120000 /tmp/street2_npz ..

# Gorras 11-14: <tipos|all> (trucker, snapback, five_panel, bucket)
python3 build_gorras.py all /tmp/gorras_png ..

# Zapatillas 15-18: <tipos|all> (skate, chunky, running, slip_on)
python3 build_calzado_street.py all /tmp/calzado_png ..
```

### Vaqueros (19-28) y su versión de Blender

```bash
# Tela, metal y piel (<id>.glb), el hilo de los pespuntes puntada a puntada (<id>_costuras.glb)
# y los ejes de las piernas con el lavado (<id>_ejes.json). Sin --estilo, el baggy.
python3 build_vaquero.py 0.003 320000 /tmp/vaquero ..
python3 build_vaquero.py 0.003 320000 /tmp/vaquero .. --estilo=skinny   # clasico, skinny, slim, recto, wide, flare, bootcut, mom, boyfriend
```

Después, en Blender 5.2 (pestaña Scripting, consola de Python):

```python
exec(open(r'C:\Users\Usuario\Documents\MyOut\prendas_street_glb\generador\blender_vaquero.py', encoding='utf-8').read())
```

Lanza un Blender en segundo plano (la ventana queda libre; el avance va a `../vaquero_baggy/registro.txt`). Con una RTX 4060 tarda unos 5 minutos. Crea en `../vaquero_baggy/`:

| Archivo | Qué es |
| --- | --- |
| `vaquero_baggy.blend` | Escena editable: colecciones *Vaquero baggy* (Tela por piezas: cinturilla, delanteros y traseros izquierdo y derecho, bolsillos traseros, monedero y trabillas; Herrajes; Piel; Pespuntes), *Versión ligera (PBR, web)*, *Estudio* (ciclorama gris y luces que giran con cada cámara) y *Cámaras* (las 8 vistas). Material procedural «Denim lavado» |
| `texturas/vaquero_baggy_{BaseColor,Roughness,Normal,AO,Height}.png` | Mapas PBR de 4096 px horneados de la tela de alta (con los pespuntes) sobre la versión ligera |
| `texturas/vaquero_baggy_UV.png` | Plantilla de las UV |
| `19_vaquero_baggy_pbr.glb` | Versión ligera (150 000 triángulos) con las texturas a 2048 px en JPEG, botón, remaches y etiqueta |
| `render/01…08_*.png` | Frontal, trasera, laterales y primeros planos de cintura, bolsillos, tejido y bajos (Cycles) |

Para los demás cortes, antes del `exec`: `import os; os.environ['VAQUERO_IDS'] = '20_vaquero_clasico,21_vaquero_skinny'` (uno tras otro; el resumen va a `../vaqueros_lote.txt`) y `os.environ['VAQUERO_VISTAS'] = '360'` para hacer solo las 4 vistas (frente, derecha, atrás e izquierda) y la lámina `<nombre>_360.png`. Cada corte deja su carpeta (`../vaquero_skinny/`, etc.) con lo mismo que el baggy.

Se pueden repetir fases sueltas con la variable `VAQUERO_FASES` antes del `exec` (`preparar`, `hornear`, `exportar`, `render`; las que no son `preparar` abren el .blend guardado), por ejemplo `import os; os.environ['VAQUERO_FASES'] = 'render'`. `VAQUERO_TOMAS=05,07` repite solo esas vistas, `VAQUERO_MUESTRAS` cambia las muestras de Cycles y `VAQUERO_TEX` el tamaño de las texturas.

Cómo está hecho:

- **Tejido**: la sarga sigue unas coordenadas de patrón (contorno de la pierna abierta por el costado y altura), así los cordones van en diagonal y continuos por toda la pernera; vetas de urdimbre, jaspeado, lavado a la piedra, desgaste por atributo (muslos, rodillas, culera, bajos, borde de la cinturilla) más crestas de los pliegues (*pointiness*) y fondos más oscuros (oclusión). El revés de la tela es más claro.
- **UV**: como un patrón de costura: cada pernera se abre por el costado y se separa del revés, Blender las desdobla con estiramiento mínimo (SLIM) y las empaqueta por su forma.
- **Topología**: la malla sale de *marching cubes*: triángulos densos y uniformes (sin quads). Los pliegues, costuras y relieves ya están en la geometría, así que no lleva Subdivision; la versión ligera se simplifica con Decimate y conserva el detalle en el mapa de normales.


### Camisetas

Las 11 camisetas (clásica, oversize, slim, boxy, crop, longline, baby tee, raglán, pico, henley y manga larga) tienen su generador (`camisetas.py`, `build_camisetas.py`) y su script de Blender (`blender_camiseta.py`). Todo está explicado en [LEEME_camisetas.md](LEEME_camisetas.md).

Las 8 sudaderas (`sudaderas.py`) y las 8 camisas (`camisas.py`) usan el mismo constructor y el mismo script de Blender: ver [LEEME_sudaderas.md](LEEME_sudaderas.md) y [LEEME_camisas.md](LEEME_camisas.md). Los 7 jerséis y prendas de punto (`jerseis.py`), en [LEEME_jerseis.md](LEEME_jerseis.md). Las 12 chaquetas (`chaquetas.py`), los 7 abrigos (`abrigos.py`), los tops y prendas sin manga (`tops.py`) y las prendas formales (`formal.py`): [LEEME_chaquetas.md](LEEME_chaquetas.md), [LEEME_abrigos.md](LEEME_abrigos.md), [LEEME_tops.md](LEEME_tops.md) y [LEEME_formal.md](LEEME_formal.md). Todas pasan por el mismo `blender_camiseta.py`, que al final hace también el esqueleto y los pesos (`<id>_rig.glb` y `.fbx`).

Después, desde `Frontend`:

```bash
npm run models:street    # ../prendas_street_glb -> public/models/prendas/street
```

## Archivos

| Archivo | Contenido |
| --- | --- |
| `items5.py` | Las cinco prendas (sudadera, plumífero, chaleco, cargo y pantalón corto). El acolchado (`quilt`) hincha la tela entre pespuntes: horizontal en el cuerpo y a lo largo de la manga |
| `build_street.py` | Lanza `build5.py` con `items5` (variable `ITEMS`) |
| `calzado.py` | Calzado (el mismo archivo que en la colección casual, con el tipo `high_top` añadido) |
| `build_calzado.py` | Exporta las zapatillas de caña alta |
| `gorro.py`, `build_gorro.py` | Gorro: mide el radio de las dos cabezas (`cabeza.py`, `cabeza_f.py`) desde un centro, lo alisa y le da holgura; canalé, vuelta y etiqueta |
| `items6.py`, `build_street2.py` | Varsity, cortavientos y paracaídas. Las prendas de dos colores salen de la misma capa partida en dos piezas (`_split`) |
| `gorras.py`, `build_gorras.py` | Gorras street: la copa sigue las dos cabezas como la gorra casual; cada tipo cambia el frente armado, las costuras, la visera, el cierre y, en la trucker, la rejilla |
| `calzado_street.py`, `build_calzado_street.py` | Zapatillas street sobre la horma de `calzado.py` |
| `vaquero_baggy.py`, `build_vaquero.py` | Vaqueros (los 10 cortes de `STYLES`): patrón, pliegues, piezas sólidas (trabillas y etiqueta que se ciñen a la tela) y botón y remaches |
| `stitches.py` | Pespuntes: cada costura son rayos que buscan la cara exterior de la tela; sobre esa línea se reparten las puntadas (cápsulas de hilo) y las presillas de las trabillas |
| `blender_vaquero.py` | Material denim, UV, horneado PBR, exportación, piezas, estudio y renders en Blender |
| `build5.py`, `core.py`, `kit.py`, `extract.py`, `render.py`, `raster.c`, `simp.mjs` | Extracción por componentes, cuerpo de referencia, herramientas de confección y exportación (los mismos de la casual) |
| `items2.py`, `items3.py`, `items4.py`, `cabeza.py`, `cabeza_f.py` | Utilidades de las otras colecciones y cabezas del maniquí que se reutilizan |
