"""Herramientas de confección sobre SDF: coordenadas de brazo/pierna, pliegues, costuras, cortes, parches."""
import numpy as np, math
from core import *

def limb_coords(P, pts):
    """Coordenada longitudinal acumulada a lo largo de una cadena de segmentos, y ángulo alrededor."""
    pts = [np.asarray(p, F32) for p in pts]
    seg_len = [np.linalg.norm(b - a) for a, b in zip(pts[:-1], pts[1:])]
    u = np.zeros(len(P), F32); ang = np.zeros(len(P), F32); best = np.full(len(P), np.inf, F32)
    acc = 0.0
    for i, (a, b) in enumerate(zip(pts[:-1], pts[1:])):
        d = (b - a) / seg_len[i]; t = (P - a) @ d
        tc = np.clip(t, 0 if i > 0 else -1, seg_len[i] if i < len(pts) - 2 else 9)
        r = P - a - np.outer(tc, d); dist = np.linalg.norm(r, axis=1)
        e1, e2 = frame(d)
        m = dist < best
        u = np.where(m, acc + tc, u); ang = np.where(m, np.arctan2(r @ e2, r @ e1), ang); best = np.where(m, dist, best)
        acc += seg_len[i]
    return u, ang, best

class Gar:
    """Acumula: desplazamiento de superficie (o), grosor (th) y región permitida (R<0 dentro)."""
    def __init__(s, P, body, base_fn='upper', th=0.0045):
        s.P = P; s.b = body
        s.x, s.y, s.z = P[:, 0], P[:, 1], P[:, 2]
        s.base = getattr(body, base_fn)(P) if isinstance(base_fn, str) else base_fn(P)
        s.o = np.zeros(len(P), F32); s.th = np.full(len(P), th, F32); s.R = np.full(len(P), -1.0, F32)
        s._arm = {}; s._leg = {}
        s.theta = np.arctan2(s.y, s.x)

    # ---------- coordenadas
    def arm(s, side):
        if side not in s._arm:
            S, E, W = s.b.arm[side]; W2 = W + (W - E) / np.linalg.norm(W - E) * 0.2
            u, a, dist = limb_coords(s.P, [S, E, W2])
            w = sstep(0.03, -0.03, s.b.arm_d(s.P, side) - s.b.torso(s.P))
            s._arm[side] = (u, a, w)
        return s._arm[side]

    def leg(s, side):
        if side not in s._leg:
            H, K, C, A = s.b.leg[side]
            u, a, dist = limb_coords(s.P, [H, K, C, A + np.array([0, 0, -0.15], F32)])
            w = sstep(0.0, 0.02, s.x * side)  # mitad del lado
            s._leg[side] = (u, a, w)
        return s._leg[side]

    # ---------- cortes
    def keep(s, r): s.R = np.maximum(s.R, r)        # r<0 = se conserva
    def cut_below(s, z0, wave=0.0, wfreq=6, curve=None):
        z0 = z0 + wave * noise(s.P * [1, 1, 0], wfreq, 3)
        if curve is not None: z0 = z0 + curve(s)
        s.keep(z0 - s.z); s._hem = s.z - z0
        return s.z - z0
    def cut_above(s, z1):
        s.keep(s.z - z1); return z1 - s.z
    def cut_neck(s, a=0.094, b=0.092, z_back=1.475, z_front=1.43, yoff=0.006):
        tube = 0.058 + s.b.ease + 0.012          # el escote siempre más ancho que el tubo del cuello
        a = max(a, tube); b = max(b, tube - 0.002)
        q = np.sqrt((s.x / a) ** 2 + ((s.y - yoff) / b) ** 2)
        t = np.clip((s.y - yoff) / b, -1, 1)
        zn = z_back + (z_front - z_back) * np.clip(-t, 0, 1) ** 1.6 + (z_back - 0.005 - z_back) * (1 - np.abs(t))
        e = np.maximum((q - 1) * min(a, b), zn - s.z)
        s.keep(-e); s.keep(s.z - 1.53 - 2.0 * np.maximum(0, np.sqrt(s.x ** 2 + s.y ** 2) - 0.115)); return -e        # distancia positiva dentro de la prenda respecto al escote
    def cut_sleeve(s, L, side=None, angle_cut=0.0):
        out = np.ones(len(s.P), F32)
        for sd in ((1, -1) if side is None else (side,)):
            u, a, w = s.arm(sd)
            r = np.where(w > 0.5, u - L, -1.0)
            s.keep(r); out = np.where(w > 0.5, L - u, out)
        return out
    def cut_front_open(s, gap=0.0, z_from=0.0):
        """Abre la prenda por delante (chaquetas, camisas abiertas)."""
        r = np.where((s.y < 0) & (s.z > z_from), gap / 2 - np.abs(s.x), -1.0)
        s.keep(r); return np.abs(s.x) - gap / 2

    # ---------- relieve
    def fold_sleeve(s, amp, wl=0.05, start=0.06, end=None, seed=1, stack_at=None, stack_amp=0.0):
        for sd in (1, -1):
            u, a, w = s.arm(sd)
            n1 = noise(s.P, 7, seed + sd); n2 = noise(s.P, 4, seed + 5 + sd)
            phase = 2 * np.pi * u / wl + 3.2 * n1 + 1.2 * np.sin(a)
            ridge = (1 - np.abs(np.sin(phase))) ** 2 - 0.4
            A = amp * sstep(start, start + 0.05, u) * (0.45 + 0.75 * (0.5 + 0.5 * n2))
            if end is not None: A = A * sstep(end, end - 0.03, u)
            if stack_at is not None:
                A = A + stack_amp * sstep(stack_at - 0.12, stack_at - 0.01, u) * sstep(stack_at + 0.005, stack_at - 0.02, u)
            s.o += w * A * ridge

    def fold_torso_drape(s, amp, z_top=1.25, z_bot=0.80, n=7, seed=2):
        n1 = noise(s.P, 5, seed)
        A = amp * sstep(z_top, z_bot, s.z) * (0.55 + 0.45 * noise(s.P, 3, seed + 3))
        s.o += A * np.cos(n * s.theta + 2.5 * n1 + 0.8 * np.sin(3 * s.theta)) * s._not_arm()

    def fold_horizontal(s, amp, z0, z1, wl=0.035, seed=4, member=None):
        n1 = noise(s.P, 6, seed)
        ph = 2 * np.pi * s.z / wl + 3.0 * n1 + 1.5 * np.sin(2 * s.theta)
        A = amp * sstep(z0, z0 + 0.03, s.z) * sstep(z1, z1 - 0.03, s.z) * (0.5 + 0.5 * noise(s.P, 4, seed + 1))
        m = s._not_arm() if member is None else member
        s.o += A * ((1 - np.abs(np.sin(ph))) ** 2 - 0.4) * m

    def fold_leg(s, amp, wl=0.06, start=0.2, end=None, seed=6, knee=0.0, stack_at=None, stack_amp=0.0, stack_len=0.14):
        for sd in (1, -1):
            u, a, w = s.leg(sd)
            n1 = noise(s.P, 6, seed + sd); n2 = noise(s.P, 3.5, seed + 3 + sd)
            phase = 2 * np.pi * u / wl + 3.5 * n1 + 1.4 * np.sin(a + sd)
            ridge = (1 - np.abs(np.sin(phase))) ** 2 - 0.4
            A = amp * sstep(start, start + 0.06, u) * (0.4 + 0.8 * (0.5 + 0.5 * n2))
            if end is not None: A = A * sstep(end, end - 0.04, u)
            A = A + knee * np.exp(-((u - 0.36) / 0.05) ** 2) * (0.5 + 0.5 * n2)
            if stack_at is not None:
                A = A + stack_amp * sstep(stack_at - stack_len, stack_at - 0.01, u) * sstep(stack_at + 0.005, stack_at - 0.015, u)
            s.o += w * A * ridge

    def ridged(s, a, b, c, seed=0):
        Q = np.stack([a, b, c], 1).astype(F32)
        n = noise(Q, 1.0, seed)
        return (1 - np.abs(n)) ** 3

    def folds_sleeve(s, amp, fu=22, fa=1.4, start=0.05, end=None, seed=11, stack_at=None, stack_amp=0.0):
        for sd in (1, -1):
            u, a, w = s.arm(sd)
            r = s.ridged(u * fu, np.cos(a) * fa, np.sin(a) * fa, seed + sd) - 0.25
            r2 = s.ridged(u * fu * 0.6 + 3.1, np.cos(a + 1) * fa * 1.6, np.sin(a + 1) * fa * 1.6, seed + 7 + sd) - 0.25
            A = amp * sstep(start, start + 0.05, u)
            if end is not None: A = A * sstep(end, end - 0.03, u)
            if stack_at is not None:
                A = A + stack_amp * sstep(stack_at - 0.13, stack_at - 0.02, u) * sstep(stack_at + 0.005, stack_at - 0.02, u)
            s.o += w * A * (r + 0.6 * r2)

    def folds_torso(s, amp, z_top=1.25, z_bot=0.80, fa=2.2, fz=3.0, seed=12, member=None):
        th = s.theta
        r = s.ridged(np.cos(th) * fa, np.sin(th) * fa, s.z * fz, seed) - 0.25
        A = amp * sstep(z_top, z_top - 0.12, s.z) * sstep(z_bot - 0.05, z_bot + 0.05, s.z)
        m = s._not_arm() if member is None else member
        s.o += A * r * m

    def folds_legs(s, amp, fu=9, fa=1.3, start=0.15, end=None, seed=21, knee=0.0, stack_at=None, stack_amp=0.0, stack_len=0.15, stack_fu=26):
        for sd in (1, -1):
            u, a, w = s.leg(sd)
            r = s.ridged(u * fu, np.cos(a) * fa, np.sin(a) * fa, seed + sd) - 0.25
            A = amp * sstep(start, start + 0.06, u)
            if end is not None: A = A * sstep(end, end - 0.04, u)
            A = A + knee * np.exp(-((u - 0.37) / 0.06) ** 2)
            s.o += w * A * r
            if stack_at is not None:
                r2 = s.ridged(u * stack_fu, np.cos(a) * 1.2, np.sin(a) * 1.2, seed + 9 + sd) - 0.2
                S = stack_amp * sstep(stack_at - stack_len, stack_at - stack_len + 0.05, u) * sstep(stack_at + 0.005, stack_at - 0.015, u)
                s.o += w * S * r2

    def wobble(s, amp=0.0012, freq=9, seed=9):
        s.o += amp * fbm(s.P, freq, 2, seed)

    def _not_arm(s):
        w = np.zeros(len(s.P), F32)
        if hasattr(s.b, 'arm'):
            for sd in (1, -1):
                if sd in s._arm: w = np.maximum(w, s._arm[sd][2])
        return 1 - w

    # ---------- costuras y bordes
    def groove(s, dist, depth=0.0013, width=0.0031, mask=1.0):
        s.o -= depth * np.exp(-(dist / width) ** 2) * mask
    def ridge(s, dist, height=0.001, width=0.0025, mask=1.0):
        s.o += height * np.exp(-(dist / width) ** 2) * mask
    def side_seams(s, zmin=0.0, xmin=0.11):
        m = sstep(xmin - 0.02, xmin, np.abs(s.x)) * (s.z > zmin) * s._not_arm()
        s.groove(s.y - 0.004, mask=m)
    def armhole_seams(s, at=0.045):
        for sd in (1, -1):
            u, a, w = s.arm(sd)
            s.groove(u - at, mask=sstep(0.2, 0.6, w) + 0 * u)
    def hem(s, dist_in, stitch=0.02, roll=0.0016, band=0.012):
        """dist_in: distancia (positiva) desde el borde hacia dentro de la prenda."""
        s.th += roll * sstep(band, 0.0, dist_in)
        s.o += roll * 0.5 * sstep(band, 0.0, dist_in)
        s.groove(dist_in - stitch, depth=0.0009, width=0.0018)
    def band(s, dist_in, width, raise_=0.0018, ribs=0, ang=None, rib_amp=0.0007):
        m = sstep(width + 0.002, width - 0.002, dist_in) * (dist_in > -0.01)
        s.o += raise_ * m; s.th += raise_ * 0.6 * m
        if ribs and ang is not None: s.o += rib_amp * np.cos(ribs * ang) * m
        s.groove(dist_in - width, depth=0.0012, width=0.0022)
        return m

    # ---------- parches (bolsillos, refuerzos) en proyección frontal/lateral
    def patch_xz(s, poly_fn, front=True, lift=0.0035, puff=0.0015, stitch=0.004):
        """poly_fn(x,z)->distancia firmada 2D al contorno (negativa dentro)."""
        d2 = poly_fn(s.x, s.z)
        side = (sstep(0.025, -0.025, s.y) if front else sstep(-0.025, 0.025, s.y))
        inside = sstep(0.0015, -0.0015, d2) * side
        s.o += inside * (lift + puff * sstep(0, -0.03, d2))
        s.groove(d2 + stitch, depth=0.0007, width=0.0016, mask=side * (d2 < 0))
        s.groove(d2, depth=0.0009, width=0.0018, mask=side)
        return d2

    def bump(s, center, r, h, mask=1.0):
        d = np.linalg.norm(s.P - np.asarray(center, F32), axis=1)
        s.o += h * np.clip(1 - (d / r) ** 2, 0, 1) ** 0.5 * mask

    def layer(s):
        return ('shell', (s.base - s.o).astype(F32), s.R.astype(F32), s.th.astype(F32))

    def sdf(s):
        shell = np.abs(s.base - s.o) - s.th / 2
        return smax(shell, s.R, 0.0012).astype(F32)

def rrect(cx, cz, w, h, r=0.01):
    def f(x, z):
        qx = np.abs(x - cx) - w / 2 + r; qz = np.abs(z - cz) - h / 2 + r
        return np.minimum(np.maximum(qx, qz), 0) + np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qz, 0) ** 2) - r
    return f

def capsule_pts(P, pts, r):
    d = np.full(len(P), np.inf, F32)
    pts = [np.asarray(p, F32) for p in pts]
    rs = np.broadcast_to(np.asarray(r, F32), (len(pts),))
    for i in range(len(pts) - 1):
        d = np.minimum(d, round_cone(P, pts[i], pts[i + 1], float(rs[i]), float(rs[i + 1])))
    return d

# ======================================================================== extras
def head_d(P, e=0.0, back=0.0, peak=0.0):
    c = np.array([0, 0.016, 1.655], F32); r = np.array([0.083 + e, 0.100 + e + back, 0.118 + e], F32)
    Q = (P - c) / r
    # capucha algo apuntada arriba/atrás
    Q[:, 1] -= peak * np.clip((P[:, 2] - 1.66) / 0.12, 0, 1) * np.clip((P[:, 1] - 0.0) / 0.1, 0, 1)
    k = np.linalg.norm(Q, axis=1)
    return ((k - 1) * r.min()).astype(F32)

def _g_blend(s, other, m):
    s.base = (s.base * (1 - m) + other * m).astype(F32)
Gar.blend = _g_blend

def _patch_limb(s, kind, sides, cu, ca, w, h, r=0.01, lift=0.0035, puff=0.002, stitch=0.004):
    """Parche en coordenadas de miembro: cu = posición a lo largo, ca = ángulo (rad) desde el exterior."""
    d_all = np.full(len(s.P), 1.0, F32)
    for sd in sides:
        u, a, wm = (s.arm(sd) if kind == 'arm' else s.leg(sd))
        out = sd * np.pi / 2
        ang = np.angle(np.exp(1j * (a - out - ca * sd)))
        rad = 0.075 if kind == 'leg' else 0.05
        f = rrect(0, cu, w, h, r)
        d2 = f(ang * rad, u)
        m = (wm > 0.5) if kind == 'arm' else (s.x * sd > 0)
        d2 = np.where(m, d2, 1.0).astype(F32)
        inside = sstep(0.0015, -0.0015, d2)
        s.o += inside * (lift + puff * sstep(0, -0.03, d2))
        s.groove(d2 + stitch, depth=0.0007, width=0.0016, mask=(d2 < 0))
        s.groove(d2, depth=0.0009, width=0.0018)
        d_all = np.minimum(d_all, d2)
    return d_all
Gar.patch_limb = _patch_limb

def _cut_leg(s, L):
    out = np.ones(len(s.P), F32)
    for sd in (1, -1):
        u, a, w = s.leg(sd); m = (s.x * sd >= 0)
        s.keep(np.where(m, u - L, -1.0)); out = np.where(m, L - u, out)
    return out
Gar.cut_leg = _cut_leg

def _armhole(s, depth=0.0):
    """Sisa sin manga: corta el brazo con un plano inclinado cerca del hombro."""
    out = np.ones(len(s.P), F32)
    for sd in (1, -1):
        S, E, W = s.b.arm[sd]
        n = np.array([sd * 0.93, 0, 0.37], F32); n /= np.linalg.norm(n)
        c = S + np.array([-sd * 0.035, 0, -0.03 - depth], F32)
        dd = (s.P - c) @ n
        m = (s.x * sd > 0)
        s.keep(np.where(m, dd, -1.0)); out = np.where(m, -dd, out)
    return out
Gar.cut_armhole = _armhole

def _gather(s, mask, amp=0.0015, n=9, fz=6, seed=31, ang=None):
    a = s.theta if ang is None else ang
    r = s.ridged(np.cos(a) * n, np.sin(a) * n, s.z * fz, seed) - 0.25
    s.o += amp * r * mask
Gar.gather = _gather

def _drag(s, amp=0.004, seed=41):
    """Pliegues de arrastre que salen de las axilas hacia el pecho y la espalda."""
    for sd in (1, -1):
        c = np.array([sd * 0.17, 0, 1.30], F32)
        dx = (s.x - c[0]) * sd; dz = s.z - c[2]
        rho = np.sqrt(dx * dx + dz * dz); psi = np.arctan2(dz, -dx)
        r = s.ridged(np.cos(psi) * 5, np.sin(psi) * 5, rho * 4 + (s.y > 0) * 7.0, seed + sd) - 0.3
        A = amp * sstep(0.02, 0.06, rho) * sstep(0.24, 0.10, rho) * sstep(0.0, 0.05, -dz + 0.04) * (s.x * sd > -0.02)
        s.o += A * r * s._not_arm()
Gar.drag = _drag

def find_surface_y(fn, x, z, front=True, span=0.35, n=1400):
    """Primer punto de la prenda al avanzar desde fuera (delante o detrás) hacia el centro."""
    ys = (np.linspace(-span, 0, n) if front else np.linspace(span, 0, n)).astype(F32)
    P = np.stack([np.full(n, x, F32), ys, np.full(n, z, F32)], 1)
    idx = np.where(fn(P) < 0)[0]
    return None if len(idx) == 0 else float(ys[idx[0]])

def sd_poly(x, z, pts):
    """Distancia firmada 2D a un polígono (iq), vectorizada."""
    pts = np.asarray(pts, F32); n = len(pts)
    px, pz = x, z
    d = (px - pts[0, 0]) ** 2 + (pz - pts[0, 1]) ** 2; s = np.ones_like(px)
    j = n - 1
    for i in range(n):
        ex, ez = pts[j, 0] - pts[i, 0], pts[j, 1] - pts[i, 1]
        wx, wz = px - pts[i, 0], pz - pts[i, 1]
        t = np.clip((wx * ex + wz * ez) / (ex * ex + ez * ez), 0, 1)
        bx, bz = wx - ex * t, wz - ez * t
        d = np.minimum(d, bx * bx + bz * bz)
        c1 = pz >= pts[i, 1]; c2 = pz < pts[j, 1]; c3 = ex * wz > ez * wx
        flip = (c1 & c2 & c3) | (~c1 & ~c2 & ~c3)
        s = np.where(flip, -s, s); j = i
    return (s * np.sqrt(d)).astype(F32)

def bump_xz(s, cx, cz, R, h, front=True):
    r = np.sqrt((s.x - cx) ** 2 + (s.z - cz) ** 2)
    m = (sstep(0.025, -0.025, s.y) if front else sstep(-0.025, 0.025, s.y))
    s.o += h * np.sqrt(np.clip(1 - (r / R) ** 2, 0, 1)) * m
Gar.bump_xz = bump_xz

def line_groove(s, p0, p1, front=True, depth=0.0011, width=0.002):
    p0 = np.asarray(p0, F32); p1 = np.asarray(p1, F32); e = p1 - p0
    wx, wz = s.x - p0[0], s.z - p0[1]
    t = np.clip((wx * e[0] + wz * e[1]) / (e @ e), 0, 1)
    d = np.sqrt((wx - e[0] * t) ** 2 + (wz - e[1] * t) ** 2)
    m = (sstep(0.025, -0.025, s.y) if front else sstep(-0.025, 0.025, s.y))
    s.groove(d, depth, width, mask=m)
Gar.line_groove = line_groove

def cord_sdf(P, pts, r):
    return capsule_pts(P, pts, r)

def ribbed_band(s, dist_in, width, ang, ribs, amp=0.001, raise_=0.002):
    m = s.band(dist_in, width, raise_=raise_)
    s.o += amp * np.cos(ribs * ang) * m
    return m
Gar.ribbed = ribbed_band

# ======================================================================== pliegues trazados
def _fold_profile(t, w):
    # cresta con sombra a ambos lados (perfil típico de un pliegue de tela)
    return np.exp(-(t / w) ** 2) - 0.35 * np.exp(-(t / (2.2 * w)) ** 2)

def _sleeve_strokes(s, n=8, u0=0.06, u1=None, amp=0.006, w=0.008, seed=1, side_list=(1, -1), dense_at=None, dense_n=0, dense_len=0.1):
    rng = np.random.default_rng(seed)
    for sd in side_list:
        u, a, wm = s.arm(sd)
        U1 = u1
        strokes = []
        for i in range(n):
            strokes.append((rng.uniform(u0, U1), rng.uniform(-np.pi, np.pi), rng.uniform(0.7, 1.9), rng.uniform(-0.02, 0.02), amp * rng.uniform(0.5, 1.1), w * rng.uniform(0.8, 1.4)))
        if dense_at is not None:
            for i in range(dense_n):
                strokes.append((dense_at - dense_len * (i + rng.uniform(0, 0.6)) / dense_n, rng.uniform(-np.pi, np.pi), rng.uniform(1.0, 2.6),
                                rng.uniform(-0.012, 0.012), amp * rng.uniform(0.8, 1.3), w * rng.uniform(0.85, 1.15)))
        acc = np.zeros(len(s.P), F32)
        for (ui, ai, span, tilt, A, ww) in strokes:
            da = np.angle(np.exp(1j * (a - ai)))
            t = u - ui - tilt * np.sin(a - ai)
            taper = sstep(1.0, 0.55, np.abs(da) / span)
            acc += min(A, 0.6 * ww) * taper * _fold_profile(t, ww)
        s.o += acc * (wm > 0.5) * sstep(0.02, 0.06, u)
Gar.sleeve_strokes = _sleeve_strokes

def _leg_strokes(s, n=7, u0=0.15, u1=0.7, amp=0.006, w=0.009, seed=3, dense_at=None, dense_n=0, dense_len=0.12, knee_n=0):
    rng = np.random.default_rng(seed)
    for sd in (1, -1):
        u, a, wm = s.leg(sd)
        strokes = [(rng.uniform(u0, u1), rng.uniform(-np.pi, np.pi), rng.uniform(0.6, 1.6), rng.uniform(-0.03, 0.03), amp * rng.uniform(0.5, 1.1), w * rng.uniform(0.8, 1.4)) for _ in range(n)]
        for i in range(knee_n):
            strokes.append((0.33 + 0.1 * rng.uniform(), -sd * np.pi / 2 + rng.uniform(-0.3, 0.3) - np.pi * 0 , rng.uniform(0.8, 1.4), rng.uniform(-0.02, 0.02), amp * 0.9, w))
        if dense_at is not None:
            for i in range(dense_n):
                strokes.append((dense_at - dense_len * (i + rng.uniform(0, 0.7)) / dense_n, rng.uniform(-np.pi, np.pi), rng.uniform(1.0, 2.8),
                                rng.uniform(-0.015, 0.015), amp * rng.uniform(0.9, 1.4), w * rng.uniform(0.85, 1.15)))
        acc = np.zeros(len(s.P), F32)
        for (ui, ai, span, tilt, A, ww) in strokes:
            da = np.angle(np.exp(1j * (a - ai)))
            t = u - ui - tilt * np.sin(a - ai)
            acc += min(A, 0.6 * ww) * sstep(1.0, 0.55, np.abs(da) / span) * _fold_profile(t, ww)
        s.o += acc * (s.x * sd > 0) * sstep(0.03, 0.08, u)
Gar.leg_strokes = _leg_strokes

def _drape_strokes(s, n=9, z_top=1.20, z_bot=0.78, amp=0.007, w=0.012, seed=5, member=None):
    """Caídas verticales que nacen bajo el pecho y se abren hacia el bajo."""
    rng = np.random.default_rng(seed)
    acc = np.zeros(len(s.P), F32)
    r = np.sqrt(s.x ** 2 + s.y ** 2)
    for i in range(n):
        th0 = rng.uniform(-np.pi, np.pi); zt = rng.uniform(z_top - 0.08, z_top + 0.04)
        drift = rng.uniform(-0.15, 0.15); A = amp * rng.uniform(0.5, 1.2); ww = w * rng.uniform(0.8, 1.5)
        th = th0 + drift * (zt - s.z)
        t = r * np.angle(np.exp(1j * (s.theta - th)))
        L = sstep(zt, zt - 0.10, s.z) * sstep(z_bot - 0.06, z_bot + 0.02, s.z)
        widen = 1 + 1.2 * np.clip((zt - s.z) / 0.4, 0, 1)
        acc += A * L * _fold_profile(t, ww * widen)
    m = s._not_arm() if member is None else member
    s.o += acc * m
Gar.drape_strokes = _drape_strokes

def _drag_strokes(s, n=4, amp=0.006, w=0.007, seed=9, length=(0.10, 0.20)):
    """Pliegues de arrastre en diagonal desde la axila hacia el centro del pecho y la espalda."""
    rng = np.random.default_rng(seed)
    acc = np.zeros(len(s.P), F32)
    for sd in (1, -1):
        for back in (False, True):
            for i in range(n):
                p0 = np.array([sd * rng.uniform(0.155, 0.18), rng.uniform(1.26, 1.34)])
                ang = np.radians(rng.uniform(195, 245)); L = rng.uniform(*length)
                p1 = p0 + L * np.array([np.cos(ang) * sd * -1 * -1, np.sin(ang)]) * np.array([-sd if sd > 0 else 1, 1]) * 0
                dirv = np.array([-sd * abs(np.cos(ang)), np.sin(ang)])
                p1 = p0 + L * dirv
                e = p1 - p0; wx, wz = s.x - p0[0], s.z - p0[1]
                tt = np.clip((wx * e[0] + wz * e[1]) / (e @ e), 0, 1)
                d = (wx * e[1] - wz * e[0]) / np.linalg.norm(e)
                taper = sstep(0.0, 0.15, tt) * sstep(1.0, 0.5, tt)
                m = sstep(-0.025, 0.025, s.y) if back else sstep(0.025, -0.025, s.y)
                acc += min(amp * rng.uniform(0.6, 1.1), 0.6 * w) * taper * _fold_profile(d, w * (1 + tt)) * m
    s.o += acc * s._not_arm()
Gar.drag_strokes = _drag_strokes

def _hem_blouse(s, z0, z1, n=10, amp=0.006, w=0.01, seed=13):
    """Pliegues horizontales del tejido que se abolsa sobre un bajo elástico."""
    rng = np.random.default_rng(seed)
    acc = np.zeros(len(s.P), F32); r = np.sqrt(s.x ** 2 + s.y ** 2)
    for i in range(n):
        zc = rng.uniform(z0, z1); th0 = rng.uniform(-np.pi, np.pi); span = rng.uniform(0.5, 1.4)
        tilt = rng.uniform(-0.02, 0.02)
        da = np.angle(np.exp(1j * (s.theta - th0)))
        t = s.z - zc - tilt * np.sin(s.theta - th0)
        acc += min(amp * rng.uniform(0.6, 1.1), 0.6 * w) * sstep(1, 0.5, np.abs(da) / span) * _fold_profile(t, w)
    s.o += acc * s._not_arm()
Gar.hem_blouse = _hem_blouse
