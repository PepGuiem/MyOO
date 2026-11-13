"""Cabeza de maniquí femenina: misma base que la masculina (cabeza.py) con rasgos más finos
(mandíbula y mentón estrechos, sin arco superciliar marcado, nariz pequeña, labios llenos),
cuello más fino (0,86 del masculino; NECK_FEMALE en libraryFit.ts) y el pelo recogido (raya al lado y moño bajo).
Coordenadas: Z arriba, frente = -Y."""
import numpy as np
from scipy.interpolate import PchipInterpolator
from core import F32, smin, smax, sstep, round_cone, noise, fbm
import cabeza as H
from cabeza import ell, mirror, g2, EY, ear

# Secciones: cara más estrecha abajo (mandíbula y mentón), cráneo igual (gorras y capuchas).
# Última columna: exponente de la mitad delantera (la cara se curva hacia los lados).
SEC = [(1.548, 0.018, -0.066, -0.026, 2.2, 2.0), (1.557, 0.027, -0.075, -0.004, 2.3, 1.9), (1.570, 0.038, -0.078, 0.020, 2.4, 1.85),
       (1.582, 0.049, -0.080, 0.040, 2.5, 1.9), (1.602, 0.057, -0.081, 0.058, 2.5, 2.0), (1.626, 0.064, -0.081, 0.080, 2.35, 2.12),
       (1.650, 0.069, -0.081, 0.100, 2.2, 2.2), (1.680, 0.0735, -0.082, 0.112, 2.1, 2.1), (1.710, 0.073, -0.078, 0.114, 2.05, 2.05),
       (1.735, 0.067, -0.066, 0.106, 2.0, 2.0), (1.755, 0.057, -0.050, 0.090, 2.0, 2.0), (1.768, 0.042, -0.032, 0.066, 2.0, 2.0),
       (1.776, 0.022, -0.012, 0.034, 2.0, 2.0)]
_W, _F, _B, _N, _NF = (H.pchip(SEC, i) for i in (1, 2, 3, 4, 5))

def base_sdf(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    Wd, Fr, Bk = _W(z), _F(z), _B(z)
    yc = (Fr + Bk) / 2; ry = (Bk - Fr) / 2
    n = np.where(y < yc, _NF(z), _N(z))
    q = (np.abs(x / Wd) ** n + np.abs((y - yc) / ry) ** n) ** (1 / n)
    d = (q - 1) * np.minimum(Wd, ry) * 0.9
    d = smax(d, z - H.ZTOP, 0.02)
    d = smax(d, (1.545 + 0.42 * np.clip(y + 0.064, 0, None)) - z, 0.014)
    d = smin(d, ell(P, (0, 0.019, 1.6955), (0.0725, 0.0945, 0.0845)), 0.03)
    return d.astype(F32)

def relief(x, z):
    """Como la masculina (cabeza.py) con rasgos más suaves: sin arco superciliar, nariz
    pequeña y respingona, labios llenos y mentón pequeño."""
    ax = np.abs(x)
    R = np.zeros_like(x)
    R += 0.0014 * g2(ax, z, 0.028, EY + 0.019, 0.022, 0.008)                  # ceja (suave)
    R -= 0.0022 * g2(x, z, 0.0, EY + 0.007, 0.009, 0.006)                     # raíz de la nariz
    # ojos cerrados: cuenca, globo bajo el párpado, pliegue y línea de las pestañas
    R -= 0.0055 * g2(ax, z, 0.031, EY + 0.004, 0.016, 0.0105)
    R += 0.0054 * g2(ax, z, 0.031, EY - 0.0005, 0.0120, 0.0078)
    lid = z - (EY + 0.0072 - 9 * (ax - 0.030) ** 2)
    R -= 0.0006 * np.exp(-(lid / 0.0010) ** 2) * g2(ax, 0, 0.031, 0, 0.012, 1)
    lash = z - (EY - 0.0012 + 7 * (ax - 0.031) ** 2 - 0.10 * (ax - 0.031))
    R -= 0.0008 * np.exp(-(lash / 0.0007) ** 2) * g2(ax, z * 0, 0.032, 0, 0.0112, 1)
    R += 0.0006 * g2(ax, z, 0.033, EY - 0.009, 0.010, 0.004)                  # párpado inferior
    # pómulos altos y mejillas llenas
    R += 0.0050 * g2(ax, z, 0.046, EY - 0.016, 0.016, 0.012)
    R += 0.0028 * g2(ax, z, 0.035, 1.614, 0.016, 0.018)
    R -= 0.0008 * g2(ax, z, 0.053, 1.600, 0.012, 0.018)
    # nariz pequeña y algo respingona
    zz = np.clip(z, 1.601, 1.666)
    prof = np.interp(zz, [1.601, 1.605, 1.609, 1.6135, 1.619, 1.628, 1.640, 1.652, 1.661, 1.666],
                     [0.0, 0.0085, 0.0160, 0.0188, 0.0176, 0.0138, 0.0092, 0.0048, 0.0018, 0.0])
    nw = np.interp(zz, [1.601, 1.607, 1.614, 1.624, 1.642, 1.656, 1.666], [0.0066, 0.0072, 0.0076, 0.0068, 0.0064, 0.0068, 0.0080])
    R += prof * np.exp(-(ax / nw) ** 2.25)
    R += 0.0014 * g2(ax, z, 0.0, 1.6138, 0.0068, 0.0058)                      # punta redondeada
    R += 0.0018 * g2(x, z, 0.0, 1.6092, 0.0110, 0.0046)                       # base de la nariz
    R += 0.0028 * g2(ax, z, 0.0108, 1.6100, 0.0058, 0.0050)                   # aletas
    R -= 0.0007 * np.exp(-((np.hypot((ax - 0.0100) / 1.2, z - 1.6110) - 0.0070) / 0.0013) ** 2) * sstep(0.012, 0.016, ax)
    R -= 0.0007 * g2(ax, z, 0.0055, 1.6050, 0.0024, 0.0015)                   # orificios
    # boca: labios llenos
    R += 0.0062 * g2(x, z, 0.0, 1.5915, 0.025, 0.016)                         # arco dental
    R -= 0.0010 * g2(x, z, 0.0, 1.5995, 0.0034, 0.0038)                       # filtrum
    R += 0.0005 * g2(ax, z, 0.0046, 1.5995, 0.0017, 0.0038)                   # columnas del filtrum
    bow = 1.5928 + 0.0013 * g2(ax, 0, 0.0055, 0, 0.004, 1) - 0.0009 * g2(ax, 0, 0, 0, 0.002, 1) - 0.006 * ax
    R += 0.0036 * np.exp(-((z - bow) / 0.0029) ** 2) * np.exp(-(ax / 0.0215) ** 3)       # labio superior
    R += 0.0050 * g2(x, z, 0.0, 1.5828, 0.0170, 0.0056)                       # labio inferior
    mouth = z - (1.5880 + 0.4 * ax * ax)
    R -= 0.0011 * np.exp(-(mouth / 0.0008) ** 2) * sstep(0.0245, 0.018, ax)
    R -= 0.0007 * g2(ax, z, 0.0240, 1.5886, 0.0028, 0.0028)                   # comisuras
    R -= 0.0014 * g2(x, z, 0.0, 1.5740, 0.0115, 0.0030)                       # surco del mentón
    R += 0.0040 * g2(x, z, 0.0, 1.5625, 0.0150, 0.0085)                       # mentón pequeño
    return R

def head_volume(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    R = relief(x, z) * sstep(0.0, -0.04, y)
    Q = P.copy(); Q[:, 1] = y + R
    d = base_sdf(Q)
    Pm = mirror(P)
    d = smin(d, round_cone(Pm, (0.049, 0.030, 1.610), (0.041, 0.008, 1.570), 0.0092, 0.0080), 0.014)
    return d

NECK_K = 0.86
def neck(P):
    Pm = mirror(P)
    d = round_cone(P, (0, 0.042, 1.400), (0, 0.032, 1.600), 0.0580 * NECK_K, 0.0520 * NECK_K)
    d = smin(d, round_cone(Pm, (0.044, 0.034, 1.600), (0.011, -0.020, 1.415), 0.0095, 0.0070), 0.03)
    return d

# Pelo recogido: liso, peinado hacia atrás desde una raya al lado, con un moño bajo en la
# nuca. Pegado al cráneo, para que gorras y capuchas (modeladas sobre la cabeza de
# referencia) encajen; el moño queda por debajo de la banda de la gorra.
HAIRLINE = [(0.0, 1.722), (0.35, 1.718), (0.70, 1.708), (0.95, 1.692), (1.15, 1.672),
            (1.30, 1.664), (1.45, 1.676), (1.70, 1.672), (2.10, 1.632), (2.60, 1.606), (np.pi, 1.600)]
_HL = PchipInterpolator([a for a, _ in HAIRLINE], [b for _, b in HAIRLINE])
BUN = np.array([0.0, 0.112, 1.622], F32)

def hair(P, base):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    phi = np.abs(np.arctan2(x, -(y - 0.020)))
    hl = _HL(phi).astype(F32)
    m = sstep(hl - 0.004, hl + 0.030, z)
    top = sstep(1.66, 1.77, z)
    t = 0.0006 + 0.0040 * top
    # peinado hacia atrás: surcos que van de la frente a la nuca, abriéndose desde la raya
    side = x + 0.024
    th = np.arctan2(side, 0.06 + 0.5 * np.clip(-y, 0, None))
    comb = np.cos(th * 30 + 1.5 * noise(P, 6, 4))
    fine = np.cos(th * 80 + 2.0 * noise(P, 14, 6))
    inner = sstep(hl + 0.006, hl + 0.02, z)
    t = t + ((0.0004 * comb + 0.00015 * fine) * (0.4 + 0.6 * top) + 0.0003 * fbm(P, 40, 2, 11)) * inner
    # raya al lado
    t = t - 0.0016 * np.exp(-(side / 0.0028) ** 2) * sstep(1.72, 1.75, z) * sstep(0.04, -0.03, y)
    d = base - (t * m).astype(F32)
    # moño: un rollo de pelo enroscado
    q = P - BUN
    bun = ell(P, BUN, (0.034, 0.024, 0.027))
    ang = np.arctan2(q[:, 2], q[:, 0])
    rad = np.sqrt(q[:, 0] ** 2 + q[:, 2] ** 2)
    bun = bun + 0.0005 * np.cos(ang * 2 + rad * 180) * sstep(0.004, 0.012, rad)
    return smin(d, bun.astype(F32), 0.010)

def head_sdf(P, with_hair=True):
    d = smin(head_volume(P), neck(P), 0.024)
    if with_hair: d = hair(P, d)
    d = smin(d, ear(P), 0.005)
    return np.maximum(d, 1.405 - P[:, 2]).astype(F32)
