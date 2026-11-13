
### Jerséis y punto (7 cortes) y su versión de Blender

Salen de `jerseis.py` (tabla `STYLES`) sobre el mismo cuerpo de referencia (1,78 m, brazos a 32°) que las camisetas, sudaderas y camisas. Punto de lana con su grosor real (6-9 mm) y dos galgas: **media** (malla de unos 4 mm) y **gruesa** (unos 6 mm). Las trenzas, el canalé, el cuello vuelto y las tapetas son geometría; la malla del punto la pone el material de Blender.

| Archivo | Prenda |
| --- | --- |
| `01_jersey_cuello_redondo` | Galga media, canalé en cuello, puños y cintura, costuras remalladas |
| `02_jersey_pico` | Escote de pico con el canalé cruzado en la punta |
| `03_jersey_cuello_alto` | Cuello alto vuelto (doble capa), canalé vertical y arrugas del cuello |
| `04_cardigan` | Abierto en pico, tapetas de canalé, 5 botones (`button`) |
| `05_jersey_ochos` | Galga gruesa, panel de trenzas en delantero y espalda, trenza en cada manga |
| `06_jersey_oversize` | Galga gruesa, hombro caído, manga larga que se amontona en el puño |
| `07_chaleco_punto` | Sin mangas, pico, sisas y cintura de canalé |

Pespuntes (aparte, `_costuras.glb`): remallado de la unión del cuello y de las tapetas del cárdigan.

```bash
PRENDAS=jerseis python3 build_camisetas.py all 0.003 260000 /tmp/jerseis ../jerseis
# estilos: cuello_redondo, pico, cuello_alto, cardigan, ochos, oversize, chaleco
```

En Blender: `os.environ['PRENDA_COLECCION'] = 'jerseis'` y el mismo `blender_camiseta.py`. El material «Punto de lana» usa la galga del `_ejes.json` (`GALGA` en el script): mallas en V a tamaño real, pelusa y brillo de lana; el canalé (atributo `canale`) sale en cordones 1x1. Botones del cárdigan con el color de `color_boton`.

Web: `npm run models:jerseis` → `public/models/prendas/jerseis`. `jerseyModel` en `libraryCatalog.ts` elige por cuello (cárdigan, chaleco, alto o perkins, pico), punto (ochos, grueso) y corte (oversize).
