"""Gorras de la colección street (gorras.py): trucker, snapback, cinco paneles y pescador.

Uso (desde esta carpeta):
    python3 build_gorras.py <tipos|all> <carpeta de vistas previas> <carpeta GLB>
    python3 build_gorras.py all /tmp/gorras_png ..
    python3 build_gorras.py trucker,bucket /tmp/gorras_png ..

Cada una tarda uno o dos minutos (la primera parte mide las dos cabezas).
"""
import sys, os, time, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import mesh_from_sdf, hex2lin, write_glb
from render import render
from PIL import Image
import gorras

COL = {'body': '#2E2E32', 'secondary': '#E8E8E8', 'hardware': '#A9A8A4'}
ROUGH = {'body': 0.85, 'secondary': 0.9, 'hardware': 0.4}
ITEMS = [('trucker', '11_gorra_trucker', 'Gorra trucker'), ('snapback', '12_gorra_snapback', 'Gorra snapback'),
         ('five_panel', '13_gorra_cinco_paneles', 'Gorra cinco paneles'), ('bucket', '14_gorro_pescador', 'Gorro de pescador')]

if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    out = sys.argv[2] if len(sys.argv) > 2 else '/tmp/gorras_png'
    glb = sys.argv[3] if len(sys.argv) > 3 else '..'
    os.makedirs(out, exist_ok=True)
    for kind, fid, title in ITEMS:
        if which != 'all' and kind not in which.split(','): continue
        t = time.time(); groups = {}
        for role, fn, (lo, hi), h in gorras.parts(kind):
            V, F, N, raw = mesh_from_sdf(fn, lo, hi, h=h, target_tris=60000 if role in ('body', 'secondary') else 6000)
            if len(F): groups.setdefault(role, []).append((V, F, N))
        meshes = []
        for role, ms in groups.items():
            off = 0; Vs, Fs, Ns = [], [], []
            for V, F, N in ms: Vs.append(V); Fs.append(F + off); Ns.append(N); off += len(V)
            meshes.append(dict(role=role, V=np.concatenate(Vs), F=np.concatenate(Fs), N=np.concatenate(Ns)))
        rm = [dict(V=m['V'], F=m['F'], N=m['N'], lin=hex2lin('#8a8a90' if m['role'] == 'body' else COL[m['role']])) for m in meshes]
        ims = [render(rm, yaw=yaw, pitch=p, W=480, H=380, bg=(0.022, 0.022, 0.024)) for yaw, p in ((0, 8), (-40, 15), (-90, 5), (160, 15), (-30, 60))]
        o = Image.new('RGB', (2400, 380)); [o.paste(im, (i * 480, 0)) for i, im in enumerate(ims)]; o.save(f'{out}/{fid}.png')
        write_glb(f'{glb}/{fid}.glb', [dict(name=m['role'], V=m['V'], F=m['F'], N=m['N'], color=COL[m['role']], rough=ROUGH[m['role']],
                                           metal=1.0 if m['role'] == 'hardware' else 0.0, role=m['role']) for m in meshes], title)
        print(fid, sum(len(m['F']) for m in meshes), 'triángulos', f'{time.time() - t:.0f}s', flush=True)
