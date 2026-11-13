"""Calzado de la colección casual: zapatillas de pista, botas de cordones y botas Chelsea.

Se modelan sobre el pie del maniquí (body2.foot): mismo tobillo y la punta girada 0,12 rad
hacia fuera. Coordenadas: Z arriba, frente = -Y. Cada zapato es un sólido con la boca hueca
(no una lámina doble). Piezas por papel: 'body' (piel, teñible), 'sole' (suela),
'lace' (cordones), 'hardware' (ojales), 'secondary' (elástico de la Chelsea), 'trim' (tirador).
"""
import numpy as np
from core import F32, smin, smax, sstep, round_cone, noise, fbm
from kit import capsule_pts

ANK = np.array([0.103, 0.016, 0.085], F32)      # tobillo derecho (cuerpo de referencia)
ANG = 0.12

def ell(P, c, r):
    c = np.asarray(c, F32); r = np.asarray(r, F32)
    q = (P - c) / r
    k0 = np.linalg.norm(q, axis=1); k1 = np.linalg.norm(q / r, axis=1)
    return (k0 * (k0 - 1) / np.maximum(k1, 1e-6)).astype(F32)

def local(P):
    """Mundo -> marco del pie (x hacia fuera, -y hacia la punta, z arriba); refleja el izquierdo."""
    x = np.abs(P[:, 0]) - ANK[0]; y = P[:, 1] - ANK[1]
    c, s = np.cos(ANG), np.sin(ANG)
    return np.stack([x * c + y * s, -x * s + y * c, P[:, 2]], 1).astype(F32)

def to_world(q, side=1):
    c, s = np.cos(ANG), np.sin(ANG)
    x = q[0] * c - q[1] * s; y = q[0] * s + q[1] * c
    return np.array([(x + ANK[0]) * side, y + ANK[1], q[2]], F32)

def last(Q, e=0.0, toe=1.0):
    """Horma (algo mayor que el pie del maniquí)."""
    d = ell(Q, (0.000, 0.034, 0.050), (0.040 + e, 0.050 + e, 0.058 + e))                    # talón
    d = smin(d, ell(Q, (0.005, -0.058, 0.044), (0.048 + e, 0.095 + e, 0.050 + e)), 0.035)   # empeine
    d = smin(d, ell(Q, (0.009, -0.160, 0.030), (0.047 + e, 0.064 + e, 0.033 * toe + e)), 0.03)   # puntera
    d = smin(d, round_cone(Q, (0.0, 0.012, 0.100), (0.0, -0.008, 0.060), 0.039 + e, 0.043 + e), 0.03)   # caña baja
    return d

def plan(Q, e):
    """Contorno en planta de la horma (para la suela)."""
    P2 = Q.copy(); P2[:, 2] = 0.032
    return last(P2, e)

def groove(d, dist, depth, width):
    return d + depth * np.exp(-(dist / width) ** 2)

def hollow(d, Q, top):
    """Boca: vacía el interior por encima de la plantilla (se ve el hueco, no una tapa)."""
    cav = smax(last(Q, -0.0035), 0.040 - Q[:, 2], 0.004)
    return smax(d, -cav, 0.002)

# ----------------------------------------------------------------------------------- piezas
def upper(kind):
    def f(P):
        Q = local(P); x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
        if kind == 'sneaker':
            d = last(Q, 0.004)
            zc = 0.084 - 0.010 * np.exp(-(y / 0.030) ** 2) * sstep(0.0, 0.03, np.abs(x)) + 0.006 * sstep(0.02, 0.06, y)
            zc = zc + 0.2 * sstep(-0.004, -0.030, y)
            d = smax(d, z - zc, 0.006)
            d = smax(d, 0.022 - z, 0.002)
            # puntera, panel lateral y refuerzo del talón (costuras)
            d = groove(d, np.sqrt(((y + 0.140) / 0.075) ** 2 + ((x - 0.008) / 0.062) ** 2) - 1, 0.0008, 0.012)
            d = groove(d, (y + 0.020) + 0.55 * (z - 0.050), 0.0006, 0.0025) * 1
            d = groove(d, (y - 0.030) - 0.5 * (z - 0.05), 0.0007, 0.0025)
            # pala con ojales: bordes del cierre
            m = sstep(-0.095, -0.085, y) * sstep(0.008, -0.002, y) * sstep(0.050, 0.060, z)
            d = groove(d, np.abs(x - 0.004) - 0.024, 0.0010 * m, 0.0018)
            # cuello acolchado
            d = d - 0.0025 * np.exp(-((z - zc + 0.006) / 0.008) ** 2) * sstep(-0.02, 0.01, y)
            return hollow(d, Q, zc).astype(F32)
        if kind == 'high_top':
            # zapatilla de baloncesto de caña alta: horma de zapatilla + caña acolchada hasta ~17 cm
            d = last(Q, 0.0045)
            shaft = round_cone(Q, (0.0, 0.014, 0.172), (0.0, 0.004, 0.064), 0.047, 0.050)
            d = smin(d, shaft, 0.03)
            top = 0.172 + 0.010 * sstep(-0.01, 0.04, y) - 0.006 * sstep(-0.02, -0.05, y)
            d = smax(d, z - top, 0.006)
            d = smax(d, 0.024 - z, 0.002)
            # costuras: puntera, refuerzo lateral y del talón, panel del tobillo
            d = groove(d, np.sqrt(((y + 0.140) / 0.075) ** 2 + ((x - 0.008) / 0.062) ** 2) - 1, 0.0008, 0.010)
            d = groove(d, (y - 0.032) - 0.45 * (z - 0.05), 0.0007, 0.0025)
            d = groove(d, z - 0.115 - 0.25 * np.clip(-y, 0, None), 0.0006, 0.0022)
            # pala con ojales: bordes del cierre
            m = sstep(-0.095, -0.085, y) * sstep(0.050, 0.040, y) * sstep(0.050, 0.060, z)
            d = groove(d, np.abs(x - 0.004) - 0.025, 0.0010 * m, 0.0018)
            # caña acolchada: rollos horizontales y borde grueso
            pad = sstep(0.110, 0.125, z) * sstep(-0.035, 0.0, y)
            d = d - 0.0010 * pad * (0.5 + 0.5 * np.cos((z - 0.12) * 2 * np.pi / 0.026))
            d = d - 0.0020 * np.exp(-((z - top + 0.006) / 0.007) ** 2) * sstep(-0.03, 0.0, y)
            cav = smax(round_cone(Q, (0.0, 0.014, 0.23), (0.0, 0.002, 0.064), 0.040, 0.041), 0.045 - z, 0.004)
            d = smax(d, -cav, 0.002)
            return d.astype(F32)
        if kind in ('boot', 'chelsea'):
            d = last(Q, 0.005)
            shaft = round_cone(Q, (0.0, 0.010, 0.170), (0.0, 0.000, 0.060), 0.046, 0.048)
            d = smin(d, shaft, 0.03)
            top = 0.160 if kind == 'boot' else 0.150
            d = smax(d, z - top, 0.004)
            d = smax(d, 0.030 - z, 0.002)
            d = groove(d, np.sqrt(((y + 0.140) / 0.075) ** 2 + ((x - 0.008) / 0.062) ** 2) - 1, 0.0009, 0.010)
            if kind == 'boot':
                m = sstep(-0.100, -0.090, y) * sstep(0.12, 0.10, z + 0.6 * y)
                d = groove(d, np.abs(x - 0.004) - 0.026, 0.0012 * sstep(0.055, 0.065, z), 0.002)
                d = groove(d, (y - 0.035) - 0.3 * (z - 0.05), 0.0008, 0.0025)              # contrafuerte
                d = d - 0.002 * np.exp(-((z - top + 0.006) / 0.006) ** 2)                     # ribete acolchado
            else:
                d = groove(d, (y - 0.040) + 0.0 * z, 0.0008, 0.0025) * 1                     # costura trasera
            # boca de la caña
            cav = smax(round_cone(Q, (0.0, 0.010, 0.20), (0.0, 0.000, 0.060), 0.041, 0.040), 0.045 - z, 0.004)
            d = smax(d, -cav, 0.002)
            return d.astype(F32)
        raise ValueError(kind)
    return f

def tongue(P):
    Q = local(P); x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    t = np.abs(last(Q, 0.0060)) - 0.0026
    reg = np.maximum(np.abs(x - 0.004) - 0.021, np.maximum(y - 0.024, -0.050 - y))
    reg = np.maximum(reg, np.maximum(0.060 - z, z - (0.104 + 0.10 * np.clip(y, 0, None))))
    return smax(t, reg, 0.004).astype(F32)

def sole(kind):
    def f(P):
        Q = local(P); x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
        if kind in ('sneaker', 'high_top'):
            h = 0.030 if kind == 'sneaker' else 0.034
            d = smax(plan(Q, 0.0065), np.abs(z - h / 2) - h / 2, 0.004)
            d = groove(d, z - 0.019, 0.0007, 0.0012)                                       # línea del canto
            d = d + 0.0005 * (np.cos(y * 2 * np.pi / 0.007) > 0.5) * sstep(0.003, 0.0, z)  # dibujo
            # puntera curvada hacia arriba
            d = smax(d, z - (h + 0.08 * np.clip(-y - 0.17, 0, None)), 0.004)
            return d.astype(F32)
        h = 0.034
        d = smax(plan(Q, 0.0075), np.abs(z - h / 2) - h / 2, 0.003)
        d = groove(d, z - 0.024, 0.0008, 0.0013)                                           # vira
        if kind == 'boot':   # suela de tacos
            lug = (np.cos(y * 2 * np.pi / 0.016) > 0.2) | (np.cos(x * 2 * np.pi / 0.020) > 0.6)
            d = d + 0.0025 * lug * sstep(0.006, 0.0, z)
            d = groove(d, y + 0.020, 0.004, 0.004) * 1                                      # arco entre tacón y planta
        else:
            d = groove(d, y + 0.020, 0.003, 0.006)
        return d.astype(F32)
    return f

def lace_bars(up, n=5, y0=-0.082, y1=-0.010, xoff=0.017, zr=0.10, r=0.0025, lift=0.0032):
    """Cordones: barras entre los ojales (y un cruce discreto), sobre la pala."""
    rows = []
    for k in range(n):
        y = y0 + (y1 - y0) * k / (n - 1)
        row = []
        for sx in (1, -1):
            q = np.array([0.004 + sx * xoff, y], F32)
            # rayo vertical hacia abajo en el marco local
            zs = np.linspace(zr + 0.05, 0.03, 900).astype(F32)
            Pw = np.stack([np.array([to_world(np.array([q[0], q[1], zz], F32)) for zz in zs])]).reshape(-1, 3)
            v = up(Pw)
            i = np.where(v < 0)[0]
            row.append(Pw[i[0]] if len(i) else None)
        rows.append(row)
    def f(P):
        d = np.full(len(P), 1.0, F32)
        for side in (1, -1):
            S = np.array([side, 1, 1], F32)
            for k, (a, b) in enumerate(rows):
                if a is None or b is None: continue
                a2 = a * S + [0, 0, lift]; b2 = b * S + [0, 0, lift]
                m = (a2 + b2) / 2 + np.array([0, 0, 0.0015], F32)
                d = np.minimum(d, capsule_pts(P, [a2, m, b2], r))
                # ojales (anillas) en los extremos
            for (a, b), (c, e) in zip(rows[:-1], rows[1:]):
                if a is None or e is None: continue
                d = np.minimum(d, capsule_pts(P, [a * S + [0, 0, lift * 0.7], e * S + [0, 0, lift * 0.7]], r * 0.9))
        return d
    pts = [p for row in rows for p in row if p is not None]
    return f, pts

def eyelets(pts, r=0.0032, t=0.0012):
    def f(P):
        d = np.full(len(P), 1.0, F32)
        for side in (1, -1):
            S = np.array([side, 1, 1], F32)
            for p in pts:
                c = p * S + np.array([0, 0, 0.0008], F32)
                q = P - c
                rad = np.sqrt(q[:, 0] ** 2 + q[:, 1] ** 2)
                ring = np.sqrt((rad - r) ** 2 + q[:, 2] ** 2) - t
                d = np.minimum(d, ring)
        return d.astype(F32)
    return f

def chelsea_gusset(P):
    Q = local(P); x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    # panel elástico en V a cada lado de la caña (por fuera de la piel)
    up = upper('chelsea')(P)
    panel = np.abs(up + 0.0004) - 0.0010
    ax = np.abs(x)
    v = np.maximum(np.abs(y - 0.012) - 0.010 - 0.30 * (z - 0.085), 0.085 - z)
    reg = np.maximum(v, z - 0.149)
    reg = np.maximum(reg, 0.030 - ax)
    d = smax(panel, reg, 0.002)
    return d.astype(F32)

def pull_tab(P):
    Q = local(P); x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    c = np.array([0.0, 0.050, 0.150], F32)
    loop = np.maximum(np.abs(np.sqrt((y - c[1]) ** 2 + ((z - c[2]) / 1.6) ** 2) - 0.010) - 0.0025, np.abs(x) - 0.009)
    return np.maximum(loop, c[2] - 0.004 - z).astype(F32)


def tongue_high(P):
    Q = local(P); x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
    reg = np.maximum(np.abs(x - 0.004) - 0.023, np.maximum(y + 0.005 - 0.0 * z, -0.095 - y))
    zt = 0.179 - 0.02 * sstep(-0.05, -0.09, y)
    reg = np.maximum(reg, np.maximum(0.060 - z, z - zt))
    # lengüeta por delante de la caña: solo la parte delantera (y < 0 en el marco del pie)
    front = round_cone(Q, (0.0, 0.016, 0.20), (0.0, 0.002, 0.064), 0.044, 0.045)
    d = np.maximum(np.abs(front - 0.0035) - 0.0028, reg)
    low = np.abs(last(Q, 0.0062)) - 0.0026
    low = np.maximum(low, np.maximum(np.abs(x - 0.004) - 0.022, np.maximum(y + 0.03, -0.095 - y)))
    low = np.maximum(low, np.maximum(0.060 - z, z - 0.13))
    return smin(d, low, 0.008).astype(F32)

def overlays(up):
    """Refuerzos de otro color sobre la piel (papel 'secondary'): talón, puntera y ojalera."""
    def f(P):
        Q = local(P); x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
        u = up(P)
        d = np.abs(u + 0.0003) - 0.0013
        heel = np.maximum((0.032 + 0.45 * (z - 0.05)) - y, z - 0.118)
        toe = (np.sqrt(((y + 0.208) / 0.046) ** 2 + ((x - 0.008) / 0.075) ** 2) - 1) * 0.04
        toe = np.maximum(toe, z - 0.062)
        topc = 0.172 + 0.010 * sstep(-0.01, 0.04, y) - 0.006 * sstep(-0.02, -0.05, y)
        collar = (topc - 0.026) - z
        # ojalera: tira a cada lado del cierre, de la pala a lo alto de la caña
        ax = np.abs(x - 0.004)
        eye = np.maximum(np.abs(ax - 0.030) - 0.008, np.maximum(-0.092 - y, y - 0.015 - 0.0 * z))
        eye = np.maximum(eye, 0.050 - z)
        reg = np.minimum(np.minimum(np.minimum(heel, toe), eye), collar)
        reg = np.maximum(reg, 0.026 - z)
        return smax(d, reg, 0.0012).astype(F32)
    return f


def lace_pts_high(up, n=7, xoff=0.019):
    """Ojales de la caña alta: a lo largo de la garganta (de la pala a lo alto de la caña),
    buscando la superficie en perpendicular a esa línea."""
    A = np.array([-0.086, 0.074], F32); Bq = np.array([-0.050, 0.160], F32)    # (y, z) local
    t = (Bq - A) / np.linalg.norm(Bq - A); nrm = np.array([-t[1], t[0]], F32)  # hacia fuera (-y, +z)
    if nrm[0] > 0: nrm = -nrm
    rows = []
    for k in range(n):
        c = A + (Bq - A) * k / (n - 1)
        row = []
        for sx in (1, -1):
            ss = np.linspace(0.06, -0.07, 1600).astype(F32)
            qs = np.stack([np.full_like(ss, 0.004 + sx * xoff), c[0] + nrm[0] * ss, c[1] + nrm[1] * ss], 1)
            Pw = np.array([to_world(q) for q in qs], F32)
            i = np.where(up(Pw) < 0)[0]
            nw = to_world(np.array([0.0, nrm[0], nrm[1]], F32)) - to_world(np.zeros(3, F32))
            row.append(Pw[i[0]] + nw * 0.0034 if len(i) else None)
        rows.append(row)
    return rows


def lace_bars_rows(rows, r=0.0025, lift=0.0):
    def f(P):
        d = np.full(len(P), 1.0, F32)
        for side in (1, -1):
            S = np.array([side, 1, 1], F32)
            for a, b in rows:
                if a is None or b is None: continue
                a2 = a * S + [0, 0, lift]; b2 = b * S + [0, 0, lift]
                m = (a2 + b2) / 2 + np.array([0, -0.0015, 0.0008], F32)
                d = np.minimum(d, capsule_pts(P, [a2, m, b2], r))
            for (a, b), (c, e) in zip(rows[:-1], rows[1:]):
                if a is None or e is None: continue
                d = np.minimum(d, capsule_pts(P, [a * S + [0, 0, lift * 0.7], e * S + [0, 0, lift * 0.7]], r * 0.9))
        return d
    return f

BOX = (np.array([-0.21, -0.27, -0.003], F32), np.array([0.21, 0.13, 0.20], F32))
BOXH = (np.array([-0.21, -0.27, -0.003], F32), np.array([0.21, 0.13, 0.215], F32))

def parts(kind):
    """Lista de (papel, sdf, caja, rejilla)."""
    up = upper(kind)
    out = [('body', up, BOXH if kind == 'high_top' else BOX, 0.0011)]
    if kind == 'sneaker':
        out.append(('body', tongue, BOX, 0.0011))
        lf, pts = lace_bars(up)
        out.append(('lace', lf, BOX, 0.0007))
        out.append(('sole', sole('sneaker'), BOX, 0.0011))
    elif kind == 'high_top':
        out.append(('body', tongue_high, BOXH, 0.0011))
        out.append(('lace', lace_bars_rows(lace_pts_high(up)), BOXH, 0.0007))
        out.append(('secondary', overlays(up), BOXH, 0.0009))
        out.append(('sole', sole('high_top'), BOXH, 0.0011))
    elif kind == 'boot':
        lf, pts = lace_bars(up, n=6, y0=-0.085, y1=0.035, xoff=0.019, zr=0.16, r=0.0024, lift=0.0032)
        out.append(('lace', lf, BOX, 0.0007))
        out.append(('hardware', eyelets(pts), BOX, 0.0006))
        out.append(('sole', sole('boot'), BOX, 0.0011))
    elif kind == 'chelsea':
        out.append(('secondary', chelsea_gusset, BOX, 0.0009))
        out.append(('trim', pull_tab, BOX, 0.0008))
        out.append(('sole', sole('chelsea'), BOX, 0.0011))
    return out
