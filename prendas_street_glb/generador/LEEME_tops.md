
### Tops y prendas sin manga (11) y su versión de Blender

Salen de `tops.py` (tabla `STYLES`) sobre el mismo cuerpo de referencia. Sin manga: el tronco sin brazos y sisa de `tank_armhole`.

| Archivo | Prenda | Construcción |
| --- | --- | --- |
| `01_camiseta_tirantes` | Tirantes | Punto, escote redondo hondo, vivos en escote y sisas |
| `02_tirantes_canale` | A-shirt de canalé | Ceñida, canalé 2x2 en la geometría y 1x1 en el material |
| `03_camiseta_muscle` | Muscle | Sisa muy amplia cortada en crudo, cuello de canalé |
| `04_polo` | Polo | Cuello de polo, tapeta de 3 botones, puños de canalé, aberturas laterales |
| `05_body` | Body | Manga larga, braguita de corte alto con broches (`hardware`) en la entrepierna |
| `06_corse` | Corsé | Satén, cintura moldeada, escote corazón, ballenas, pico delante, ojetes (`hardware`) y cordón cruzado (`trim`) detrás |
| `07_top_halter` | Halter | Panel delantero hasta el cuello, tira atada en la nuca (`trim`), espalda al aire con banda abajo |
| `08_top_bandeau` | Bandeau | Banda sin tirantes con fruncido y elásticos arriba y abajo |
| `09_chaleco_vestir` | Chaleco | Lana fría, pico, 5 botones, vivos, espalda de satén (`secondary`), puntas delanteras |
| `10_camisa_sin_mangas` | Camisa sin mangas | Popelín, cuello camisero, tapeta y botones |
| `04_chaleco_traje` (colección formal) | Chaleco de traje cruzado | 3x2 botones y solapas pequeñas |

```bash
PRENDAS=tops python3 build_camisetas.py all 0.003 260000 /tmp/tops ../tops
```

Blender: `os.environ['PRENDA_COLECCION'] = 'tops'` (tejidos nuevos: satén y lana fría de traje). Web: `npm run models:tops`. El tipo nuevo «Top» (modelKey `top`) usa `topModel`; las camisetas sin manga, muscle y polo y la camisa sin mangas también salen de esta colección.
