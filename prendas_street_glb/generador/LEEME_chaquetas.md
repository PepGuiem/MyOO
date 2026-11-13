
### Chaquetas (12 cortes) y su versión de Blender

Salen de `chaquetas.py` (tabla `STYLES`) sobre el mismo cuerpo de referencia (1,78 m, brazos a 32°). Prendas estructuradas con el grosor de tela + forro. Todas se montan con las mismas piezas: cierre, cuello, bajo, puños, bolsillos y paneles de otro color.

| Archivo | Chaqueta | Construcción |
| --- | --- | --- |
| `01_chaqueta_bomber` | Bomber MA-1 | Nailon, cuello/puños/bajo de canalé, cremallera, vivos inclinados, bolsillo de manga con cremallera y portalápices, forro naranja |
| `02_chaqueta_varsity` | Varsity | Paño de lana, mangas de piel (`secondary`), dos rayas en el canalé (`trim`), broches (`hardware`) |
| `03_chaqueta_vaquera` | Trucker | Denim, cuello camisero, botones metálicos, canesú en V, cortes con tabla, bolsillos de pecho con solapa, pretina con pestañas, puños con botón |
| `04_chaqueta_piel` | Racer | Piel, cuello alto con presilla, cremallera, cortes delanteros y traseros, bolsillos con cremallera, cremallera en los puños |
| `05_chaqueta_biker` | Perfecto | Piel, cremallera cruzada, solapas con broches, cinturón con hebilla, bolsillo de pecho con cremallera |
| `06_plumifero` | Plumífero | Nailon acolchado (canales horizontales y en la manga), cuello alto, cremallera |
| `07_cortavientos` | Cortavientos | Nailon, canesú en pico de otro color (`secondary`), puños elásticos, cordón con topes en el bajo |
| `08_chaqueta_chandal` | Chándal | Tricot, cuello alto, dos bandas por la manga (`trim`), canalé, bolsillos con cremallera |
| `09_chaqueta_coach` | Coach | Nailon, cuello camisero, broches, cordón en el bajo |
| `10_forro_polar` | Forro polar | Polar con vivos de otro color (`trim`), cremallera, bolsillos con cremallera |
| `11_chaqueta_utility` | Field / utility | Sarga, cuello alto, tapeta con broches, 4 bolsillos con solapa, hombreras, cordón en la cintura y en el bajo |
| `12_chaleco_acolchado` | Chaleco acolchado | Como el plumífero, sin mangas, sisas con vivo |

Pespuntes (aparte, `_costuras.glb`): bajo, puños, cremallera o tapeta, bolsillos de solapa y canesú de la vaquera.

```bash
PRENDAS=chaquetas python3 build_camisetas.py all 0.003 260000 /tmp/chaquetas ../chaquetas
# estilos: bomber, varsity, vaquera, piel, biker, plumifero, cortavientos, chandal, coach, polar, utility, chaleco_acolchado
```

En Blender: `os.environ['PRENDA_COLECCION'] = 'chaquetas'` y el mismo `blender_camiseta.py`. Tejidos nuevos en `WOVEN`: nailon, sarga, tricot, paño de lana, forro polar y piel (sin trama: fieltro, pelo o poro, con capa de brillo). El revés lleva el color del forro (`forro` en `_ejes.json`) y las zonas de canalé (atributo `canale`) salen en punto 1x1. Los paneles `secondary` usan `tejido2` (piel en la varsity).

Web: `npm run models:chaquetas` → `public/models/prendas/chaquetas`. `jacketModel` en `libraryCatalog.ts` elige por tipo (`JACKETS`): Harrington usa la bomber; campo y sobrecamisa, la utility; anorak y con capucha, el cortavientos. La americana espera al bloque formal.

#### Cierre: cremallera, botones o abierta

El selector «Cierre» de la web cambia de modelo. Cada chaqueta tiene, además de la original, su versión **abierta** y la versión con el **otro cierre**:

| Original | `_abierta` | `_cremallera` / `_botones` |
| --- | --- | --- |
| Con cremallera (bomber, piel, biker, plumífero, cortavientos, chándal, polar, chaleco) | Las dos mitades separadas, media cremallera en cada borde y el cursor abajo | `_botones`: tapeta con broches |
| Con broches o botones (varsity, vaquera, coach, utility) | Una tapeta en cada borde (los broches en uno) y los bolsillos de pecho apartados del borde | `_cremallera`: cremallera central con vistas |

La abertura es estrecha en el cuello, se abre en el pecho y un poco más hacia el bajo (`open_hg` en `chaquetas.py`). Las americanas (colección formal) solo se abrochan con botones.

```bash
# estilo:cierre (cremallera, botones o abierta)
PRENDAS=chaquetas python3 build_camisetas.py bomber:abierta,bomber:botones,vaquera:cremallera 0.003 260000 /tmp/chaquetas ../chaquetas
# o con la variable: CHAQUETA_CIERRE=abierta
```

En la web, `jacketClosureFile` (`libraryCatalog.ts`) elige el archivo; en los outfits, «Delantera: abierta / cerrada» de una chaqueta de Blender usa la versión abierta o la cerrada (`jacketForStyling`).
