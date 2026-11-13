"""Gorro de punto con vuelta (gorro.py).

Uso (desde esta carpeta):
    python3 build_gorro.py <carpeta de vistas previas> <carpeta GLB>
    python3 build_gorro.py /tmp/gorro_png ..

Tarda alrededor de un minuto (la primera parte mide las dos cabezas).
"""
import sys, os, numpy as np, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import mesh_from_sdf, hex2lin, write_glb
from render import render
from PIL import Image
import gorro

COL = {'body': '#2E2E32', 'trim': '#C9B28E'}
ROUGH = {'body': 0.95, 'trim': 0.8}

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/gorro_png'
    glb = sys.argv[2] if len(sys.argv) > 2 else '..'
    os.makedirs(out, exist_ok=True)
    groups = {}
    for role, fn, (lo, hi), h in gorro.parts():
        t = time.time()
        V, F, N, raw = mesh_from_sdf(fn, lo, hi, h=h, target_tris=60000 if role == 'body' else 6000)
        if len(F) == 0: continue
        print(role, fn.__name__, len(F), 'triángulos', f'{time.time() - t:.0f}s', flush=True)
        groups.setdefault(role, []).append((V, F, N))
    meshes = []
    for role, ms in groups.items():
        off = 0; Vs, Fs, Ns = [], [], []
        for V, F, N in ms: Vs.append(V); Fs.append(F + off); Ns.append(N); off += len(V)
        meshes.append(dict(role=role, V=np.concatenate(Vs), F=np.concatenate(Fs), N=np.concatenate(Ns)))
    rm = [dict(V=m['V'], F=m['F'], N=m['N'], lin=hex2lin('#8a8a90' if m['role'] == 'body' else COL[m['role']])) for m in meshes]
    ims = [render(rm, yaw=yaw, pitch=p, W=480, H=380, bg=(0.022, 0.022, 0.024)) for yaw, p in ((0, 8), (-40, 15), (-90, 5), (160, 15), (-30, 60))]
    o = Image.new('RGB', (2400, 380)); [o.paste(im, (i * 480, 0)) for i, im in enumerate(ims)]; o.save(f'{out}/07_gorro.png')
    write_glb(f'{glb}/07_gorro.glb', [dict(name=m['role'], V=m['V'], F=m['F'], N=m['N'], color=COL[m['role']], rough=ROUGH[m['role']],
                                         metal=0.0, role=m['role']) for m in meshes], 'Gorro')
