
### Camisas (8 cortes) y su versión de Blender

Salen de `camisas.py` (tabla `STYLES`) sobre el mismo cuerpo de referencia (brazos a 32°). Tela plana con cuello de pie y caída (`items4.collar`), tapeta, canesú trasero, bajo de faldón y botones:

| Archivo | Camisa |
| --- | --- |
| `01_camisa_formal` | Entallada, popelín, cuello clásico, puño con botón y cartera, faldón curvo |
| `02_camisa_oxford` | Oxford, cuello con botones en las puntas, bolsillo de pecho, tabla y presilla en la espalda |
| `03_camisa_oversize` | Ancha, hombro caído, manga larga que se amontona, cuello algo más grande |
| `04_camisa_lino` | Lino holgado, primer botón abierto, mangas remangadas |
| `05_camisa_franela` | Franela de cuadros (en Blender), dos bolsillos con cartera y botón |
| `06_camisa_vaquera` | Denim ligero, canesú delantero en pico, dos bolsillos con cartera, broches metálicos (`hardware`) |
| `07_camisa_cubana` | Cuello camp abierto en V con las solapas vueltas, manga corta, bajo recto |
| `08_camisa_manga_corta` | Cuello clásico, manga corta con dobladillo, bolsillo de pecho |

Pespuntes (aparte, `_costuras.glb`): tapeta, bajo, canesú, puños o mangas y bolsillos.

```bash
PRENDAS=camisas python3 build_camisetas.py all 0.003 260000 /tmp/camisas ../camisas
# estilos: formal, oxford, oversize, lino, franela, vaquera, cubana, manga_corta
```

En Blender: `os.environ['PRENDA_COLECCION'] = 'camisas'` y el mismo `blender_camiseta.py`. Material de tela plana según la camisa (popelín, oxford con trama blanca, lino con hilo irregular, franela de cuadros con pelusa, denim en sarga). Piezas: delanteros, espalda, canesú, mangas, puños, cuello, tapeta y bolsillos.

Web: `npm run models:camisas` → `public/models/prendas/camisas`. `shirtModel` en `libraryCatalog.ts` elige por cuello (cubano), manga (corta), corte (oversize) y material (vaquero, franela, lino, oxford o cuello button-down); las camisas sin manga siguen con las colecciones anteriores.
