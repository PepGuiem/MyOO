"""Núcleo: cuerpo de referencia en SDF, ruido, malla (marching cubes + meshoptimizer), GLB y render.
Coordenadas de trabajo: Z arriba, frente = -Y, metros. Exportación glTF: Y arriba, frente = +Z."""
import numpy as np, ctypes, json, struct, math, os
from skimage.measure import marching_cubes

F32 = np.float32
HERE = os.path.dirname(os.path.abspath(__file__))

# ============================================================ utilidades SDF
def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)

def smax(a, b, k): return -smin(-a, -b, k)

def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def round_cone(P, a, b, r1, r2):
    """Distancia exacta a un cono redondeado (iq)."""
    a = np.asarray(a, F32); b = np.asarray(b, F32)
    ba = b - a; l2 = float(ba @ ba); rr = r1 - r2; a2 = l2 - rr * rr; il2 = 1.0 / l2
    pa = P - a; y = pa @ ba; z = y - l2
    xv = pa * l2 - y[:, None] * ba; x2 = np.einsum('ij,ij->i', xv, xv)
    y2 = y * y * l2; z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    d = np.where(np.sign(z) * a2 * z2 > k, np.sqrt(x2 + z2) * il2 - r2,
         np.where(np.sign(y) * a2 * y2 < k, np.sqrt(x2 + y2) * il2 - r1,
                  (np.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1))
    return d.astype(F32)

def seg_param(P, a, b):
    """Parámetro t∈[0,1] a lo largo del segmento, distancia radial y vector radial."""
    a = np.asarray(a, F32); b = np.asarray(b, F32); ba = b - a; L = np.linalg.norm(ba); d = ba / L
    u = (P - a) @ d
    r = P - a - np.outer(u, d)
    return u, np.linalg.norm(r, axis=1), r, d, L

def frame(d):
    d = np.asarray(d, float); d = d / np.linalg.norm(d)
    up = np.array([0, 1.0, 0]) if abs(d[1]) < 0.9 else np.array([1.0, 0, 0])
    e1 = up - up.dot(d) * d; e1 /= np.linalg.norm(e1); e2 = np.cross(d, e1)
    return e1.astype(F32), e2.astype(F32)

# ============================================================ ruido de valor 3D (continuo, determinista)
_rng = np.random.default_rng(7)
_LAT = _rng.random((64, 64, 64)).astype(F32)
def noise(P, freq=1.0, seed=0):
    Q = P * freq + seed * 17.31
    i = np.floor(Q).astype(np.int64); f = (Q - i).astype(F32); f = f * f * (3 - 2 * f)
    i0 = i & 63; i1 = (i + 1) & 63
    def g(a, b, c): return _LAT[a[:, 0], b[:, 1], c[:, 2]]
    x0, y0, z0 = i0.T; x1, y1, z1 = i1.T
    L = _LAT
    c000 = L[x0, y0, z0]; c100 = L[x1, y0, z0]; c010 = L[x0, y1, z0]; c110 = L[x1, y1, z0]
    c001 = L[x0, y0, z1]; c101 = L[x1, y0, z1]; c011 = L[x0, y1, z1]; c111 = L[x1, y1, z1]
    fx, fy, fz = f.T
    a = c000 + fx * (c100 - c000); b = c010 + fx * (c110 - c010)
    c = c001 + fx * (c101 - c001); e = c011 + fx * (c111 - c011)
    r = (a + fy * (b - a)); s = (c + fy * (e - c))
    return (r + fz * (s - r)) * 2 - 1     # [-1, 1]

def fbm(P, freq, oct=3, seed=0):
    v = 0; a = 1; n = 0
    for o in range(oct):
        v = v + a * noise(P, freq * 2 ** o, seed + o); n += a; a *= 0.5
    return v / n

# ============================================================ cuerpo de referencia (~1,78 m, pose en A)
# perfil del tronco: z, semiancho, fondo delantero, fondo trasero, desplazamiento y del centro
TZ  = np.array([0.74, 0.80, 0.86, 0.92, 0.98, 1.04, 1.10, 1.16, 1.22, 1.28, 1.34, 1.38, 1.42, 1.455, 1.48, 1.50], F32)
TRX = np.array([0.150, 0.168, 0.178, 0.180, 0.172, 0.160, 0.152, 0.156, 0.165, 0.172, 0.178, 0.180, 0.170, 0.135, 0.085, 0.062], F32)
TRF = np.array([0.090, 0.098, 0.102, 0.100, 0.098, 0.100, 0.100, 0.104, 0.112, 0.118, 0.114, 0.106, 0.090, 0.072, 0.058, 0.050], F32)
TRB = np.array([0.090, 0.112, 0.118, 0.108, 0.094, 0.088, 0.090, 0.094, 0.098, 0.100, 0.102, 0.102, 0.096, 0.080, 0.062, 0.052], F32)

from scipy.interpolate import PchipInterpolator
_ZF = np.linspace(0.74, 1.50, 400).astype(F32)
def _fine(arr): return PchipInterpolator(TZ, arr)(_ZF).astype(F32)

class Body:
    """Cuerpo parametrizable: holgura (ease) y caída (drape) se aplican al perfil del tronco
    y a los radios de brazos/piernas, como hace la tela al colgar."""
    def __init__(s, ease=0.0, drape=0.0, drape_from=1.30, arm_ease=None, arm_drape=0.0,
                 leg_ease=None, leg_drape=0.0, hip_ease=None, waist_fit=0.0, arm_deg=44.0):
        s.ease = ease; s.arm_ease = ease if arm_ease is None else arm_ease
        s.leg_ease = ease if leg_ease is None else leg_ease; s.hip_ease = s.leg_ease if hip_ease is None else hip_ease
        rx, rf, rb = TRX.copy(), TRF.copy(), TRB.copy()
        if drape > 0:   # la tela cuelga recta desde el pecho: máximo acumulado de arriba abajo
            m = TZ <= drape_from
            for arr in (rx, rf, rb):
                cm = np.maximum.accumulate(arr[::-1])[::-1]
                cm = np.where(m, np.maximum.accumulate(np.where(m, arr, 0)[::-1])[::-1], arr)
                # caída desde la altura indicada hacia abajo
                top = np.interp(drape_from, TZ, arr)
                hang = np.maximum(arr, top * np.ones_like(arr))
                arr[:] = np.where(m, arr + (hang - arr) * drape, arr)
        if waist_fit > 0:  # pretina ceñida
            pass
        s.rx, s.rf, s.rb = _fine(rx), _fine(rf), _fine(rb)
        # brazos (pose en A, ~44° desde la vertical, ligera flexión de codo)
        s.arm = {}
        for side in (1, -1):
            S = np.array([0.168 * side, 0.004, 1.405], F32)
            d1 = np.array([math.sin(math.radians(arm_deg)) * side, 0.0, -math.cos(math.radians(arm_deg))], F32)
            E = S + d1 * 0.285
            d2 = np.array([math.sin(math.radians(arm_deg - 6)) * side, -0.12, -math.cos(math.radians(arm_deg - 6))], F32); d2 /= np.linalg.norm(d2)
            W = E + d2 * 0.255
            s.arm[side] = (S, E, W)
        s.arm_r = (0.054, 0.040, 0.031)
        s.arm_drape = arm_drape
        # piernas
        s.leg = {}
        for side in (1, -1):
            H = np.array([0.090 * side, 0.004, 0.84], F32); K = np.array([0.098 * side, -0.004, 0.485], F32)
            C = np.array([0.101 * side, 0.010, 0.33], F32); A = np.array([0.103 * side, 0.016, 0.085], F32)
            s.leg[side] = (H, K, C, A)
        s.leg_r = (0.088, 0.054, 0.056, 0.035)
        s.leg_drape = leg_drape
        # separar los ejes para que las perneras holgadas no se solapen por dentro
        r0, r1, r2, r3 = s.leg_r; e = s.leg_ease; dr = leg_drape
        rads = [r0 + e, r1 + (r0 - r1) * dr + e, r2 + (r0 - r2) * dr * 0.95 + e, r3 + (r0 - r3) * dr * 0.9 + e]
        for side in (1, -1):
            nodes = []
            for N, rr in zip(s.leg[side], rads):
                N = N.copy(); N[0] += side * max(0.0, rr - (abs(float(N[0])) - 0.006)); nodes.append(N)
            s.leg[side] = tuple(nodes)

    # ---- tronco con secciones elípticas asimétricas; distancia corregida por el gradiente
    def _torso_f(s, P):
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        e = s.ease
        rx = np.interp(z, _ZF, s.rx) + e; rf = np.interp(z, _ZF, s.rf) + e; rb = np.interp(z, _ZF, s.rb) + e
        ry = np.where(y < 0, rf, rb)
        q = np.sqrt((x / rx) ** 2 + (y / ry) ** 2)
        return q, rx, ry

    def torso(s, P):
        q, rx, ry = s._torso_f(P)
        h = 1e-3
        dz = (s._torso_f(P + [0, 0, h])[0] - s._torso_f(P - [0, 0, h])[0]) / (2 * h)
        x, y = P[:, 0], P[:, 1]
        gx = x / (rx * rx * np.maximum(q, 1e-6)); gy = y / (ry * ry * np.maximum(q, 1e-6))
        gxy2 = gx * gx + gy * gy
        dz2 = np.minimum(dz * dz, gxy2 * 2.5)
        g = np.sqrt(gxy2 + dz2)
        d = (q - 1) / np.maximum(g, 1e-3)
        # tapas arriba (cuello) y abajo
        top = P[:, 2] - (1.53 + s.ease); bot = (0.72 - s.ease) - P[:, 2]
        return np.maximum(d, np.maximum(top, bot)).astype(F32)

    def arm_d(s, P, side):
        S, E, W = s.arm[side]; r0, r1, r2 = s.arm_r; e = s.arm_ease
        dr = s.arm_drape
        r1e = r1 + (r0 - r1) * dr; r2e = r2 + (r0 - r2) * dr * 0.85
        W2 = W + (W - E) / np.linalg.norm(W - E) * 0.18
        a = round_cone(P, S, E, r0 + e, r1e + e)
        b = round_cone(P, E, W2, r1e + e, r2e + e)
        return np.minimum(a, b)

    def leg_d(s, P, side):
        H, K, C, A = s.leg[side]; r0, r1, r2, r3 = s.leg_r; e = s.leg_ease; dr = s.leg_drape
        r1e = r1 + (r0 - r1) * dr; r2e = r2 + (r0 - r2) * dr * 0.95; r3e = r3 + (r0 - r3) * dr * 0.9
        A2 = A + np.array([0, 0, -0.12], F32)
        d = round_cone(P, H, K, r0 + e, r1e + e)
        d = np.minimum(d, round_cone(P, K, C, r1e + e, r2e + e))
        return np.minimum(d, round_cone(P, C, A2, r2e + e, r3e + e))

    def neck_d(s, P):
        return round_cone(P, [0, 0.008, 1.42], [0, 0.012, 1.70], 0.058 + s.ease, 0.055 + s.ease)

    def upper(s, P):
        d = smin(s.torso(P), s.neck_d(P), 0.03)
        for side in (1, -1): d = smin(d, s.arm_d(P, side), 0.05)
        return d

    def lower(s, P):
        # pelvis: el tramo inferior del tronco se estrecha para fundirse con las piernas
        z = P[:, 2]; k = 1 - 0.38 * sstep(0.90, 0.75, z)
        Q = P.copy(); Q[:, 0] /= (1 - 0.18 * sstep(0.90, 0.75, z)); Q[:, 1] /= k
        d = s.torso(Q) * np.minimum(k, 1)
        legs = np.minimum(s.leg_d(P, 1), s.leg_d(P, -1))
        return smin(d, legs, 0.05)

# ============================================================ evaluación en rejilla + malla
def eval_grid(fn, lo, hi, h, chunk=1_500_000):
    lo = np.asarray(lo, F32); hi = np.asarray(hi, F32)
    n = np.ceil((hi - lo) / h).astype(int) + 1
    xs = [lo[i] + np.arange(n[i], dtype=F32) * h for i in range(3)]
    out = np.empty(n[0] * n[1] * n[2], F32)
    # recorremos por rodajas en x para no agotar memoria
    per = max(1, chunk // (n[1] * n[2]))
    Y, Z = np.meshgrid(xs[1], xs[2], indexing='ij'); Y = Y.ravel(); Z = Z.ravel()
    for i0 in range(0, n[0], per):
        i1 = min(n[0], i0 + per); X = np.repeat(xs[0][i0:i1], len(Y))
        P = np.stack([X, np.tile(Y, i1 - i0), np.tile(Z, i1 - i0)], 1)
        out[i0 * n[1] * n[2]: i1 * n[1] * n[2]] = fn(P)
    return out.reshape(n), lo

_lib = None
def _meshopt():
    global _lib
    if _lib is None:
        _lib = ctypes.CDLL('/home/claude/ext/libmeshopt.so')
        _lib.meshopt_simplifyWithAttributes.restype = ctypes.c_size_t
        _lib.meshopt_simplifyWithAttributes.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p, ctypes.c_size_t, ctypes.c_size_t,
                                                        ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p,
                                                        ctypes.c_size_t, ctypes.c_float, ctypes.c_uint, ctypes.c_void_p]
        _lib.meshopt_optimizeVertexCache.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t, ctypes.c_size_t]
    return _lib

def simplify(V, F, N, target_tris, err=0.0006):
    lib = _meshopt()
    V = np.ascontiguousarray(V, F32); N = np.ascontiguousarray(N, F32); I = np.ascontiguousarray(F.ravel(), np.uint32)
    dst = np.empty_like(I); w = np.array([0.4, 0.4, 0.4], F32); rerr = ctypes.c_float()
    n = lib.meshopt_simplifyWithAttributes(dst.ctypes.data, I.ctypes.data, len(I), V.ctypes.data, len(V), 12,
                                           N.ctypes.data, 12, w.ctypes.data, 3, None, target_tris * 3, err, 1 << 2, ctypes.byref(rerr))
    dst = dst[:n]
    opt = np.empty_like(dst); lib.meshopt_optimizeVertexCache(opt.ctypes.data, dst.ctypes.data, n, len(V))
    used, inv = np.unique(opt, return_inverse=True)
    return V[used], inv.reshape(-1, 3).astype(np.uint32), N[used]

def sdf_normals(fn, V, h=0.0012):
    g = np.zeros_like(V)
    for k in range(3):
        o = np.zeros(3, F32); o[k] = h
        g[:, k] = fn(V + o) - fn(V - o)
    l = np.linalg.norm(g, axis=1, keepdims=True); l[l == 0] = 1
    return (g / l).astype(F32)

def mesh_from_sdf(fn, lo, hi, h=0.003, target_tris=90_000):
    G, lo = eval_grid(fn, lo, hi, h)
    V, Fc, _, _ = marching_cubes(G, 0.0, spacing=(h, h, h), allow_degenerate=False)
    V = (V + lo).astype(F32); Fc = Fc.astype(np.uint32)
    # descartar islas diminutas (polvo de la extracción)
    V, Fc = drop_small_components(V, Fc, min_faces=60)
    V = taubin(V, Fc, 4)
    N = sdf_normals(fn, V)
    raw = len(Fc)
    if target_tris and len(Fc) > target_tris:
        V, Fc, N = simplify(V, Fc, N, target_tris)
        N = sdf_normals(fn, V)
    # orientar triángulos con la normal del campo (hacia fuera)
    fn_ = np.cross(V[Fc[:, 1]] - V[Fc[:, 0]], V[Fc[:, 2]] - V[Fc[:, 0]])
    flip = (fn_ * N[Fc].mean(1)).sum(1) < 0
    Fc[flip] = Fc[flip][:, [0, 2, 1]]
    return V, Fc, N, raw

def drop_small_components(V, F, min_faces=60):
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    nv = len(V); e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]]])
    A = coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(nv, nv))
    nc, lab = connected_components(A, directed=False)
    fl = lab[F[:, 0]]; cnt = np.bincount(fl, minlength=nc)
    keep = cnt[fl] >= min_faces; F = F[keep]
    used, inv = np.unique(F, return_inverse=True)
    return V[used], inv.reshape(-1, 3).astype(np.uint32)

# ============================================================ GLB
def hex2lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c]

def to_yup(v): return np.stack([v[:, 0], v[:, 2], -v[:, 1]], 1).astype(F32)

def write_glb(path, meshes, name):
    """meshes: lista de dict(name, V, F, N, color, rough, metal)"""
    mats, views, accs, gm, nodes = [], [], [], [], []
    buf = bytearray()
    def view(data, target):
        while len(buf) % 4: buf.append(0)
        off = len(buf); buf.extend(data); views.append({"buffer": 0, "byteOffset": off, "byteLength": len(data), "target": target}); return len(views) - 1
    for m in meshes:
        mats.append({"name": m['name'], "doubleSided": True, "pbrMetallicRoughness": {
            "baseColorFactor": hex2lin(m['color']) + [1.0], "metallicFactor": m.get('metal', 0.0), "roughnessFactor": m.get('rough', 0.9)}})
        V = to_yup(m['V']); N = to_yup(m['N']); I = np.ascontiguousarray(m['F'], np.uint32).ravel()
        a = len(accs)
        accs += [{"bufferView": view(V.tobytes(), 34962), "componentType": 5126, "count": len(V), "type": "VEC3", "min": V.min(0).tolist(), "max": V.max(0).tolist()},
                 {"bufferView": view(N.tobytes(), 34962), "componentType": 5126, "count": len(N), "type": "VEC3"},
                 {"bufferView": view(I.tobytes(), 34963), "componentType": 5125, "count": len(I), "type": "SCALAR"}]
        gm.append({"name": m['name'], "primitives": [{"attributes": {"POSITION": a, "NORMAL": a + 1}, "indices": a + 2, "material": len(mats) - 1}]})
        nodes.append({"name": m['name'], "mesh": len(gm) - 1})
    nodes.append({"name": name, "children": list(range(len(gm)))})
    while len(buf) % 4: buf.append(0)
    js = json.dumps({"asset": {"version": "2.0", "generator": "garment-sdf (Claude)"}, "scene": 0,
                     "scenes": [{"name": name, "nodes": [len(nodes) - 1]}], "nodes": nodes, "meshes": gm, "materials": mats,
                     "accessors": accs, "bufferViews": views, "buffers": [{"byteLength": len(buf)}]}, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(buf)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(buf), 0x004E4942)); f.write(bytes(buf))

def taubin(V, F, it=4, lam=0.5, mu=-0.53):
    from scipy.sparse import coo_matrix, diags
    n = len(V); e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]); e = np.concatenate([e, e[:, ::-1]])
    A = coo_matrix((np.ones(len(e), F32), (e[:, 0], e[:, 1])), shape=(n, n)).tocsr(); A.data[:] = 1
    deg = np.asarray(A.sum(1)).ravel(); Dinv = diags(1 / np.maximum(deg, 1))
    L = Dinv @ A
    V = V.astype(np.float64)
    for _ in range(it):
        V = V + lam * (L @ V - V)
        V = V + mu * (L @ V - V)
    return V.astype(F32)
