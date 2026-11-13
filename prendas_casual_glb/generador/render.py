import numpy as np, ctypes
from PIL import Image
F32 = np.float32
import os as _os
_here = _os.path.dirname(_os.path.abspath(__file__))
_lib = ctypes.CDLL(_os.path.join(_here, 'libraster.so') if _os.path.exists(_os.path.join(_here, 'libraster.so')) else '/home/claude/ext/libraster.so')
_lib.raster.argtypes = [ctypes.c_int] * 3 + [ctypes.c_void_p] * 5 + [ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]

def srgb(x): return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.clip(x, 0, None), 1 / 2.4) - 0.055)

def ao_vertices(fn, V, N, steps=5, dist=0.012):
    if fn is None: return np.ones(len(V), F32)
    occ = np.zeros(len(V), F32)
    for k in range(1, steps + 1):
        h = dist * k / steps
        d = fn(V + N * h)
        occ += (h - np.minimum(d, h)) / h * (0.6 ** k)
    return np.clip(1 - 1.6 * occ, 0.25, 1).astype(F32)

def shade(V, N, base, ao, view):
    L1 = np.array([-0.55, -0.65, 0.55]); L1 /= np.linalg.norm(L1)
    L2 = np.array([0.7, -0.4, 0.15]); L2 /= np.linalg.norm(L2)
    L3 = np.array([0.2, 0.9, 0.5]); L3 /= np.linalg.norm(L3)
    base = np.asarray(base)[None, :] if np.ndim(base) == 1 else base
    def lit(n):
        d1 = np.clip(n @ L1, 0, 1); d2 = np.clip(n @ L2, 0, 1); d3 = np.clip(n @ L3, 0, 1)
        hemi = 0.5 + 0.5 * n[:, 2]
        H = (L1 - view); H /= np.linalg.norm(H)
        spec = np.clip(n @ H, 0, 1) ** 24 * 0.06
        rim = (1 - np.abs(n @ view)) ** 3 * 0.25
        c = (0.95 * d1 + 0.25 * d2 + 0.35 * d3 + 0.30 * hemi)[:, None] * base * ao[:, None] + (spec + rim * ao)[:, None]
        return c
    return lit(N).astype(F32), (lit(-N) * 0.55).astype(F32)

def render(meshes, W=520, H=640, yaw=-28, pitch=8, ss=2, bg=(0.17, 0.17, 0.18), pad=1.08, fit=None):
    a, b = np.radians(yaw), np.radians(pitch)
    Rz = np.array([[np.cos(a), -np.sin(a), 0], [np.sin(a), np.cos(a), 0], [0, 0, 1]])
    Rx = np.array([[1, 0, 0], [0, np.cos(b), -np.sin(b)], [0, np.sin(b), np.cos(b)]])
    R = (Rx @ Rz).astype(F32); view = (R.T @ np.array([0, 1.0, 0]))  # dirección cámara->escena en mundo
    allV = np.concatenate([m['V'] for m in meshes]) @ R.T if fit is None else np.asarray(fit) @ R.T
    lo, hi = allV.min(0), allV.max(0); c = (lo + hi) / 2
    span = max((hi[0] - lo[0]) / W, (hi[2] - lo[2]) / H) * pad
    w, h = W * ss, H * ss
    img = np.zeros((h, w, 3), F32); img[:] = bg; zb = np.full((h, w), np.inf, F32)
    for m in meshes:
        V = (m['V'] @ R.T).astype(F32)
        sx = ((V[:, 0] - c[0]) / span + W / 2) * ss; sy = (H / 2 - (V[:, 2] - c[2]) / span) * ss; sz = V[:, 1].copy()
        base = np.array(m['lin'], F32)
        cf, cb = shade(m['V'], m['N'], base, m.get('ao', np.ones(len(V), F32)), view)
        Fi = np.ascontiguousarray(m['F'], np.uint32)
        args = [np.ascontiguousarray(x, F32) for x in (sx, sy, sz, cf, cb)]
        _lib.raster(w, h, len(V), *[x.ctypes.data for x in args], len(Fi), Fi.ctypes.data, img.ctypes.data, zb.ctypes.data)
    # fondo con viñeta suave
    out = srgb(np.clip(img, 0, 1))
    im = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS)
    return im
