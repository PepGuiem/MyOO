
### Formal (4) y su versión de Blender

`formal.py` reutiliza la construcción de `abrigos.py` con largo de americana y lo propio de la sastrería: hombros armados (hombrera y copa de la manga con roping), ojal en la solapa izquierda, cuatro botones de puño que se tocan, bolsillos con cartera, bolsillo de pecho y, en la chaqueta de traje, bolsillo de cerillas y dos aberturas.

| Archivo | Prenda |
| --- | --- |
| `01_americana` | Americana de botonadura sencilla (2 botones dorados), abertura central, forro granate |
| `02_americana_cruzada` | Cruzada 6x2 con solapa de pico y dos aberturas |
| `03_chaqueta_traje` | Chaqueta de traje en lana fría, 2 botones, bolsillo de cerillas |
| `04_chaleco_traje` | Chaleco de traje cruzado (de `tops.py`, estilo `chaleco_traje`) |

```bash
PRENDAS=formal python3 build_camisetas.py all 0.003 260000 /tmp/formal ../formal
PRENDAS=tops python3 build_camisetas.py chaleco_traje 0.003 260000 /tmp/formal ../formal
```

Blender: `os.environ['PRENDA_COLECCION'] = 'formal'`. Web: `npm run models:formal`. En la web: chaqueta «Americana / blazer», «Americana cruzada», «Chaqueta de traje» y top «Chaleco de traje cruzado».
