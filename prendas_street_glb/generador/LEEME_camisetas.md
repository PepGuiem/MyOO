
### Camisetas (11 cortes) y su versión de Blender

Salen de `camisetas.py` (tabla `STYLES`) sobre el cuerpo de referencia con los brazos a 32°. Cada corte fija holguras, largo del cuerpo y de la manga, escote, ancho del canalé, costura de la sisa (montada o de hombro caído) y pliegues:

| Archivo | Camiseta |
| --- | --- |
| `01_camiseta_clasica` | Regular, manga corta, cuello redondo de canalé |
| `02_camiseta_oversize` | Ancha, hombro caído, manga hasta el codo, cuello algo más ancho |
| `03_camiseta_slim` | Ajustada al pecho y al brazo |
| `04_camiseta_boxy` | Recta, ancha y corta (por la cintura), hombro caído |
| `05_camiseta_crop` | Corta por encima de la cintura |
| `06_camiseta_longline` | Larga, con el bajo curvo (más alto en los costados) |
| `07_baby_tee` | Muy ceñida y corta, manga muy corta con el puño ajustado, canalé fino |
| `08_camiseta_raglan` | Manga tres cuartos con costura raglán (del cuello a la axila); las mangas son pieza aparte (`secondary`) para teñirlas de otro color |
| `09_camiseta_pico` | Cuello de pico con costura en inglete |
| `10_camiseta_henley` | Tapeta con tres botones (`button`) |
| `11_camiseta_manga_larga` | Manga larga con puño de canalé |

Todas llevan costura de hombro, costados, sisa (o raglán), cuello de canalé con su costura, bajos de recubridora de dos agujas y pliegues de caída, de arrastre desde la axila y de manga. El hilo de los pespuntes va aparte (`_costuras.glb`), puntada a puntada.

```bash
# <estilos|all> <rejilla m> <triángulos> <carpeta de vistas previas> <carpeta GLB>
python3 build_camisetas.py all 0.003 260000 /tmp/camisetas ../camisetas
# estilos: clasica, oversize, slim, boxy, crop, longline, baby, raglan, pico, henley, manga_larga
```

Por cada camiseta deja en `../camisetas/`: `<id>.glb` (tela, mangas de la raglán y botones de la henley), `<id>_costuras.glb`, `<id>_ejes.json` (medidas y color) y `<id>_campos.npz` (por vértice: pieza de patrón, coordenadas del punto y cara interior, para Blender).

Después, en Blender 5.2 (pestaña Scripting, consola de Python):

```python
import os; os.environ['CAMISETA_IDS'] = 'all'
exec(open(r'C:\Users\Usuario\Documents\MyOut\prendas_street_glb\generador\blender_camiseta.py', encoding='utf-8').read())
```

Lanza un Blender en segundo plano (el avance va a `../camisetas/camisetas_lote.txt` y a `registro.txt` de cada una). Para cada camiseta crea `../camisetas/<nombre>/`:

| Archivo | Qué es |
| --- | --- |
| `<nombre>.blend` | Escena editable: la tela separada en piezas de confección (delantero, espalda, mangas, cuello, puños, tapeta), botones, pespuntes, versión ligera, estudio y cámaras. Material procedural «Punto jersey» (mallas en V, canalé 1x1, hilo irregular, pelusa, revés más mate) |
| `texturas/<nombre>_{BaseColor,Roughness,Normal,AO,Height}.png` | Mapas PBR de 4096 px horneados de la tela de alta (con los pespuntes) sobre la versión ligera, y la plantilla `_UV.png` |
| `<id>_pbr.glb` y `<id>_pbr.fbx` | Versión ligera (120 000 triángulos) con UV de patrón y texturas (2048 px en el GLB) |
| `render/360_1..4_*.png` y `<nombre>_360.png` | Frente, derecha, atrás e izquierda con cámara ortográfica y la misma distancia, en estudio gris claro, y la lámina con las cuatro |

Variables: `CAMISETA_IDS` (`all` o lista de ids), `CAMISETA_FASES` (`preparar`, `hornear`, `exportar`, `render`), `CAMISETA_VISTAS=todas` (añade primeros planos de cuello, bajo y tejido), `CAMISETA_TOMAS`, `CAMISETA_MUESTRAS`, `CAMISETA_TEX`.

UV como un patrón: delantero, espalda, mangas abiertas por debajo, cuello, puños y tapeta, cada uno con su revés aparte; Blender las desdobla con estiramiento mínimo y las empaqueta por su forma.

Para la web (desde `Frontend`): `node scripts/prepare-garments.mjs ../prendas_street_glb/camisetas public/models/prendas/camisetas` (solo los `<id>.glb`, sin `_costuras`). En la web, una camiseta con «Modelo 3D: Automático» usa la de su corte, manga y cuello (sin manga, muscle, polo, perkins o barco siguen con las otras colecciones).
