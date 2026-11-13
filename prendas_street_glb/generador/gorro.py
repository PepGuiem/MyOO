"""Gorro de punto con vuelta (beanie) de la colección street.

Igual que la gorra (gorra.py), se modela directamente sobre las cabezas esculpidas del maniquí
(cabeza.py y cabeza_f.py, coordenadas del cuerpo de referencia): la copa sigue la cabeza (con el
pelo y las orejas, alisada) con una holgura pequeña, así que en la web se coloca con la región
`head` sin más ajustes. Punto de canalé, vuelta doble de ~5,5 cm y una etiqueta tejida delante.
Piezas por papel: 'body' (punto, teñible) y 'trim' (etiqueta).
"""
import numpy as np
from scipy.ndimage import gaussian_filter1d, maximum_filter
from core import F32, smin, smax, sstep, noise

C = np.array([0.0, 0.018, 1.668], F32)
STEP = np.radians(2.0)
TH = np.arange(0, np.radians(142), STEP).astype(F32)
PH = np.arange(0, 2 * np.pi, STEP).astype(F32)
SHELL = 0.0034          # grosor del punto
CUFF_H = 0.056          # alto de la vuelta
CUFF_T = 0.0042         # grosor extra de la vuelta (doble capa)


def _dirs(th, ph):
    st = np.sin(th)
    return np.stack([st * np.sin(ph), -st * np.cos(ph), np.cos(th)], -1).astype(F32)


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


def edge_z(ph):
    """Borde inferior: sobre las cejas delante, tapando la parte alta de las orejas y la nuca."""
    return (1.655 + 0.047 * np.cos(ph) - 0.004 * np.cos(2 * ph)).astype(F32)


_R = None
def radius_grid():
    """Radio exterior de la copa en la rejilla: cabezas (pelo y orejas) alisadas + holgura."""
    global _R
    if _R is not None: return _R
    import cabeza as head4, cabeza_f as head_f
    T, P = np.meshgrid(TH, PH, indexing='ij')
    D = _dirs(T, P).reshape(-1, 3)
    ts = np.linspace(0.03, 0.17, 241).astype(F32)
    raw = np.zeros(len(D), F32)
    for m in (head4, head_f):
        best = np.full(len(D), 0.03, F32)
        for t in ts:
            best = np.where(m.head_sdf(C + D * t) < 0, t, best)
        raw = np.maximum(raw, best)
    raw = raw.reshape(T.shape)
    # El punto se tensa sobre la cabeza: no entra en los huecos (se cubre la oreja con un
    # máximo local) y queda liso.
    R = maximum_filter(raw, size=(5, 7), mode=('nearest', 'wrap'))
    R = gaussian_filter1d(gaussian_filter1d(R, 3.0, axis=0, mode='nearest'), 4.0, axis=1, mode='wrap')
    R = np.maximum(R, raw + 0.001)
    R = gaussian_filter1d(gaussian_filter1d(R, 2.0, axis=0, mode='nearest'), 3.0, axis=1, mode='wrap')
    # Holgura y algo de volumen arriba y detrás (el punto cae un poco: «slouch» leve).
    back = 0.5 + 0.5 * np.cos(P - np.pi)
    slouch = 0.010 * np.exp(-((T - np.radians(35)) / np.radians(32)) ** 2) * (0.55 + 0.45 * back)
    _R = (R + 0.0040 + slouch).astype(F32)
    return _R


def wrap(a): return (a + np.pi) % (2 * np.pi) - np.pi


def crown(P):
    v, r, th, ph = polar(P)
    z = P[:, 2]
    R = _lookup(radius_grid(), th, ph)
    zb = edge_z(ph)
    h = z - zb                                       # altura sobre el borde
    cuff = sstep(CUFF_H + 0.003, CUFF_H - 0.003, h)
    rho = np.hypot(v[:, 0], v[:, 1])
    # canalé: costillas verticales que se juntan arriba (menguados en seis gajos)
    ribs = np.cos(ph * 80) * sstep(0.010, 0.045, rho)
    rib_amp = 0.0005 + 0.0003 * cuff
    seams = np.min(np.abs(wrap(ph[:, None] - np.radians(np.arange(0, 360, 60))[None, :])), axis=1) * rho
    crownm = sstep(0.050, 0.020, rho) * (1 - cuff)
    Rout = R + CUFF_T * cuff + rib_amp * ribs - 0.0009 * np.exp(-(seams / 0.0018) ** 2) * crownm
    # pliegue de la vuelta: canto redondeado arriba y pequeño labio abajo
    Rout = Rout + 0.0012 * np.exp(-((h - CUFF_H) / 0.003) ** 2) + 0.0008 * np.exp(-(h / 0.003) ** 2)
    Rout = Rout + 0.0006 * noise(P, 60, 3)
    thick = SHELL + CUFF_T * cuff
    d = np.abs(r - (Rout - thick / 2)) - thick / 2
    d = smax(d, -h, 0.0015)
    return d.astype(F32)


LABEL = dict(ph=0.0, h=CUFF_H * 0.52, w=0.036, hh=0.020)


def label(P):
    """Etiqueta tejida cosida en la vuelta, delante."""
    v, r, th, ph = polar(P)
    R = _lookup(radius_grid(), th, ph)
    h = P[:, 2] - edge_z(ph)
    arc = wrap(ph - LABEL['ph']) * r * np.sin(th)
    d = np.abs(r - (R + CUFF_T + 0.0012)) - 0.0006
    rect = np.maximum(np.abs(arc) - LABEL['w'] / 2, np.abs(h - LABEL['h']) - LABEL['hh'] / 2)
    return smax(d, rect, 0.0008).astype(F32)


def parts():
    return [
        ('body', crown, ((-0.125, -0.13, 1.585), (0.125, 0.165, 1.83)), 0.0009),
        ('trim', label, ((-0.03, -0.14, 1.70), (0.03, -0.07, 1.76)), 0.0004),
    ]
