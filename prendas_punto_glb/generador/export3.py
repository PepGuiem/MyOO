import sys, os, json, glob, struct, numpy as np
sys.path.insert(0, '/home/claude/gen2')
from core import write_glb, hex2lin
from items3 import CATALOG
from PIL import Image, ImageDraw, ImageFont

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
info = []
for fid, nombre, fn, box in CATALOG:
    p = f'{src}/{fid}.npz'
    if not os.path.exists(p): print('falta', fid); continue
    d = np.load(p)
    write_glb(f'{dst}/{fid}.glb', [dict(name=nombre, V=d['V'], F=d['F'], N=d['N'], color='#ECEBE7', rough=0.92, metal=0.0)], nombre)
    info.append(dict(archivo=f'{fid}.glb', prenda=nombre, triangulos=int(len(d['F'])), vertices=int(len(d['V'])),
                     mb=round(os.path.getsize(f'{dst}/{fid}.glb') / 1e6, 2)))
json.dump(info, open(f'{dst}/catalogo.json', 'w'), ensure_ascii=False, indent=1)

# validación estructural
bad = 0
for f in sorted(glob.glob(f'{dst}/*.glb')):
    b = open(f, 'rb').read()
    mg, ver, ln = struct.unpack('<III', b[:12]); jl, jt = struct.unpack('<II', b[12:20])
    js = json.loads(b[20:20 + jl]); bl, bt = struct.unpack('<II', b[20 + jl:28 + jl]); bn = b[28 + jl:28 + jl + bl]
    ok = mg == 0x46546C67 and ver == 2 and ln == len(b) and bl == js['buffers'][0]['byteLength']
    for m in js['meshes']:
        pr = m['primitives'][0]
        def acc(i, dt):
            a = js['accessors'][i]; v = js['bufferViews'][a['bufferView']]
            n = a['count'] * (3 if a['type'] == 'VEC3' else 1)
            return np.frombuffer(bn, dt, n, v['byteOffset']), a
        P, a = acc(pr['attributes']['POSITION'], np.float32); N, _ = acc(pr['attributes']['NORMAL'], np.float32)
        I, _ = acc(pr['indices'], np.uint32)
        P = P.reshape(-1, 3); N = N.reshape(-1, 3)
        ok &= bool(np.isfinite(P).all() and np.isfinite(N).all() and I.max() < len(P) and len(I) % 3 == 0)
        ok &= bool(np.allclose(P.min(0), a['min']) and np.allclose(P.max(0), a['max']))
        ok &= bool((np.abs(np.linalg.norm(N, axis=1) - 1) < 1e-2).all())
    if not ok: bad += 1; print('PROBLEMA', f)
print(len(info), 'GLB,', bad, 'con problemas')

# hoja de contactos
cols = 5; W, H = 340, 420
ims = []
for it in info:
    fid = it['archivo'][:-4]
    im = Image.open(f'{src}/{fid}.png').resize((W, H), Image.LANCZOS)
    dr = ImageDraw.Draw(im)
    try: ft = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
    except Exception: ft = None
    dr.text((12, 10), it['prenda'], fill=(215, 215, 215), font=ft)
    ims.append(im)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * W, rows * H), (38, 38, 40))
for k, im in enumerate(ims): sheet.paste(im, ((k % cols) * W, (k // cols) * H))
sheet.save(f'{dst}/vista_previa.png')
