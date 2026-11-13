"""Construye las camisetas de camisetas.py: tela (y mangas de la raglán, botones de la henley) y,
aparte, el hilo de los pespuntes. Escribe también <id>_ejes.json para el script de Blender.

Uso (desde esta carpeta):
    python3 build_camisetas.py <estilos|all> <rejilla m> <triángulos> <carpeta npz/png> <carpeta GLB>
    python3 build_camisetas.py clasica,oversize 0.003 260000 /tmp/cam ../camisetas
Estilos: clasica, oversize, slim, boxy, crop, longline, baby, raglan, pico, henley, manga_larga.
"""
import os, sys, time, json, numpy as np
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, here)
from core import F32, write_glb, hex2lin
from render import render, ao_vertices
import build5
import camisetas as cm
_cm = cm
from stitches import stitch_mesh

ROUGH = {'body': 0.9, 'secondary': 0.9, 'button': 0.4, 'stitch': 0.8, 'trim': 0.85, 'hardware': 0.3, 'zipper': 0.35}
METAL = {'hardware': 1.0, 'zipper': 1.0}


def build_one(key, h, tgt, out, glb_dir, mod=None):
    cm = mod or _cm
    if ':' in key:                 # estilo:cierre (chaquetas: cremallera, botones o abierta)
        key, cierre = key.split(':', 1)
        cm.configure(key, cierre)
    else:
        cm.configure(key)
    fid, nombre, fn, box = cm.CATALOG[0]
    t = time.time()
    specs = fn()
    groups, raw = build5.build(specs, box[0], box[1], h, tgt)
    shells = build5.combined([s for s in specs if s['kind'] == 'shell'])
    t2 = time.time()
    sv, sf, sn, info = stitch_mesh(shells, cm.seam_paths(), pitch=0.0030, dash=0.0021, r=0.00034)
    groups['stitch'] = (sv, sf, sn)
    json.dump(info, open(f'{out}/{fid}_costuras.json', 'w'), indent=1)
    print(f'  costuras: {len(sf)} tris, {info["puntadas"]} puntadas {time.time() - t2:.0f}s', flush=True)
    col = cm.ST['color']
    preview = {'body': col, 'secondary': cm.ST.get('color2') or col, 'button': cm.ST.get('boton') or '#D8D2C4', 'stitch': col,
               'trim': cm.ST.get('color_trim') or '#E8E6E0', 'hardware': '#B9B8B4', 'zipper': '#A9A8A4'}
    csdf = build5.combined(specs)
    meshes = []
    for role, (V, F, N) in groups.items():
        ao = ao_vertices(csdf, V + N * 0.0005, N) if role != 'stitch' else np.ones(len(V), F32)
        meshes.append(dict(V=V, F=F, N=N, lin=hex2lin(preview.get(role, '#888888')), ao=ao))
    zoom = lambda lo, hi: np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])], F32)
    for yaw, tag in ((0, '_f'), (180, '_b'), (90, '_l'), (-90, '_r'), (-28, '')):
        render(meshes, W=640, H=640, yaw=yaw, pitch=4, bg=(0.30, 0.30, 0.31)).save(f'{out}/{fid}{tag}.png')
    render(meshes, W=700, H=520, yaw=-15, pitch=12, bg=(0.30, 0.30, 0.31), fit=zoom((-0.16, -0.16, 1.28), (0.16, 0.16, 1.52))).save(f'{out}/{fid}_zn.png')
    main = [dict(name=role, V=V, F=F, N=N, color=preview.get(role, '#888888'), rough=ROUGH.get(role, 0.9),
                 metal=METAL.get(role, 0.0), role=role) for role, (V, F, N) in groups.items() if role != 'stitch']
    write_glb(f'{glb_dir}/{fid}.glb', main, nombre)
    V, F, N = groups['stitch']
    write_glb(f'{glb_dir}/{fid}_costuras.glb', [dict(name='stitch', V=V, F=F, N=N, color=col, rough=0.8, metal=0.0, role='stitch')],
              nombre + ' (pespuntes)')
    json.dump(cm.ejes(), open(f'{glb_dir}/{fid}_ejes.json', 'w'))
    fab = [r for r in ('body', 'secondary') if r in groups]
    V = np.concatenate([groups[r][0] for r in fab]); N = np.concatenate([groups[r][2] for r in fab])
    pieza, tej, inter, canale = cm.campos(V, N)
    np.savez_compressed(f'{glb_dir}/{fid}_campos.npz', V=V.astype(F32), pieza=pieza, tejido=tej, interior=inter, canale=canale,
                        piezas=np.array(cm.PIEZAS))
    print('  piezas:', {cm.PIEZAS[i]: int((pieza == i).sum()) for i in np.unique(pieza)}, flush=True)
    print(f'{fid}: {raw} -> {sum(len(g[1]) for g in groups.values())} tris  {time.time() - t:.0f}s', flush=True)


if __name__ == '__main__':
    if os.environ.get('PRENDAS') == 'sudaderas':
        import sudaderas as cm
    elif os.environ.get('PRENDAS') == 'camisas':
        import camisas as cm
    elif os.environ.get('PRENDAS') == 'jerseis':
        import jerseis as cm
    elif os.environ.get('PRENDAS') == 'chaquetas':
        import chaquetas as cm
    elif os.environ.get('PRENDAS') == 'abrigos':
        import abrigos as cm
    elif os.environ.get('PRENDAS') == 'tops':
        import tops as cm
    elif os.environ.get('PRENDAS') == 'formal':
        import formal as cm
    keys = list(cm.STYLES) if sys.argv[1] == 'all' else sys.argv[1].split(',')
    h = float(sys.argv[2]); tgt = int(sys.argv[3]); out = sys.argv[4]; glb_dir = sys.argv[5]
    os.makedirs(out, exist_ok=True); os.makedirs(glb_dir, exist_ok=True)
    for k in keys:
        build_one(k, h, tgt, out, glb_dir, cm)
