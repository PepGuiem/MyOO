"""Gorras de la colección street: trucker (frente de espuma y rejilla detrás), snapback (copa alta
y armada, visera plana, cierre de presión), cinco paneles (copa baja, visera plana corta, cinta con
hebilla) y gorro de pescador (bucket, ala caída alrededor).

Mismo método que la gorra casual (gorra.py): la copa se modela directamente sobre las cabezas
esculpidas del maniquí (cabeza.py y cabeza_f.py, coordenadas del cuerpo de referencia; Z arriba,
frente = -Y), siguiendo la cabeza con el pelo con una holgura pequeña. En la web se colocan con la
región `head` sin ajustes.

Papeles de las piezas: 'body' (tela, teñible), 'secondary' (rejilla de la trucker), 'hardware'
(botones de presión, hebilla).
"""
import numpy as np
from scipy.ndimage import gaussian_filter1d
from core import F32, smin, smax, sstep

C = np.array([0.0, 0.020, 1.668], F32)
STEP = np.radians(2.0)
TH = np.arange(0, np.radians(126), STEP).astype(F32)
PH = np.arange(0, 2 * np.pi, STEP).astype(F32)
SHELL = 0.0024

KINDS = {
    # struct: frente armado (m); top: volumen extra arriba; brim: (A, B, curva lateral, caída, caída²)
    'trucker': dict(struct=0.016, struct_th=50, upper=0.3, top=0.002, clear=0.0060,
                    seams=(60, 120, 180, 240, 300), brim=(0.090, 0.118, 1.5, 0.14, 0.6),
                    closure='snap', mesh=True, button=True, eyelets=False),
    'snapback': dict(struct=0.017, struct_th=52, upper=0.25, top=0.0, clear=0.0060,
                     seams=(0, 60, 120, 180, 240, 300), brim=(0.096, 0.120, 0.10, 0.07, 0.0),
                     closure='snap', mesh=False, button=True, eyelets=True),
    'five_panel': dict(struct=0.002, struct_th=55, upper=0.5, top=-0.006, clear=0.0045,
                       seams=(55, 125, 180, 235, 305), brim=(0.086, 0.104, 0.30, 0.06, 0.0),
                       closure='clip', mesh=False, button=False, eyelets=True),
    'bucket': dict(struct=0.0, struct_th=55, upper=0.0, top=0.0, clear=0.0085,
                   seams=(), brim=None, closure=None, mesh=False, button=False, eyelets=True),
}
K = KINDS['snapback']
KIND = 'snapback'
_R = None


def configure(kind):
    global K, KIND, _R
    K = KINDS[kind]; KIND = kind; _R = None


def _dirs(th, ph):
    st = np.sin(th)
    return np.stack([st * np.sin(ph), -st * np.cos(ph), np.cos(th)], -1).astype(F32)


def _head_radius(head_fns):
    T, P = np.meshgrid(TH, PH, indexing='ij')
    D = _dirs(T, P).reshape(-1, 3)
    ts = np.linspace(0.03, 0.17, 281).astype(F32)
    R = np.zeros(len(D), F32)
    for fn in head_fns:
        best = np.full(len(D), 0.03, F32)
        for t in ts:
            best = np.where(fn(C + D * t) < 0, t, best)
        R = np.maximum(R, best)
    return R.reshape(T.shape)


_RAW = None
def _raw():
    global _RAW
    if _RAW is None:
        try:
            import cabeza as head4, cabeza_f as head_f     # nombres en el repositorio
        except ImportError:
            import head4, head_f
        noear = lambda m: (lambda P: np.maximum(m.hair(P, smin(m.head_volume(P), m.neck(P), 0.024)), 1.405 - P[:, 2]).astype(F32))
        _RAW = _head_radius([noear(head4), noear(head_f)])
    return _RAW


def radius_grid():
    """Radio exterior de la copa en la rejilla (θ, φ)."""
    global _R
    if _R is not None: return _R
    raw = _raw()
    sm = gaussian_filter1d(gaussian_filter1d(raw, 3.0, axis=0, mode='nearest'), 4.0, axis=1, mode='wrap')
    R = np.maximum(sm, raw)
    R = gaussian_filter1d(gaussian_filter1d(R, 2.0, axis=0, mode='nearest'), 3.0, axis=1, mode='wrap')
    T, P = np.meshgrid(TH, PH, indexing='ij')
    front = np.maximum(0, np.cos(P)) ** 2
    struct_ = K['struct'] * front * np.exp(-((T - np.radians(K['struct_th'])) / np.radians(30)) ** 2)
    # Frente alto y recto (espuma o entretela): llena también el arco entre la frente y lo alto.
    struct_ = struct_ + K['upper'] * K['struct'] * front * np.exp(-((T - np.radians(30)) / np.radians(22)) ** 2)
    clear = K['clear'] - 0.0025 * np.sin(P) ** 2 * sstep(np.radians(30), np.radians(70), T)
    R = R + clear + struct_ + 0.002 * np.exp(-(T / np.radians(30)) ** 2) + K['top'] * np.exp(-(T / np.radians(38)) ** 2)
    if KIND == 'bucket':
        # Copa de pescador: lados casi rectos y techo plano.
        zt = float(np.mean(R[0])) * 0.86
        plane = zt / np.maximum(np.cos(T), 0.05)
        R = smin(R, plane, 0.005)
        # lados algo más rectos: un poco de volumen en la parte alta de los lados
        R = R + 0.004 * np.exp(-((T - np.radians(62)) / np.radians(18)) ** 2)
    _R = R.astype(F32)
    return _R


def _lookup(G, th, ph):
    ti = np.clip(th / STEP, 0, len(TH) - 1.001)
    pi_ = (ph % (2 * np.pi)) / STEP
    t0 = np.floor(ti).astype(int); ft = ti - t0
    p0 = np.floor(pi_).astype(int) % len(PH); fp = pi_ - np.floor(pi_); p1 = (p0 + 1) % len(PH)
    return ((G[t0, p0] * (1 - fp) + G[t0, p1] * fp) * (1 - ft) + (G[t0 + 1, p0] * (1 - fp) + G[t0 + 1, p1] * fp) * ft).astype(F32)


def polar(P):
    v = P - C
    r = np.linalg.norm(v, axis=1) + 1e-9
    th = np.arccos(np.clip(v[:, 2] / r, -1, 1))
    ph = np.arctan2(v[:, 0], -v[:, 1])
    return v, r, th, ph


def wrap(a): return (a + np.pi) % (2 * np.pi) - np.pi


def _band_generic(ph):
    if KIND == 'bucket':
        # Por la frente, tapando lo alto de las orejas y bajando a la nuca.
        return (1.673 + 0.018 * np.cos(ph) - 0.003 * np.cos(2 * ph)).astype(F32)
    return (1.676 + 0.021 * np.cos(ph) - 0.003 * np.cos(2 * ph)).astype(F32)


def zf():
    return float(_band_generic(np.zeros(1, F32))[0])


BRIM_CY = -0.050
def brim_h(x, y):
    A, B, curve, slope, slope2 = K['brim']
    fwd = np.maximum(0, -0.090 - y)
    return zf() - 0.0015 - curve * x * x - slope * fwd - slope2 * fwd * fwd


def band_z(ph):
    if K['brim'] is None: return _band_generic(ph)
    R90 = _lookup(radius_grid(), np.full_like(ph, np.pi / 2), ph) * 0.97
    xb = R90 * np.sin(ph); yb = C[1] - R90 * np.cos(ph)
    w = sstep(np.cos(np.radians(100)), np.cos(np.radians(50)), np.cos(ph))
    return (w * (brim_h(xb, yb) + 0.0012) + (1 - w) * _band_generic(ph)).astype(F32)


def _shell(P):
    """Copa: cáscara exterior con costuras de los paneles y canto inferior."""
    v, r, th, ph = polar(P)
    G = radius_grid()
    R = _lookup(G, th, ph)
    dr = r - R
    d = np.abs(dr + SHELL / 2) - SHELL / 2
    rho = np.hypot(v[:, 0], v[:, 1])
    if K['seams']:
        seams = np.radians(np.array(K['seams'], F32))
        sd = np.min(np.abs(wrap(ph[:, None] - seams[None, :])), axis=1) * rho
        fade = sstep(0.006, 0.020, rho)
        d = d + 0.0007 * np.exp(-(sd / 0.0013) ** 2) * fade
        st = np.exp(-((sd - 0.0042) / 0.0006) ** 2) * fade
        d = d - 0.00028 * st * sstep(-0.0012, 0.0, dr)
    if K['eyelets']:
        if KIND == 'bucket':
            eyes = [(np.radians(a), np.radians(62)) for a in (75, 105, 255, 285)]
        elif KIND == 'five_panel':
            eyes = [(np.radians(a), np.radians(48)) for a in (90, 270)]
        else:
            eyes = [(np.radians(30 + 60 * k), np.radians(36)) for k in range(6)]
        for ph_e, th_e in eyes:
            u = _dirs(np.float32(th_e), np.float32(ph_e))
            along = v @ u
            lat = np.linalg.norm(v - along[:, None] * u[None, :], axis=1)
            d = d - 0.0007 * np.exp(-((lat - 0.0032) / 0.0011) ** 2) * sstep(-0.0015, 0.0, dr)
            d = d + 0.0010 * np.exp(-(lat / 0.0013) ** 2) * sstep(-0.0015, 0.0, dr)
    zb = band_z(ph)
    if KIND == 'bucket':
        # Pespuntes horizontales alrededor de la copa (cerca del ala y del techo).
        h = P[:, 2] - zb
        rows = sum(np.exp(-((h - hh) / 0.0006) ** 2) for hh in (0.006, 0.0105, 0.015))
        d = d + 0.0003 * rows
    d = smax(d, zb - P[:, 2], 0.0012)
    if K['closure']:
        back = np.abs(wrap(ph - np.pi)) < np.radians(70)
        ax = np.abs(P[:, 0])
        arch = zb + 0.042 * np.sqrt(np.clip(1 - (ax / 0.030) ** 2, 0, 1))
        opening = np.where(back, smax(P[:, 2] - arch, ax - 0.030, 0.006), 1.0)
        d = smax(d, -opening, 0.002)
    if K['button']:
        top = C + np.array([0, 0, 1], F32) * _lookup(G, np.zeros(1, F32), np.zeros(1, F32))[0]
        q = (P - top) / np.array([0.0085, 0.0085, 0.0042], F32)
        k0 = np.linalg.norm(q, axis=1); k1 = np.linalg.norm(q / np.array([0.0085, 0.0085, 0.0042], F32), axis=1)
        d = smin(d, k0 * (k0 - 1) / np.maximum(k1, 1e-6), 0.0015)
    return d.astype(F32), ph, rho, dr


MESH_FROM = np.radians(60)   # la rejilla de la trucker: de los paneles laterales hacia atrás


def crown(P):
    d, ph, rho, dr = _shell(P)
    if K['mesh']:
        # Frente de espuma: hasta las costuras de ±60°.
        a = (np.abs(wrap(ph)) - MESH_FROM) * rho
        d = smax(d, a, 0.0006)
    return d.astype(F32)


def mesh_back(P):
    """Rejilla de la trucker: la misma cáscara, con agujeros (hoyuelos en panal)."""
    d, ph, rho, dr = _shell(P)
    a = (np.abs(wrap(ph)) - MESH_FROM) * rho
    d = smax(d, -a, 0.0006)
    # Panal de agujeros: hoyuelos en la cara exterior.
    s = 0.0036
    u = ph * np.maximum(rho, 0.02) / s
    w = P[:, 2] / s
    cell = (np.cos(2 * np.pi * u) + np.cos(np.pi * (u + 1.732 * w)) + np.cos(np.pi * (u - 1.732 * w))) / 3
    d = d + 0.00055 * sstep(0.25, 0.85, cell) * sstep(-0.0012, 0.0, dr)
    return d.astype(F32)


def strap(P):
    v, r, th, ph = polar(P)
    R = _lookup(radius_grid(), th, ph)
    zb = band_z(ph)
    d = np.abs(r - R - 0.0012) - 0.0011
    d = smax(d, np.abs(P[:, 2] - (zb + 0.0085)) - 0.0075, 0.0008)
    d = smax(d, np.abs(P[:, 0]) - 0.047, 0.002)
    return np.where(P[:, 1] > 0.03, d, 1.0).astype(F32)


def snaps(P):
    """Cierre de presión: fila de botones en la tira (los de la izquierda, cabezas a la vista)."""
    v, r, th, ph = polar(P)
    R = _lookup(radius_grid(), th, ph)
    zc = band_z(ph) + 0.0085
    best = np.full(len(P), 1.0, F32)
    for x0 in np.linspace(-0.032, 0.024, 7):
        dx = np.hypot(P[:, 0] - x0, P[:, 2] - zc)
        h = r - (R + 0.0023)
        cap = np.maximum(dx - 0.0028, np.abs(h) - 0.0011)
        best = np.minimum(best, cap)
    return np.where(P[:, 1] > 0.03, best, 1.0).astype(F32)


def clip(P):
    """Hebilla de enganche (cinco paneles): rectángulo con ranura, sobre la cinta."""
    v, r, th, ph = polar(P)
    R = _lookup(radius_grid(), th, ph)
    zc = band_z(ph) + 0.0085
    x = P[:, 0] - 0.014
    outer = np.maximum(np.abs(x) - 0.0095, np.abs(P[:, 2] - zc) - 0.0098)
    inner = np.maximum(np.abs(x + 0.002) - 0.0018, np.abs(P[:, 2] - zc) - 0.0072)
    d = smax(outer, -inner, 0.0005)
    d = smax(d, np.abs(r - R - 0.0034) - 0.0011, 0.0004)
    return np.where(P[:, 1] > 0.03, d, 1.0).astype(F32)


def brim(P):
    A, B = K['brim'][0], K['brim'][1]
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    v, r, th, ph = polar(P)
    G = radius_grid()
    zb = band_z(ph)
    thb = np.arccos(np.clip((zb - C[2]) / np.maximum(_lookup(G, np.full_like(ph, np.pi / 2), ph), 1e-3), -1, 1))
    rho_b = _lookup(G, thb, ph) * np.sin(thb)
    rho = np.hypot(v[:, 0], v[:, 1])
    e = np.sqrt((x / A) ** 2 + ((y - BRIM_CY) / B) ** 2)
    ell2 = (e - 1) * min(A, B)
    region = smax(ell2, (rho_b - 0.006) - rho, 0.002)
    region = smax(region, y + 0.02, 0.01)
    h = brim_h(x, y)
    thick = 0.0024 if KIND == 'snapback' else 0.0021
    d = np.abs(z - h) - thick
    inside = -ell2
    rows = np.zeros_like(d)
    n = 4 if KIND in ('snapback', 'trucker') else 7
    for k in range(1, n + 1):
        rows = rows + np.exp(-((inside - 0.0055 * k) / 0.0006) ** 2)
    d = d + 0.00032 * rows * sstep(h, h + 0.0018, z) * sstep(-0.004, -0.02, y)
    d = smax(d, region, 0.0018)
    return d.astype(F32)


BUCKET_W = 0.056


def _bucket_rho_b(ph):
    G = radius_grid()
    zb = band_z(ph)
    thb = np.arccos(np.clip((zb - C[2]) / np.maximum(_lookup(G, np.full_like(ph, np.pi / 2), ph), 1e-3), -1, 1))
    return _lookup(G, thb, ph) * np.sin(thb), zb


def bucket_brim(P):
    """Ala del gorro de pescador: cae hacia fuera alrededor de toda la copa, con pespuntes."""
    v, r, th, ph = polar(P)
    rho = np.hypot(v[:, 0], v[:, 1])
    rho_b, zb = _bucket_rho_b(ph)
    s = rho - (rho_b - 0.002)
    sc = np.clip(s, 0, None)
    zs = zb + 0.0005 - 0.36 * sc - 1.6 * sc * sc
    slope = 0.36 + 3.2 * sc
    d = np.abs(P[:, 2] - zs) / np.sqrt(1 + slope ** 2) - 0.0014
    rows = sum(np.exp(-((s - 0.0065 * k) / 0.0006) ** 2) for k in range(1, 8))
    d = d + 0.00030 * rows * sstep(-0.001, 0.0005, P[:, 2] - zs)
    d = smax(d, s - BUCKET_W, 0.0018)
    d = smax(d, -s, 0.0012)
    return d.astype(F32)


def sweatband(P):
    v, r, th, ph = polar(P)
    R = _lookup(radius_grid(), th, ph)
    zb = band_z(ph)
    d = np.abs(r - (R - SHELL - 0.0011)) - 0.0009
    d = smax(d, np.abs(P[:, 2] - (zb + 0.014)) - 0.013, 0.001)
    if K['closure']:
        back = np.abs(wrap(ph - np.pi)) < np.radians(70)
        ax = np.abs(P[:, 0])
        d = np.where(back & (ax < 0.032), np.maximum(d, 0.032 - ax), d)
    return d.astype(F32)


CROWN_BOX = ((-0.115, -0.13, 1.635), (0.115, 0.165, 1.82))


def parts(kind):
    configure(kind)
    out = []
    if kind == 'bucket':
        out.append(('body', crown, ((-0.12, -0.13, 1.63), (0.12, 0.17, 1.80)), 0.0008))
        out.append(('body', bucket_brim, ((-0.185, -0.20, 1.585), (0.185, 0.235, 1.705)), 0.0009))
        out.append(('body', sweatband, ((-0.12, -0.13, 1.63), (0.12, 0.17, 1.72)), 0.0009))
        return out
    out.append(('body', crown, CROWN_BOX, 0.0008))
    if K['mesh']:
        out.append(('secondary', mesh_back, ((-0.115, -0.08, 1.635), (0.115, 0.165, 1.82)), 0.0006))
    A, B = K['brim'][0], K['brim'][1]
    out.append(('body', brim, ((-A - 0.01, BRIM_CY - B - 0.01, 1.62), (A + 0.01, -0.01, 1.715)), 0.0007))
    out.append(('body', strap, ((-0.06, 0.04, 1.638), (0.06, 0.165, 1.685)), 0.0006))
    out.append(('body', sweatband, ((-0.115, -0.13, 1.64), (0.115, 0.165, 1.72)), 0.0009))
    if K['closure'] == 'snap':
        out.append(('hardware', snaps, ((-0.045, 0.04, 1.638), (0.035, 0.165, 1.685)), 0.0004))
    elif K['closure'] == 'clip':
        out.append(('hardware', clip, ((-0.002, 0.04, 1.638), (0.035, 0.165, 1.685)), 0.0005))
    return out
