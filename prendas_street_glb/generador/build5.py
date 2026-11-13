"""Construye las prendas de items4 (componentes perezosos con papel) y exporta GLB con un material por papel.

Uso: python3 build5.py <ids|all> <h> <triángulos> <salida_npz> [salida_glb]
"""
import sys, time, os, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import F32, write_glb, hex2lin, eval_grid
from render import render, ao_vertices
from extract import extract_shell, extract_solid
import importlib
items4 = importlib.import_module(os.environ.get('ITEMS', 'items4'))

PREVIEW = {'body': '#E9E8E4', 'button': '#3A3A3E', 'trim': '#C9B28E', 'zipper': '#A9A8A4', 'hardware': '#B8A26A', 'stitch': '#C9A15A'}
ROUGH = {'body': 0.92, 'button': 0.45, 'trim': 0.9, 'zipper': 0.35, 'hardware': 0.3, 'stitch': 0.8}
METAL = {'zipper': 1.0, 'hardware': 1.0}

def spec_sdf(sp):
    if sp['kind'] == 'shell':
        def f(P):
            c = sp['fn'](P)
            return np.maximum(np.abs(c[1]) - c[3] / 2, c[2]).astype(F32)
        return f
    return items4.lazy_solid(sp['fn'], sp['bbox'])

def combined(specs):
    fs = [spec_sdf(s) for s in specs]
    def f(P):
        d = None
        for g in fs:
            v = g(P); d = v if d is None else np.minimum(d, v)
        return d
    return f

def build(specs, lo, hi, h, target):
    groups = {}
    raw = 0
    for k, sp in enumerate(specs):
        t = time.time()
        if sp['kind'] == 'shell':
            item = lambda P, sp=sp: [sp['fn'](P)]
            m, r = extract_shell(item, 0, lo, hi, h, target)
        else:
            item = lambda P, sp=sp: [('solid', sp['fn'](P))]
            m, r = extract_solid(item, 0, sp['bbox'][0], sp['bbox'][1], sp['h'], 6000)
        if m is None: print('  (vacío)', k, sp['role']); continue
        raw += r
        groups.setdefault(sp['role'], []).append(m)
        print(f"  {k} {sp['kind']} {sp['role']}: {len(m[1])} tris {time.time() - t:.0f}s", flush=True)
    out = {}
    for role, ms in groups.items():
        V = []; F = []; N = []; off = 0
        for (v, f, n) in ms:
            V.append(v); F.append(f + off); N.append(n); off += len(v)
        out[role] = (np.concatenate(V), np.concatenate(F), np.concatenate(N))
    return out, raw

if __name__ == '__main__':
    ids = sys.argv[1].split(','); h = float(sys.argv[2]); tgt = int(sys.argv[3])
    out = sys.argv[4]; glb_dir = sys.argv[5] if len(sys.argv) > 5 else None
    os.makedirs(out, exist_ok=True)
    if glb_dir: os.makedirs(glb_dir, exist_ok=True)
    for fid, nombre, fn, box in items4.CATALOG:
        if ids != ['all'] and fid[:2] not in ids: continue
        t = time.time()
        specs = fn()
        groups, raw = build(specs, box[0], box[1], h, tgt)
        csdf = combined(specs)
        meshes = []; save = {}
        for role, (V, F, N) in groups.items():
            ao = ao_vertices(csdf, V + N * 0.0005, N)
            meshes.append(dict(V=V, F=F, N=N, lin=hex2lin(PREVIEW.get(role, '#888888')), ao=ao))
            save[f'{role}_V'] = V; save[f'{role}_F'] = F; save[f'{role}_N'] = N
        np.savez(f'{out}/{fid}.npz', **save)
        for yaw, tag in ((-28, ''), (152, '_b')):
            render(meshes, yaw=yaw, bg=(0.022, 0.022, 0.024)).save(f'{out}/{fid}{tag}.png')
        if glb_dir:
            write_glb(f'{glb_dir}/{fid}.glb', [dict(name=role, V=V, F=F, N=N, color=PREVIEW.get(role, '#888888'),
                                                     rough=ROUGH.get(role, 0.9), metal=METAL.get(role, 0.0), role=role)
                                                for role, (V, F, N) in groups.items()], nombre)
        print(f'{fid}: {raw} -> {sum(len(g[1]) for g in groups.values())} tris  {time.time() - t:.0f}s', flush=True)
