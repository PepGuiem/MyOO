"""Maniquí v2: cuerpo (cuerpo.py) y cabeza (cabeza.py) esculpidos, y la versión femenina
(cuerpo_f.py y cabeza_f.py). La mano sigue en mannequin.py (la misma para los dos).

Uso (desde esta carpeta):
    python3 build_maniqui.py <carpeta de vistas previas> <carpeta GLB>
    python3 build_maniqui.py /tmp/maniqui_png ../maniqui
    python3 build_maniqui.py /tmp/maniqui_png ../maniqui mujer    # solo el femenino
    python3 build_maniqui.py /tmp/maniqui_png ../maniqui hombre   # solo el masculino

Rejilla: cuerpo 2,5 mm (160.000 triángulos), cabeza 0,9 mm (90.000). Tarda unos 3 minutos por maniquí.
"""
import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import mesh_from_sdf, hex2lin, write_glb
from render import render, ao_vertices
from PIL import Image
import cuerpo, cabeza, cuerpo_f, cabeza_f

def build(fn, box, h, tris, name, title, out, glb, views, W, H):
    V, F, N, raw = mesh_from_sdf(fn, *box, h=h, target_tris=tris)
    ao = ao_vertices(fn, V + N * 0.0005, N)
    ims = [render([dict(V=V, F=F, N=N, lin=hex2lin('#D9D8D4'), ao=ao)], yaw=yaw, W=W, H=H, bg=(0.022, 0.022, 0.024)) for yaw in views]
    o = Image.new('RGB', (W * len(ims), H)); [o.paste(im, (i * W, 0)) for i, im in enumerate(ims)]; o.save(f'{out}/{name}.png')
    write_glb(f'{glb}/{name}.glb', [dict(name=name, V=V, F=F, N=N, color='#D9D8D4', rough=0.6, role='body')], title)
    print(name, raw, '->', len(F), 'triángulos', flush=True)

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/maniqui_png'
    glb = sys.argv[2] if len(sys.argv) > 2 else '../maniqui'
    os.makedirs(out, exist_ok=True); os.makedirs(glb, exist_ok=True)
    which = sys.argv[3] if len(sys.argv) > 3 else 'todos'
    if which in ('todos', 'hombre'):
        build(cuerpo.body_sdf, cuerpo.BOX, 0.0025, 160000, 'cuerpo', 'Cuerpo de maniquí', out, glb, (0, -35, -90, 180), 420, 760)
        build(cabeza.head_sdf, ((-0.10, -0.13, 1.40), (0.10, 0.13, 1.79)), 0.0009, 90000, 'cabeza', 'Cabeza de maniquí', out, glb, (0, -30, -90, 160), 400, 500)
    if which in ('todos', 'mujer'):
        build(cuerpo_f.body_sdf, cuerpo_f.BOX, 0.0025, 160000, 'cuerpo_f', 'Cuerpo de maniquí femenino', out, glb, (0, -35, -90, 180), 420, 760)
        # La caja llega más atrás (y 0,16) para que quepa el moño.
        build(cabeza_f.head_sdf, ((-0.10, -0.13, 1.40), (0.10, 0.16, 1.79)), 0.0009, 90000, 'cabeza_f', 'Cabeza de maniquí femenina', out, glb, (0, -30, -90, 160), 400, 500)
