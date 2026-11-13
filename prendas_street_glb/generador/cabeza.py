"""Cabeza de maniquí masculina (v5): volumen por secciones (superelipses, la cara más curvada que el cráneo) + relieve de la cara + orejas + pelo.
Coordenadas: Z arriba, frente = -Y. Mismo marco que la cabeza anterior (centro 0, 0.016, 1.655)."""
import numpy as np
from scipy.interpolate import PchipInterpolator
from core import F32, smin, smax, sstep, round_cone, noise, fbm

def ell(P, c, r):
    c = np.asarray(c, F32); r = np.asarray(r, F32)
    q = (P - c) / r
    k0 = np.linalg.norm(q, axis=1); k1 = np.linalg.norm(q / r, axis=1)
    return (k0 * (k0 - 1) / np.maximum(k1, 1e-6)).astype(F32)

def rotx(P, c, ang):
    c = np.asarray(c, F32); Q = P - c
    ca, sa = np.cos(ang), np.sin(ang)
    y = Q[:, 1] * ca - Q[:, 2] * sa; z = Q[:, 1] * sa + Q[:, 2] * ca
    return np.stack([Q[:, 0], y, z], 1).astype(F32) + c

def mirror(P):
    Q = P.copy(); Q[:, 0] = np.abs(Q[:, 0]); return Q

def g2(x, z, cx, cz, wx, wz):
    return np.exp(-((x - cx) / wx) ** 2 - ((z - cz) / wz) ** 2)

def pchip(rows, col):
    xs = np.array([r[0] for r in rows]); ys = np.array([r[col] for r in rows])
    f = PchipInterpolator(xs, ys)
    return lambda z: f(np.clip(z, xs[0], xs[-1])).astype(F32)

EY = 1.655
# z, semiancho, delante (y), detrás (y), exponente detrás, exponente delante (la cara se curva hacia
# los lados: con el mismo exponente que el cráneo quedaba plana, como una máscara)
SEC = [(1.536, 0.019, -0.069, -0.030, 2.2, 2.0), (1.548, 0.028, -0.079, -0.004, 2.3, 1.9),
       (1.562, 0.038, -0.080, 0.020, 2.5, 1.85), (1.580, 0.049, -0.081, 0.040, 2.6, 1.9),
       (1.600, 0.059, -0.082, 0.058, 2.6, 2.0), (1.625, 0.066, -0.082, 0.080, 2.4, 2.15),
       (1.650, 0.0715, -0.082, 0.100, 2.25, 2.25), (1.680, 0.0755, -0.083, 0.112, 2.1, 2.1),
       (1.710, 0.074, -0.079, 0.114, 2.05, 2.05), (1.735, 0.068, -0.067, 0.106, 2.0, 2.0),
       (1.755, 0.057, -0.050, 0.090, 2.0, 2.0), (1.768, 0.042, -0.032, 0.066, 2.0, 2.0),
       (1.776, 0.022, -0.012, 0.034, 2.0, 2.0)]
_W, _F, _B, _N, _NF = pchip(SEC, 1), pchip(SEC, 2), pchip(SEC, 3), pchip(SEC, 4), pchip(SEC, 5)
ZTOP, ZBOT = 1.742, 1.530

def base_sdf(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    W, Fr, Bk = _W(z), _F(z), _B(z)
    yc = (Fr + Bk) / 2; ry = (Bk - Fr) / 2
    n = np.where(y < yc, _NF(z), _N(z))
    q = (np.abs(x / W) ** n + np.abs((y - yc) / ry) ** n) ** (1 / n)
    d = (q - 1) * np.minimum(W, ry) * 0.9
    d = smax(d, z - ZTOP, 0.02)
    d = smax(d, (1.533 + 0.45 * np.clip(y + 0.066, 0, None)) - z, 0.012)     # bajo la mandíbula
    d = smin(d, ell(P, (0, 0.019, 1.6955), (0.0735, 0.0955, 0.0855)), 0.03)   # bóveda del cráneo
    return d.astype(F32)

def line_dist(ax, z, a, b):
    """Distancia (en el plano x-z de la cara) al segmento a-b."""
    ax_, az = a; bx, bz = b
    vx, vz = bx - ax_, bz - az; L2 = vx * vx + vz * vz
    t = np.clip(((ax - ax_) * vx + (z - az) * vz) / L2, 0, 1)
    return np.hypot(ax - ax_ - t * vx, z - az - t * vz)

def relief(x, z):
    """Relieve de la cara hacia delante (m, positivo = sale)."""
    ax = np.abs(x)
    R = np.zeros_like(x)
    # frente, cejas y raíz de la nariz
    R += 0.0030 * g2(ax, z, 0.027, EY + 0.018, 0.022, 0.0080)                 # arco superciliar
    R += 0.0018 * g2(x, z, 0.0, EY + 0.021, 0.014, 0.010)                     # glabela
    R -= 0.0026 * g2(x, z, 0.0, EY + 0.008, 0.009, 0.006)                     # raíz de la nariz
    # ojos cerrados: cuenca, globo bajo el párpado, pliegue del párpado y línea de las pestañas
    R -= 0.0058 * g2(ax, z, 0.031, EY + 0.004, 0.016, 0.0105)
    R += 0.0052 * g2(ax, z, 0.031, EY - 0.0005, 0.0115, 0.0075)
    lid = z - (EY + 0.0068 - 9 * (ax - 0.030) ** 2)
    R -= 0.0006 * np.exp(-(lid / 0.0010) ** 2) * g2(ax, 0, 0.031, 0, 0.012, 1)
    lash = z - (EY - 0.0012 + 7 * (ax - 0.031) ** 2 - 0.10 * (ax - 0.031))
    R -= 0.0007 * np.exp(-(lash / 0.0007) ** 2) * g2(ax, 0, 0.031, 0, 0.0105, 1)
    R += 0.0007 * g2(ax, z, 0.033, EY - 0.009, 0.010, 0.004)                  # párpado inferior
    # pómulos, mejillas y surco nasogeniano
    R += 0.0048 * g2(ax, z, 0.050, EY - 0.018, 0.016, 0.012)
    R += 0.0026 * g2(ax, z, 0.036, 1.616, 0.016, 0.018)
    R -= 0.0012 * g2(ax, z, 0.054, 1.598, 0.012, 0.018)                       # bajo el pómulo
    # nariz: perfil, anchura, punta, aletas
    zz = np.clip(z, 1.597, 1.666)
    prof = np.interp(zz, [1.597, 1.601, 1.605, 1.6105, 1.616, 1.625, 1.637, 1.650, 1.660, 1.666],
                     [0.0, 0.0085, 0.0175, 0.0215, 0.0205, 0.0165, 0.0115, 0.0060, 0.0022, 0.0])
    nw = np.interp(zz, [1.597, 1.604, 1.612, 1.622, 1.640, 1.655, 1.666], [0.0074, 0.0082, 0.0085, 0.0078, 0.0076, 0.0080, 0.0090])
    R += prof * np.exp(-(ax / nw) ** 2.25)
    R += 0.0016 * g2(ax, z, 0.0, 1.6108, 0.0075, 0.0062)                      # punta redondeada
    R += 0.0020 * g2(x, z, 0.0, 1.6062, 0.0125, 0.0050)                       # base de la nariz
    R += 0.0034 * g2(ax, z, 0.0120, 1.6070, 0.0066, 0.0056)                   # aletas
    R -= 0.0009 * np.exp(-((np.hypot((ax - 0.0110) / 1.2, z - 1.6080) - 0.0078) / 0.0014) ** 2) * sstep(0.013, 0.018, ax)   # surco de las aletas
    R -= 0.0008 * g2(ax, z, 0.0062, 1.6022, 0.0026, 0.0016)                   # orificios
    # boca
    R += 0.0070 * g2(x, z, 0.0, 1.5880, 0.026, 0.017)                         # arco dental
    R -= 0.0010 * g2(x, z, 0.0, 1.5960, 0.0035, 0.0040)                       # filtrum
    R += 0.0005 * g2(ax, z, 0.0048, 1.5960, 0.0018, 0.0040)                   # columnas del filtrum
    bow = 1.5892 + 0.0012 * g2(ax, 0, 0.0060, 0, 0.004, 1) - 0.0008 * g2(ax, 0, 0, 0, 0.002, 1) - 0.006 * ax
    R += 0.0030 * np.exp(-((z - bow) / 0.0027) ** 2) * np.exp(-(ax / 0.0235) ** 3)       # labio superior
    R += 0.0040 * g2(x, z, 0.0, 1.5798, 0.0185, 0.0050)                       # labio inferior
    mouth = z - (1.5852 + 0.4 * ax * ax)
    R -= 0.0011 * np.exp(-(mouth / 0.0008) ** 2) * sstep(0.0265, 0.020, ax)
    R -= 0.0008 * g2(ax, z, 0.0262, 1.5858, 0.0030, 0.0030)                   # comisuras
    R -= 0.0018 * g2(x, z, 0.0, 1.5705, 0.0130, 0.0034)                       # surco del mentón
    R += 0.0058 * g2(x, z, 0.0, 1.5555, 0.0180, 0.0100)                       # mentón
    return R

def head_volume(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    R = relief(x, z) * sstep(0.0, -0.04, y)            # solo en la cara
    Q = P.copy(); Q[:, 1] = y + R
    d = base_sdf(Q)
    Pm = mirror(P)
    # ángulo de la mandíbula marcado y occipital
    d = smin(d, round_cone(Pm, (0.052, 0.030, 1.608), (0.044, 0.006, 1.562), 0.0100, 0.0088), 0.012)
    return d

def neck(P):
    Pm = mirror(P)
    # Cuello (cono: debe coincidir con REF_NECK en libraryFit.ts, que ajusta los escotes a él)
    d = round_cone(P, (0, 0.042, 1.400), (0, 0.032, 1.600), 0.0580, 0.0520)
    # esternocleidomastoideo: de detrás de la oreja al esternón, se hunde en el pecho
    d = smin(d, round_cone(Pm, (0.050, 0.034, 1.600), (0.012, -0.022, 1.415), 0.0115, 0.0085), 0.03)
    return d

def ear(P):
    Pm = mirror(P)
    c = np.array([0.0735, 0.022, 1.646], F32)
    Q = rotx(Pm, c, -0.22)
    e = ell(Q, c + [0.001, 0, 0], (0.0075, 0.0180, 0.0280))
    qy = (Q[:, 1] - c[1]); qz = (Q[:, 2] - c[2] - 0.002)
    ring = np.sqrt(qy ** 2 / 0.0168 ** 2 + qz ** 2 / 0.0262 ** 2)
    rd = np.sqrt(((ring - 1) * 0.021) ** 2 + (Q[:, 0] - c[0] - 0.0050) ** 2) - 0.0028
    e = smin(e, rd.astype(F32), 0.003)
    e = smax(e, -ell(Q, c + [0.0095, 0.001, -0.002], (0.0050, 0.0110, 0.0170)), 0.004)
    e = smin(e, ell(Q, c + [0.003, 0.002, -0.026], (0.0045, 0.0075, 0.0075)), 0.004)
    return e

HAIRLINE = [(0.0, 1.718), (0.30, 1.714), (0.60, 1.706), (0.85, 1.697),
            (1.05, 1.684), (1.18, 1.650), (1.28, 1.646), (1.36, 1.684),
            (1.55, 1.690), (1.80, 1.672), (2.20, 1.620), (2.70, 1.596), (np.pi, 1.592)]
_HL = PchipInterpolator([a for a, _ in HAIRLINE], [b for _, b in HAIRLINE])

def hair(P, base):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    phi = np.abs(np.arctan2(x, -(y - 0.020)))
    hl = _HL(phi).astype(F32)
    m = sstep(hl - 0.003, hl + 0.022, z)
    top = sstep(1.66, 1.77, z)
    t = 0.0008 + 0.0058 * top + 0.0030 * sstep(1.70, 1.75, z) * sstep(0.0, -0.06, y)
    th = np.arctan2(x - 0.02, 0.10 + (z - 1.66))
    comb = np.cos(th * 14 + 2.0 * noise(P, 7, 4) + 1.0 * np.sin(y * 25))
    fine = np.cos(th * 46 + 2.5 * noise(P, 16, 6))
    inner = sstep(hl + 0.008, hl + 0.03, z)
    t = t + ((0.0010 * comb + 0.00035 * fine) * (0.3 + 0.7 * top) + 0.0004 * fbm(P, 40, 2, 11)) * inner
    return base - (t * m).astype(F32)

def head_sdf(P, with_hair=True):
    d = smin(head_volume(P), neck(P), 0.024)
    if with_hair: d = hair(P, d)
    d = smin(d, ear(P), 0.005)
    return np.maximum(d, 1.405 - P[:, 2]).astype(F32)
