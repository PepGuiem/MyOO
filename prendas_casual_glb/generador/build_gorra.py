"""Gorra de seis paneles (gorra.py).

Uso (desde esta carpeta):
    python3 build_gorra.py <carpeta de vistas previas> <carpeta GLB>
    python3 build_gorra.py /tmp/gorra_png ..

Tarda alrededor de un minuto.
"""
import sys, os, numpy as np, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import mesh_from_sdf, hex2lin, write_glb
from render import render
import gorra
from PIL import Image
COL = {'body': '#2E2E32', 'hardware': '#A9A8A4'}
ROUGH = {'body': 0.85, 'hardware': 0.35}
out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/gorra_png'
glb = sys.argv[2] if len(sys.argv) > 2 else '..'
scale = 1.0
os.makedirs(out, exist_ok=True); os.makedirs(glb, exist_ok=True)
groups = {}
for role, fn, (lo, hi), h in gorra.parts():
    t = time.time()
    V, F, N, raw = mesh_from_sdf(fn, lo, hi, h=h * scale, target_tris=60000 if role == 'body' else 6000)
    if len(F) == 0: print('vacío', role); continue
    print(role, fn.__name__, raw, len(F), f'{time.time() - t:.0f}s', flush=True)
    groups.setdefault(role, []).append((V, F, N))
meshes = []
for role, ms in groups.items():
    off = 0; Vs = []; Fs = []; Ns = []
    for V, F, N in ms: Vs.append(V); Fs.append(F + off); Ns.append(N); off += len(V)
    meshes.append(dict(role=role, V=np.concatenate(Vs), F=np.concatenate(Fs), N=np.concatenate(Ns)))
rm = [dict(V=m['V'], F=m['F'], N=m['N'], lin=hex2lin('#8a8a90' if m['role'] == 'body' else COL[m['role']])) for m in meshes]
ims = [render(rm, yaw=yaw, pitch=p, W=480, H=380, bg=(0.022, 0.022, 0.024)) for yaw, p in ((0, 8), (-40, 15), (-90, 5), (160, 15), (-30, 60))]
o = Image.new('RGB', (2400, 380)); [o.paste(im, (i * 480, 0)) for i, im in enumerate(ims)]; o.save(f'{out}/11_gorra.png')
if glb:
    write_glb(f'{glb}/11_gorra.glb', [dict(name=m['role'], V=m['V'], F=m['F'], N=m['N'], color=COL[m['role']], rough=ROUGH[m['role']], metal=1.0 if m['role'] == 'hardware' else 0.0, role=m['role']) for m in meshes], 'Gorra')
