
### Abrigos (7 cortes) y su versión de Blender

Salen de `abrigos.py` (tabla `STYLES`) sobre el mismo cuerpo de referencia (1,78 m, brazos a 32°). El tronco sigue por debajo de la cadera en línea A (`CoatBody`: la sección de la cadera se abre `flare` cada 40 cm hasta el bajo), así que el abrigo cae por fuera de las piernas sin atravesarlas.

| Archivo | Abrigo | Construcción |
| --- | --- | --- |
| `01_gabardina` | Trench | Sarga, cruzado (4x2 botones), solapas y cuello vuelto, cinturón con hebilla, solapa de tormenta, hombreras, trabillas en los puños, abertura trasera, forro granate |
| `02_abrigo_lana` | Chesterfield | Paño de lana, 3 botones, solapas, bolsillos con cartera y de pecho, botones en el puño, abertura trasera |
| `03_abrigo_largo` | Abrigo largo | Paño, hasta media pantorrilla, tapeta oculta, solapas anchas, bolsillos en vivo |
| `04_parka` | Parka | Sarga, capucha bajada con pelo (`trim`), cremallera con tapeta de broches, 4 bolsillos, cordón en la cintura, forro naranja |
| `05_chaqueton` | Chaquetón marinero | Paño grueso, cruzado (3x2 botones grandes), solapas y cuello grandes, bolsillos verticales |
| `06_trenca` | Trenca | Paño, capucha, 4 trabillas de madera (`button`) con presillas de cordón (`trim`), canesú, bolsillos de parche con cartera |
| `07_plumifero_largo` | Plumífero largo | Nailon acolchado, capucha, cremallera, bolsillos con cremallera |

El cuello de los abrigos es una tira vuelta sobre el propio escote (sube 6 mm y acaba en la muesca de la solapa), no una pieza aparte: así no atraviesa los hombros.

```bash
PRENDAS=abrigos python3 build_camisetas.py all 0.003 260000 /tmp/abrigos ../abrigos
```

Blender: `os.environ['PRENDA_COLECCION'] = 'abrigos'`. Web: `npm run models:abrigos`; `coatModel` en `libraryCatalog.ts` elige por tipo y largo (si se pide más corto que el modelo, `hemY` acorta el tronco; abrigo recto midi o maxi → el largo; plumífero por la cadera → el de las chaquetas).
