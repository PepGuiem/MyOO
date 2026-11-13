
### Sudaderas (8 cortes) y su versión de Blender

Salen de `sudaderas.py` (tabla `STYLES`) sobre el mismo cuerpo de referencia (brazos a 32°) que las camisetas. Felpa de algodón gruesa (unos 6 mm de tela con su volumen), canalé en cintura y puños y la felpa que se abolsa encima:

| Archivo | Sudadera |
| --- | --- |
| `01_sudadera_capucha` | Con capucha (bajada sobre la espalda), bolsillo canguro con bocas en diagonal, cordones con punteras metálicas y ojales |
| `02_sudadera_capucha_oversize` | Ancha, hombro caído, mangas que se amontonan en el puño |
| `03_sudadera_capucha_crop` | Corta por encima de la cintura, bolsillo más pequeño |
| `04_sudadera_cremallera` | Con capucha y cremallera completa (cinta, dientes y tirador, `zipper`), bolsillos partidos |
| `05_sudadera_cuello_redondo` | Cuello redondo de canalé ancho |
| `06_sudadera_media_cremallera` | Cuello alto con cremallera hasta el pecho |
| `07_sudadera_cuarto_cremallera` | Cuello alto con cremallera corta |
| `08_sudadera_deportiva` | Mangas raglán y pico de canalé bajo el cuello |

Pespuntes (aparte, `_costuras.glb`): costura del canalé en cintura y puños, cuello, bocas del bolsillo, tapeta de la cremallera y costuras raglán.

```bash
# mismo constructor que las camisetas, con PRENDAS=sudaderas
PRENDAS=sudaderas python3 build_camisetas.py all 0.003 260000 /tmp/sudaderas ../sudaderas
# estilos: capucha, capucha_oversize, capucha_crop, cremallera, cuello_redondo, media_cremallera, cuarto_cremallera, deportiva
```

En Blender, el mismo script que las camisetas con la colección `sudaderas`:

```python
import os; os.environ['PRENDA_COLECCION'] = 'sudaderas'; os.environ['CAMISETA_IDS'] = 'all'
exec(open(r'C:\Users\Usuario\Documents\MyOut\prendas_street_glb\generador\blender_camiseta.py', encoding='utf-8').read())
```

Material «Felpa de algodón» (cara de punto liso por fuera, perchada más clara y mate por dentro), cordones de algodón, punteras y cremallera metálicas. Piezas de confección: delantero, espalda, mangas, capucha, cuello, puños y cintura. Salida en `../sudaderas/<nombre>/` como las camisetas (.blend, texturas PBR, GLB y FBX, vistas 360° y lámina).

Web: `npm run models:sudaderas` → `public/models/prendas/sudaderas`. Un jersey (`sweater`) es sudadera si su cuello es de capucha, cremallera o deportivo, o si es redondo y de algodón sin «punto» elegido (`isSweatshirt` en `libraryCatalog.ts`); los jerséis de punto siguen con las colecciones anteriores hasta su bloque.
