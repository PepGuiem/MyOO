"""Cuerpo de maniquí masculino (sin cabeza ni manos) sobre el cuerpo de referencia.
Brazos a ARMDEG grados (cerca de la pose de la web, para que el ajuste deforme poco).
El relieve muscular nunca sobresale más de ~4 mm de la superficie de referencia, para que
las prendas modeladas sobre ella no lo atraviesen. Coordenadas: Z arriba, frente = -Y."""
import numpy as np
from core import F32, Body, smin, smax, sstep, round_cone, noise
from kit import capsule_pts

ARMDEG = 18.0

def ell(P, c, r):
    c = np.asarray(c, F32); r = np.asarray(r, F32)
    q = (P - c) / r
    k0 = np.linalg.norm(q, axis=1); k1 = np.linalg.norm(q / r, axis=1)
    return (k0 * (k0 - 1) / np.maximum(k1, 1e-6)).astype(F32)

def mirror(P):
    Q = P.copy(); Q[:, 0] = np.abs(Q[:, 0]); return Q

def unit(v):
    v = np.asarray(v, F32); return v / np.linalg.norm(v)

B0 = Body(arm_deg=ARMDEG, ease=-0.004)
S, E, W = [np.asarray(v, F32) for v in B0.arm[1]]
H, K, C, A = [np.asarray(v, F32) for v in B0.leg[1]]
FRONT = np.array([0, -1, 0], F32); BACK = -FRONT
OUT = np.array([1, 0, 0], F32)

def torso(P):
    Pm = mirror(P)
    d = B0.torso(P)
    d = smax(d, 0.90 - P[:, 2], 0.04)            # la pelvis la pone lower()
    # Hombros: el cuello sale de aquí (lo pone la cabeza, ver neck())
    # El borde superior sube hacia el cuello (trapecio), no es una repisa plana.
    ztop = 1.462 + 0.30 * np.clip(0.155 - np.abs(P[:, 0]), 0, 0.11) - 0.05 * np.clip(-P[:, 1] - 0.03, 0, None)
    d = smax(d, P[:, 2] - ztop, 0.03)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ax = np.abs(x)
    front = sstep(-0.03, -0.085, y)
    # Pectorales: volumen suave (hasta ~7 mm) con el borde inferior marcado que sube
    # hacia la axila; se funden arriba con las clavículas y en el centro con el esternón.
    zp = 1.250 + 0.40 * np.clip(ax - 0.03, 0, None) ** 1.3
    lower = sstep(zp - 0.010, zp + 0.030, z)
    upper = 1 - sstep(1.33, 1.43, z)
    lat = sstep(0.006, 0.035, ax) * sstep(0.165, 0.115, ax)
    dome = np.maximum(np.sin(np.clip((ax - 0.006) / 0.16, 0, 1) * np.pi), 0) ** 0.6
    d = d - 0.0055 * lower * upper * lat * (0.55 + 0.45 * dome) * front
    # clavículas: un relieve fino
    zc = 1.446 - 0.06 * np.clip(ax - 0.03, 0, None)
    d = d - 0.0018 * np.exp(-((z - zc) / 0.006) ** 2) * sstep(0.015, 0.03, ax) * sstep(0.16, 0.13, ax) * front
    # Dorsales: la espalda se abre en V bajo las axilas
    back = sstep(0.0, 0.05, y)
    d = d - 0.0045 * np.exp(-((z - 1.22) / 0.07) ** 2) * sstep(0.08, 0.14, ax) * back
    # omóplatos
    d = smin(d, ell(Pm, (0.075, 0.074, 1.330), (0.050, 0.022, 0.065)), 0.02)
    # esternón y línea alba
    d = smax(d, -capsule_pts(P, [np.array([0, -0.122, 1.235], F32), np.array([0, -0.112, 1.420], F32)], 0.0055), 0.006)
    d = smax(d, -capsule_pts(P, [np.array([0, -0.108, 1.030], F32), np.array([0, -0.116, 1.215], F32)], 0.0035), 0.005)
    # abdominales: intersecciones tendinosas (suaves)
    for z, w in ((1.170, 0.040), (1.105, 0.038)):
        d = smax(d, -capsule_pts(Pm, [np.array([0.006, -0.113, z], F32), np.array([w, -0.110, z + 0.004], F32)], 0.0028), 0.005)
    # ombligo
    d = smax(d, -ell(P, (0, -0.101, 1.040), (0.006, 0.005, 0.007)), 0.004)
    # columna
    d = smax(d, -capsule_pts(P, [np.array([0, 0.096, 0.985], F32), np.array([0, 0.103, 1.300], F32), np.array([0, 0.088, 1.460], F32)], 0.0075), 0.008)
    # línea inguinal: un surco ancho y poco profundo
    t = np.clip((0.975 - z) / 0.095, 0, 1)
    gx = 0.110 - 0.070 * t
    d = d + 0.0018 * np.exp(-((ax - gx) / 0.010) ** 2) * sstep(0.995, 0.97, z) * sstep(0.86, 0.885, z) * front
    return d

def neck(P):
    d = round_cone(P, [0, 0.012, 1.42], [0, 0.016, 1.56], 0.0380, 0.0340)
    return d

def arm(P):
    Pm = mirror(P)
    d1 = unit(E - S); d2 = unit(W - E)
    a = round_cone(Pm, S, E, 0.0485, 0.0385)
    a = smin(a, round_cone(Pm, E, W, 0.0380, 0.0265), 0.02)
    # deltoides (cubre la articulación) y bíceps / tríceps
    a = smin(a, ell(Pm, S + d1 * 0.022 + OUT * 0.006, (0.052, 0.054, 0.062)), 0.02)
    a = smin(a, ell(Pm, S + d1 * 0.155 + FRONT * 0.011, (0.039, 0.037, 0.080)), 0.025)
    a = smin(a, ell(Pm, S + d1 * 0.125 + BACK * 0.011 + OUT * 0.004, (0.038, 0.036, 0.090)), 0.025)
    # antebrazo: braquiorradial cerca del codo, se afina hacia la muñeca
    a = smin(a, ell(Pm, E + d2 * 0.065 + OUT * 0.006 + FRONT * 0.006, (0.034, 0.033, 0.080)), 0.02)
    # codo (olécranon) discreto
    a = smin(a, ell(Pm, E + BACK * 0.026, (0.016, 0.012, 0.018)), 0.012)
    # la muñeca se cierra dentro de la mano
    a = smax(a, np.dot(Pm - (W + d2 * 0.012), d2), 0.008)
    return a

from scipy.interpolate import PchipInterpolator
# Pierna como secciones elípticas a lo largo de su eje (casi vertical): perfil liso y anatómico.
# z, semiancho, delante, detrás
LEGPROF = [(0.050, 0.031, 0.030, 0.032), (0.085, 0.031, 0.030, 0.032), (0.140, 0.032, 0.030, 0.031),
           (0.220, 0.038, 0.034, 0.040), (0.300, 0.046, 0.038, 0.054), (0.370, 0.051, 0.041, 0.061),
           (0.420, 0.050, 0.043, 0.057), (0.460, 0.048, 0.047, 0.048), (0.500, 0.049, 0.051, 0.046),
           (0.560, 0.058, 0.059, 0.053), (0.650, 0.070, 0.068, 0.063), (0.750, 0.081, 0.076, 0.074),
           (0.840, 0.089, 0.082, 0.087), (0.940, 0.092, 0.084, 0.090)]
_LZ = np.array([r[0] for r in LEGPROF])
_LRX, _LRF, _LRB = (PchipInterpolator(_LZ, np.array([r[i] for r in LEGPROF])) for i in (1, 2, 3))
_NZ = np.array([0.085, 0.33, 0.485, 0.84]); _NX = np.array([0.103, 0.101, 0.098, 0.094]); _NY = np.array([0.016, 0.010, -0.004, 0.004])

def leg(P):
    Pm = mirror(P)
    z = np.clip(Pm[:, 2], 0.05, 0.94)
    cx = np.interp(z, _NZ, _NX); cy = np.interp(z, _NZ, _NY)
    rx = _LRX(z); rf = _LRF(z); rb = _LRB(z)
    dx = Pm[:, 0] - cx; dy = Pm[:, 1] - cy
    ry = np.where(dy < 0, rf, rb)
    q = np.sqrt((dx / rx) ** 2 + (dy / ry) ** 2)
    l = (q - 1) * np.minimum(rx, ry) * 0.95
    l = smax(l.astype(F32), Pm[:, 2] - 0.90, 0.05)
    # rótula discreta y maléolos
    l = smin(l, ell(Pm, (0.098, -0.041, 0.505), (0.022, 0.009, 0.030)), 0.03)
    l = smin(l, ell(Pm, (0.103 + 0.026, 0.020, 0.087), (0.010, 0.012, 0.012)), 0.008)
    l = smin(l, ell(Pm, (0.103 - 0.024, 0.016, 0.095), (0.010, 0.012, 0.012)), 0.008)
    return l

def foot(P):
    Pm = mirror(P)
    # gira la punta 0,12 rad hacia fuera alrededor del tobillo
    ang = 0.12
    Q = Pm - A * np.array([1, 1, 0], F32)
    c, s = np.cos(ang), np.sin(ang)
    x = Q[:, 0] * c + Q[:, 1] * s; y = -Q[:, 0] * s + Q[:, 1] * c
    Q = np.stack([x, y, Pm[:, 2]], 1).astype(F32)
    heel = np.array([0.000, 0.030, 0.035], F32)
    ball = np.array([0.008, -0.140, 0.020], F32)
    f = round_cone(Q, heel, ball, 0.032, 0.026)
    f = smin(f, ell(Q, (0.000, 0.022, 0.038), (0.031, 0.040, 0.038)), 0.02)                 # talón
    f = smin(f, ell(Q, (0.006, -0.085, 0.040), (0.038, 0.065, 0.030)), 0.03)                # empeine
    f = smin(f, ell(Q, (0.010, -0.168, 0.018), (0.040, 0.042, 0.017)), 0.02)                # dedos
    f = smin(f, round_cone(Q, (0.0, 0.010, 0.085), (0.0, -0.010, 0.050), 0.033, 0.034), 0.03)   # tobillo
    f = smax(f, 0.0015 - Pm[:, 2], 0.004)                                                  # suela plana
    return f

def lower(P):
    # pelvis que se funde con las piernas (como Body.lower, sin holgura)
    z = P[:, 2]; k = 1 - 0.38 * sstep(0.90, 0.75, z)
    Q = P.copy(); Q[:, 0] /= (1 - 0.18 * sstep(0.90, 0.75, z)); Q[:, 1] /= k
    d = B0.torso(Q) * np.minimum(k, 1)
    d = smax(d, (0.795 + 0.30 * np.abs(P[:, 0]) - 0.10 * np.clip(P[:, 1], 0, None)) - z, 0.04)   # ingles: sube hacia la cadera
    # glúteos y su surco
    d = smin(d, ell(mirror(P), (0.062, 0.066, 0.858), (0.066, 0.046, 0.070)), 0.03)
    d = smax(d, -capsule_pts(P, [np.array([0, 0.125, 0.800], F32), np.array([0, 0.112, 0.930], F32)], 0.006), 0.008)
    return smin(d, leg(P), 0.06)

# Las prendas modeladas sobre el cuerpo de referencia (y las generadas por código con poca
# holgura, como la ropa interior o las mallas) van ceñidas al tronco y las piernas: el maniquí
# queda INSET por dentro de esa superficie para que no las atraviese. Brazos y pies, sin tocar.
INSET = 0.009

def body_sdf(P):
    z = P[:, 2]
    ramp = INSET * sstep(0.12, 0.22, z)
    up = smin(torso(P) + INSET, neck(P), 0.025)
    up = smin(up, arm(P), 0.035)
    d = smin(up, lower(P) + ramp, 0.04)
    d = smin(d, foot(P), 0.02)
    return smax(d, P[:, 2] - 1.505, 0.008).astype(F32)   # el resto del cuello lo pone la cabeza

BOX = ((-0.33, -0.26, 0.0), (0.33, 0.18, 1.59))
