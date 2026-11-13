"""Maniquí de tienda (tienda.py): cuerpo, cabeza y mano, masculino y femenino.

Uso (desde esta carpeta):
    python3 build_tienda.py <carpeta de vistas previas> <carpeta GLB> [hombre|mujer|mano|todos] [rápido]

Salen cuerpo_tienda(.glb/_f), cabeza_tienda(_f) y mano_tienda. Con "rápido", rejilla gruesa
(solo para mirar las vistas previas). Después, desde Frontend: npm run models:maniqui
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_maniqui import build
import tienda

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/maniqui_png'
    glb = sys.argv[2] if len(sys.argv) > 2 else '../maniqui'
    which = sys.argv[3] if len(sys.argv) > 3 else 'todos'
    fast = len(sys.argv) > 4
    os.makedirs(out, exist_ok=True); os.makedirs(glb, exist_ok=True)
    hb, hh = (0.005, 0.002) if fast else (0.0025, 0.0009)
    HEAD = ((-0.10, -0.13, 1.40), (0.10, 0.13, 1.79))
    # Cajas algo mayores que las de cuerpo.py y mannequin.py: allí las muñecas, las
    # plantas de los pies y la muñeca de la mano tocaban el borde y la malla salía
    # abierta (Blender no puede remallar una malla abierta).
    BODY = ((-0.36, -0.26, -0.02), (0.36, 0.18, 1.59))
    if which in ('todos', 'hombre'):
        build(tienda.body_sdf, BODY, hb, 160000, 'cuerpo_tienda', 'Cuerpo de maniquí de tienda', out, glb, (0, -35, -90, 180), 420, 760)
        build(tienda.head_sdf, HEAD, hh, 60000, 'cabeza_tienda', 'Cabeza de maniquí de tienda', out, glb, (0, -30, -90, 160), 400, 500)
    if which in ('todos', 'mujer'):
        build(tienda.body_sdf_f, BODY, hb, 160000, 'cuerpo_tienda_f', 'Cuerpo de maniquí de tienda femenino', out, glb, (0, -35, -90, 180), 420, 760)
        build(tienda.head_sdf_f, HEAD, hh, 60000, 'cabeza_tienda_f', 'Cabeza de maniquí de tienda femenina', out, glb, (0, -30, -90, 160), 400, 500)
    if which in ('todos', 'mano'):
        build(tienda.hand_sdf, ((-0.07, -0.09, -0.21), (0.04, 0.06, 0.075)), 0.0012 if fast else 0.0007, 30000, 'mano_tienda', 'Mano de maniquí de tienda', out, glb, (-60, 90, -90, 0), 360, 520)
