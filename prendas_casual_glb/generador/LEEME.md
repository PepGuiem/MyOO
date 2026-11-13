# Generador de la colección casual y del maniquí

Las prendas se modelan como campos de distancia (SDF) sobre el cuerpo de referencia de 1,78 m.
Los brazos están a 32°, como en la colección de punto. Después se extraen con *marching cubes*, se engrosan y se exportan a GLB.

Cada prenda guarda sus piezas por separado, con su papel en `extras.role` del material:

| Papel | Piezas |
| --- | --- |
| `body` | La tela (teñible) |
| `button` | Botones |
| `trim` | Vivos, pelo de la capucha, flecos |
| `zipper` | Cremalleras |
| `hardware` | Remaches y broches |

La web colorea cada pieza con la personalización.

## Requisitos

- Python 3 con `numpy`, `scipy`, `scikit-image` y `pillow`.
- Node (la simplificación usa `meshoptimizer` de `Frontend/node_modules`; instala antes las dependencias del Frontend).
- Un compilador de C para el rasterizador de las vistas previas:

```bash
gcc -O3 -shared -fPIC -o libraster.so raster.c
```

## Uso (desde esta carpeta)

```bash
# Prendas: <ids|all> <rejilla en m> <triángulos> <carpeta npz/png> <carpeta GLB>
python3 build5.py all 0.003 120000 /tmp/casual_npz ..

# Gorra de seis paneles (carpeta de vistas previas, carpeta GLB)
python3 build_gorra.py /tmp/gorra_png ..

# Calzado: zapatillas, botas de cordones y Chelsea (carpeta de vistas previas, carpeta GLB)
python3 build_calzado.py /tmp/calzado_png ..

# Maniquí: cuerpo y cabeza esculpidos, masculino y femenino (carpeta de vistas previas,
# carpeta GLB y, opcional, "hombre" o "mujer" para generar solo uno)
python3 build_maniqui.py /tmp/maniqui_png ../maniqui
# La mano sigue saliendo de mannequin.py (solo la mano):
python3 mannequin.py /tmp/maniqui_png ../maniqui hand

# Maniquí de tienda (el que usa la web): cuerpo, cabeza y mano, hombre y mujer.
# Opcional: hombre | mujer | mano | todos, y "rápido" para una rejilla gruesa de prueba.
python3 build_tienda.py /tmp/maniqui_png ../maniqui
```

Después, desde `Frontend`:

```bash
npm run models:casual    # ../prendas_casual_glb -> public/models/prendas/casual
npm run models:maniqui   # ../prendas_casual_glb/maniqui -> public/models/maniqui
```

## Archivos

| Archivo | Contenido |
| --- | --- |
| `items4.py` | Las 7 prendas: camisas de manga corta y larga, sobrecamisa, parka con capucha de pelo, chaqueta de chándal, bufanda y vaquero recto. Las mangas caen más ceñidas hacia el puño (menos holgura y caída en el antebrazo). El cuello camisero (`collar`) tiene pie más bajo y caída que termina en dos puntas (antes era redondeado, tipo bebé) |
| `tienda.py` | Maniquí de tienda genérico (el de la web): cabeza «huevo» sin rasgos ni pelo (el cráneo crece lo que abultaba el pelo para que gorras y gorros encajen igual), cuello igual que el esculpido, cuerpo liso de fibra (sin ombligo, abdominales, columna, omóplatos ni tobillos; tronco y pelvis mezclados en la cintura, sin el anillo de la cadera) y mano con los dedos juntos. Mismas medidas que los esculpidos. Sale con `build_tienda.py` como `cuerpo_tienda`, `cuerpo_tienda_f`, `cabeza_tienda`, `cabeza_tienda_f` y `mano_tienda` |
| `cuerpo.py` | Cuerpo del maniquí (sin cabeza ni manos): tronco con relieve suave, brazos a 18° con deltoides, bíceps y antebrazo, piernas por secciones con rótula, gemelo y tobillos, y pies. Se ajusta a cada silueta en la web (región `body` de `libraryFit.ts`) |
| `cabeza.py` | Cabeza masculina: volumen por secciones (la cara, con un exponente menor que el cráneo, se curva hacia los lados en vez de quedar plana), cara como relieve (cejas, ojos cerrados con párpado y línea de pestañas, nariz con puente redondeado, punta y aletas, labios con arco de Cupido, mentón), mandíbula que se estrecha hacia el mentón, orejas, pelo corto peinado y cuello largo que entra en el cuerpo |
| `cuerpo_f.py` | Cuerpo femenino, sobre la misma base que `cuerpo.py`: pecho, cintura marcada, cadera y glúteos redondeados, hombros y brazos más finos y cuello más estrecho. Se deforma en la web igual que el masculino (las medidas las pone la silueta) |
| `cabeza_f.py` | Cabeza femenina: misma construcción que la masculina (cara curvada hacia los lados, ojos cerrados con párpado y pestañas, nariz con punta y aletas, labios con arco de Cupido) con rasgos más finos, nariz pequeña, labios llenos, cuello ×0,86 (`NECK_FEMALE` en `libraryFit.ts`) y pelo recogido con raya al lado y moño bajo |
| `gorra.py`, `build_gorra.py` | Gorra de béisbol de seis paneles modelada sobre las dos cabezas esculpidas (`cabeza.py` y `cabeza_f.py`): copa a ~5 mm de la cabeza con el pelo, alisada y armada delante; visera curvada con pespuntes; ojales bordados, botón, abertura trasera con tira y hebilla (pieza 'hardware') y badana interior. En la web entra sin ajustes |
| `calzado.py` | Zapatillas de pista, botas de cordones y botas Chelsea, hechas sobre el pie del maniquí (suela, cordones, ojales, elástico y tirador como piezas aparte) |
| `build_maniqui.py`, `build_calzado.py` | Extracción y exportación del maniquí y del calzado |
| `mannequin.py` | Mano relajada con dedos (y la cabeza anterior, ya sustituida por `cabeza.py`) |
| `build5.py` | Extracción por componentes, agrupación por papel y exportación |
| `core.py`, `kit.py`, `extract.py` | Cuerpo de referencia, herramientas de confección, extracción y GLB (los mismos que la colección de punto, con la simplificación en `simp.mjs`) |
| `items2.py`, `items3.py` | Prendas de las colecciones clásica y de punto (se usan algunas utilidades) |
