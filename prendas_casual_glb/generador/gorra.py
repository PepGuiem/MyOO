"""Gorra de béisbol de seis paneles (tipo «dad cap»): copa estructurada delante, visera curvada,
ojales bordados, botón, abertura trasera con tira y hebilla metálica.

Se modela directamente sobre la cabeza esculpida del maniquí (cabeza.py y cabeza_f.py, en las
coordenadas del cuerpo de referencia): la copa sigue la forma de la cabeza (con el pelo) con una
holgura de ~5 mm, alisada, así que en la web se coloca con la región `head` sin más ajustes.
Coordenadas: Z arriba, frente = -Y. Piezas por papel: 'body' (tela, teñible) y 'hardware' (hebilla).
"""
import numpy as np
from scipy.ndimage import gaussian_filter1d
from core import F32, smin, smax, sstep

C = np.array([0.0, 0.020, 1.668], F32)        # centro de la copa (dentro de la cabeza)
TH = np.radians(np.arange(0, 126, 2.0)).astype(F32)     # ángulo polar desde +Z
PH = np.radians(np.arange(0, 360, 2.0)).astype(F32)     # acimut, 0 = frente (-Y)
SHELL = 0.0024                                 # grosor de la copa
BOX = ((-0.115, -0.185, 1.625), (0.115, 0.165, 1.805))


def _dirs(th, ph):
    st = np.sin(th)
    return np.stack([st * np.sin(ph), -st * np.cos(ph), np.cos(th)], -1).astype(F32)


def _head_radius(head_fns):
    """Radio de la cabeza (con pelo) desde C en cada dirección de la rejilla (máximo de las cabezas)."""
    T, P = np.meshgrid(TH, PH, indexing='ij')
    D = _dirs(T, P).reshape(-1, 3)
    ts = np.linspace(0.03, 0.17, 281).astype(F32)
    R = np.zeros(len(D), F32)
    for fn in head_fns:
        best = np.full(len(D), 0.03, F32)
        for t in ts:
            inside = fn(C + D * t) < 0
            best = np.where(inside, t, best)
        R = np.maximum(R, best)
    return R.reshape(T.shape)


_R = None
def radius_grid():
    """Radio de la copa (cara exterior) en la rejilla: cabeza alisada + holgura + estructura."""
    global _R
    if _R is not None: return _R
    import cabeza as head4, cabeza_f as head_f
    # Sin orejas: si no, la copa se abría por encima de ellas.
    noear = lambda m: (lambda P: np.maximum(m.hair(P, smin(m.head_volume(P), m.neck(P), 0.024)), 1.405 - P[:, 2]).astype(F32))
    raw = _head_radius([noear(head4), noear(head_f)])
    # Por debajo del ala/cinta no hay copa: lo que importa es arriba y a los lados. Se alisa
    # (sin las mechas del pelo) y nunca queda por dentro de la cabeza.
    sm = gaussian_filter1d(gaussian_filter1d(raw, 3.0, axis=0, mode='nearest'), 4.0, axis=1, mode='wrap')
    R = np.maximum(sm, raw)
    R = gaussian_filter1d(gaussian_filter1d(R, 2.0, axis=0, mode='nearest'), 3.0, axis=1, mode='wrap')
    T, P = np.meshgrid(TH, PH, indexing='ij')
    front = np.maximum(0, np.cos(P)) ** 2
    # Paneles delanteros armados: algo más llenos y rectos a media altura.
    struct_ = 0.007 * front * np.exp(-((T - np.radians(55)) / np.radians(28)) ** 2)
    # Holgura: algo menos a los lados, para que la copa no sobresalga de la cabeza.
    clear = 0.0055 - 0.0025 * np.sin(P) ** 2 * sstep(np.radians(30), np.radians(70), T)
    _R = (R + clear + struct_ + 0.002 * np.exp(-(T / np.radians(30)) ** 2)).astype(F32)
    return _R


def _lookup(G, th, ph):
    """Interpolación bilineal en la rejilla (θ con tope, φ periódico)."""
    ti = np.clip(th / np.radians(2.0), 0, len(TH) - 1.001)
    pi_ = (ph % (2 * np.pi)) / np.radians(2.0)
    t0 = np.floor(ti).astype(int); ft = ti - t0
    p0 = np.floor(pi_).astype(int) % len(PH); fp = pi_ - np.floor(pi_); p1 = (p0 + 1) % len(PH)
    return ((G[t0, p0] * (1 - fp) + G[t0, p1] * fp) * (1 - ft) + (G[t0 + 1, p0] * (1 - fp) + G[t0 + 1, p1] * fp) * ft).astype(F32)


def polar(P):
    v = P - C
    r = np.linalg.norm(v, axis=1) + 1e-9
    th = np.arccos(np.clip(v[:, 2] / r, -1, 1))
    ph = np.arctan2(v[:, 0], -v[:, 1])
    return v, r, th, ph


def _band_generic(ph):
    return (1.676 + 0.021 * np.cos(ph) - 0.003 * np.cos(2 * ph)).astype(F32)


ZF = float(_band_generic(np.zeros(1, F32))[0])


def band_z(ph):
    """Altura del borde de la copa: delante sigue la curva de la visera; sobre las orejas y
    bajando hacia la nuca."""
    R90 = _lookup(radius_grid(), np.full_like(ph, np.pi / 2), ph) * 0.97
    xb = R90 * np.sin(ph); yb = C[1] - R90 * np.cos(ph)
    w = sstep(np.cos(np.radians(100)), np.cos(np.radians(50)), np.cos(ph))
    return (w * (brim_h(xb, yb, ZF) + 0.0012) + (1 - w) * _band_generic(ph)).astype(F32)


def wrap(a): return (a + np.pi) % (2 * np.pi) - np.pi


SEAMS = np.radians(np.arange(0, 360, 60)).astype(F32)
EYELETS = [(np.radians(30 + 60 * k), np.radians(36)) for k in range(6)]


def crown(P):
    v, r, th, ph = polar(P)
    G = radius_grid()
    R = _lookup(G, th, ph)
    dr = r - R                                   # >0 fuera de la cara exterior
    d = np.abs(dr + SHELL / 2) - SHELL / 2
    rho = np.hypot(v[:, 0], v[:, 1])
    # Costuras de los seis paneles (surco) con doble pespunte a los lados.
    sd = np.min(np.abs(wrap(ph[:, None] - SEAMS[None, :])), axis=1) * rho
    fade = sstep(0.006, 0.020, rho)
    d = d + 0.0007 * np.exp(-(sd / 0.0013) ** 2) * fade
    st = np.exp(-((sd - 0.0042) / 0.0006) ** 2) * fade
    d = d - 0.00028 * st * sstep(-0.0012, 0.0, dr)
    # Ojales bordados: anillo en relieve con el centro hundido.
    for ph_e, th_e in EYELETS:
        u = _dirs(np.float32(th_e), np.float32(ph_e))
        along = v @ u
        lat = np.linalg.norm(v - along[:, None] * u[None, :], axis=1)
        d = d - 0.0007 * np.exp(-((lat - 0.0032) / 0.0011) ** 2) * sstep(-0.0015, 0.0, dr)
        d = d + 0.0010 * np.exp(-(lat / 0.0013) ** 2) * sstep(-0.0015, 0.0, dr)
    # Borde inferior (se pliega hacia dentro: canto redondeado).
    zb = band_z(ph)
    d = smax(d, zb - P[:, 2], 0.0012)
    # Abertura trasera en arco.
    back = np.abs(wrap(ph - np.pi)) < np.radians(70)
    ax = np.abs(P[:, 0])
    arch = zb + 0.042 * np.sqrt(np.clip(1 - (ax / 0.030) ** 2, 0, 1))
    opening = np.where(back, smax(P[:, 2] - arch, ax - 0.030, 0.006), 1.0)
    d = smax(d, -opening, 0.002)
    # Botón en lo alto.
    top = C + np.array([0, 0, 1], F32) * _lookup(G, np.zeros(1, F32), np.zeros(1, F32))[0]
    q = (P - top) / np.array([0.0085, 0.0085, 0.0042], F32)
    k0 = np.linalg.norm(q, axis=1); k1 = np.linalg.norm(q / np.array([0.0085, 0.0085, 0.0042], F32), axis=1)
    d = smin(d, k0 * (k0 - 1) / np.maximum(k1, 1e-6), 0.0015)
    return d.astype(F32)


def strap(P):
    """Tira trasera que cierra la abertura (sobre la copa, por fuera)."""
    v, r, th, ph = polar(P)
    R = _lookup(radius_grid(), th, ph)
    zb = band_z(ph)
    d = np.abs(r - R - 0.0012) - 0.0011
    d = smax(d, np.abs(P[:, 2] - (zb + 0.0085)) - 0.0075, 0.0008)
    d = smax(d, np.abs(P[:, 0]) - 0.047, 0.002)
    d = np.where(P[:, 1] > 0.03, d, 1.0)
    return d.astype(F32)


def buckle(P):
    """Hebilla rectangular de metal sobre la tira, algo a la derecha."""
    v, r, th, ph = polar(P)
    R = _lookup(radius_grid(), th, ph)
    zc = band_z(ph) + 0.0085
    x = P[:, 0] - 0.016
    outer = np.maximum(np.abs(x) - 0.0075, np.abs(P[:, 2] - zc) - 0.0105)
    inner = np.maximum(np.abs(x) - 0.0045, np.abs(P[:, 2] - zc) - 0.0075)
    d = smax(outer, -inner, 0.0005)
    d = smax(d, np.abs(r - R - 0.0033) - 0.0009, 0.0004)
    d = np.where(P[:, 1] > 0.03, d, 1.0)
    return d.astype(F32)


# Visera: en planta, dentro de una elipse delante de la copa; curvada hacia abajo en los lados.
BRIM_C = (0.0, -0.050); BRIM_A = 0.088; BRIM_B = 0.116
def brim_h(x, y, zf):
    fwd = np.maximum(0, -0.090 - y)
    return zf - 0.0015 - 2.4 * x * x - 0.17 * fwd - 0.8 * fwd * fwd


def brim(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    v, r, th, ph = polar(P)
    G = radius_grid()
    # Huella de la copa a la altura del borde, en esta dirección.
    zb = band_z(ph)
    thb = np.arccos(np.clip((zb - C[2]) / np.maximum(_lookup(G, np.full_like(ph, np.pi / 2), ph), 1e-3), -1, 1))
    rho_b = _lookup(G, thb, ph) * np.sin(thb)
    rho = np.hypot(v[:, 0], v[:, 1])
    e = np.sqrt((x / BRIM_A) ** 2 + ((y - BRIM_C[1]) / BRIM_B) ** 2)
    ell2 = (e - 1) * min(BRIM_A, BRIM_B)
    region = smax(ell2, (rho_b - 0.006) - rho, 0.002)
    region = smax(region, y + 0.02, 0.01)
    h = brim_h(x, y, ZF)
    d = np.abs(z - h) - 0.0021
    # Pespuntes concéntricos en la cara de arriba.
    inside = -ell2
    rows = np.zeros_like(d)
    for k in range(1, 8):
        rows = rows + np.exp(-((inside - 0.0055 * k) / 0.0006) ** 2)
    d = d + 0.00032 * rows * sstep(h, h + 0.0018, z) * sstep(-0.004, -0.02, y)
    d = smax(d, region, 0.0018)
    return d.astype(F32)


def sweatband(P):
    """Badana interior (se ve desde abajo)."""
    v, r, th, ph = polar(P)
    R = _lookup(radius_grid(), th, ph)
    zb = band_z(ph)
    d = np.abs(r - (R - SHELL - 0.0011)) - 0.0009
    d = smax(d, np.abs(P[:, 2] - (zb + 0.014)) - 0.013, 0.001)
    back = np.abs(wrap(ph - np.pi)) < np.radians(70)
    ax = np.abs(P[:, 0])
    d = np.where(back & (ax < 0.032), np.maximum(d, 0.032 - ax), d)
    return d.astype(F32)


def parts():
    return [
        ('body', crown, ((-0.11, -0.125, 1.645), (0.11, 0.16, 1.805)), 0.0008),
        ('body', brim, ((-0.106, -0.178, 1.655), (0.106, -0.01, 1.705)), 0.0007),
        ('body', strap, ((-0.06, 0.04, 1.638), (0.06, 0.165, 1.685)), 0.0006),
        ('body', sweatband, ((-0.11, -0.125, 1.64), (0.11, 0.16, 1.72)), 0.0009),
        ('hardware', buckle, ((-0.002, 0.04, 1.638), (0.035, 0.165, 1.685)), 0.0005),
    ]
