"""Construye el vaquero baggy (vaquero_baggy.py): tela, metal, piel y, aparte, el hilo de los pespuntes.

Uso (desde esta carpeta):
    python3 build_vaquero.py <rejilla m> <triángulos tela> <carpeta npz/png> <carpeta GLB> [--sin-costuras] [--estilo=skinny]
    Estilos: baggy (19), clasico, skinny, slim, recto, wide, flare, bootcut, mom, boyfriend (20-28).
    python3 build_vaquero.py 0.0028 260000 /tmp/vb ../
Salida: 19_vaquero_baggy.glb (tela + metal + piel) y 19_vaquero_baggy_costuras.glb (puntadas).
"""
import os, sys, time, json, numpy as np
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, here)
os.environ['ITEMS'] = 'vaquero_baggy'
for _a in sys.argv:          # --estilo=skinny (ver STYLES en vaquero_baggy.py); por defecto, baggy
    if _a.startswith('--estilo='):
        os.environ['VAQUERO_ESTILO'] = _a.split('=', 1)[1]
from core import F32, write_glb, hex2lin
from render import render, ao_vertices
import build5
import vaquero_baggy as vb
from stitches import stitch_mesh, seam_paths

PREVIEW = {'body': '#3E5A80', 'hardware': '#8C8A84', 'trim': '#7A5636', 'stitch': '#C68A3A'}
ROUGH = {'body': 0.88, 'hardware': 0.32, 'trim': 0.7, 'stitch': 0.75}
METAL = {'hardware': 1.0}


def merge(ms):
    V = []; F = []; N = []; off = 0
    for (v, f, n) in ms:
        V.append(v); F.append(f + off); N.append(n); off += len(v)
    return np.concatenate(V), np.concatenate(F), np.concatenate(N)


if __name__ == '__main__':
    h = float(sys.argv[1]); tgt = int(sys.argv[2]); out = sys.argv[3]; glb_dir = sys.argv[4]
    with_stitch = '--sin-costuras' not in sys.argv
    os.makedirs(out, exist_ok=True); os.makedirs(glb_dir, exist_ok=True)
    fid, nombre, fn, box = vb.CATALOG[0]
    t = time.time()
    specs = fn()
    groups, raw = build5.build(specs, box[0], box[1], h, tgt)
    csdf = build5.combined(specs)
    if with_stitch:
        t2 = time.time()
        sdf_body = build5.spec_sdf(specs[0])
        paths = seam_paths()
        from stitches import bartack_paths
        loops = build5.combined([s for s in specs if s['kind'] == 'solid' and s['role'] == 'body'])
        sv, sf, sn, info = stitch_mesh(sdf_body, paths, extra=[(loops, bartack_paths())])
        groups['stitch'] = (sv, sf, sn)
        json.dump(info, open(f'{out}/{fid}_costuras.json', 'w'), indent=1)
        print(f'  costuras: {len(sf)} tris, {info["puntadas"]} puntadas {time.time() - t2:.0f}s', flush=True)
    meshes = []; save = {}
    for role, (V, F, N) in groups.items():
        ao = ao_vertices(csdf, V + N * 0.0005, N) if role != 'stitch' else np.ones(len(V), F32)
        meshes.append(dict(V=V, F=F, N=N, lin=hex2lin(PREVIEW.get(role, '#888888')), ao=ao))
        save[f'{role}_V'] = V; save[f'{role}_F'] = F; save[f'{role}_N'] = N; save[f'{role}_ao'] = ao
    np.savez(f'{out}/{fid}.npz', **save)
    allV = np.concatenate([m['V'] for m in meshes])
    for yaw, tag in ((0, '_f'), (180, '_b'), (90, '_l'), (-90, '_r'), (-28, '')):
        render(meshes, W=560, H=900, yaw=yaw, pitch=4, bg=(0.30, 0.30, 0.31)).save(f'{out}/{fid}{tag}.png')
    # primeros planos: cintura delantera y bolsillo trasero
    zoom = lambda lo, hi: np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])], F32)
    render(meshes, W=700, H=520, yaw=-18, pitch=6, bg=(0.30, 0.30, 0.31), fit=zoom((-0.24, -0.2, 0.80), (0.24, 0.2, 1.0))).save(f'{out}/{fid}_zw.png')
    render(meshes, W=700, H=520, yaw=160, pitch=6, bg=(0.30, 0.30, 0.31), fit=zoom((-0.22, -0.2, 0.72), (0.22, 0.2, 0.99))).save(f'{out}/{fid}_zb.png')
    render(meshes, W=700, H=520, yaw=-20, pitch=10, bg=(0.30, 0.30, 0.31), fit=zoom((-0.30, -0.2, -0.02), (0.30, 0.2, 0.30))).save(f'{out}/{fid}_zh.png')
    main = [dict(name=role, V=V, F=F, N=N, color=PREVIEW.get(role, '#888888'), rough=ROUGH.get(role, 0.9),
                 metal=METAL.get(role, 0.0), role=role) for role, (V, F, N) in groups.items() if role != 'stitch']
    write_glb(f'{glb_dir}/{fid}.glb', main, nombre)
    if 'stitch' in groups:
        V, F, N = groups['stitch']
        write_glb(f'{glb_dir}/{fid}_costuras.glb', [dict(name='stitch', V=V, F=F, N=N, color=PREVIEW['stitch'], rough=0.75,
                                                         metal=0.0, role='stitch')], nombre + ' (pespuntes)')
    # ejes de las piernas y medidas de la cintura, para el script de Blender (coordenadas de tejido)
    ejes = {'waist_z': vb.WAIST_Z, 'waist_slope': vb.WAIST_SLOPE, 'band_w': vb.BAND_W, 'loops': vb.LOOPS,
            'back_pockets': {str(sx): vb.back_pocket(sx) for sx in (1, -1)}, 'coin': vb.COIN,
            'estilo': vb.KEY, 'nombre': nombre, 'lavado': vb.STYLE['wash'], 'vuelta': vb.CUFF}
    for sd in (1, -1):
        z, cx, cy, uu = vb.leg_axis(sd)
        ejes[str(sd)] = {'z': z[::2].tolist(), 'cx': cx[::2].tolist(), 'cy': cy[::2].tolist(), 'u': uu[::2].tolist()}
    json.dump(ejes, open(f'{glb_dir}/{fid}_ejes.json', 'w'))
    print(f'{fid}: {raw} -> {sum(len(g[1]) for g in groups.values())} tris  {time.time() - t:.0f}s', flush=True)
