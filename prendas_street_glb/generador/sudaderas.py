"""Sudaderas para Blender (8 variantes), sobre el cuerpo de referencia de 1,78 m con los brazos a 32°.

Mismo sistema que las camisetas (camisetas.py): campo de distancia por corte (tabla STYLES) que se
extrae con marching cubes. Felpa de algodón gruesa (unos 6 mm de tela con su volumen):

  01 sudadera con capucha     02 capucha oversize     03 capucha crop        04 capucha con cremallera
  05 cuello redondo           06 media cremallera     07 cuarto de cremallera 08 deportiva (raglán y pico)

Piezas (papel del material):
- body       la felpa;
- trim       cordones de la capucha;
- hardware   punteras de los cordones y ojales;
- zipper     cremallera (cinta, dientes y tirador).
Aparte (_costuras.glb): pespuntes de recubridora en el canalé de puños, cintura y cuello, la boca del
bolsillo canguro, la tapeta de la cremallera y las costuras raglán.
Coordenadas: Z arriba, frente = -Y.
"""
import math
import numpy as np
from kit import *
from items2 import cuff_blend, arm_ang
from items3 import B, fit_base
from items4 import SHELL, SOLID, solids_bbox, surf_ray, sdf_normal, unit, _cache
from camisetas import arm_rays, ring_rays_at, _rnom, RAG, raglan_d, SAMPLE

UP = ((-0.58, -0.27, 0.62), (0.58, 0.27, 1.62))

# cap: capucha (bajada sobre la espalda); zip: 'full' (abierta delante), 'half' / 'quarter' (cuello
# alto con cremallera hasta zip_z); hem: altura del bajo; band: canalé de la cintura; L: manga;
# cuff: canalé del puño; at: costura de la sisa (más alta = hombro caído); pocket: bolsillo canguro.
STYLES = {
    'capucha': dict(num=1, file='sudadera_capucha', name='Sudadera con capucha', ease=0.032, drape=0.9, arm_ease=0.032, arm_drape=0.5,
                    hem=0.735, band=0.065, L=0.585, cuff=0.065, at=0.060, cap=True, pocket=True, th=0.0062,
                    folds=(0.0085, 0.010, 0.006), color='#9B9BA0'),
    'capucha_oversize': dict(num=2, file='sudadera_capucha_oversize', name='Sudadera con capucha oversize', ease=0.050, drape=0.95,
                             arm_ease=0.040, arm_drape=0.6, hem=0.705, band=0.075, L=0.605, cuff=0.075, at=0.090, cap=True,
                             pocket=True, th=0.0066, folds=(0.0095, 0.012, 0.007), color='#2B2B2E'),
    'capucha_crop': dict(num=3, file='sudadera_capucha_crop', name='Sudadera con capucha crop', ease=0.034, drape=0.9, arm_ease=0.032,
                         arm_drape=0.5, hem=1.000, band=0.060, L=0.585, cuff=0.065, at=0.062, cap=True, pocket=True, th=0.0062,
                         folds=(0.0085, 0.006, 0.005), color='#8FB24F'),
    'cremallera': dict(num=4, file='sudadera_cremallera', name='Sudadera con capucha y cremallera', ease=0.030, drape=0.85,
                       arm_ease=0.030, arm_drape=0.45, hem=0.735, band=0.065, L=0.585, cuff=0.065, at=0.060, cap=True,
                       pocket=True, zip='full', th=0.0060, folds=(0.0080, 0.009, 0.0055), color='#8C8C90'),
    'cuello_redondo': dict(num=5, file='sudadera_cuello_redondo', name='Sudadera de cuello redondo', ease=0.030, drape=0.9,
                           arm_ease=0.030, arm_drape=0.5, hem=0.735, band=0.065, L=0.585, cuff=0.065, at=0.060, th=0.0060,
                           neck=(0.098, 0.094, 1.482, 1.446), rib=0.024, folds=(0.0080, 0.009, 0.0055), color='#BDB9AF'),
    'media_cremallera': dict(num=6, file='sudadera_media_cremallera', name='Sudadera de media cremallera', ease=0.030, drape=0.85,
                             arm_ease=0.030, arm_drape=0.45, hem=0.735, band=0.065, L=0.585, cuff=0.065, at=0.060, th=0.0060,
                             zip='half', zip_z=1.200, folds=(0.0080, 0.009, 0.0055), color='#363B47'),
    'cuarto_cremallera': dict(num=7, file='sudadera_cuarto_cremallera', name='Sudadera de cuarto de cremallera', ease=0.028,
                              drape=0.85, arm_ease=0.028, arm_drape=0.45, hem=0.740, band=0.065, L=0.585, cuff=0.065, at=0.060,
                              th=0.0058, zip='quarter', zip_z=1.320, folds=(0.0080, 0.009, 0.0055), color='#6E6A62'),
    'deportiva': dict(num=8, file='sudadera_deportiva', name='Sudadera deportiva', ease=0.034, drape=0.9, arm_ease=0.032, arm_drape=0.5,
                      hem=0.735, band=0.070, L=0.585, cuff=0.070, at=None, raglan=True, vinsert=True, th=0.0062,
                      neck=(0.098, 0.094, 1.482, 1.446), rib=0.024, folds=(0.0080, 0.009, 0.0055), color='#A6A6A9'),
}

PIEZAS = ['Delantero', 'Espalda', 'Manga izquierda', 'Manga derecha', 'Cuello', 'Puño izquierdo', 'Puño derecho', 'Tapeta',
          'Capucha', 'Cintura']
COLLAR_TOP = 1.535          # borde del cuello alto (media y cuarto de cremallera)
HOOD_C = np.array([0, 0.095, 1.425], F32)
HOOD_R = np.array([0.150, 0.072, 0.092], F32)
ZIP_GAP = 0.004


def configure(key):
    global ST, KEY, CATALOG
    ST = STYLES[key]; KEY = key
    for k in [k for k in _cache if str(k).startswith('sw_')]:
        del _cache[k]
    CATALOG = [(f"{ST['num']:02d}_{ST['file']}", ST['name'], sudadera, UP)]


def body():
    s = ST
    return B(ease=s['ease'], drape=s['drape'], drape_from=1.30, arm_ease=s['arm_ease'], arm_drape=s['arm_drape'])


def hood_d(P):
    """Capucha bajada, aplastada sobre la espalda alta."""
    Q = (P - HOOD_C) / HOOD_R
    return ((np.linalg.norm(Q, axis=1) - 1) * HOOD_R.min()).astype(F32)


def collar_d(P):
    """Cuello alto (tubo algo cónico alrededor del cuello)."""
    return round_cone(P, [0, 0.008, 1.40], [0, 0.012, 1.64], 0.078, 0.073)


def base_fn(b):
    s = ST
    def f(P):
        d = b.upper(P)
        if s.get('cap'):
            d = smin(d, hood_d(P), 0.04)
        if s.get('zip') in ('half', 'quarter'):
            d = smin(d, collar_d(P), 0.035)
        return d
    return f


def pocket_poly(sx=None):
    """Bolsillo canguro (con bocas en diagonal); con cremallera, dos mitades."""
    z0, z1 = (ST['hem'] + ST['band'] - 0.005, ST['hem'] + ST['band'] + 0.20)
    if ST.get('cap') and KEY == 'capucha_crop':
        z0, z1 = ST['hem'] + ST['band'] - 0.004, ST['hem'] + ST['band'] + 0.150
    w0, w1 = (0.17, 0.125) if KEY != 'capucha_oversize' else (0.18, 0.13)
    if ST.get('zip') == 'full':
        return [(sx * 0.012, z0), (sx * w0, z0), (sx * w1, z1), (sx * 0.012, z1)]
    return [(-w0, z0), (w0, z0), (w1, z1), (-w1, z1)]


def sweat(P):
    s = ST
    b = body()
    g = Gar(P, b, base_fn(b), th=s['th'])
    L = s['L']
    cuff_blend(g, L, s['cuff'], fit_base(P, 0.012, 0.006), extra=0.05)
    # cintura de canalé ceñida y la felpa que se abolsa encima
    zb = s['hem'] + s['band']
    g.blend(fit_base(P, 0.014, 0.006), sstep(zb + 0.03, zb - 0.01, g.z) * g._not_arm() * 0.75)
    hz = s['hem'] + 0.002 * noise(g.P * [1, 1, 0], 6, 3)
    g.keep(hz - g.z); hem = g.z - hz
    sl = g.cut_sleeve(L)
    if s.get('zip') in ('half', 'quarter'):
        g.keep(g.z - (COLLAR_TOP + 0.004 * np.sin(g.theta)))
        neck = (COLLAR_TOP + 0.004 * np.sin(g.theta)) - g.z
    elif s.get('cap'):
        neck = -g.cut_neck(a=0.110, b=0.106, z_back=1.49, z_front=1.445)
    else:
        a, bb, zbk, zf = s['neck']
        neck = -g.cut_neck(a=a, b=bb, z_back=zbk, z_front=zf)
    if s.get('zip') == 'full':
        g.cut_front_open(gap=ZIP_GAP)
    # pliegues
    fs, ft, fd = s['folds']
    g.sleeve_strokes(8, 0.07, L - 0.08, amp=fs, w=0.011, seed=101 + s['num'], dense_at=L - s['cuff'], dense_n=6, dense_len=0.13)
    g.drape_strokes(10, 1.20, zb + 0.02, amp=ft, w=0.015, seed=103 + s['num'])
    g.drag_strokes(4, amp=fd, w=0.009, seed=107 + s['num'])
    g.hem_blouse(zb, zb + 0.09, 9, amp=0.005, seed=109 + s['num'])
    g.wobble(0.0015)
    # costuras
    g.side_seams(zmin=s['hem'] + 0.01, xmin=0.10)
    shoulder = (g.z > 1.40) * sstep(0.07, 0.085, np.abs(g.x)) * g._not_arm() * (hood_d(g.P) > 0.01 if s.get('cap') else 1.0)
    g.groove(g.y - 0.004, depth=0.0010, width=0.0022, mask=shoulder)
    if s.get('raglan'):
        for front in (True, False):
            for sx in (1, -1):
                g.line_groove((sx * RAG[0][0], RAG[0][1]), (sx * RAG[1][0], RAG[1][1]), front=front, depth=0.0016, width=0.0026)
    else:
        g.armhole_seams(s['at'])
    # canalé: cintura, puños y cuello
    g.ribbed(hem, s['band'], g.theta, 74, 0.0010, 0.0022)
    g.ribbed(sl, s['cuff'], arm_ang(g), 24, 0.0010, 0.0018)
    if s.get('cap'):
        g.band(neck, 0.012, raise_=0.0018)
        g.groove(g.x, depth=0.0022, width=0.004, mask=(g.y > 0.03) * (g.z > 1.43))        # costura central de la capucha
        q = np.sqrt((g.x / 0.14) ** 2 + ((g.z - 1.46) / 0.06) ** 2)
        rim = (q - 1) * 0.07
        hm = sstep(0.05, 0.10, g.y) * sstep(1.37, 1.40, g.z)
        g.o += 0.0035 * sstep(0.004, -0.004, rim) * hm
        g.groove(rim, depth=0.0025, width=0.003, mask=hm)
    elif s.get('zip') in ('half', 'quarter'):
        g.hem(neck, 0.012, roll=0.0022, band=0.012)                                        # borde del cuello alto
        g.groove(g.z - 1.476, depth=0.0014, width=0.0024, mask=sstep(0.13, 0.10, np.hypot(g.x, g.y)))   # unión cuello-cuerpo
    else:
        g.ribbed(neck, s['rib'], g.theta, 90, 0.0002, 0.0016)
    if s.get('vinsert'):        # pico deportivo bajo el cuello (triángulo de canalé)
        zt = s['neck'][3] - s['rib']
        dv = (zt - 0.075 + 1.3 * np.abs(g.x) - g.z)
        front = sstep(-0.02, -0.05, g.y)
        tri = (dv < 0) * (g.z < zt) * front
        g.o += 0.0012 * sstep(0.002, -0.002, dv) * (g.z < zt) * front
        g.groove(dv / math.sqrt(1 + 1.69), depth=0.0012, width=0.0022, mask=(g.z < zt + 0.004) * front)
    # tapeta de la cremallera
    if s.get('zip'):
        z_lo = s['hem'] if s['zip'] == 'full' else s['zip_z']
        m = (g.y < 0) * (g.z > z_lo) * (g.z < (1.56 if s['zip'] != 'full' else 1.47))
        g.groove(np.abs(g.x) - 0.012, depth=0.0010, width=0.0018, mask=m)
        if s['zip'] != 'full':
            g.groove(np.hypot(g.x, g.z - z_lo) - 0.012, depth=0.0010, width=0.0018, mask=(g.y < 0) * (g.z < z_lo + 0.002))
    # bolsillo canguro
    if s.get('pocket'):
        polys = [pocket_poly(1), pocket_poly(-1)] if s.get('zip') == 'full' else [pocket_poly()]
        for pp in polys:
            g.patch_xz(lambda x, z, pp=pp: sd_poly(x, z, pp), lift=0.0046, puff=0.0035)
        for sx in (1, -1):
            p = pocket_poly(sx) if s.get('zip') == 'full' else pocket_poly()
            a0, a1 = (p[1], p[2]) if (s.get('zip') == 'full' or sx > 0) else (p[0], p[3])
            g.line_groove((a0[0] + (-0.002 if a0[0] > 0 else 0.002), a0[1] + 0.012), (a1[0], a1[1] - 0.012), depth=0.0022, width=0.0024)
    g.neck_in, g.sleeve_in, g.hem_in = neck, sl, hem
    return g


def _sdf(Q):
    return sweat(Q).sdf()


# ---------------------------------------------------------------- piezas sólidas
def _cords():
    """Cordones de la capucha con punteras metálicas y ojales."""
    if 'sw_cord' not in _cache:
        lines = []
        for sx in (1, -1):
            x0 = sx * (0.040 if ST.get('zip') != 'full' else 0.050)
            p = surf_ray(_sdf, (x0, 0.0, 1.447), (0, -1, 0), span=0.40)
            if p is None:
                continue
            t = p + sdf_normal(_sdf, p) * 0.002
            pts = [t]
            for z in (1.40, 1.34, 1.29):
                x = sx * (abs(x0) + (1.447 - z) * 0.05)
                q = surf_ray(_sdf, (x, 0.0, z), (0, -1, 0), span=0.40)
                y = (q[1] if q is not None else t[1]) - 0.0045
                pts.append(np.array([x, y, z], F32))
            lines.append(pts)
        _cache['sw_cord'] = lines
    out = []
    for l in _cache['sw_cord']:
        out.append(SOLID((lambda l: lambda Q: capsule_pts(Q, l, 0.0034))(l), solids_bbox(l, 0.01), 'trim', h=0.0009))
        tip = l[-1]; d = unit(l[-1] - l[-2]); e = tip + d * 0.026
        out.append(SOLID((lambda a, b: lambda Q: round_cone(Q, a, b, 0.0040, 0.0037))(tip - d * 0.002, e),
                         solids_bbox([tip, e], 0.01), 'hardware', h=0.0006))
        c = l[0]; n = sdf_normal(_sdf, c)
        def eyelet(Q, c=c, n=n):
            q = Q - c; al = q @ n; rad = np.linalg.norm(q - np.outer(al, n), axis=1)
            return (np.sqrt((rad - 0.0052) ** 2 + al ** 2) - 0.0014).astype(F32)
        out.append(SOLID(eyelet, (c - 0.012, c + 0.012), 'hardware', h=0.0005))
    return out


def _zip_points():
    s = ST
    if 'sw_zip' not in _cache:
        z0 = s['hem'] + 0.004 if s['zip'] == 'full' else s['zip_z']
        z1 = 1.452 if s['zip'] == 'full' else COLLAR_TOP - 0.003
        pts = []
        for z in np.arange(z0, z1, 0.010):
            p = surf_ray(_sdf, (0.006, 0.0, z), (0, -1, 0), span=0.40)
            if p is not None:
                p = p.copy(); p[0] = 0.0; pts.append(p)
        _cache['sw_zip'] = np.asarray(pts, F32)
    return _cache['sw_zip']


def _zipper():
    zp = _zip_points()
    line = [p + np.array([0, -0.0012, 0], F32) for p in zp]
    tape = lambda Q: (capsule_pts(Q, line, 0.0040) + 0.0004 * np.sign(np.sin(Q[:, 2] * 2 * np.pi / 0.0050))).astype(F32)
    out = [SOLID(tape, solids_bbox(zp, 0.008), 'zipper', h=0.0010)]
    top = zp[np.argmax(zp[:, 2])]
    c = top + np.array([0, -0.0068, -0.030], F32)
    def puller(Q):
        a = round_cone(Q, c + np.array([0, 0, 0.022], F32), c - np.array([0, 0, 0.012], F32), 0.0050, 0.0064)
        hole = round_cone(Q, c - np.array([0, 0, 0.003], F32), c - np.array([0, 0, 0.008], F32), 0.0021, 0.0021)
        return smax(np.maximum(a, np.abs(Q[:, 1] - c[1]) - 0.0019), -hole, 0.0005).astype(F32)
    out.append(SOLID(puller, (c - 0.03, c + 0.03), 'zipper', h=0.0007))
    return out


def sudadera():
    s = ST
    if s.get('raglan'):
        def part(keep_body):
            def f(P):
                g = sweat(P)
                kind, sh, R, th = g.layer()
                d = raglan_d(g)
                return (kind, sh, np.maximum(R, d if keep_body else -d).astype(F32), th)
            return f
        out = [SHELL(part(True), 'body'), SHELL(part(False), 'body')]
    else:
        out = [SHELL(lambda P: sweat(P).layer(), 'body')]
    if s.get('cap'):
        out += _cords()
    if s.get('zip'):
        out += _zipper()
    return out


# ---------------------------------------------------------------- pespuntes
def seam_paths():
    s = ST
    P = []
    ths = np.linspace(-np.pi, np.pi, int(2 * np.pi * 0.20 / SAMPLE), endpoint=False).astype(F32)
    if s.get('zip') == 'full':
        ths = ths[np.abs(np.angle(np.exp(1j * (ths + np.pi / 2)))) > 0.10]
    # cintura: pespunte de recubridora en la costura del canalé
    z = np.full_like(ths, s['hem'] + s['band'] + 0.004)
    if s.get('zip') == 'full':
        for k, m in enumerate((ths > -np.pi / 2, ths < -np.pi / 2)):
            P.append((f'cintura_{k}',) + ring_rays_at(z[m], ths[m]))
    else:
        P.append(('cintura',) + ring_rays_at(z, ths))
    angs = np.linspace(-np.pi, np.pi, int(2 * np.pi * 0.07 / SAMPLE), endpoint=False).astype(F32)
    for sd in (1, -1):
        P.append((f'puno_{sd}',) + arm_rays(sd, s['L'] - s['cuff'] - 0.004, angs))
    # cuello redondo: pespunte bajo el canalé
    if not s.get('cap') and not s.get('zip'):
        a, b, zb, zf = s['neck']; off = s['rib'] + 0.006
        ph = np.linspace(-np.pi, np.pi, int(2 * np.pi * 0.10 / SAMPLE), endpoint=False)
        x = (a + off * 0.75) * np.cos(ph); y = 0.006 + (b + off * 0.75) * np.sin(ph)
        t = np.clip((y - 0.006) / b, -1, 1)
        zn = zb + (zf - zb) * np.clip(-t, 0, 1) ** 1.6 - 0.005 * (1 - np.abs(t))
        tgt = np.stack([x, y, zn - off * (0.35 + 0.65 * np.clip(-t, 0, 1))], 1).astype(F32)
        O = np.tile(np.array([0, 0.004, 1.30], F32), (len(tgt), 1)); D = tgt - O; D /= np.linalg.norm(D, axis=1)[:, None]
        P.append(('cuello', O, D))
    # cremallera: pespuntes a los lados de la tapeta
    if s.get('zip'):
        z_lo = s['hem'] + s['band'] + 0.004 if s['zip'] == 'full' else s['zip_z'] + 0.004
        z_hi = 1.44 if s['zip'] == 'full' else COLLAR_TOP - 0.008
        zs = np.arange(z_lo, z_hi, SAMPLE)
        for sx in (1, -1):
            O = np.stack([np.full_like(zs, sx * 0.0115), np.zeros_like(zs), zs], 1).astype(F32)
            D = np.tile(np.array([0, -1.0, 0], F32), (len(zs), 1))
            P.append((f'tapeta_{sx}', O, D))
    # bocas del bolsillo canguro
    if s.get('pocket'):
        for sx in (1, -1):
            p = pocket_poly(sx) if s.get('zip') == 'full' else pocket_poly()
            a0, a1 = (p[1], p[2]) if (s.get('zip') == 'full' or sx > 0) else (p[0], p[3])
            a0 = np.array(a0); a1 = np.array(a1)
            e = a1 - a0; e /= np.linalg.norm(e); nn = np.array([-e[1], e[0]]) * (-np.sign(a0[0]))
            n = int(np.linalg.norm(np.array(a1) - np.array(a0)) / SAMPLE)
            t = np.linspace(0.06, 0.94, n)[:, None]
            xz = a0 + (a1 - a0) * t - nn * 0.008
            O = np.stack([xz[:, 0], np.zeros(n), xz[:, 1]], 1).astype(F32)
            D = np.tile(np.array([0, -1.0, 0], F32), (n, 1))
            P.append((f'bolsillo_{sx}', O, D))
    if s.get('raglan'):
        (x0, z0), (x1, z1) = RAG
        n = int(np.hypot(x1 - x0, z1 - z0) / SAMPLE)
        e = np.array([x1 - x0, z1 - z0]); e /= np.linalg.norm(e); nn = np.array([e[1], -e[0]])
        if nn[0] < 0: nn = -nn
        for sx in (1, -1):
            for front in (True, False):
                for k, off in enumerate((0.004, -0.004)):
                    t = np.linspace(0.06, 1.0, n)[:, None]
                    xz = np.array([x0, z0]) + (np.array([x1, z1]) - np.array([x0, z0])) * t + nn * off
                    xz[:, 0] *= sx
                    O = np.stack([xz[:, 0], np.zeros(n), xz[:, 1]], 1).astype(F32)
                    D = np.tile(np.array([0, -1.0 if front else 1.0, 0], F32), (n, 1))
                    P.append((f'raglan_{sx}_{int(front)}_{k}', O, D))
    return P


# ---------------------------------------------------------------- campos para Blender
def campos(V, N):
    s = ST
    V = np.asarray(V, F32); N = np.asarray(N, F32)
    out_p = np.zeros(len(V), np.int8); tej = np.zeros((len(V), 2), F32); inter = np.zeros(len(V), np.uint8); can = np.zeros(len(V), F32)
    for i in range(0, len(V), 60000):
        p, t, it, c = _campos(V[i:i + 60000], N[i:i + 60000])
        out_p[i:i + 60000] = p; tej[i:i + 60000] = t; inter[i:i + 60000] = it; can[i:i + 60000] = c
    return out_p, tej, inter, can


def _campos(V, N):
    s = ST
    g = sweat(V)
    x, y, z = V[:, 0], V[:, 1], V[:, 2]
    pieza = np.where(y < 0.004, 0, 1).astype(np.int8)
    tej = np.zeros((len(V), 2), F32)
    r = np.hypot(x, y); th = np.arctan2(y, x)
    tej[:, 0] = th * _rnom(z, r, 0.01); tej[:, 1] = z
    interior = (N[:, 0] * x + N[:, 1] * y) / (r + 1e-6) < -0.15
    rag = raglan_d(g) if s.get('raglan') else None
    b = g.b
    for k, sd in enumerate((1, -1)):
        u, a, w = g.arm(sd)
        m = (x * sd > 0) & ((rag > 0) if rag is not None else ((w > 0.35) & (u > s['at'])))
        if not m.any():
            continue
        S, E, W = b.arm[sd]
        W2 = W + (W - E) / np.linalg.norm(W - E) * 0.2
        uu, aa, dist = limb_coords(V[m], [S, E, W2])
        L1 = np.linalg.norm(E - S)
        d1 = (E - S) / L1; d2 = (W2 - E) / np.linalg.norm(W2 - E)
        first = (uu <= L1)[:, None]
        d = np.where(first, d1[None], d2[None])
        base = np.where(first, S[None] + d1[None] * uu[:, None], E[None] + d2[None] * (uu - L1)[:, None])
        rv = V[m] - base; rv -= d * np.sum(rv * d, 1)[:, None]
        out = np.array([sd, 0, 0], F32)
        ref = out[None] - d * np.sum(out[None] * d, 1)[:, None]; ref /= np.linalg.norm(ref, axis=1)[:, None]
        ang = np.arctan2(np.sum(rv * np.cross(d, ref), 1), np.sum(rv * ref, 1))
        rr = np.linalg.norm(rv, axis=1)
        pieza[m] = 2 + k
        tej[m, 0] = ang * _rnom(uu, rr, 0.01) if m.sum() > 50 else ang * 0.07; tej[m, 1] = uu
        interior[m] = np.sum(N[m] * rv, 1) / (rr + 1e-6) < -0.15
        c = m.copy(); c[m] = g.sleeve_in[m] < s['cuff']
        pieza[c] = 5 + k
    if s.get('cap'):
        hood = (hood_d(V) < 0.035) & (y > 0.02) & (z > 1.38)
        pieza[hood] = 8
    collar = (g.neck_in < (s.get('rib') or 0.03) + 0.0015) & (z > 1.40) & ~(pieza == 8)
    pieza[collar] = 4
    band = g.hem_in < s['band']
    pieza[band & (pieza <= 1)] = 9
    canale = np.maximum(sstep(s['band'] + 0.0025, s['band'] - 0.0005, g.hem_in),
                        sstep(s['cuff'] + 0.0025, s['cuff'] - 0.0005, g.sleeve_in) * (np.abs(x) > 0.2))
    if s.get('rib'):
        canale = np.maximum(canale, sstep(s['rib'] + 0.0025, s['rib'] - 0.0005, g.neck_in) * (z > 1.30))
    return pieza, tej, interior.astype(np.uint8), canale.astype(F32)


def ejes():
    s = ST
    return {'estilo': KEY, 'nombre': s['name'], 'color': s['color'], 'color2': s.get('color2'), 'tejido': 'felpa',
            'piezas': PIEZAS, 'L': s['L'], 'hem': s['hem']}


configure(__import__('os').environ.get('SUDADERA_ESTILO', 'capucha'))
