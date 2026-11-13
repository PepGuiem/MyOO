"""Maniquí de tienda (genérico): cabeza sin rasgos (huevo con una nariz apenas
insinuada), sin pelo ni orejas, cuerpo liso de fibra (sin ombligo, abdominales, columna
ni tobillos marcados) y manos con los dedos juntos.

Conserva las medidas de los maniquíes esculpidos (cuerpo.py, cuerpo_f.py, cabeza.py,
cabeza_f.py), porque las prendas, las gorras y los escotes están ajustados a ellos:
- el cráneo crece lo que abultaba el pelo, en suave, para que gorras y gorros encajen;
- el cuello es el mismo cono (REF_NECK / NECK_FEMALE en libraryFit.ts).
Coordenadas: Z arriba, frente = -Y."""
import numpy as np
from scipy.interpolate import PchipInterpolator
from core import F32, smin, smax, sstep, round_cone
from kit import capsule_pts
import cuerpo as C
import cuerpo_f as CF
import cabeza as H
import cabeza_f as HF
import mannequin as M
from cuerpo import ell, mirror, B0, INSET

# ============================================================ CABEZA
def _hair_volume(P, hairline, t_top):
    """Grosor que tenía el pelo, liso y con un borde muy suave (sin escalón en la frente)."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    phi = np.abs(np.arctan2(x, -(y - 0.020)))
    hl = hairline(phi).astype(F32)
    m = sstep(hl - 0.035, hl + 0.035, z)
    top = sstep(1.64, 1.77, z)
    return (0.0006 + t_top * top) * m

def _nose_hint(x, z, amp):
    """Nariz apenas insinuada: un lomo suave que nace entre los ojos, sin punta marcada,
    aletas ni orificios."""
    ax = np.abs(x)
    zz = np.clip(z, 1.596, 1.672)
    prof = np.interp(zz, [1.596, 1.604, 1.614, 1.626, 1.642, 1.658, 1.672], [0.0, 0.55, 1.0, 0.82, 0.48, 0.18, 0.0])
    w = 0.011 + 0.004 * sstep(1.64, 1.60, z)
    return amp * prof * np.exp(-(ax / w) ** 2)

# Secciones de la cabeza «huevo»: desde los pómulos hacia arriba, las de la cabeza
# esculpida (cabeza.py / cabeza_f.py: el cráneo es igual); por debajo, la cara se cierra en
# un óvalo liso, sin mandíbula ni mentón marcados.
# z, semiancho, delante (y), detrás (y), exponente detrás, exponente delante
_EGG_LOW = [(1.524, 0.016, -0.034, 0.006, 2.0, 2.0), (1.536, 0.030, -0.052, 0.016, 2.1, 2.0),
            (1.552, 0.042, -0.066, 0.030, 2.2, 2.0), (1.572, 0.052, -0.075, 0.046, 2.3, 2.0),
            (1.596, 0.060, -0.080, 0.062, 2.4, 2.05)]

def _egg_profile(sec_src, k_low):
    rows = [(z, w * k_low, f * k_low, b, n, nf) for z, w, f, b, n, nf in _EGG_LOW]
    rows += [r for r in sec_src if r[0] >= 1.625]
    return tuple(H.pchip(rows, i) for i in (1, 2, 3, 4, 5))

_EGG_M = _egg_profile(H.SEC, 1.0)
_EGG_F = _egg_profile(HF.SEC, 0.95)

def _egg_base(P, prof, vault):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    Wf, Ff, Bf, Nf, NFf = prof
    Wd, Fr, Bk = Wf(z), Ff(z), Bf(z)
    yc = (Fr + Bk) / 2; ry = (Bk - Fr) / 2
    n = np.where(y < yc, NFf(z), Nf(z))
    q = (np.abs(x / Wd) ** n + np.abs((y - yc) / ry) ** n) ** (1 / n)
    d = (q - 1) * np.minimum(Wd, ry) * 0.9
    d = smax(d, z - H.ZTOP, 0.02)
    d = smax(d, 1.530 - z, 0.03)                       # cierre redondo por debajo
    d = smin(d, ell(P, *vault), 0.03)                   # bóveda del cráneo (como la esculpida)
    return d.astype(F32)

def head_sdf(P, female=False):
    z = P[:, 2]
    if female:
        d = _egg_base(P, _EGG_F, ((0, 0.019, 1.6955), (0.0725, 0.0945, 0.0845)))
    else:
        d = _egg_base(P, _EGG_M, ((0, 0.019, 1.6955), (0.0735, 0.0955, 0.0855)))
    d = d - _hair_volume(P, HF._HL if female else H._HL, 0.0040 if female else 0.0060)
    k = HF.NECK_K if female else 1.0
    neck = round_cone(P, (0, 0.042, 1.400), (0, 0.032, 1.600), 0.0580 * k, 0.0520 * k)
    # la cara pasa al cuello en curva suave
    d = smin(d, neck, 0.035)
    return np.maximum(d, 1.405 - z).astype(F32)

def head_sdf_f(P):
    return head_sdf(P, female=True)

# ============================================================ CUERPO (hombre)
def torso(P):
    Pm = mirror(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ax = np.abs(x)
    d = B0.torso(P)                # sin cortar abajo: se funde con la pelvis en body_sdf
    ztop = 1.462 + 0.30 * np.clip(0.155 - ax, 0, 0.11) - 0.05 * np.clip(-y - 0.03, 0, None)
    d = smax(d, z - ztop, 0.035)
    front = sstep(-0.03, -0.085, y)
    # pecho: un plano apenas abombado (estilizado), sin borde marcado
    zp = 1.250 + 0.40 * np.clip(ax - 0.03, 0, None) ** 1.3
    lower = sstep(zp - 0.03, zp + 0.05, z)
    upper = 1 - sstep(1.32, 1.43, z)
    lat = sstep(0.0, 0.05, ax) * sstep(0.17, 0.10, ax)
    d = d - 0.0040 * lower * upper * lat * front
    # espalda en V (sin omóplatos: dejaban un borde)
    back = sstep(0.0, 0.05, y)
    d = d - 0.0035 * np.exp(-((z - 1.22) / 0.08) ** 2) * sstep(0.08, 0.15, ax) * back
    return d

def leg(P):
    Pm = mirror(P)
    z = np.clip(Pm[:, 2], 0.05, 0.94)
    cx = np.interp(z, C._NZ, C._NX); cy = np.interp(z, C._NZ, C._NY)
    rx = C._LRX(z); rf = C._LRF(z); rb = C._LRB(z)
    dx = Pm[:, 0] - cx; dy = Pm[:, 1] - cy
    ry = np.where(dy < 0, rf, rb)
    q = np.sqrt((dx / rx) ** 2 + (dy / ry) ** 2)
    l = (q - 1) * np.minimum(rx, ry) * 0.95
    l = smax(l.astype(F32), Pm[:, 2] - 0.90, 0.05)
    # rodilla: solo un volumen suave (sin rótula); tobillos sin maléolos
    return smin(l, ell(Pm, (0.098, -0.030, 0.505), (0.030, 0.016, 0.048)), 0.045)

def lower(P, glute=(0.062, 0.066, 0.858), gr=(0.066, 0.046, 0.070), groin=0.04):
    z = P[:, 2]; k = 1 - 0.38 * sstep(0.90, 0.75, z)
    Q = P.copy(); Q[:, 0] /= (1 - 0.18 * sstep(0.90, 0.75, z)); Q[:, 1] /= k
    d = B0.torso(Q) * np.minimum(k, 1)
    d = smax(d, (0.795 + 0.30 * np.abs(P[:, 0]) - 0.10 * np.clip(P[:, 1], 0, None)) - z, groin)
    d = smin(d, ell(mirror(P), glute, gr), 0.035)   # glúteos sin surco
    return smin(d, leg(P), 0.06)

def foot(P):
    # el pie esculpido ya es liso (sin dedos); se suaviza un poco más
    return C.foot(P) - 0.0005

def _trunk(P, torso_d, lower_d):
    """Tronco + pelvis: se mezclan las distancias en la cintura (las dos superficies casi
    coinciden ahí). Unirlas con smin, como en cuerpo.py, abultaba un anillo en la cadera."""
    z = P[:, 2]
    w = sstep(0.84, 0.95, z)
    ramp = INSET * sstep(0.12, 0.22, z)
    return (lower_d + ramp) * (1 - w) + (torso_d + INSET) * w

def body_sdf(P):
    t = _trunk(P, torso(P), lower(P))
    up = smin(t, C.neck(P), 0.03)
    up = smin(up, C.arm(P), 0.04)
    d = smin(up, foot(P), 0.025)
    d = smax(d, 0.0015 - P[:, 2], 0.004)                 # suelo: las piernas no siguen por debajo
    return smax(d, P[:, 2] - 1.505, 0.008).astype(F32)

# ============================================================ CUERPO (mujer)
def torso_f(P):
    Pm = mirror(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ax = np.abs(x)
    d = B0.torso(P)
    ztop = 1.462 + 0.26 * np.clip(0.150 - ax, 0, 0.105) - 0.05 * np.clip(-y - 0.03, 0, None)
    d = smax(d, z - ztop, 0.035)
    front = sstep(-0.03, -0.085, y)
    # pecho estilizado: los dos volúmenes, con el centro apenas marcado y sin pliegue
    bc = np.array([0.074, -0.080, 1.236], F32)
    breast = ell(Pm, bc, (0.064, 0.044, 0.060)) + 0.004 * sstep(-0.02, 0.06, (Pm - bc)[:, 2])
    d = smin(d, breast.astype(F32), 0.065)
    d = d + 0.0025 * np.exp(-(x / 0.020) ** 2) * sstep(1.19, 1.22, z) * sstep(1.32, 1.28, z) * front
    return d

def body_sdf_f(P):
    t = _trunk(P, torso_f(P), lower(P, (0.060, 0.064, 0.862), (0.068, 0.048, 0.074), 0.045))
    up = smin(t, CF.neck(P), 0.03)
    up = smin(up, CF.arm(P), 0.04)
    d = smin(up, foot(P), 0.025)
    d = smax(d, 0.0015 - P[:, 2], 0.004)                 # suelo: las piernas no siguen por debajo
    return smax(d, P[:, 2] - 1.505, 0.008).astype(F32)

# ============================================================ MANO
def _finger(P, base, dirs, lens, r0, r1):
    pts = [np.asarray(base, F32)]
    for dv, L in zip(dirs, lens):
        dv = np.asarray(dv, F32); dv = dv / np.linalg.norm(dv)
        pts.append(pts[-1] + dv * L)
    return capsule_pts(P, pts, np.linspace(r0, r1, len(pts)))

def hand_sdf(P):
    """Mano de escaparate: dedos rectos y juntos (fundidos, con un surco leve entre
    ellos), apenas curvados, y el pulgar pegado al índice. Mismo marco que mannequin.py
    (muñeca en el origen, dedos hacia -Z, dorso +X, pulgar hacia -Y)."""
    d = ell(P, (0.0, 0.0, 0.0), (0.019, 0.027, 0.03))
    d = smin(d, M.seg(P, (0, 0, 0.04), (0, 0, -0.005), 0.021), 0.01)
    # palma lisa y plana
    d = smin(d, ell(P, (-0.002, 0.000, -0.052), (0.0150, 0.0400, 0.042)), 0.025)
    d = smin(d, ell(P, (-0.009, -0.022, -0.040), (0.011, 0.015, 0.024)), 0.014)
    specs = [(-0.0250, (0.040, 0.025, 0.019), 0.0096, 0.0080),
             (-0.0083, (0.044, 0.027, 0.020), 0.0098, 0.0082),
             (0.0085, (0.042, 0.026, 0.019), 0.0095, 0.0079),
             (0.0245, (0.035, 0.020, 0.016), 0.0086, 0.0070)]
    for yb, lens, r0, r1 in specs:
        k = (0.001, yb, -0.086 + 0.006 * (abs(yb + 0.004) / 0.03) ** 2)
        dirs, acc = [], 0
        for a in (5, 9, 8):                 # apenas curvados hacia la palma
            acc += a; dx, _, dz = M.bend(acc); dirs.append((dx, -yb * 0.04, dz))
        d = smin(d, _finger(P, k, dirs, lens, r0, r1), 0.009)
    # pulgar junto al índice, apuntando hacia abajo
    f = _finger(P, (-0.008, -0.022, -0.022), [(-0.22, -0.30, -0.93), (-0.25, -0.12, -0.96), (-0.24, -0.04, -0.97)],
                (0.040, 0.028, 0.023), 0.0122, 0.0086)
    return smin(d, f, 0.012).astype(F32)
