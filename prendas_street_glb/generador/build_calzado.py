"""Calzado de la colección street (calzado.py): zapatillas de baloncesto de caña alta.

Uso (desde esta carpeta):
    python3 build_calzado.py <carpeta de vistas previas> <carpeta GLB>
    python3 build_calzado.py /tmp/calzado_png ..

Cada pieza se exporta con su papel: body (piel), sole (suela), lace (cordones) y
secondary (refuerzos de talón, puntera, ojalera y cuello acolchado).
"""
import sys, os, time, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import mesh_from_sdf, hex2lin, write_glb
from render import render
from PIL import Image
import calzado

COL = {'body': '#E9E8E4', 'sole': '#F4F3EF', 'lace': '#D8D6D0', 'hardware': '#A9A8A4', 'secondary': '#55555A', 'trim': '#8A6A48'}
ROUGH = {'body': 0.6, 'sole': 0.8, 'lace': 0.85, 'hardware': 0.35, 'secondary': 0.9, 'trim': 0.7}
ITEMS = [('high_top', '06_zapatillas_altas', 'Zapatillas de caña alta')]

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/calzado_png'
    glb = sys.argv[2] if len(sys.argv) > 2 else '..'
    os.makedirs(out, exist_ok=True)
    for kind, fid, title in ITEMS:
        t = time.time(); groups = {}
        for role, fn, (lo, hi), h in calzado.parts(kind):
            V, F, N, raw = mesh_from_sdf(fn, lo, hi, h=h, target_tris=40000 if role in ('body', 'sole') else 12000)
            if len(F): groups.setdefault(role, []).append((V, F, N))
        meshes = []
        for role, ms in groups.items():
            off = 0; Vs, Fs, Ns = [], [], []
            for V, F, N in ms: Vs.append(V); Fs.append(F + off); Ns.append(N); off += len(V)
            meshes.append(dict(role=role, V=np.concatenate(Vs), F=np.concatenate(Fs), N=np.concatenate(Ns)))
        rm = [dict(V=m['V'], F=m['F'], N=m['N'], lin=hex2lin(COL[m['role']])) for m in meshes]
        ims = [render(rm, yaw=yaw, pitch=p, W=480, H=360, bg=(0.022, 0.022, 0.024)) for yaw, p in ((-40, 18), (-90, 5), (20, 30), (160, 15))]
        o = Image.new('RGB', (1920, 360)); [o.paste(im, (i * 480, 0)) for i, im in enumerate(ims)]; o.save(f'{out}/{fid}.png')
        write_glb(f'{glb}/{fid}.glb', [dict(name=m['role'], V=m['V'], F=m['F'], N=m['N'], color=COL[m['role']], rough=ROUGH[m['role']],
                                           metal=1.0 if m['role'] == 'hardware' else 0.0, role=m['role']) for m in meshes], title)
        print(fid, sum(len(m['F']) for m in meshes), 'triángulos', f'{time.time() - t:.0f}s', flush=True)
