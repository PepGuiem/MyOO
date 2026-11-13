"""Zapatillas de la colección street (calzado_street.py): skate, chunky, running y slip-on.

Uso (desde esta carpeta):
    python3 build_calzado_street.py <tipos|all> <carpeta de vistas previas> <carpeta GLB>
    python3 build_calzado_street.py all /tmp/calzado_png ..

Cada pieza se exporta con su papel: body (piel o tejido), sole (suela), lace (cordones) y
secondary (refuerzos o elásticos).
"""
import sys, os, time, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import mesh_from_sdf, hex2lin, write_glb
from render import render
from PIL import Image
import calzado_street

COL = {'body': '#E9E8E4', 'sole': '#F4F3EF', 'lace': '#D8D6D0', 'secondary': '#55555A'}
ROUGH = {'body': 0.6, 'sole': 0.8, 'lace': 0.85, 'secondary': 0.9}
ITEMS = [('skate', '15_zapatillas_skate', 'Zapatillas de skate'), ('chunky', '16_zapatillas_chunky', 'Zapatillas chunky'),
         ('running', '17_zapatillas_running', 'Zapatillas running'), ('slip_on', '18_zapatillas_slip_on', 'Zapatillas slip-on')]

if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    out = sys.argv[2] if len(sys.argv) > 2 else '/tmp/calzado_png'
    glb = sys.argv[3] if len(sys.argv) > 3 else '..'
    os.makedirs(out, exist_ok=True)
    for kind, fid, title in ITEMS:
        if which != 'all' and kind not in which.split(','): continue
        t = time.time(); groups = {}
        for role, fn, (lo, hi), h in calzado_street.parts(kind):
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
                                           metal=0.0, role=m['role']) for m in meshes], title)
        print(fid, sum(len(m['F']) for m in meshes), 'triángulos', f'{time.time() - t:.0f}s', flush=True)
