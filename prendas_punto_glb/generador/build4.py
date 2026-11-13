import sys, time, os, numpy as np
sys.path.insert(0, '/home/claude/gen2')
from core import *; from render import render, ao_vertices
from extract import build, combined_sdf
import items3 as items2
WHITE = '#E9E8E4'
ids = sys.argv[1].split(','); h = float(sys.argv[2]); tgt = int(sys.argv[3]) if len(sys.argv) > 3 else 120000
out = sys.argv[4] if len(sys.argv) > 4 else '/home/claude/out2'
os.makedirs(out, exist_ok=True)
for fid, nombre, fn, box in items2.CATALOG:
    if ids != ['all'] and fid[:2] not in ids: continue
    t = time.time()
    V, F, N, raw = build(fn, box[0], box[1], h, tgt)
    ao = ao_vertices(combined_sdf(fn), V + N * 0.0005, N)
    np.savez(f'{out}/{fid}.npz', V=V, F=F, N=N, ao=ao)
    render([dict(V=V, F=F, N=N, lin=hex2lin(WHITE), ao=ao)], bg=(0.022, 0.022, 0.024)).save(f'{out}/{fid}.png')
    print(f'{fid}: {raw} -> {len(F)} tris  {time.time()-t:.0f}s', flush=True)
