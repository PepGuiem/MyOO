"""Extracción de prendas: superficie media del tejido + recorte preciso + engrosado (solidify)."""
import numpy as np
from skimage.measure import marching_cubes
from core import F32, eval_grid, simplify, taubin, drop_small_components, _meshopt
import ctypes

def comp_eval(item, i, P):
    return item(P)[i]

def field_of(c):
    return np.maximum(c[1], c[2]) if c[0] == 'shell' else c[1]

def combined_sdf(item):
    def f(P):
        d = None
        for c in item(P):
            v = np.maximum(np.abs(c[1]) - c[3] / 2, c[2]) if c[0] == 'shell' else c[1]
            d = v if d is None else np.minimum(d, v)
        return d.astype(F32)
    return f

def grad(fun, V, h=0.0008):
    g = np.zeros_like(V)
    for k in range(3):
        o = np.zeros(3, F32); o[k] = h
        g[:, k] = (fun(V + o) - fun(V - o)) / (2 * h)
    return g

def boundary_edges(F):
    e = np.sort(np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), axis=1)
    u, c = np.unique(e, axis=0, return_counts=True)
    return u[c == 1]

def _edges_directed(F):
    """Aristas de borde con la orientación de su triángulo."""
    E = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    key = np.sort(E, axis=1)
    u, inv, c = np.unique(key, axis=0, return_inverse=True, return_counts=True)
    return E[c[inv] == 1]

def project(fun, V, it=3, maxstep=0.003):
    for _ in range(it):
        f = fun(V); g = grad(fun, V); g2 = np.maximum((g * g).sum(1), 1e-6)
        step = (f / g2)[:, None] * g
        n = np.linalg.norm(step, axis=1, keepdims=True)
        step = step * np.minimum(1.0, maxstep / np.maximum(n, 1e-12))   # nunca saltos grandes
        V = V - step
    return V.astype(F32)

def extract_shell(item, i, lo, hi, h, target):
    fnF = lambda P: field_of(item(P)[i])
    G, lo_ = eval_grid(fnF, lo, hi, h)
    V, Fc, _, _ = marching_cubes(G, 0.0, spacing=(h, h, h), allow_degenerate=False)
    V = (V + lo_).astype(F32); Fc = Fc.astype(np.uint32)
    comp = lambda P: item(P)[i]
    c = comp(V); f, R = c[1], c[2]
    # quedarse con las caras sobre el tejido (f≈0), descartar las tapas del recorte
    keep = f[Fc].mean(1) > -0.35 * h
    Fc = Fc[keep]
    V, Fc = drop_small_components(V, Fc, 40)
    ff = lambda P: item(P)[i][1]; RR = lambda P: item(P)[i][2]
    # suavizado + reproyección del interior sobre la superficie media
    for rnd in range(2):
        B = np.unique(boundary_edges(Fc))
        V2 = taubin(V, Fc, 3)
        mask = np.ones(len(V), bool); mask[B] = False
        V[mask] = V2[mask]
        V[mask] = project(ff, V[mask], 1)
    # bordes: alisar a lo largo de la línea de corte y proyectar sobre ambas superficies
    be = boundary_edges(Fc)
    if len(be):
        nb = {}
        for a, b in be:
            nb.setdefault(a, []).append(b); nb.setdefault(b, []).append(a)
        idx = np.array(list(nb.keys()))
        nbr = np.array([(nb[k] + nb[k])[:2] for k in idx])
        P0 = V[idx].copy()
        for rnd in range(4):
            P = V[idx]
            P = 0.5 * P + 0.25 * (V[nbr[:, 0]] + V[nbr[:, 1]])
            for _ in range(3):
                P = project(ff, P, 1, maxstep=h); P = project(RR, P, 1, maxstep=h)
            far = np.linalg.norm(P - P0, axis=1) > 4.0 * h      # vértice que se escapa: se queda donde estaba
            P[far] = P0[far]
            V[idx] = P
        # quitar picos: un vértice de borde muy separado de sus vecinos vuelve a la línea del borde
        for _ in range(8):
            mid = 0.5 * (V[nbr[:, 0]] + V[nbr[:, 1]])
            dev = np.linalg.norm(V[idx] - mid, axis=1)
            bad = dev > 1.2 * h
            if not bad.any(): break
            V[idx[bad]] = mid[bad]
    N = grad(ff, V); N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    raw = len(Fc)
    if target and len(Fc) > target:
        V, Fc, N = simplify_lock(V, Fc, N, target)
        N = grad(ff, V); N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    fn_ = np.cross(V[Fc[:, 1]] - V[Fc[:, 0]], V[Fc[:, 2]] - V[Fc[:, 0]])
    flip = (fn_ * N[Fc].mean(1)).sum(1) < 0; Fc[flip] = Fc[flip][:, [0, 2, 1]]
    th = item(V)[i][3]
    return solidify(V, Fc, N.astype(F32), th, RR), raw

def simplify_lock(V, F, N, target, err=0.0005):
    lib = _meshopt()
    V = np.ascontiguousarray(V, F32); N = np.ascontiguousarray(N, F32); I = np.ascontiguousarray(F.ravel(), np.uint32)
    dst = np.empty_like(I); w = np.array([0.35, 0.35, 0.35], F32); rerr = ctypes.c_float()
    n = lib.meshopt_simplifyWithAttributes(dst.ctypes.data, I.ctypes.data, len(I), V.ctypes.data, len(V), 12,
                                           N.ctypes.data, 12, w.ctypes.data, 3, None, target * 3, err, (1 << 0) | (1 << 2), ctypes.byref(rerr))
    dst = dst[:n]
    used, inv = np.unique(dst, return_inverse=True)
    return V[used], inv.reshape(-1, 3).astype(np.uint32), N[used]

def solidify(V, F, N, th, RR):
    """Engrosa la superficie media: cara exterior, interior y canto en los bordes."""
    th = np.asarray(th, F32)[:, None]
    Vo = V + N * th / 2; Vi = V - N * th / 2
    n = len(V)
    verts = [Vo, Vi]; norms = [N, -N]; faces = [F, F[:, [0, 2, 1]] + n]
    E = _edges_directed(F)
    if len(E):
        # normal del canto: hacia fuera del recorte, en el plano tangente
        bv = np.unique(E)
        gR = grad(RR, V[bv]); gR -= (gR * N[bv]).sum(1, keepdims=True) * N[bv]
        gR /= np.maximum(np.linalg.norm(gR, axis=1, keepdims=True), 1e-9)
        rimN = np.zeros_like(V); rimN[bv] = gR
        base = 2 * n
        # anillo de 3 filas: exterior, centro abombado, interior (canto redondeado)
        Vmid = V + rimN * (th * 0.45)
        rows = [Vo, Vmid, Vi]
        rown = [N * 0.6 + rimN * 0.8, rimN, -N * 0.6 + rimN * 0.8]
        for k in range(3):
            nn = rown[k] / np.maximum(np.linalg.norm(rown[k], axis=1, keepdims=True), 1e-9)
            verts.append(rows[k][bv]); norms.append(nn[bv])
        remap = -np.ones(n, np.int64); remap[bv] = np.arange(len(bv))
        m = len(bv)
        a = remap[E[:, 0]]; b = remap[E[:, 1]]
        rf = []
        for k in range(2):
            r0 = base + k * m; r1 = base + (k + 1) * m
            rf.append(np.stack([r0 + b, r0 + a, r1 + a], 1)); rf.append(np.stack([r0 + b, r1 + a, r1 + b], 1))
        faces.append(np.concatenate(rf))
    Vall = np.concatenate(verts).astype(F32); Nall = np.concatenate(norms).astype(F32)
    Fall = np.concatenate(faces).astype(np.uint32)
    # orientar el canto según su normal
    fn_ = np.cross(Vall[Fall[:, 1]] - Vall[Fall[:, 0]], Vall[Fall[:, 2]] - Vall[Fall[:, 0]])
    flip = (fn_ * Nall[Fall].mean(1)).sum(1) < 0; Fall[flip] = Fall[flip][:, [0, 2, 1]]
    return Vall, Fall, Nall

def extract_solid(item, i, lo, hi, h, target):
    fn = lambda P: item(P)[i][1]
    G, lo_ = eval_grid(fn, lo, hi, h)
    if G.min() > 0: return None, 0
    V, Fc, _, _ = marching_cubes(G, 0.0, spacing=(h, h, h), allow_degenerate=False)
    V = (V + lo_).astype(F32); Fc = Fc.astype(np.uint32)
    V = taubin(V, Fc, 3)
    N = grad(fn, V); N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    raw = len(Fc)
    if target and len(Fc) > target:
        V, Fc, N = simplify_lock(V, Fc, N, target)
        N = grad(fn, V); N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    fn_ = np.cross(V[Fc[:, 1]] - V[Fc[:, 0]], V[Fc[:, 2]] - V[Fc[:, 0]])
    flip = (fn_ * N[Fc].mean(1)).sum(1) < 0; Fc[flip] = Fc[flip][:, [0, 2, 1]]
    return (V, Fc, N.astype(F32)), raw

def build(item, lo, hi, h=0.003, target=120000):
    probe = item(np.zeros((1, 3), F32))
    parts = []; raw = 0
    for i, c in enumerate(probe):
        if c[0] == 'shell':
            m, r = extract_shell(item, i, lo, hi, h, target)
        else:
            blo, bhi = c[2] if len(c) > 2 else (lo, hi)
            m, r = extract_solid(item, i, blo, bhi, 0.0011, 6000)
        if m is not None: parts.append(m); raw += r
    V = []; F = []; N = []; off = 0
    for (v, f, n) in parts:
        V.append(v); F.append(f + off); N.append(n); off += len(v)
    return np.concatenate(V), np.concatenate(F), np.concatenate(N), raw
