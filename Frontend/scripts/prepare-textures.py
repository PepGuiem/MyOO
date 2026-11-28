#!/usr/bin/env python3
"""
Prepara los mapas de relieve (normal maps) de las prendas 3D para la web.

Uso (desde la carpeta Frontend):
  python scripts/prepare-textures.py <carpeta de los .glb> <carpeta de texturas> <salida> [--quality=80]
  p. ej.
  python scripts/prepare-textures.py ../prendas_street_glb/sudaderas_v2/glb \
      ../prendas_street_glb/sudaderas_v2/texturas public/models/prendas/sudaderas/tex

Para cada .glb de la entrada (sin `_costuras` ni `_pbr`) busca su mapa normal
horneado en Blender (4K, espacio tangente, convención OpenGL):
  <texturas>/<nombre>/<...>Normal<...>.png      (sudaderas: carpeta = nombre del .glb)
  <texturas>/<prefijo>/<...>Normal<...>.png     (calzado: carpeta SNK01 para SNK01_CourtLow.glb)
  <texturas>/<nombre>_Normal<...>.png
y escribe dos versiones reducidas en WebP:
  <salida>/<nombre>_n1024.webp   vista de detalle (al acercarse)
  <salida>/<nombre>_n512.webp    miniaturas y primera carga
Después, `prepare-garments.mjs` asocia estos mapas a cada .glb (conserva las UV).

Por qué así:
- Solo el mapa normal: el color lo pone la web (las prendas se tiñen) y la
  oclusión ya va por vértice. El mapa de oclusión de Blender tampoco sirve
  aquí: se horneó con el maniquí y deja la espalda casi negra.
- La trama fina del punto (2-3 px en el mapa de 4K) no cabe en 1024 px: la web
  la dibuja con su textura de tejido repetida en estas mismas UV. En 1024 px
  queda el relieve que sí se ve: costuras, cantos, bolsillos, arrugas.
- Al reducir, los vectores se acortan (se promedian): se vuelven a normalizar.

Solo necesita Pillow y numpy (no hace falta Node ni sharp).
"""
import json
import os
import re
import sys

import numpy as np
from PIL import Image

SIZES = (1024, 512)
# Calidad WebP. El error lo pone sobre todo el submuestreo del color de WebP
# (no la calidad): de 90 a 80 el error medio sube un 10 % y el archivo baja un
# 35 %. Se cambia con --quality=N.
QUALITY = 80


def find_normal(tex_dir: str, base: str):
    """Ruta del mapa normal de `base` (o None)."""
    candidates = []
    if os.path.isdir(tex_dir):
        for entry in sorted(os.listdir(tex_dir)):
            path = os.path.join(tex_dir, entry)
            if os.path.isdir(path) and (entry == base or base.startswith(entry + '_')):
                candidates += [os.path.join(path, f) for f in sorted(os.listdir(path))]
            elif os.path.isfile(path) and entry.startswith(base + '_'):
                candidates.append(path)
    normals = [p for p in candidates if re.search(r'normal', os.path.basename(p), re.I) and p.lower().endswith('.png') and not re.search(r'_dx', p, re.I)]
    # Si hay varias, la de más resolución (nombre con 4K o la más pesada).
    normals.sort(key=lambda p: os.path.getsize(p), reverse=True)
    return normals[0] if normals else None


def load_normal(path: str) -> np.ndarray:
    im = Image.open(path)
    if im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGB')
    return np.asarray(im.convert('RGB'), dtype=np.float32) / 255.0


def reduce_normal(rgb: np.ndarray, size: int) -> Image.Image:
    # Se reduce cada canal en coma flotante (Lanczos) y luego se renormaliza.
    chans = [np.asarray(Image.fromarray(rgb[..., k], mode='F').resize((size, size), Image.LANCZOS)) for k in range(3)]
    v = np.stack(chans, axis=-1) * 2.0 - 1.0
    v[..., 2] = np.maximum(v[..., 2], 0.05)
    v /= np.linalg.norm(v, axis=-1, keepdims=True) + 1e-8
    out = np.clip(np.round((v * 0.5 + 0.5) * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, mode='RGB')


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    flags = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
    if len(args) < 3:
        print(__doc__)
        return 1
    glb_dir, tex_dir, out_dir = args[:3]
    quality = int(flags.get('quality', QUALITY))
    os.makedirs(out_dir, exist_ok=True)
    files = sorted(f for f in os.listdir(glb_dir) if f.lower().endswith('.glb') and not re.search(r'_(costuras|pbr)\.glb$', f, re.I))
    report = []
    for f in files:
        base = f[:-4]
        src = find_normal(tex_dir, base)
        if not src:
            print(f'{base}: sin mapa normal, se omite')
            continue
        rgb = load_normal(src)
        entry = {'archivo': f, 'origen': os.path.basename(src), 'px': rgb.shape[1]}
        for size in SIZES:
            out = os.path.join(out_dir, f'{base}_n{size}.webp')
            reduce_normal(rgb, size).save(out, 'WEBP', quality=quality, method=6)
            entry[str(size)] = os.path.getsize(out)
        report.append(entry)
        print(f"{base}: {entry['px']} px -> " + ', '.join(f'{s} px {entry[str(s)] / 1024:.0f} KB' for s in SIZES))
    total = sum(e[str(s)] for e in report for s in SIZES)
    print(f'Total: {total / 1024:.0f} KB en {len(report)} prendas')
    with open(os.path.join(out_dir, 'texturas.json'), 'w', encoding='utf-8') as fh:
        json.dump(report, fh, ensure_ascii=False, indent=1)
    return 0


if __name__ == '__main__':
    sys.exit(main())
