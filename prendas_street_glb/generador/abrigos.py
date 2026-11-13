"""Abrigos para Blender (7 variantes), sobre el cuerpo de referencia de 1,78 m con los brazos a 32°.

Mismo sistema que chaquetas.py, con un tronco que sigue por debajo de la cadera en línea A
(`CoatBody`: la sección de la cadera se abre `flare` cada 40 cm y llega hasta `zlow`).

  01 gabardina (trench, cruzada y con cinturón)   02 abrigo de lana (chesterfield)   03 abrigo largo
  04 parka (capucha con pelo)                      05 chaquetón marinero (cruzado)   06 trenca (trabillas)
  07 plumífero largo (acolchado con capucha)

Solapas (escote en V + solapa levantada + cuello camisero grande), cruzado (tapeta montada y dos
filas de botones), capucha bajada sobre la espalda, cinturón con hebilla, aberturas traseras,
hombreras, trabillas de los puños, bolsillos con solapa, en vivo o con cremallera.

Piezas (papel del material): body, trim (pelo de la capucha, cinturón, presillas de la trenca),
button (botones y trabillas de madera), hardware (hebillas, broches), zipper.
Aparte (_costuras.glb): pespuntes.
Coordenadas: Z arriba, frente = -Y.
"""
import math
import numpy as np
from kit import *
from core import Body
from items2 import cuff_blend, arm_ang
from items3 import B, fit_base, ARM
from items4 import (SHELL, SOLID, placed, front_points, button_specs, collar, flap_pocket, surf_ray, sdf_normal, unit,
                    solids_bbox, _surf_from_axis, _cuff_button_specs, hood_down_d, fur_ruff, _cache)
from items5 import quilt
from camisetas import arm_rays, ring_rays_at, _rnom, SAMPLE
from chaquetas import teeth, _seg_dist, sleeve_coords, _line_pts, _u_path, _front_rays

UP = ((-0.64, -0.32, 0.26), (0.64, 0.32, 1.70))

# front: sb (botonadura sencilla), db (cruzado), hidden (tapeta oculta), zip, toggle.  zv: fondo del escote en V.
# lapel: ancho de la solapa (0 = sin solapas).  hood: capucha bajada ('fur' con pelo).  belt: cinturón a esa altura.
STYLES = {
    'gabardina': dict(num=1, file='gabardina', name='Gabardina', ease=0.050, drape=0.9, flare=0.05, arm_ease=0.036,
                      arm_drape=0.4, th=0.0068, hem=0.420, L=0.615, at=0.062, front='db', zv=1.240, lapel=0.070,
                      collar_w=0.058, belt=1.020, epaulettes=True,
                      gunflap=True, cuffstrap=True, pockets=('welt',), vent=0.30, tejido='sarga', color='#C2A77F',
                      color_trim='#C2A77F', forro='#7A3B33', folds=(0.010, 0.012, 0.008)),
    'lana': dict(num=2, file='abrigo_lana', name='Abrigo de lana', ease=0.044, drape=0.9, flare=0.03, arm_ease=0.034,
                 arm_drape=0.35, th=0.0085, hem=0.500, L=0.615, at=0.060, front='sb', n_btn=3, zv=1.150, lapel=0.060,
                 collar_w=0.052, cuffbuttons=True,
                 pockets=('flaphip', 'chestwelt'), vent=0.25, tejido='lana', color='#3A3B3F', forro='#2A2C33',
                 boton='#1E1D1C', folds=(0.009, 0.010, 0.007)),
    'largo': dict(num=3, file='abrigo_largo', name='Abrigo largo', ease=0.048, drape=0.95, flare=0.06, arm_ease=0.036,
                  arm_drape=0.4, th=0.0085, hem=0.330, L=0.615, at=0.064, front='hidden', zv=1.180, lapel=0.075,
                  collar_w=0.060, pockets=('welt',), vent=0.35,
                  tejido='lana', color='#B08C64', forro='#B08C64', folds=(0.010, 0.012, 0.008)),
    'parka': dict(num=4, file='parka', name='Parka', ease=0.058, drape=0.95, flare=0.03, arm_ease=0.040, arm_drape=0.3,
                  th=0.0074, hem=0.600, L=0.610, at=0.066, front='zip', storm=0.050, n_btn=6, hood='fur', lapel=0.0,
                  pockets=('flapchest', 'flaphip'), waistcord=1.040, cuffband=0.050, tejido='sarga', color='#4D5440',
                  color_trim='#8E8478', forro='#D0651F', folds=(0.012, 0.014, 0.009)),
    'chaqueton': dict(num=5, file='chaqueton', name='Chaquetón marinero', ease=0.040, drape=0.8, flare=0.02,
                      arm_ease=0.032, arm_drape=0.3, th=0.0090, hem=0.700, L=0.610, at=0.060, front='db', zv=1.260,
                      lapel=0.080, collar_w=0.068,
                      pockets=('vertslash',), tejido='lana', color='#1F2533', forro='#1F2533', boton='#141619',
                      folds=(0.008, 0.009, 0.006)),
    'trenca': dict(num=6, file='trenca', name='Trenca', ease=0.054, drape=0.9, flare=0.04, arm_ease=0.038, arm_drape=0.35,
                   th=0.0090, hem=0.560, L=0.610, at=0.064, front='toggle', hood='plain', lapel=0.0, yoke=True,
                   pockets=('patchhip',), tejido='lana', color='#A88A63', color_trim='#3A3026', forro='#5C4B3A',
                   boton='#E2D5BC', folds=(0.010, 0.011, 0.008)),
    'plumifero_largo': dict(num=7, file='plumifero_largo', name='Plumífero largo', ease=0.062, drape=0.85, flare=0.04,
                            arm_ease=0.048, arm_drape=0.35, th=0.0085, hem=0.420, L=0.600, at=0.066, front='zip',
                            hood='plain', lapel=0.0, quilt=True, cuffband=0.035, pockets=('zipwelt',), tejido='nailon',
                            color='#1C1D20', forro='#1C1D20', folds=(0.004, 0.0, 0.0)),
}

PIEZAS = ['Delantero izquierdo', 'Delantero derecho', 'Espalda', 'Manga izquierda', 'Manga derecha', 'Puño izquierdo',
          'Puño derecho', 'Cuello', 'Bajo', 'Tapeta', 'Bolsillos', 'Capucha']
DB_EDGE = -0.090           # borde del delantero de encima en los cruzados
DB_COLS = (-0.068, 0.068)  # filas de botones
ZIP_GAP = 0.004


class CoatBody(Body):
    """Tronco que sigue por debajo de la cadera en línea A hasta `zlow`."""
    def __init__(s, flare=0.04, zlow=0.30, **kw):
        kw.setdefault('arm_deg', ARM)
        Body.__init__(s, **kw)
        s.flare = flare; s.zlow = zlow

    def torso(s, P):
        z = P[:, 2]
        d = Body.torso(s, P)
        Q = P.copy(); Q[:, 2] = np.maximum(z, 0.88)
        k = 1 + s.flare * np.clip(0.88 - z, 0, None) / 0.40
        Q[:, 0] /= k; Q[:, 1] /= k
        d2 = Body.torso(s, Q) * k
        d2 = np.maximum(d2, s.zlow - z)
        w = sstep(0.92, 0.86, z)
        return (d * (1 - w) + d2 * w).astype(F32)


def configure(key):
    global ST, KEY, CATALOG
    ST = STYLES[key]; KEY = key
    for k in [k for k in _cache if str(k).startswith('ab_')]:
        del _cache[k]
    CATALOG = [(f"{ST['num']:02d}_{ST['file']}", ST['name'], abrigo, UP)]


def body():
    s = ST
    return CoatBody(flare=s['flare'], zlow=s['hem'] - 0.05, ease=s['ease'], drape=s['drape'], drape_from=1.30,
                    arm_ease=s['arm_ease'], arm_drape=s['arm_drape'])


def hood_d(P):
    return hood_down_d(P, 0.010 + (ST['ease'] - 0.05) * 0.5)


def base_fn(b):
    def f(P):
        d = b.upper(P)
        if ST.get('hood'):
            d = smin(d, hood_d(P), 0.05)
        return d
    return f


def lapel_poly(sx):
    s = ST
    zv, w = s['zv'], s['lapel']
    if s.get('peak'):              # solapa de pico (cruzada): la punta sube hacia el hombro
        pts = [(0.012, zv), (0.100, 1.448), (0.112 + w, 1.432), (0.090 + w, 1.395), (0.072 + w, zv + 0.080), (0.040 + w * 0.35, zv - 0.030)]
    else:
        pts = [(0.012, zv), (0.100, 1.448), (0.100 + w, 1.392), (0.072 + w, zv + 0.080), (0.040 + w * 0.35, zv - 0.030)]
    pts = [(sx * px, pz) for px, pz in pts]
    return pts if sx > 0 else pts[::-1]


def hip_pocket():
    s = ST
    return s.get('hip_pocket') or (0.130, 0.880 if s['hem'] < 0.62 else 0.900, 0.165, 0.165, 0.055)


def coat(P):
    s = ST
    b = body()
    g = Gar(P, b, base_fn(b), th=s['th'])
    L = s['L']
    if s.get('cuffband'):
        cuff_blend(g, L, s['cuffband'], fit_base(P, 0.016, 0.010), extra=0.05)
    hz = s['hem'] + 0.002 * noise(g.P * [1, 1, 0], 5, 3)
    g.keep(hz - g.z); hem = g.z - hz
    sl = g.cut_sleeve(L)
    # ---------- escote: solapas (V) o capucha
    if s['lapel'] > 0:
        neck = -g.cut_neck(a=0.096, b=0.094, z_back=1.468, z_front=1.440)
        slope = (1.448 - s['zv']) / 0.100
        dv = (s['zv'] + slope * np.abs(g.x) - g.z) / math.sqrt(1 + slope * slope)
        front = sstep(-0.02, -0.05, g.y)
        g.keep(np.where(front > 0.5, -dv, -1.0))
        neck = np.where(front > 0.5, np.minimum(neck, dv), neck).astype(F32)
    else:
        neck = -g.cut_neck(a=0.112, b=0.108, z_back=1.505, z_front=1.450)
    front_edge = None
    if s['front'] == 'zip':
        fe = g.cut_front_open(gap=ZIP_GAP)
        front_edge = np.where(g.y < 0, fe, 1.0).astype(F32)
    # ---------- pliegues
    fs, ft, fd = s['folds']
    if s.get('quilt'):
        quilt(g, 0.095, 0.014, arm_sp=0.080, z0=s['hem'] - 0.004)
        g.sleeve_strokes(5, 0.10, L - 0.05, amp=0.004, w=0.010, seed=401, dense_at=L - 0.04, dense_n=5, dense_len=0.08)
    else:
        g.sleeve_strokes(8, 0.07, L - 0.06, amp=fs, w=0.012, seed=401 + s['num'], dense_at=L - 0.05, dense_n=6, dense_len=0.12)
        g.drape_strokes(11, 1.20, s['hem'] + 0.03, amp=ft, w=0.018, seed=403 + s['num'])
        g.drag_strokes(4, amp=fd, w=0.010, seed=407 + s['num'])
    g.wobble(0.0018)
    # ---------- costuras
    g.side_seams(zmin=s['hem'] + 0.01, xmin=0.10)
    shoulder = (g.z > 1.40) * sstep(0.07, 0.085, np.abs(g.x)) * g._not_arm()
    g.groove(g.y - 0.004, depth=0.0012, width=0.0022, mask=shoulder)
    g.armhole_seams(s['at'])
    if s.get('structured'):        # hombrera y copa de la manga armada
        pad = (g.z > 1.33) * g._not_arm() * sstep(0.095, 0.130, np.abs(g.x)) * sstep(0.06, 0.0, np.abs(g.y - 0.004))
        g.o += 0.0050 * pad * sstep(1.33, 1.40, g.z)
        for sd in (1, -1):
            u, a, w = g.arm(sd)
            top = (w > 0.4) * sstep(1.25, 1.33, g.z)
            g.ridge(u - s['at'] - 0.007, height=0.0030, width=0.0060, mask=top)
    if s.get('sidevents'):         # dos aberturas laterales detrás
        for sx in (1, -1):
            m = (g.y > 0) * (g.z < s['hem'] + 0.20) * (g.z > s['hem']) * (np.sign(g.x) == sx)
            g.groove(np.abs(g.x) - 0.120, depth=0.0016, width=0.0016, mask=m)
            g.o += 0.0016 * sstep(0.004, -0.002, np.abs(g.x) - 0.120) * sstep(0.0, 0.03, np.abs(g.x) - 0.09) * m
    g.groove(g.x, depth=0.0012, width=0.0020, mask=(g.y > 0) * g._not_arm() * (g.z < 1.40) * (g.z > s['hem']))   # costura central trasera
    if s.get('vent'):              # abertura trasera: el lado de encima monta
        m = (g.y > 0) * (g.z < s['hem'] + s['vent']) * (g.z > s['hem'])
        g.o += 0.0020 * sstep(-0.002, 0.004, g.x) * m * sstep(0.03, 0.0, np.abs(g.x))
        g.groove(g.x - 0.002, depth=0.0016, width=0.0016, mask=m)
        g.groove(g.z - s['hem'] - s['vent'], depth=0.0010, width=0.0016, mask=(g.y > 0) * (np.abs(g.x) < 0.035))
    # ---------- bajo y puños
    if s.get('quilt'):
        g.band(hem, 0.030, raise_=0.0026)
    else:
        g.hem(hem, 0.030, roll=0.0028, band=0.035)
    if s.get('cuffband'):
        g.band(sl, s['cuffband'], raise_=0.0024)
    else:
        g.hem(sl, 0.035, roll=0.0026, band=0.040)
    if s.get('cuffstrap'):         # trabilla abrochada alrededor del puño
        for sd in (1, -1):
            u, a, w = g.arm(sd)
            m = (w > 0.5) * sstep(0.020, 0.016, np.abs(u - (L - 0.085)))
            g.o += 0.0032 * m; g.th += 0.0012 * m
            g.groove(np.abs(u - (L - 0.085)) - 0.018, depth=0.0010, width=0.0015, mask=(w > 0.5))
    # ---------- solapas y cierre
    if s['lapel'] > 0:
        # cuello vuelto: tira levantada alrededor del escote, por encima de la muesca de la solapa
        cw = s['collar_w']
        cm = sstep(cw + 0.002, cw - 0.002, neck) * sstep(1.385, 1.400, g.z) * sstep(0.0, 0.008, neck)
        g.o += 0.0060 * cm; g.th += 0.0022 * cm
        g.groove(neck - cw, depth=0.0018, width=0.0020, mask=sstep(1.385, 1.400, g.z))
        g.groove(neck - cw + 0.006, depth=0.0006, width=0.0012, mask=sstep(1.39, 1.41, g.z))
        g.hem(neck, 0.006, roll=0.0030, band=0.010)                     # doblez del cuello
        for sx in (1, -1):
            d2 = sd_poly(g.x, g.z, lapel_poly(sx))
            front = sstep(0.02, -0.02, g.y)
            ins = sstep(0.0015, -0.0015, d2) * front
            g.o += ins * (0.0055 + 0.0012 * sstep(0, -0.03, d2)); g.th += 0.0020 * ins
            g.groove(d2, depth=0.0018, width=0.0022, mask=front)
            g.groove(d2 + 0.006, depth=0.0006, width=0.0012, mask=front * (d2 < 0))
    if s['front'] == 'db':        # cruzado: el delantero de encima monta sobre el otro
        m = (g.y < 0) * g._not_arm() * (g.z > s['hem']) * (g.z < s['zv'] + 0.01)
        g.o += 0.0028 * sstep(-0.002, 0.004, g.x - DB_EDGE) * m
        g.groove(g.x - DB_EDGE, depth=0.0018, width=0.0018, mask=m)
        g.groove(g.x - DB_EDGE - 0.007, depth=0.0006, width=0.0012, mask=m)
    elif s['front'] in ('sb', 'hidden', 'toggle'):
        m = (g.y < 0) * g._not_arm() * (g.z > s['hem']) * (g.z < (s['zv'] + 0.01 if s['lapel'] > 0 else 1.45))
        g.o += 0.0020 * sstep(-0.002, 0.004, g.x + 0.012) * m
        g.groove(g.x + 0.012, depth=0.0016, width=0.0016, mask=m)
        if s['front'] == 'hidden':
            g.groove(g.x - 0.030, depth=0.0007, width=0.0013, mask=m)
    elif s['front'] == 'zip':
        if s.get('storm'):         # tapeta tapacremallera con broches
            w = s['storm']
            m = (g.y < 0) * (g.z > s['hem']) * (g.z < 1.46)
            g.o += 0.0028 * sstep(w + 0.002, w - 0.002, g.x + 0.004) * sstep(-0.004, 0.0, g.x + 0.004) * m
            g.groove(g.x - w + 0.004, depth=0.0014, width=0.0018, mask=m)
        else:
            g.band(front_edge, 0.010, raise_=0.0012)
    # ---------- capucha
    if s.get('hood'):
        hm = sstep(0.01, -0.01, hood_d(g.P) - 0.012) * (g.y > 0.02) * (g.z > 1.36)
        g.groove(g.x, depth=0.0020, width=0.0035, mask=hm)
        q = np.sqrt((g.x / 0.15) ** 2 + ((g.z - 1.47) / 0.07) ** 2)
        rim = (q - 1) * 0.07
        rm = sstep(0.06, 0.11, g.y) * sstep(1.36, 1.40, g.z)
        g.o += 0.0040 * sstep(0.004, -0.004, rim) * rm
        g.groove(rim, depth=0.0025, width=0.003, mask=rm)
        g.band(neck, 0.012, raise_=0.0018)
    else:
        g.band(neck, 0.006, raise_=0.0010)
    # ---------- cinturón, hombreras, cordón, canesú
    if s.get('belt'):
        zc = s['belt']
        m = g._not_arm() * sstep(0.024, 0.020, np.abs(g.z - zc))
        g.o += 0.0045 * m; g.th += 0.0020 * m
        g.groove(np.abs(g.z - zc) - 0.022, depth=0.0012, width=0.0016, mask=g._not_arm())
        g.hem_blouse(zc + 0.02, zc + 0.12, 10, amp=0.005, seed=411)
        g.gather(sstep(0.06, 0.0, np.abs(g.z - zc)) * g._not_arm(), amp=0.0020, n=18, fz=0)
    if s.get('epaulettes'):
        for sx in (1, -1):
            m = (g.z > 1.38) * g._not_arm() * sstep(0.10, 0.11, np.abs(g.x)) * sstep(0.200, 0.190, np.abs(g.x)) * (np.sign(g.x) == sx)
            band = sstep(0.019, 0.015, np.abs(g.y - 0.004)) * m
            g.o += 0.0032 * band
            g.groove(np.abs(g.y - 0.004) - 0.017, depth=0.0010, width=0.0015, mask=m)
    if s.get('gunflap'):           # solapa de tormenta en el hombro derecho
        poly = [(0.040, 1.420), (0.190, 1.420), (0.190, 1.230), (0.110, 1.200), (0.040, 1.250)]
        g.patch_xz(lambda x, z: sd_poly(x, z, poly), lift=0.0030, puff=0.0)
    if s.get('waistcord'):
        zc = s['waistcord']
        g.groove(g.z - zc - 0.012, depth=0.0010, width=0.0016, mask=g._not_arm())
        g.groove(g.z - zc + 0.012, depth=0.0010, width=0.0016, mask=g._not_arm())
        g.gather(sstep(0.04, 0.0, np.abs(g.z - zc)) * g._not_arm(), amp=0.0025, n=16, fz=0)
    if s.get('yoke'):              # canesú de la trenca (delante y detrás)
        poly = [(-0.20, 1.50), (0.20, 1.50), (0.20, 1.33), (-0.20, 1.33)]
        for fr in (True, False):
            g.patch_xz(lambda x, z: sd_poly(x, z, poly), front=fr, lift=0.0028, puff=0.0)
    # ---------- bolsillos
    pk = s['pockets']
    if 'welt' in pk or 'zipwelt' in pk:
        for sx in (1, -1):
            a = (sx * 0.125, 0.835); c = (sx * 0.160, 0.995)
            d, t = _seg_dist(g.x, g.z, a, c)
            m = sstep(0.025, -0.025, g.y) * (t > 0.003) * (t < 0.160)
            if 'zipwelt' in pk:
                teeth(g, d, t, m)
            else:
                g.o += 0.0024 * sstep(0.011, 0.008, np.abs(d)) * m
                g.groove(np.abs(d) - 0.0105, depth=0.0010, width=0.0016, mask=m)
                g.groove(d, depth=0.0018, width=0.0012, mask=m)
    if 'vertslash' in pk:
        for sx in (1, -1):
            a = (sx * 0.150, 0.900); c = (sx * 0.150, 1.080)
            d, t = _seg_dist(g.x, g.z, a, c)
            m = sstep(0.025, -0.025, g.y) * (t > 0.003) * (t < 0.178)
            g.o += 0.0026 * sstep(0.014, 0.011, np.abs(d)) * m
            g.groove(np.abs(d) - 0.0135, depth=0.0010, width=0.0016, mask=m)
            g.groove(d, depth=0.0018, width=0.0012, mask=m)
    if 'chestwelt' in pk:
        g.patch_xz(rrect(0.105, 1.255, 0.110, 0.022, 0.003), lift=0.0022, puff=0.0)
    if 'flaphip' in pk:
        cx_, zc, w_, h_, fl = hip_pocket()
        for sx in (1, -1):
            flap_pocket(g, sx * cx_, zc, w_, h_, fl, lift=0.0026, flap_lift=0.0052)
    if 'ticket' in pk:             # bolsillo de cerillas sobre el derecho
        cx_, zc, w_, h_, fl = hip_pocket()
        flap_pocket(g, -cx_ - 0.004, zc + h_ / 2 + 0.040, w_ * 0.72, 0.050, 0.040, lift=0.0018, flap_lift=0.0040)
    if s.get('lapelhole'):         # ojal de la solapa izquierda
        a = (0.108 + s['lapel'] * 0.45, 1.352); c = (0.098 + s['lapel'] * 0.45, 1.376)
        d, t = _seg_dist(g.x, g.z, a, c)
        g.groove(d, depth=0.0012, width=0.0011, mask=sstep(0.02, -0.02, g.y) * (t > 0.0) * (t < 0.026))
    if 'flapchest' in pk:
        for sx in (1, -1):
            flap_pocket(g, sx * 0.110, 1.230, 0.120, 0.130, 0.045, lift=0.0030, flap_lift=0.0062)
    if 'patchhip' in pk:
        for sx in (1, -1):
            flap_pocket(g, sx * 0.130, 0.860, 0.175, 0.185, 0.060, lift=0.0034, flap_lift=0.0068)
    g.neck_in, g.sleeve_in, g.hem_in, g.front_in = neck, sl, hem, front_edge
    return g


def _collar_layers(P):
    # el cuello de los abrigos va en la propia tela (tira vuelta sobre el escote, ver coat())
    return []


def _sdf(Q):
    d = coat(Q).sdf()
    for kind, csh, cR, cth in _collar_layers(Q):
        d = np.minimum(d, np.maximum(np.abs(csh) - cth / 2, cR))
    return d.astype(F32)


# ---------------------------------------------------------------- piezas sólidas
def _zipper(path, key):
    if key not in _cache:
        pts = []
        for x, z in _line_pts(path, 0.012):
            p = surf_ray(_sdf, (0.006, 0.0, z), (0, -1, 0), span=0.45)
            if p is not None:
                p = p.copy(); p[0] = 0.0; pts.append(p)
        _cache[key] = np.asarray(pts, F32)
    zp = _cache[key]
    line = [p + np.array([0, -0.0014, 0], F32) for p in zp]
    tape = lambda Q: (capsule_pts(Q, line, 0.0042) + 0.0004 * np.sign(np.sin(Q[:, 2] * 2 * np.pi / 0.0050))).astype(F32)
    out = [SOLID(tape, solids_bbox(zp, 0.008), 'zipper', h=0.0010)]
    top = zp[np.argmax(zp[:, 2])]
    c = top + np.array([0, -0.0072, -0.036], F32)
    def puller(Q):
        a = round_cone(Q, c + np.array([0, 0, 0.022], F32), c - np.array([0, 0, 0.014], F32), 0.0054, 0.0070)
        hole = round_cone(Q, c - np.array([0, 0, 0.004], F32), c - np.array([0, 0, 0.009], F32), 0.0022, 0.0022)
        return smax(np.maximum(a, np.abs(Q[:, 1] - c[1]) - 0.0020), -hole, 0.0005).astype(F32)
    out.append(SOLID(puller, (c - 0.03, c + 0.03), 'zipper', h=0.0007))
    return out


def _toggles():
    """Trabillas de la trenca: palillo de madera (button) y presilla de cordón (trim)."""
    out = []
    zs = (1.300, 1.170, 1.040, 0.910)
    pts = placed('ab_tog', _sdf, front_points([(0.030, z) for z in zs]))
    for p, n in pts:
        c = p + n * 0.007
        a = c + np.array([-0.022, 0, 0.004], F32); b2 = c + np.array([0.022, 0, -0.004], F32)
        out.append(SOLID((lambda a, b2: lambda Q: round_cone(Q, a, b2, 0.0055, 0.0050))(a, b2), solids_bbox([a, b2], 0.012), 'button', h=0.0006))
        loop = [p + n * 0.003 + np.array([-0.075, 0, 0.0], F32), p + n * 0.006 + np.array([-0.040, 0, 0.001], F32),
                c + np.array([-0.004, 0, 0.007], F32), c + np.array([0.006, -0.002, 0.000], F32), c + np.array([-0.004, 0, -0.007], F32),
                p + n * 0.006 + np.array([-0.040, 0, -0.001], F32), p + n * 0.003 + np.array([-0.075, 0, 0.0], F32)]
        out.append(SOLID((lambda l: lambda Q: capsule_pts(Q, l, 0.0022))(loop), solids_bbox(loop, 0.01), 'trim', h=0.0006))
        tab = [p + n * 0.003 + np.array([-0.095, 0, 0], F32), p + n * 0.003 + np.array([-0.070, 0, 0], F32)]
        out.append(SOLID((lambda l: lambda Q: capsule_pts(Q, l, 0.0060))(tab), solids_bbox(tab, 0.012), 'trim', h=0.0006))
    return out


def _buckle(x, z, key, w=0.030, h=0.034):
    if key not in _cache:
        p = surf_ray(_sdf, (x, 0.0, z), (0, -1, 0), span=0.45)
        _cache[key] = None if p is None else (p, sdf_normal(_sdf, p))
    if _cache[key] is None:
        return []
    p, n = _cache[key]
    e2 = np.array([0, 0, 1.0], F32); e1 = unit(np.cross(e2, n)); e2 = unit(np.cross(n, e1))
    c = p + n * 0.0045
    corners = [c + e1 * sx * w / 2 + e2 * sz * h / 2 for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1), (-1, -1))]
    prong = [c - e1 * w / 2, c + e1 * 0.004]
    return [SOLID(lambda Q: capsule_pts(Q, corners, 0.0026), solids_bbox(corners, 0.01), 'hardware', h=0.0006),
            SOLID(lambda Q: capsule_pts(Q, prong, 0.0016), solids_bbox(prong, 0.01), 'hardware', h=0.0005)]


def abrigo():
    s = ST
    out = [SHELL(lambda P: coat(P).layer(), 'body')]
    if s.get('hood') == 'fur':
        out.append(SOLID(fur_ruff, ((-0.22, -0.20, 1.33), (0.22, 0.24, 1.66)), 'trim', h=0.002))
    btn = []
    if s['front'] == 'sb':
        zs = np.linspace(s['zv'] - 0.040, s['zv'] - 0.040 - 0.105 * (s['n_btn'] - 1), s['n_btn'])
        btn = [(-0.006, z) for z in zs]
    elif s['front'] == 'db':
        z0 = s['zv'] - 0.050
        rows = 3 if s['hem'] > 0.6 else 4
        for k in range(rows):
            z = z0 - 0.105 * k
            btn += [(DB_COLS[0] + 0.004, z), (DB_COLS[1], z)]
    if btn:
        pts = placed('ab_btn', _sdf, front_points(btn))
        out += button_specs(pts, role='button', r=0.0105 if s['front'] == 'db' and s['hem'] > 0.6 else 0.0095, t=0.0036)
    if s['front'] == 'zip':
        out += _zipper([(0.0, s['hem'] + 0.006), (0.0, 1.455)], 'ab_zip')
        if s.get('storm'):
            zs = np.linspace(s['hem'] + 0.06, 1.40, s['n_btn'])
            pts = placed('ab_snap', _sdf, front_points([(s['storm'] / 2 - 0.004, z) for z in zs]))
            out += button_specs(pts, role='hardware', r=0.0068, t=0.0030, kind='stud')
    if s['front'] == 'toggle':
        out += _toggles()
    det = []
    if 'flaphip' in s['pockets'] and s['tejido'] not in ('traje',) and not s.get('structured'):
        cx_, zc, w_, h_, fl = hip_pocket()
        det += [(sx * cx_, zc + h_ / 2 - 0.024) for sx in (1, -1)]
    if 'flapchest' in s['pockets']:
        det += [(sx * 0.110, 1.230 + 0.065 - 0.020) for sx in (1, -1)]
    if 'patchhip' in s['pockets']:
        det += [(sx * 0.130, 0.860 + 0.0925 - 0.026) for sx in (1, -1)]
    if s.get('gunflap'):
        det += [(0.170, 1.240)]
    if det:
        pts = placed('ab_det', _sdf, front_points(det))
        role = 'hardware' if s['tejido'] in ('sarga', 'nailon') else 'button'
        out += button_specs(pts, role=role, r=0.0062, t=0.0028, kind='stud' if role == 'hardware' else 'disc')
    if s.get('cuffbuttons'):
        if 'ab_cuff' not in _cache:
            specs = []
            for du in s.get('cuff_du', (0.030, 0.050, 0.070)):
                specs += _cuff_button_specs(s['L'] - 0.005, du=du, ang=2.6)
            _cache['ab_cuff'] = _surf_from_axis(_sdf, specs, span=0.15)
        out += button_specs(_cache['ab_cuff'], role='button', r=0.0058 if not s.get('structured') else 0.0060, t=0.0026)
    if s.get('epaulettes'):
        if 'ab_epa' not in _cache:
            pts = []
            for sx in (1, -1):
                p = surf_ray(_sdf, (sx * 0.170, 0.004, 1.40), (0, 0, 1), span=0.30)
                if p is not None: pts.append((p, sdf_normal(_sdf, p)))
            _cache['ab_epa'] = pts
        out += button_specs(_cache['ab_epa'], role='button', r=0.0055, t=0.0024)
    if s.get('belt'):
        out += _buckle(-0.120, s['belt'], 'ab_buckle')
    return out


# ---------------------------------------------------------------- pespuntes
def seam_paths():
    s = ST
    P = []
    ths = np.linspace(-np.pi, np.pi, int(2 * np.pi * 0.25 / SAMPLE), endpoint=False).astype(F32)
    ths = ths[np.abs(np.angle(np.exp(1j * (ths + np.pi / 2)))) > 0.08]
    for k, m in enumerate((ths > -np.pi / 2, ths < -np.pi / 2)):
        P.append((f'bajo_{k}',) + ring_rays_at(np.full(int(m.sum()), s['hem'] + 0.026, F32), ths[m]))
    angs = np.linspace(-np.pi, np.pi, int(2 * np.pi * 0.08 / SAMPLE), endpoint=False).astype(F32)
    for sd in (1, -1):
        P.append((f'puno_{sd}',) + arm_rays(sd, s['L'] - (s.get('cuffband') or 0.030) - 0.004, angs))
    if s['front'] == 'zip':
        zs = np.arange(s['hem'] + 0.006, 1.44, SAMPLE)
        xo = (s['storm'] - 0.008) if s.get('storm') else 0.0115
        for sx in ((1,) if s.get('storm') else (1, -1)):
            O = np.stack([np.full_like(zs, sx * xo), np.zeros_like(zs), zs], 1).astype(F32)
            P.append((f'cremallera_{sx}', O, _front_rays(O)))
    if 'flapchest' in s['pockets']:
        for sx in (1, -1):
            O = _u_path(sx * 0.110, 1.230, 0.120, 0.130); P.append((f'bolsillo_p_{sx}', O, _front_rays(O)))
    hp = hip_pocket()
    for key, (cx_, cz, w_, h_) in (('flaphip', hp[:4]), ('patchhip', (0.130, 0.860, 0.175, 0.185))):
        if key in s['pockets']:
            for sx in (1, -1):
                O = _u_path(sx * cx_, cz, w_, h_); P.append((f'bolsillo_{key}_{sx}', O, _front_rays(O)))
    if s.get('belt'):
        for k, off in enumerate((-0.016, 0.016)):
            ths2 = ths
            P.append((f'cinturon_{k}',) + ring_rays_at(np.full(len(ths2), s['belt'] + off, F32), ths2))
    return P


# ---------------------------------------------------------------- campos para Blender
def campos(V, N):
    V = np.asarray(V, F32); N = np.asarray(N, F32)
    out = [np.zeros(len(V), np.int8), np.zeros((len(V), 2), F32), np.zeros(len(V), np.uint8), np.zeros(len(V), F32)]
    for i in range(0, len(V), 60000):
        for k, a in enumerate(_campos(V[i:i + 60000], N[i:i + 60000])):
            out[k][i:i + 60000] = a
    return tuple(out)


def _campos(V, N):
    s = ST
    g = coat(V)
    x, y, z = V[:, 0], V[:, 1], V[:, 2]
    pieza = np.where(y >= 0.004, 2, np.where(x >= 0, 0, 1)).astype(np.int8)
    tej = np.zeros((len(V), 2), F32)
    r = np.hypot(x, y); th = np.arctan2(y, x)
    tej[:, 0] = th * _rnom(z, r, 0.01); tej[:, 1] = z
    interior = (N[:, 0] * x + N[:, 1] * y) / (r + 1e-6) < -0.15
    b = g.b
    for k, sd in enumerate((1, -1)):
        u, a, w = g.arm(sd)
        m = (x * sd > 0) & (w > 0.35) & (u > s['at'])
        if m.sum() < 10:
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
        pieza[m] = 3 + k
        tej[m, 0] = ang * _rnom(uu, rr, 0.01); tej[m, 1] = uu
        interior[m] = np.sum(N[m] * rv, 1) / (rr + 1e-6) < -0.15
        if s.get('cuffband'):
            c = m.copy(); c[m] = g.sleeve_in[m] < s['cuffband']
            pieza[c] = 5 + k
    if s['lapel'] > 0:
        pieza[(g.neck_in < s['collar_w']) & (z > 1.39) & (pieza <= 2)] = 7
    if s.get('hood'):
        pieza[(hood_d(V) < 0.04) & (y > 0.02) & (z > 1.36) & (pieza == 2)] = 11
    for key, cx_, cz, w_, h_ in [('flaphip',) + tuple(hip_pocket()[:4]),
                                 ('flapchest', 0.110, 1.230, 0.120, 0.130), ('patchhip', 0.130, 0.860, 0.175, 0.185)]:
        if key in s['pockets']:
            for sx in (1, -1):
                pieza[(y < 0) & (pieza <= 1) & (np.abs(x - sx * cx_) < w_ / 2 + 0.003) & (np.abs(z - cz) < h_ / 2 + 0.003) & ~interior] = 10
    return pieza, tej, interior.astype(np.uint8), np.zeros(len(V), F32)


def ejes():
    s = ST
    return {'estilo': KEY, 'nombre': s['name'], 'color': s['color'], 'color2': s.get('color2'), 'tejido': s['tejido'],
            'forro': s.get('forro'), 'color_trim': s.get('color_trim'), 'color_boton': s.get('boton'), 'piezas': PIEZAS,
            'L': s['L'], 'hem': s['hem']}


configure(__import__('os').environ.get('ABRIGO_ESTILO', 'gabardina'))
