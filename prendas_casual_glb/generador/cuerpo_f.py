"""Cuerpo de maniquí femenino (sin cabeza ni manos) sobre el cuerpo de referencia.

Se modela con las mismas proporciones de referencia que el masculino (cuerpo.py): la web lo
deforma a cada silueta femenina (cintura, cadera, pecho) igual que a la ropa, así que lo que
aquí se esculpe son las formas (pecho, hombros suaves, cadera redondeada) y no las medidas.
El pecho apenas sale del contorno de referencia: su volumen lo da el factor `bust` de la
silueta, que también ensancha la ropa. Coordenadas: Z arriba, frente = -Y."""
import numpy as np
from core import F32, smin, smax, sstep, round_cone
from kit import capsule_pts
from cuerpo import ell, mirror, unit, B0, S, E, W, FRONT, BACK, OUT, leg, foot, INSET, ARMDEG

def torso(P):
    Pm = mirror(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ax = np.abs(x)
    d = B0.torso(P)
    d = smax(d, 0.90 - z, 0.04)                                   # la pelvis la pone lower()
    ztop = 1.462 + 0.26 * np.clip(0.150 - ax, 0, 0.105) - 0.05 * np.clip(-y - 0.03, 0, None)
    d = smax(d, z - ztop, 0.035)                                  # hombros redondeados hacia el cuello
    front = sstep(-0.03, -0.085, y)
    # Pecho: dos volúmenes que apenas pasan del contorno de referencia, separados en el
    # centro (escote) y con el pliegue de debajo.
    bc = np.array([0.074, -0.080, 1.236], F32)
    rel = Pm - bc
    # algo caído: más lleno abajo
    rr = np.where(rel[:, 2] < 0, 0.050, 0.060)
    breast = ell(Pm, bc, (0.064, 0.044, 0.060)) + 0.004 * sstep(-0.02, 0.06, rel[:, 2])
    d = smin(d, breast.astype(F32), 0.035)
    d = d + 0.0050 * np.exp(-(x / 0.016) ** 2) * sstep(1.19, 1.22, z) * sstep(1.32, 1.28, z) * front   # escote
    zf = 1.188 + 0.25 * np.clip(ax - 0.03, 0, None) ** 1.2
    d = d + 0.0016 * np.exp(-((z - zf) / 0.012) ** 2) * sstep(0.02, 0.05, ax) * sstep(0.15, 0.12, ax) * front  # pliegue
    # clavículas suaves
    zc = 1.446 - 0.06 * np.clip(ax - 0.03, 0, None)
    d = d - 0.0012 * np.exp(-((z - zc) / 0.006) ** 2) * sstep(0.015, 0.03, ax) * sstep(0.15, 0.12, ax) * front
    # omóplatos discretos y columna
    d = smin(d, ell(Pm, (0.070, 0.072, 1.330), (0.046, 0.018, 0.058)), 0.02)
    d = smax(d, -capsule_pts(P, [np.array([0, 0.094, 0.985], F32), np.array([0, 0.101, 1.300], F32), np.array([0, 0.094, 1.360], F32)], 0.0045), 0.008)
    # vientre liso con ombligo
    d = smax(d, -ell(P, (0, -0.100, 1.040), (0.005, 0.004, 0.007)), 0.004)
    return d

def neck(P):
    return round_cone(P, [0, 0.012, 1.42], [0, 0.016, 1.56], 0.0340, 0.0310)

def arm(P):
    Pm = mirror(P)
    d1 = unit(E - S); d2 = unit(W - E)
    a = round_cone(Pm, S, E, 0.0470, 0.0375)
    a = smin(a, round_cone(Pm, E, W, 0.0370, 0.0255), 0.025)
    # hombro redondeado, brazo y antebrazo suaves (sin musculatura marcada)
    a = smin(a, ell(Pm, S + d1 * 0.022 + OUT * 0.004, (0.049, 0.050, 0.060)), 0.025)
    a = smin(a, ell(Pm, S + d1 * 0.140 + BACK * 0.006, (0.037, 0.036, 0.095)), 0.03)
    a = smin(a, ell(Pm, E + d2 * 0.070 + OUT * 0.004, (0.032, 0.031, 0.085)), 0.025)
    a = smax(a, np.dot(Pm - (W + d2 * 0.012), d2), 0.008)
    return a

def lower(P):
    z = P[:, 2]; k = 1 - 0.38 * sstep(0.90, 0.75, z)
    Q = P.copy(); Q[:, 0] /= (1 - 0.18 * sstep(0.90, 0.75, z)); Q[:, 1] /= k
    d = B0.torso(Q) * np.minimum(k, 1)
    d = smax(d, (0.795 + 0.30 * np.abs(P[:, 0]) - 0.10 * np.clip(P[:, 1], 0, None)) - z, 0.045)
    # glúteos redondeados y cadera suave
    d = smin(d, ell(mirror(P), (0.060, 0.064, 0.862), (0.068, 0.048, 0.074)), 0.035)
    d = smax(d, -capsule_pts(P, [np.array([0, 0.122, 0.800], F32), np.array([0, 0.110, 0.930], F32)], 0.005), 0.008)
    return smin(d, leg(P), 0.06)

def body_sdf(P):
    z = P[:, 2]
    ramp = INSET * sstep(0.12, 0.22, z)
    up = smin(torso(P) + INSET, neck(P), 0.025)
    up = smin(up, arm(P), 0.035)
    d = smin(up, lower(P) + ramp, 0.04)
    d = smin(d, foot(P), 0.02)
    return smax(d, P[:, 2] - 1.505, 0.008).astype(F32)

BOX = ((-0.33, -0.26, 0.0), (0.33, 0.18, 1.59))
