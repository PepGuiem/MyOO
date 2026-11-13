"""Calzado de la colección street: skate (acolchada, suela vulcanizada), chunky (suela gruesa por
capas, refuerzos superpuestos), running (punto, mediasuela con balancín) y slip-on (sin cordones,
elásticos a los lados).

Usa la horma, los cordones y las utilidades de calzado.py (mismo pie, mismo tobillo, misma
colocación en la web: región 'lower'). Papeles: 'body' (piel o tejido, teñible), 'secondary'
(refuerzos o elásticos), 'sole', 'lace'.
"""
import numpy as np
try:
    import calzado as S
except ImportError:          # en el entorno de desarrollo se llama shoes.py
    import shoes as S
from core import F32, smin, smax, sstep

local, last, groove, hollow, plan = S.local, S.last, S.groove, S.hollow, S.plan
BOX = S.BOX


def collar_z(kind, x, y):
    """Altura del borde de la boca (cuello) según el modelo."""
    if kind == 'skate':
        zc = 0.092 - 0.011 * np.exp(-(y / 0.030) ** 2) * sstep(0.0, 0.03, np.abs(x)) + 0.008 * sstep(0.02, 0.06, y)
    elif kind == 'chunky':
        zc = 0.094 - 0.010 * np.exp(-(y / 0.030) ** 2) * sstep(0.0, 0.03, np.abs(x)) + 0.006 * sstep(0.02, 0.06, y)
    elif kind == 'running':
        # cuello bajo y tirador de talón que sube
        zc = 0.080 - 0.012 * np.exp(-(y / 0.030) ** 2) * sstep(0.0, 0.03, np.abs(x)) + 0.016 * sstep(0.045, 0.075, y) * np.exp(-(x / 0.020) ** 2)
    else:  # slip_on
        zc = 0.080 - 0.008 * np.exp(-(y / 0.035) ** 2) * sstep(0.0, 0.03, np.abs(x)) + 0.008 * sstep(0.02, 0.06, y)
    return zc


def upper(kind):
    def f(P):
        Q = local(P); x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
        e = {'skate': 0.0055, 'chunky': 0.0050, 'running': 0.0035, 'slip_on': 0.0045}[kind]
        d = last(Q, e)
        zc = collar_z(kind, x, y)
        if kind == 'slip_on':
            # pala cerrada hasta el empeine: la boca empieza más atrás
            zc = zc + 0.2 * sstep(-0.020, -0.045, y)
        else:
            zc = zc + 0.2 * sstep(-0.004, -0.030, y)
        d = smax(d, z - zc, 0.006)
        d = smax(d, 0.024 - z, 0.002)
        # puntera y talón (costuras)
        d = groove(d, np.sqrt(((y + 0.140) / 0.075) ** 2 + ((x - 0.008) / 0.062) ** 2) - 1, 0.0008, 0.011)
        d = groove(d, (y - 0.030) - 0.5 * (z - 0.05), 0.0007, 0.0025)
        if kind != 'slip_on':
            m = sstep(-0.095, -0.085, y) * sstep(0.008, -0.002, y) * sstep(0.050, 0.060, z)
            d = groove(d, np.abs(x - 0.004) - 0.024, 0.0010 * m, 0.0018)
        back = sstep(-0.02, 0.01, y)
        if kind == 'skate':
            # cuello muy acolchado (dos rollos) y laterales mullidos
            d = d - 0.0045 * np.exp(-((z - zc + 0.008) / 0.010) ** 2) * back
            d = d - 0.0015 * np.exp(-((z - zc + 0.024) / 0.008) ** 2) * back
        elif kind == 'running':
            # punto: canalé horizontal fino y cuello justo
            d = d + 0.00022 * np.cos(z * 2 * np.pi / 0.0026) * sstep(0.028, 0.034, z)
            d = d - 0.0018 * np.exp(-((z - zc + 0.005) / 0.006) ** 2) * back
        else:
            d = d - 0.0028 * np.exp(-((z - zc + 0.006) / 0.008) ** 2) * back
        return hollow(d, Q, zc).astype(F32)
    return f


def tongue(kind):
    """Lengüeta: en la skate, gruesa y acolchada; en la running, fina."""
    thick, top = {'skate': (0.0042, 0.114), 'chunky': (0.0036, 0.112), 'running': (0.0022, 0.106)}[kind]
    def f(P):
        Q = local(P); x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
        t = np.abs(last(Q, 0.0060 + thick - 0.0026)) - thick
        reg = np.maximum(np.abs(x - 0.004) - 0.021, np.maximum(y - 0.024, -0.050 - y))
        reg = np.maximum(reg, np.maximum(0.060 - z, z - (top + 0.10 * np.clip(y, 0, None))))
        return smax(t, reg, 0.004).astype(F32)
    return f


def overlays(kind, up):
    """Refuerzos de otro color sobre la piel: talón, puntera, ojalera (y paneles en la chunky)."""
    def f(P):
        Q = local(P); x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
        u = up(P)
        lift = 0.0016 if kind == 'chunky' else 0.0013
        d = np.abs(u + 0.0003) - lift
        heel = np.maximum((0.034 + 0.45 * (z - 0.05)) - y, z - (0.086 if kind != 'running' else 0.074))
        ax = np.abs(x - 0.004)
        if kind == 'running':
            # solo contrafuerte y una ojalera fina
            eye = np.maximum(np.abs(ax - 0.028) - 0.005, np.maximum(-0.092 - y, y + 0.002))
            reg = np.minimum(heel, np.maximum(eye, 0.055 - z))
        else:
            # puntera envolvente (mudguard) hasta media altura
            toe = np.maximum((y + 0.112) - 0.45 * (0.062 - z), z - 0.064)
            eye = np.maximum(np.abs(ax - 0.031) - 0.008, np.maximum(-0.092 - y, y - 0.010))
            eye = np.maximum(eye, 0.050 - z)
            reg = np.minimum(np.minimum(heel, toe), eye)
            if kind == 'chunky':
                # panel lateral ondulado que une puntera y talón por abajo
                wave = z - (0.050 + 0.010 * np.sin(y * 38.0))
                reg = np.minimum(reg, np.maximum(wave, 0.026 - z))
        reg = np.maximum(reg, 0.026 - z)
        return smax(d, reg, 0.0012).astype(F32)
    return f


def gussets(up):
    """Elásticos en V a los dos lados de la pala (slip-on)."""
    def f(P):
        Q = local(P); x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
        u = up(P)
        d = np.abs(u + 0.0004) - 0.0010
        ax = np.abs(x - 0.004)
        # triángulo: de la boca (arriba) hacia la pala, junto al empeine
        tri = np.maximum(np.abs(y + 0.040) - 0.006 - 0.35 * (z - 0.060), 0.060 - z)
        tri = np.maximum(tri, np.maximum(0.012 - ax, ax - 0.040))
        rib = 0.00025 * np.cos((y + 0.04) * 2 * np.pi / 0.0022)
        return (smax(d, tri, 0.0012) + rib).astype(F32)
    return f


def sole(kind):
    def f(P):
        Q = local(P); x, y, z = Q[:, 0], Q[:, 1], Q[:, 2]
        if kind in ('skate', 'slip_on'):
            # vulcanizada: canto recto y alto, raya del «foxing» y punta de goma
            h = 0.036
            d = smax(plan(Q, 0.0068), np.abs(z - h / 2) - h / 2, 0.003)
            d = groove(d, z - 0.027, 0.0007, 0.0010)
            d = groove(d, z - 0.008, 0.0005, 0.0010)
            d = d + 0.0005 * (np.cos(y * 2 * np.pi / 0.006) > 0.4) * sstep(0.003, 0.0, z)
            # punta de goma que sube sobre la puntera
            toe = np.abs(last(Q, 0.0062)) - 0.0017
            toe = smax(toe, z - (0.036 + 0.45 * np.clip(-y - 0.170, 0, None)), 0.002)
            toe = smax(toe, y + 0.168, 0.004)
            d = smin(d, toe, 0.002)
            return d.astype(F32)
        if kind == 'chunky':
            # suela gruesa por capas: más ancha y alta, con ondas y escalón en el talón
            h = 0.050 + 0.006 * sstep(0.0, 0.06, y)
            t = sstep(0.0, 0.07, y)
            d = smax(plan(Q, 0.0105) * (1 - t) + plan(Q, 0.0145) * t, np.abs(z - h / 2) - h / 2, 0.005)
            layer = z - (0.022 + 0.006 * np.sin(y * 34.0 + 0.8))
            d = groove(d, layer, 0.0012, 0.0016)
            d = groove(d, z - (0.040 + 0.004 * np.sin(y * 27.0)), 0.0009, 0.0014)
            d = d + 0.0008 * (np.cos(y * 2 * np.pi / 0.010) > 0.5) * sstep(0.004, 0.0, z)
            d = smax(d, z - (h + 0.10 * np.clip(-y - 0.18, 0, None)), 0.005)
            return d.astype(F32)
        # running: mediasuela de espuma con balancín (más alta en el talón), puntera levantada
        h = 0.026 + 0.014 * sstep(-0.06, 0.04, y)
        lift_toe = 0.35 * np.clip(-y - 0.150, 0, None)
        zb = lift_toe * 0.6
        zt = h + lift_toe
        t = sstep(0.02, 0.08, y)
        pl = plan(Q, 0.0080) * (1 - t) + plan(Q, 0.0125) * t
        d = smax(pl, np.abs(z - (zb + zt) / 2) - (zt - zb) / 2, 0.008)
        d = groove(d, z - (0.008 + zb), 0.0008, 0.0011)                     # goma / espuma
        d = groove(d, z - (zb + zt) / 2 - 0.004, 0.0006, 0.0030)            # esculpido suave
        d = d + 0.0005 * (np.cos(y * 2 * np.pi / 0.008) > 0.4) * sstep(0.003, 0.0, z - zb)
        return d.astype(F32)
    return f


BOXC = (np.array([-0.22, -0.28, -0.003], F32), np.array([0.22, 0.14, 0.20], F32))


def parts(kind):
    up = upper(kind)
    box = BOXC if kind == 'chunky' else BOX
    out = [('body', up, box, 0.0011)]
    if kind != 'slip_on':
        out.append(('body', tongue(kind), box, 0.0011))
        if kind == 'running':
            lf, _ = S.lace_bars(up, n=6, y0=-0.088, y1=-0.006, xoff=0.016, r=0.0020, lift=0.0028)
        else:
            lf, _ = S.lace_bars(up, n=5, y0=-0.082, y1=-0.010, xoff=0.018, r=0.0027, lift=0.0040 if kind == 'skate' else 0.0034)
        out.append(('lace', lf, box, 0.0007))
        out.append(('secondary', overlays(kind, up), box, 0.0009))
    else:
        out.append(('secondary', gussets(up), box, 0.0008))
    out.append(('sole', sole(kind), box, 0.0011))
    return out
