"""Chaquetas para Blender (11 variantes), sobre el cuerpo de referencia de 1,78 m con los brazos a 32°.

Mismo sistema que camisetas.py, sudaderas.py, camisas.py y jerseis.py: campo de distancia por corte
(tabla STYLES) extraído con marching cubes. Prendas estructuradas, con grosor de tela + forro:

  01 bomber (MA-1)          02 varsity (paño y mangas de piel)   03 vaquera (trucker)
  04 de piel (racer)        05 biker (cremallera cruzada)        06 plumífero (acolchado)
  07 cortavientos           08 de chándal                        09 coach
  10 forro polar            11 utility (field jacket)     12 chaleco acolchado (sin mangas)

Construcción por piezas comunes: cierre (cremallera, cremallera cruzada o broches/botones con tapeta),
cuello (canalé, alto, camisero o solapas), bajo y puños (canalé, pretina, cordón, cinturón, cremallera),
bolsillos (vivo inclinado, cremallera, solapa, manga) y paneles de otro color.

Piezas (papel del material):
- body       la tela principal (el revés es el forro en Blender: atributo «interior»);
- secondary  paneles de otro tejido o color (mangas de piel de la varsity, canesú del cortavientos);
- trim       rayas del canalé, bandas de la manga, vivos del polar, cordones y cinturón;
- zipper     cremalleras; hardware: broches, botones metálicos, hebilla, topes; button: botones.
Aparte (_costuras.glb): pespuntes.
Coordenadas: Z arriba, frente = -Y.
"""
import math
import numpy as np
from kit import *
from items2 import cuff_blend, arm_ang
from items3 import B, fit_base, tank_armhole
from items4 import (SHELL, SOLID, placed, front_points, button_specs, collar, flap_pocket, surf_ray, sdf_normal, unit,
                    solids_bbox, _surf_from_axis, _cuff_button_specs, _cache)
from items5 import quilt
from camisetas import arm_rays, ring_rays_at, _rnom, SAMPLE

UP = ((-0.62, -0.28, 0.62), (0.62, 0.28, 1.66))

# front: zip | asym | snap | button.  collar: rib | stand | shirt | lapel.  hemk / cuffk: rib | band | cord |
# belt | elastic | zip | button.  pockets: welt (vivo inclinado), zipwelt (cremallera vertical), flapchest,
# zipchest, sleeve, flaphip, slash.  ctop: altura del cuello de tubo.  tejido / tejido2: materiales de Blender.
STYLES = {
    'bomber': dict(num=1, file='chaqueta_bomber', name='Bomber', ease=0.042, drape=0.75, arm_ease=0.040, arm_drape=0.5,
                   th=0.0072, hem=0.905, L=0.600, at=0.060, front='zip', collar='rib', ctop=1.505, hemk='rib', band=0.065,
                   cuffk='rib', cuff=0.070, pockets=('welt', 'sleeve'), tejido='nailon', color='#3E4536', forro='#D9632B',
                   folds=(0.010, 0.010, 0.007)),
    'varsity': dict(num=2, file='chaqueta_varsity', name='Chaqueta varsity', ease=0.040, drape=0.7, arm_ease=0.036,
                    arm_drape=0.45, th=0.0078, hem=0.890, L=0.600, at=0.060, front='snap', n_snap=6, collar='rib',
                    ctop=1.500, hemk='rib', band=0.060, cuffk='rib', cuff=0.065, pockets=('welt',), sleeves2=True,
                    stripes=True, tejido='lana', tejido2='piel', color='#1F2A44', color2='#ECE6D8', color_trim='#ECE6D8',
                    forro='#2B2B2E', folds=(0.008, 0.008, 0.006)),
    'vaquera': dict(num=3, file='chaqueta_vaquera', name='Chaqueta vaquera', ease=0.030, drape=0.55, arm_ease=0.028,
                    arm_drape=0.35, th=0.0060, hem=0.900, L=0.600, at=0.058, front='button', n_snap=6, collar='shirt',
                    hemk='band', band=0.050, cuffk='button', cuff=0.055, pockets=('flapchest', 'slash'), denim=True,
                    tejido='denim', color='#5A7AA6', forro='#5A7AA6', folds=(0.007, 0.006, 0.006)),
    'piel': dict(num=4, file='chaqueta_piel', name='Chaqueta de piel', ease=0.026, drape=0.5, arm_ease=0.026, arm_drape=0.3,
                 th=0.0058, hem=0.870, L=0.605, at=0.055, front='zip', collar='stand', ctop=1.520, tab=True, hemk='band',
                 band=0.045, cuffk='zip', cuff=0.0, pockets=('zipwelt',), princess=True, tejido='piel', color='#2A2522',
                 forro='#3A3A3E', folds=(0.009, 0.006, 0.007)),
    'biker': dict(num=5, file='chaqueta_biker', name='Chaqueta biker', ease=0.026, drape=0.45, arm_ease=0.026, arm_drape=0.3,
                  th=0.0060, hem=0.880, L=0.605, at=0.055, front='asym', collar='lapel', hemk='belt', band=0.042,
                  cuffk='zip', cuff=0.0, pockets=('zipchest',), tejido='piel', color='#1C1C1E', forro='#2E2E33',
                  folds=(0.009, 0.006, 0.007)),
    'plumifero': dict(num=6, file='plumifero', name='Plumífero', ease=0.058, drape=0.55, arm_ease=0.048, arm_drape=0.35,
                      th=0.0080, hem=0.860, L=0.590, at=0.065, front='zip', collar='stand', ctop=1.555, hemk='band',
                      band=0.030, cuffk='band', cuff=0.030, pockets=('zipwelt',), quilt=True, tejido='nailon',
                      color='#2C2D30', forro='#2C2D30', folds=(0.004, 0.0, 0.0)),
    'cortavientos': dict(num=7, file='cortavientos', name='Cortavientos', ease=0.050, drape=0.85, arm_ease=0.044,
                         arm_drape=0.6, th=0.0050, hem=0.790, L=0.610, at=0.075, front='zip', collar='stand', ctop=1.535,
                         hemk='cord', band=0.0, cuffk='elastic', cuff=0.025, pockets=('slash',), chevron=True,
                         tejido='nailon', color='#B9BCC2', color2='#2C3E5C', color_trim='#1E1E20', forro='#8A8D93',
                         folds=(0.012, 0.012, 0.008)),
    'chandal': dict(num=8, file='chaqueta_chandal', name='Chaqueta de chándal', ease=0.034, drape=0.7, arm_ease=0.030,
                    arm_drape=0.4, th=0.0050, hem=0.800, L=0.600, at=0.058, front='zip', collar='stand', ctop=1.530,
                    hemk='rib', band=0.050, cuffk='rib', cuff=0.055, pockets=('zipwelt',), track=True, tejido='tricot',
                    color='#1D2633', color_trim='#EDEDED', forro='#1D2633', folds=(0.008, 0.008, 0.006)),
    'coach': dict(num=9, file='chaqueta_coach', name='Chaqueta coach', ease=0.048, drape=0.85, arm_ease=0.042, arm_drape=0.55,
                  th=0.0052, hem=0.790, L=0.605, at=0.075, front='snap', n_snap=5, collar='shirt', hemk='cord', band=0.0,
                  cuffk='band', cuff=0.030, pockets=('slash',), tejido='nailon', color='#141416', color_trim='#141416',
                  forro='#8D8F94', folds=(0.011, 0.011, 0.008)),
    'polar': dict(num=10, file='forro_polar', name='Forro polar', ease=0.038, drape=0.8, arm_ease=0.036, arm_drape=0.5,
                  th=0.0080, hem=0.790, L=0.600, at=0.062, front='zip', collar='stand', ctop=1.540, hemk='bind', band=0.0,
                  cuffk='bind', cuff=0.0, pockets=('zipwelt', 'zipchest'), binding=True, tejido='polar', color='#D7D0C3',
                  color_trim='#3B4A3E', forro='#D7D0C3', folds=(0.008, 0.008, 0.006)),
    'utility': dict(num=11, file='chaqueta_utility', name='Chaqueta utility', ease=0.040, drape=0.75, arm_ease=0.034,
                    arm_drape=0.45, th=0.0062, hem=0.760, L=0.605, at=0.062, front='snap', n_snap=6, placket_w=0.050,
                    collar='stand', ctop=1.535, hemk='cord', band=0.0, cuffk='button', cuff=0.050,
                    pockets=('flapchest', 'flaphip'), epaulettes=True, waistcord=1.02, tejido='sarga', color='#59603F',
                    color_trim='#59603F', forro='#59603F', folds=(0.009, 0.009, 0.007)),
    'chaleco_acolchado': dict(num=12, file='chaleco_acolchado', name='Chaleco acolchado', ease=0.044, drape=0.55, arm_ease=0.02,
                              arm_drape=0.0, th=0.0078, hem=0.860, L=0.0, at=0.0, front='zip', collar='stand', ctop=1.550,
                              hemk='band', band=0.028, cuffk='none', cuff=0.0, pockets=('zipwelt',), quilt=True, vest=True,
                              armhole=(0.212, 1.290, 0.050, 0.120), tejido='nailon', color='#3A3F36', forro='#3A3F36',
                              folds=(0.0, 0.0, 0.0)),
}

PIEZAS = ['Delantero izquierdo', 'Delantero derecho', 'Espalda', 'Manga izquierda', 'Manga derecha', 'Puño izquierdo',
          'Puño derecho', 'Cuello', 'Bajo', 'Tapeta', 'Bolsillos']
ZIP_GAP = 0.004
NECK_Z = 1.462              # unión del cuello de tubo con el cuerpo
YOKE_Z = 1.330              # canesú (vaquera)
LAPEL = [(0.012, 1.290), (0.100, 1.448), (0.150, 1.392), (0.118, 1.330), (0.060, 1.250)]
ASYM_X = 0.075             # cremallera cruzada de la biker
V_BOTTOM = 1.288


# Variantes de cierre (selector «Cierre» de la web): la misma chaqueta con cremallera, con broches o
# abierta. Sale como <id>_cremallera / _botones / _abierta junto a la original.
CIERRES = ('cremallera', 'botones', 'abierta')


def configure(key, cierre=None):
    global ST, KEY, CATALOG, CIERRE
    ST = dict(STYLES[key]); KEY = key
    cierre = cierre if cierre is not None else __import__('os').environ.get('CHAQUETA_CIERRE', '')
    if cierre and cierre not in CIERRES:
        raise ValueError(f'cierre desconocido: {cierre} (usa {", ".join(CIERRES)})')
    CIERRE = cierre or ''
    nombre = ST['name']
    if cierre == 'abierta':        # abierta: las dos mitades separadas; se ve lo de debajo y el forro
        ST['open_kind'] = 'zip' if ST['front'] in ('zip', 'asym') else 'snap'
        ST['front'] = 'open'; nombre += ' (abierta)'
    elif cierre == 'cremallera':
        ST['front'] = 'zip'; nombre += ' (cremallera)'
    elif cierre == 'botones':
        ST['front'] = 'snap'; ST.setdefault('n_snap', 6); nombre += ' (botones)'
    for k in [k for k in _cache if str(k).startswith('ch_')]:
        del _cache[k]
    CATALOG = [(f"{ST['num']:02d}_{ST['file']}" + (f'_{cierre}' if cierre else ''), nombre, chaqueta, UP)]


def open_hg(z):
    """Media abertura de la delantera abierta a la altura z: estrecha en el cuello, se abre en el
    pecho y algo más hacia el bajo (las mitades caen hacia los lados)."""
    s = ST
    if s['collar'] == 'lapel':
        return 0.012 + 0.050 * sstep(V_BOTTOM, s['hem'], z)
    if s.get('open_kind') == 'snap':   # con tapeta y bolsillos de pecho: abertura más estrecha
        return 0.018 + 0.030 * sstep(1.50, 1.22, z) + 0.010 * sstep(1.22, s['hem'], z)
    return 0.022 + 0.050 * sstep(1.50, 1.22, z) + 0.014 * sstep(1.22, s['hem'], z)


def chest_pk():
    """Bolsillo de pecho con solapa (cx, cz, ancho, alto); abierta, se aparta del borde."""
    return (0.130, 1.245, 0.115, 0.130) if ST['front'] == 'open' else (0.095, 1.245, 0.115, 0.130)


def hip_pk():
    s = ST
    return (0.132, s['hem'] + 0.120, 0.128, 0.160) if s['front'] == 'open' else (0.105, s['hem'] + 0.120, 0.150, 0.160)


def _closure_top():
    s = ST
    if s['collar'] in ('rib', 'stand'):
        return s['ctop'] - 0.004
    return V_BOTTOM - 0.004 if s['collar'] == 'lapel' else 1.43


def body():
    s = ST
    return B(ease=s['ease'], drape=s['drape'], drape_from=1.30, arm_ease=s['arm_ease'], arm_drape=s['arm_drape'])


def tube_d(P):
    e = ST['ease'] - 0.03
    return round_cone(P, [0, 0.008, 1.40], [0, 0.012, 1.64], 0.086 + e * 0.6, 0.082 + e * 0.6)


def base_fn(b):
    def f(P):
        d = smin(b.torso(P), b.neck_d(P), 0.03) if ST.get('vest') else b.upper(P)
        if ST['collar'] in ('rib', 'stand'):
            d = smin(d, tube_d(P), 0.035)
        return d
    return f


def _sleeve_a0(b, sd):
    S, E, W = b.arm[sd]
    W2 = W + (W - E) / np.linalg.norm(W - E) * 0.2
    d = (E - S) / np.linalg.norm(E - S)
    n = np.cross(d, np.array([0, 1.0, 0], F32))
    if n[2] < 0: n = -n
    q = ((S + E) / 2 + n * 0.06).astype(F32)[None]
    u, a, dist = limb_coords(q, [S, E, W2])
    return float(a[0])


def sleeve_coords(g, sd):
    """(u a lo largo del brazo, s alrededor desde el lado de fuera en m, peso de manga)."""
    u, a, w = g.arm(sd)
    da = np.angle(np.exp(1j * (a - _sleeve_a0(g.b, sd))))
    return u, da * 0.062, w


def teeth(g, dist, along, mask, w=0.0045):
    """Cremallera vista en la tela (bolsillos): cinta hundida con dientes."""
    m = mask * sstep(w, w * 0.6, np.abs(dist))
    g.o += (-0.0006 + 0.0007 * np.sign(np.sin(along * 2 * np.pi / 0.0042))) * m
    g.groove(np.abs(dist) - w, depth=0.0010, width=0.0014, mask=mask)


def _seg_dist(x, z, a, b):
    a = np.asarray(a, F32); b = np.asarray(b, F32)
    e = b - a; L = float(np.linalg.norm(e)); e /= L
    t = np.clip((x - a[0]) * e[0] + (z - a[1]) * e[1], 0, L)
    px = a[0] + e[0] * t; pz = a[1] + e[1] * t
    sgn = np.sign((x - a[0]) * e[1] - (z - a[1]) * e[0])
    return np.hypot(x - px, z - pz) * sgn, t


def asym_path():
    s = ST
    return [(ASYM_X, s['hem'] + 0.006), (ASYM_X, 1.180), (0.010, V_BOTTOM - 0.004)]


def jacket(P):
    s = ST
    b = body()
    g = Gar(P, b, base_fn(b), th=s['th'])
    L = s['L']
    zb = s['hem'] + s.get('band', 0.0)
    # ---------- ceñidos: bajo y puño
    if s['hemk'] in ('rib',):
        g.blend(fit_base(P, 0.020, 0.008), sstep(zb + 0.03, zb - 0.01, g.z) * g._not_arm() * 0.70)
    elif s['hemk'] in ('belt', 'band'):
        g.blend(fit_base(P, s['ease'] * 0.8, 0.008), sstep(zb + 0.05, zb - 0.01, g.z) * g._not_arm() * 0.45)
    if s['cuffk'] in ('rib', 'elastic', 'band', 'button') and not s.get('vest'):
        cw = max(s['cuff'], 0.03)
        cuff_blend(g, L, cw, fit_base(P, 0.014, 0.008 if s['cuffk'] != 'button' else 0.012), extra=0.06 if s['cuffk'] != 'button' else 0.02)
    hz = s['hem'] + 0.0015 * noise(g.P * [1, 1, 0], 6, 3)
    g.keep(hz - g.z); hem = g.z - hz
    if s.get('vest'):
        cx, cz, ax, az = s['armhole']
        sl = tank_armhole(g, cx=cx, cz=cz, ax=ax, az=az)            # positiva dentro de la prenda
    else:
        sl = g.cut_sleeve(L)
    # ---------- cuello y escote
    if s['collar'] in ('rib', 'stand'):
        topz = s['ctop'] + 0.004 * np.sin(g.theta) * (s['collar'] == 'stand')
        g.keep(g.z - topz)
        neck = (topz - g.z).astype(F32)
    else:
        neck = -g.cut_neck(a=0.092, b=0.090, z_back=1.462, z_front=1.438)
    if s['front'] == 'asym' or s['collar'] == 'lapel':       # escote en V con solapas
        slope = (1.445 - V_BOTTOM) / 0.10
        dv = (V_BOTTOM + slope * np.abs(g.x) - g.z) / math.sqrt(1 + slope * slope)
        front = sstep(-0.02, -0.05, g.y)
        g.keep(np.where(front > 0.5, -dv, -1.0))
        neck = np.where(front > 0.5, np.minimum(neck, dv), neck).astype(F32)
    front_edge = None
    if s['front'] == 'zip':
        fe = g.cut_front_open(gap=ZIP_GAP)
        front_edge = np.where(g.y < 0, fe, 1.0).astype(F32)
    elif s['front'] == 'open':
        hg = open_hg(g.z)
        g.keep(np.where(g.y < 0, hg - np.abs(g.x), -1.0))
        front_edge = np.where(g.y < 0, np.abs(g.x) - hg, 1.0).astype(F32)
    # ---------- pliegues
    fs, ft, fd = s['folds']
    if s.get('quilt'):
        o0 = g.o.copy()
        quilt(g, 0.085, 0.013, arm_sp=0.078, z0=s['hem'] + s['band'] - 0.004, arms=not s.get('vest'))
        if s.get('vest'):          # el acolchado se aplana junto a la sisa (si no, muerde el borde)
            g.o = o0 + (g.o - o0) * sstep(0.004, 0.040, sl)
        if not s.get('vest'):
            g.sleeve_strokes(5, 0.10, L - 0.05, amp=0.004, w=0.010, seed=301, dense_at=L - 0.04, dense_n=5, dense_len=0.08)
    else:
        g.sleeve_strokes(8, 0.07, L - 0.06, amp=fs, w=0.011, seed=301 + s['num'], dense_at=L - max(s['cuff'], 0.03), dense_n=6,
                         dense_len=0.13)
        g.drape_strokes(9, 1.22, zb + 0.03, amp=ft, w=0.015, seed=303 + s['num'])
        g.drag_strokes(4, amp=fd, w=0.009, seed=307 + s['num'])
    if s['hemk'] in ('rib', 'cord', 'belt'):
        g.hem_blouse(zb, zb + 0.10, 10, amp=0.006 if s['hemk'] != 'belt' else 0.003, seed=309 + s['num'])
    g.wobble(0.0016 if s['tejido'] != 'piel' else 0.0011)
    # ---------- costuras
    g.side_seams(zmin=s['hem'] + 0.01, xmin=0.10)
    shoulder = (g.z > 1.40) * sstep(0.07, 0.085, np.abs(g.x)) * g._not_arm()
    g.groove(g.y - 0.004, depth=0.0012, width=0.0022, mask=shoulder)
    if s.get('vest'):
        g.band(sl, 0.014, raise_=0.0026)                               # vivo de la sisa
    else:
        g.armhole_seams(s['at'])
    if s.get('princess'):        # cortes delanteros y traseros (piel)
        for front_side in (True, False):
            cx = 0.105 + 0.03 * sstep(1.30, 1.42, g.z)
            m = (g.y < 0 if front_side else g.y > 0) * g._not_arm() * (g.z < 1.42) * (g.z > s['hem'])
            g.groove(np.abs(g.x) - cx, depth=0.0014, width=0.0020, mask=m)
        g.groove(g.z - 1.36, depth=0.0013, width=0.0020, mask=(g.y > 0) * g._not_arm() * (np.abs(g.x) < 0.20))
    if s.get('denim'):           # canesú delantero y trasero, cortes verticales con tablas
        g.groove(g.z - YOKE_Z, depth=0.0013, width=0.0020, mask=(g.y < 0) * g._not_arm() * (np.abs(g.x) > 0.024) * (np.abs(g.x) < 0.19))
        g.groove(g.z - 1.37, depth=0.0013, width=0.0020, mask=(g.y > 0) * g._not_arm() * (np.abs(g.x) < 0.19))
        m = (g.y < 0) * g._not_arm() * (g.z < YOKE_Z) * (g.z > zb)
        for cx in (0.075, 0.150):
            g.groove(np.abs(g.x) - cx, depth=0.0012, width=0.0018, mask=m)
            g.ridge(np.abs(g.x) - cx - 0.006, height=0.0010, width=0.0025, mask=m * sstep(YOKE_Z, YOKE_Z - 0.03, g.z))
        g.groove(np.abs(g.x) - 0.09, depth=0.0012, width=0.0018, mask=(g.y > 0) * g._not_arm() * (g.z < 1.37) * (g.z > zb))
    # ---------- bajo
    k = s['hemk']
    if k == 'rib':
        g.ribbed(hem, s['band'], g.theta, 80, 0.0013, 0.0026)
    elif k == 'band':
        g.band(hem, s['band'], raise_=0.0026)
        g.groove(hem - 0.006, depth=0.0005, width=0.0012)
        if s.get('denim'):       # pestañas de ajuste en la pretina
            for sx in (1, -1):
                g.patch_xz(rrect(sx * 0.160, s['hem'] + s['band'] / 2, 0.045, 0.026, 0.006), lift=0.0022, puff=0.0)
    elif k == 'belt':
        g.band(hem, s['band'], raise_=0.0040)
        g.th += 0.0020 * sstep(s['band'] + 0.002, s['band'] - 0.002, hem)
        g.groove(hem - 0.005, depth=0.0006, width=0.0012); g.groove(hem - s['band'] + 0.005, depth=0.0006, width=0.0012)
    elif k == 'cord':
        g.hem(hem, 0.022, roll=0.0028, band=0.025)                        # jareta del cordón
        g.gather(sstep(0.04, 0.0, hem), amp=0.0018, n=14, fz=0)
    elif k == 'bind':
        g.hem(hem, 0.010, roll=0.0030, band=0.012)
    # ---------- puños
    k = s['cuffk']
    if k == 'rib':
        g.ribbed(sl, s['cuff'], arm_ang(g), 26, 0.0012, 0.0024)
    elif k == 'elastic':
        g.band(sl, s['cuff'], raise_=0.0018)
        g.gather(sstep(s['cuff'] + 0.03, 0.0, sl) * (1 - g._not_arm()), amp=0.0022, n=10, fz=8, ang=arm_ang(g))
    elif k in ('band', 'button'):
        g.band(sl, s['cuff'], raise_=0.0022)
        g.groove(sl - 0.005, depth=0.0005, width=0.0012)
    elif k == 'zip':
        g.hem(sl, 0.012, roll=0.0020, band=0.014)
        for sd in (1, -1):         # cremallera en el puño, por la costura de abajo
            u, sv, w = sleeve_coords(g, sd)
            m = (w > 0.5) * (u > L - 0.13) * (u < L - 0.004)
            teeth(g, np.angle(np.exp(1j * (sv / 0.062 + np.pi))) * 0.062, u, m)
    elif k == 'bind':
        g.hem(sl, 0.010, roll=0.0030, band=0.012)
    # ---------- cuello
    if s['collar'] == 'rib':
        cz = sstep(NECK_Z - 0.005, NECK_Z + 0.005, g.z)
        g.o += 0.0012 * np.cos(44 * g.theta) * cz + 0.0018 * cz
        g.groove(g.z - NECK_Z, depth=0.0014, width=0.0024, mask=(np.abs(g.x) < 0.13))
        g.hem(neck, 0.006, roll=0.0018, band=0.008)
    elif s['collar'] == 'stand':
        g.hem(neck, 0.008, roll=0.0022, band=0.010)
        g.groove(g.z - NECK_Z, depth=0.0013, width=0.0022, mask=(np.abs(g.x) < 0.13))
    else:
        g.band(neck, 0.006, raise_=0.0010)
    if front_edge is not None and s.get('open_kind') != 'snap':     # vistas de la cremallera
        g.band(front_edge, 0.010, raise_=0.0012)
    # ---------- cierre con tapeta (broches o botones)
    if s['front'] in ('snap', 'button'):
        w = s.get('placket_w', 0.036)
        zt = s['ctop'] - 0.004 if s['collar'] in ('rib', 'stand') else 1.440
        m = (g.y < 0) * (g.z > s['hem']) * (g.z < zt)
        g.o += 0.0016 * sstep(w / 2 + 0.002, w / 2 - 0.002, np.abs(g.x)) * m
        g.groove(g.x + w / 2, depth=0.0013, width=0.0018, mask=m)
        g.groove(g.x - w / 2, depth=0.0008, width=0.0014, mask=m)
    if s.get('open_kind') == 'snap':   # abierta: una tapeta en cada borde (broches en uno)
        w = s.get('placket_w', 0.036) * 0.75
        zt = s['ctop'] - 0.004 if s['collar'] in ('rib', 'stand') else 1.440
        m = (g.y < 0) * (g.z > s['hem']) * (g.z < zt)
        g.o += 0.0016 * sstep(w + 0.002, w - 0.002, front_edge) * m
        g.groove(front_edge - w, depth=0.0010, width=0.0016, mask=m)
        g.hem(front_edge, 0.004, roll=0.0016, band=0.005)
    if s['front'] == 'asym':       # cremallera cruzada: el delantero de encima monta sobre el otro
        path = asym_path()
        dmin = np.full(len(g.P), 1.0, F32); along = np.zeros(len(g.P), F32); acc = 0.0
        for a, c in zip(path[:-1], path[1:]):
            d, t = _seg_dist(g.x, g.z, a, c)
            better = np.abs(d) < np.abs(dmin)
            dmin = np.where(better, d, dmin); along = np.where(better, t + acc, along)
            acc += float(np.hypot(c[0] - a[0], c[1] - a[1]))
        front = (g.y < 0) * g._not_arm() * (g.z > s['hem']) * (g.z < V_BOTTOM + 0.01)
        g.o += 0.0022 * sstep(-0.002, 0.004, -dmin) * front
        teeth(g, dmin, along, front)
    # ---------- solapas (biker)
    if s['collar'] == 'lapel':
        for sx in (1, -1):
            poly = [(sx * px, pz) for px, pz in LAPEL]
            if sx < 0: poly = poly[::-1]
            d2 = sd_poly(g.x, g.z, poly)
            front = sstep(0.02, -0.02, g.y)
            ins = sstep(0.0015, -0.0015, d2) * front
            g.o += ins * (0.0050 + 0.0012 * sstep(0, -0.03, d2)); g.th += 0.0018 * ins
            g.groove(d2, depth=0.0016, width=0.0020, mask=front)
            g.groove(d2 + 0.006, depth=0.0006, width=0.0012, mask=front * (d2 < 0))
    # ---------- bolsillos
    pk = s['pockets']
    if 'welt' in pk:               # vivos inclinados en las caderas
        for sx in (1, -1):
            a = (sx * 0.110, zb + 0.035); c = (sx * 0.145, zb + 0.185)
            d, t = _seg_dist(g.x, g.z, a, c)
            m = sstep(0.025, -0.025, g.y)
            g.o += 0.0024 * sstep(0.010, 0.007, np.abs(d)) * m * (t > 0.002) * (t < 0.150)
            g.groove(np.abs(d) - 0.0095, depth=0.0010, width=0.0016, mask=m * (t > 0.0) * (t < 0.152))
            g.groove(d, depth=0.0018, width=0.0012, mask=m * (t > 0.004) * (t < 0.148))
    if 'zipwelt' in pk:
        for sx in (1, -1):
            a = (sx * 0.125, zb + 0.040); c = (sx * 0.150, zb + 0.200)
            d, t = _seg_dist(g.x, g.z, a, c)
            m = sstep(0.025, -0.025, g.y) * (t > 0.003) * (t < 0.158)
            teeth(g, d, t, m)
    if 'slash' in pk:
        for sx in (1, -1):
            a = (sx * 0.150, zb + 0.050); c = (sx * 0.172, zb + 0.200)
            d, t = _seg_dist(g.x, g.z, a, c)
            m = sstep(0.025, -0.025, g.y) * (t > 0.003) * (t < 0.150)
            g.groove(d, depth=0.0018, width=0.0014, mask=m)
            g.ridge(d + 0.0045 * sx, height=0.0012, width=0.0022, mask=m)
    if 'zipchest' in pk:
        sx = 1 if s['front'] == 'asym' else -1
        a = (sx * 0.065, 1.215); c = (sx * 0.140, 1.275)
        if s['front'] == 'asym':
            a = (-0.150, 1.205); c = (-0.075, 1.270)
        d, t = _seg_dist(g.x, g.z, a, c)
        m = sstep(0.025, -0.025, g.y) * (t > 0.003) * (t < np.hypot(c[0] - a[0], c[1] - a[1]) - 0.003)
        teeth(g, d, t, m)
    if 'flapchest' in pk:
        for sx in (1, -1):
            cx_, cz_, w_, h_ = chest_pk(); flap_pocket(g, sx * cx_, cz_, w_, h_, 0.045, lift=0.0024, flap_lift=0.0052)
    if 'flaphip' in pk:
        for sx in (1, -1):
            cx_, cz_, w_, h_ = hip_pk(); flap_pocket(g, sx * cx_, cz_, w_, h_, 0.055, lift=0.0030, flap_lift=0.0060)
    if 'sleeve' in pk:             # bolsillo con cremallera en la manga izquierda (bomber)
        u, sv, w = sleeve_coords(g, -1)
        m = (w > 0.5) * (g.x < 0)
        rr = np.maximum(np.abs(sv - 0.004) - 0.034, np.abs(u - 0.175) - 0.055)
        g.o += 0.0024 * sstep(0.0015, -0.0015, rr) * m
        g.groove(rr, depth=0.0010, width=0.0016, mask=m)
        teeth(g, u - 0.135, sv, m * (np.abs(sv - 0.004) < 0.028), w=0.0035)
        for k2 in (-1, 0, 1):        # portalápices
            g.groove(sv - 0.004 - k2 * 0.012, depth=0.0008, width=0.0012, mask=m * (u > 0.182) * (u < 0.228))
    # ---------- hombreras (utility) y cordón de cintura
    if s.get('epaulettes'):
        for sx in (1, -1):
            m = (g.z > 1.38) * g._not_arm() * sstep(0.10, 0.11, np.abs(g.x)) * sstep(0.195, 0.185, np.abs(g.x)) * (np.sign(g.x) == sx)
            band = sstep(0.019, 0.015, np.abs(g.y - 0.004)) * m
            g.o += 0.0030 * band
            g.groove(np.abs(g.y - 0.004) - 0.017, depth=0.0010, width=0.0015, mask=m)
    if s.get('waistcord'):
        zc = s['waistcord']
        g.groove(g.z - zc - 0.010, depth=0.0009, width=0.0016, mask=g._not_arm())
        g.groove(g.z - zc + 0.010, depth=0.0009, width=0.0016, mask=g._not_arm())
        g.gather(sstep(0.03, 0.0, np.abs(g.z - zc)) * g._not_arm(), amp=0.0012, n=16, fz=0)
    g.neck_in, g.sleeve_in, g.hem_in, g.front_in = neck, sl, hem, front_edge
    return g


# ---------------------------------------------------------------- regiones de otro color
def regions(g):
    """(sec, trim): >0 dentro del panel secundario / de la franja de adorno."""
    s = ST
    n = len(g.P)
    sec = np.full(n, -1.0, F32); trim = np.full(n, -1.0, F32)
    if s.get('sleeves2'):          # mangas desde la costura de la sisa hasta el puño (el puño es de canalé)
        for sd in (1, -1):
            u, a, w = g.arm(sd)
            d = np.minimum(np.minimum((w - 0.5) * 0.06, u - s['at']), g.sleeve_in - s['cuff'])
            sec = np.where(g.x * sd > 0, d, sec)
    if s.get('chevron'):           # canesú en pico (delante, detrás y la parte alta de las mangas)
        zc = 1.25 + 0.30 * np.clip(0.30 - np.abs(g.x), 0, 0.30) / 0.30 * 0.35
        sec = (g.z - zc).astype(F32)
    if s.get('stripes'):           # dos rayas en el canalé de cuello, puños y bajo
        def two(d, w0, w1, hw=0.0045):
            return np.maximum(hw - np.abs(d - w0), hw - np.abs(d - w1))
        t = two(g.hem_in, 0.018, 0.038)
        t = np.maximum(t, np.where(g._not_arm() < 0.5, two(g.sleeve_in, 0.017, 0.036, 0.0042), -1))
        t = np.maximum(t, np.where(g.z > NECK_Z + 0.004, two(g.neck_in, 0.010, 0.025, 0.0040), -1))
        trim = t.astype(F32)
    if s.get('track'):             # dos bandas por la manga, del hombro al puño
        for sd in (1, -1):
            u, sv, w = sleeve_coords(g, sd)
            ok = (w > 0.5) & (g.sleeve_in > s['cuff'] + 0.002) & (u > 0.0)
            trim = np.where(ok & (g.x * sd > 0), 0.0040 - np.abs(np.abs(sv) - 0.0085), trim)
    if s.get('binding'):           # vivos del polar: cuello, bajo, puños y cremallera
        t = 0.010 - g.hem_in
        t = np.maximum(t, np.where(g._not_arm() < 0.5, 0.010 - g.sleeve_in, -1))
        t = np.maximum(t, 0.008 - g.neck_in)
        trim = t.astype(F32)
    return sec.astype(F32), trim.astype(F32)


def _parts(P):
    g = jacket(P)
    kind, sh, R, th = g.layer()
    sec, trim = regions(g)
    return g, sh, R, th, sec, trim


def _collar_layers(P):
    s = ST
    if s['collar'] == 'shirt':
        gap = 0.056 if s['front'] == 'open' else 0.016 if s['front'] != 'zip' else 0.010
        c = dict(gap=gap, stand=0.036, fall=0.058, spread=1.08, e=0.014)
    elif s['collar'] == 'lapel':
        c = dict(gap=0.090, stand=0.030, fall=0.064, spread=1.25, e=0.018)
    else:
        return []
    return [l[:4] for l in collar(P, th=0.0050, **c)]


def _sdf(Q):
    d = jacket(Q).sdf()
    for kind, csh, cR, cth in _collar_layers(Q):
        d = np.minimum(d, np.maximum(np.abs(csh) - cth / 2, cR))
    return d.astype(F32)


# ---------------------------------------------------------------- piezas sólidas
def _line_pts(path, step=0.010):
    pts = []
    for a, c in zip(path[:-1], path[1:]):
        L = math.hypot(c[0] - a[0], c[1] - a[1]); n = max(2, int(L / step))
        for t in np.linspace(0, 1, n, endpoint=False):
            pts.append((a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t))
    pts.append(path[-1])
    return pts


def _zipper(path, key, lift=-0.0014):
    if key not in _cache:
        pts = []
        for x, z in _line_pts(path):
            straight = abs(x) < 1e-6           # cremallera central: la tela está abierta justo en x = 0
            p = surf_ray(_sdf, (0.006 if straight else x, 0.0, z), (0, -1, 0), span=0.40)
            if p is not None:
                p = p.copy()
                if straight: p[0] = 0.0
                pts.append(p)
        _cache[key] = np.asarray(pts, F32)
    zp = _cache[key]
    line = [p + np.array([0, lift, 0], F32) for p in zp]
    tape = lambda Q: (capsule_pts(Q, line, 0.0040) + 0.0004 * np.sign(np.sin(Q[:, 2] * 2 * np.pi / 0.0050))).astype(F32)
    out = [SOLID(tape, solids_bbox(zp, 0.008), 'zipper', h=0.0010)]
    top = zp[np.argmax(zp[:, 2])]
    c = top + np.array([0, -0.0070, -0.034], F32)
    def puller(Q):
        a = round_cone(Q, c + np.array([0, 0, 0.022], F32), c - np.array([0, 0, 0.014], F32), 0.0052, 0.0068)
        hole = round_cone(Q, c - np.array([0, 0, 0.004], F32), c - np.array([0, 0, 0.009], F32), 0.0022, 0.0022)
        return smax(np.maximum(a, np.abs(Q[:, 1] - c[1]) - 0.0020), -hole, 0.0005).astype(F32)
    out.append(SOLID(puller, (c - 0.03, c + 0.03), 'zipper', h=0.0007))
    return out


def _zip_halves():
    """Cremallera abierta: media cinta con dientes en cada borde y el cursor abajo, en un lado."""
    s = ST
    out = []
    for sx in (1, -1):
        key = f'ch_zh_{sx}'
        if key not in _cache:
            pts = []
            for z in np.arange(s['hem'] + 0.004, _closure_top(), 0.010):
                hg = float(open_hg(z))
                p = surf_ray(_sdf, (sx * (hg + 0.008), 0.0, z), (0, -1, 0), span=0.40)
                if p is not None:
                    p = p.copy(); p[0] = sx * (hg + 0.0012); pts.append(p)
            _cache[key] = np.asarray(pts, F32)
        zp = _cache[key]
        if len(zp) < 2:
            continue
        line = [p + np.array([0, -0.0012, 0], F32) for p in zp]
        tape = (lambda l: lambda Q: (capsule_pts(Q, l, 0.0034) + 0.0004 * np.sign(np.sin(Q[:, 2] * 2 * np.pi / 0.0050))).astype(F32))(line)
        out.append(SOLID(tape, solids_bbox(zp, 0.008), 'zipper', h=0.0010))
        if sx == 1:                # cursor (la caja abajo, con el tirador colgando)
            bot = zp[np.argmin(zp[:, 2])]
            c = bot + np.array([0, -0.0065, 0.012], F32)
            def puller(Q, c=c):
                a = round_cone(Q, c + np.array([0, 0, 0.010], F32), c - np.array([0, 0, 0.020], F32), 0.0052, 0.0064)
                return np.maximum(a, np.abs(Q[:, 1] - c[1]) - 0.0020).astype(F32)
            out.append(SOLID(puller, (c - 0.03, c + 0.03), 'zipper', h=0.0007))
    return out


def _cords():
    """Cordón del bajo con topes a los lados del delantero."""
    out = []
    s = ST
    for sx in (1, -1):
        key = f'ch_cord_{sx}'
        if key not in _cache:
            x0 = sx * 0.120
            p = surf_ray(_sdf, (x0, 0.0, s['hem'] + 0.012), (0, -1, 0), span=0.40)
            if p is None:
                _cache[key] = None; continue
            n = sdf_normal(_sdf, p)
            q0 = p + n * 0.003
            pts = [q0, q0 + np.array([0.004 * sx, -0.006, -0.030], F32), q0 + np.array([0.006 * sx, -0.008, -0.075], F32)]
            _cache[key] = pts
        pts = _cache[key]
        if pts is None:
            continue
        out.append(SOLID((lambda l: lambda Q: capsule_pts(Q, l, 0.0024))(pts), solids_bbox(pts, 0.01), 'trim', h=0.0008))
        tip = pts[-1]; c0 = tip + np.array([0, 0, 0.026], F32)
        out.append(SOLID((lambda a, b: lambda Q: round_cone(Q, a, b, 0.0058, 0.0050))(c0, c0 - np.array([0, 0, 0.020], F32)),
                         solids_bbox([c0, tip], 0.012), 'hardware', h=0.0006))
    return out


def _buckle():
    s = ST
    key = 'ch_buckle'
    if key not in _cache:
        x = -0.140; z = s['hem'] + s['band'] / 2
        p = surf_ray(_sdf, (x, 0.0, z), (0, -1, 0), span=0.40)
        _cache[key] = None if p is None else (p, sdf_normal(_sdf, p))
    if _cache[key] is None:
        return []
    p, n = _cache[key]
    e2 = np.array([0, 0, 1.0], F32); e1 = unit(np.cross(e2, n)); e2 = unit(np.cross(n, e1))
    c = p + n * 0.0035
    hw, hh = 0.026, 0.030
    corners = [c + e1 * sx * hw + e2 * sz * hh for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1), (-1, -1))]
    frame_ = SOLID(lambda Q: capsule_pts(Q, corners, 0.0026), solids_bbox(corners, 0.01), 'hardware', h=0.0006)
    prong = [c + e1 * (-hw), c + e1 * 0.004]
    return [frame_, SOLID(lambda Q: capsule_pts(Q, prong, 0.0016), solids_bbox(prong, 0.01), 'hardware', h=0.0005)]


def chaqueta():
    s = ST
    out = []
    def shell(which):
        def f(P):
            g, sh, R, th, sec, trim = _parts(P)
            if which == 'body':
                RR = np.maximum(R, np.maximum(sec, trim))
            elif which == 'secondary':
                RR = np.maximum(R, np.maximum(-sec, trim))
            else:
                RR = np.maximum(R, -trim)
            return ('shell', sh, RR.astype(F32), th)
        return f
    out.append(SHELL(shell('body'), 'body'))
    if s.get('sleeves2') or s.get('chevron'):
        out.append(SHELL(shell('secondary'), 'secondary'))
    if s.get('stripes') or s.get('track') or s.get('binding'):
        out.append(SHELL(shell('trim'), 'trim'))
    out += [SHELL((lambda k: lambda P: _collar_layers(P)[k])(k), 'body') for k in range(len(_collar_layers(np.zeros((1, 3), F32))))]
    # cierres
    if s['front'] == 'zip':
        top = (s['ctop'] - 0.004) if s['collar'] in ('rib', 'stand') else 1.43
        out += _zipper([(0.0, s['hem'] + 0.004), (0.0, top)], 'ch_zip')
    elif s['front'] == 'asym':
        out += _zipper(asym_path(), 'ch_zip', lift=-0.0030)
    elif s.get('open_kind') == 'zip':
        out += _zip_halves()
    elif s['front'] in ('snap', 'button') or s.get('open_kind') == 'snap':
        zt = (s['ctop'] - 0.030) if s['collar'] in ('rib', 'stand') else (V_BOTTOM - 0.030 if s['collar'] == 'lapel' else 1.400)
        zs = np.linspace(s['hem'] + (0.030 if s['hemk'] in ('rib', 'band') else 0.050), zt, s['n_snap'])
        if s['front'] == 'open':   # abierta: los broches se quedan en el borde de un lado
            w = s.get('placket_w', 0.036) * 0.75
            xz = [(-(float(open_hg(z)) + w / 2), z) for z in zs]
        else:
            xz = [(0.0, z) for z in zs]
        pts = placed('ch_btn', _sdf, front_points(xz))
        kind = 'stud'
        role = 'hardware'
        out += button_specs(pts, role=role, r=0.0070 if s['front'] == 'snap' else 0.0075, t=0.0030, kind=kind)
    # broches y botones de detalle
    extra = []
    if 'flapchest' in s['pockets']:
        extra += [(sx * chest_pk()[0], chest_pk()[1] + 0.065 - 0.020) for sx in (1, -1)]
    if 'flaphip' in s['pockets']:
        extra += [(sx * hip_pk()[0], hip_pk()[1] + 0.080 - 0.024) for sx in (1, -1)]
    if s['collar'] == 'lapel':
        extra += [(sx * 0.128, 1.340) for sx in (1, -1)]
    if s.get('tab'):
        zt = s['ctop'] - 0.030
        extra += [(-(float(open_hg(zt)) + 0.010) if s['front'] == 'open' else -0.030, zt)]
    if s['hemk'] == 'band' and s.get('denim'):
        extra += [(sx * 0.175, s['hem'] + s['band'] / 2) for sx in (1, -1)]
    if s['hemk'] == 'belt':
        extra += [(0.170, s['hem'] + s['band'] / 2)]
    if extra:
        pts = placed('ch_det', _sdf, front_points(extra))
        out += button_specs(pts, role='hardware', r=0.0058, t=0.0026, kind='stud')
    if s['cuffk'] == 'button':
        if 'ch_cuff' not in _cache:
            _cache['ch_cuff'] = _surf_from_axis(_sdf, _cuff_button_specs(s['L'] - 0.005, ang=2.75), span=0.14)
        out += button_specs(_cache['ch_cuff'], role='hardware', r=0.0060, t=0.0026, kind='stud')
    if s.get('epaulettes'):
        key = 'ch_epa'
        if key not in _cache:
            pts = []
            for sx in (1, -1):
                p = surf_ray(_sdf, (sx * 0.165, 0.004, 1.40), (0, 0, 1), span=0.30)
                if p is not None: pts.append((p, sdf_normal(_sdf, p)))
            _cache[key] = pts
        out += button_specs(_cache[key], role='hardware', r=0.0052, t=0.0024, kind='stud')
    if s['hemk'] == 'cord':
        out += _cords()
    if s['hemk'] == 'belt':
        out += _buckle()
    return out


# ---------------------------------------------------------------- pespuntes
def _u_path(cx, cz, w, h, ins=0.0045):
    poly = np.array([(cx - w / 2 + ins, cz + h / 2 - 0.004), (cx - w / 2 + ins, cz - h / 2 + ins),
                     (cx + w / 2 - ins, cz - h / 2 + ins), (cx + w / 2 - ins, cz + h / 2 - 0.004)], F32)
    seg = np.linalg.norm(np.diff(poly, axis=0), axis=1); sc = np.concatenate([[0], np.cumsum(seg)])
    t = np.linspace(0, sc[-1], int(sc[-1] / SAMPLE))
    xz = np.stack([np.interp(t, sc, poly[:, 0]), np.interp(t, sc, poly[:, 1])], 1)
    return np.stack([xz[:, 0], np.zeros(len(xz)), xz[:, 1]], 1).astype(F32)


def _front_rays(O):
    return np.tile(np.array([0, -1.0, 0], F32), (len(O), 1))


def seam_paths():
    s = ST
    P = []
    zb = s['hem'] + s.get('band', 0.0)
    ths = np.linspace(-np.pi, np.pi, int(2 * np.pi * 0.21 / SAMPLE), endpoint=False).astype(F32)
    zline = zb + 0.004 if s['hemk'] in ('rib', 'band', 'belt') else s['hem'] + 0.018
    if s['front'] in ('zip', 'asym'):
        ths = ths[np.abs(np.angle(np.exp(1j * (ths + np.pi / 2)))) > 0.08]
    elif s['front'] == 'open':     # sin pespunte en la abertura
        ths = ths[~((np.sin(ths) < 0) & (np.abs(np.cos(ths)) * 0.17 < float(open_hg(zline)) + 0.010))]
    for k, m in enumerate((ths > -np.pi / 2, ths < -np.pi / 2)):
        if m.sum() > 10:
            P.append((f'bajo_{k}',) + ring_rays_at(np.full(int(m.sum()), zline, F32), ths[m]))
    angs = np.linspace(-np.pi, np.pi, int(2 * np.pi * 0.075 / SAMPLE), endpoint=False).astype(F32)
    for sd in ((1, -1) if not s.get('vest') else ()):
        off = (s['cuff'] + 0.004) if s['cuffk'] in ('rib', 'band', 'button', 'elastic') else 0.012
        P.append((f'puno_{sd}',) + arm_rays(sd, s['L'] - off, angs))
    if s['front'] == 'zip':
        top = (s['ctop'] - 0.008) if s['collar'] in ('rib', 'stand') else 1.42
        zs = np.arange(s['hem'] + 0.006, top, SAMPLE)
        for sx in (1, -1):
            O = np.stack([np.full_like(zs, sx * 0.0115), np.zeros_like(zs), zs], 1).astype(F32)
            P.append((f'cremallera_{sx}', O, _front_rays(O)))
    elif s['front'] == 'open':     # pespunte a lo largo de cada borde
        zt = (s['ctop'] - 0.010) if s['collar'] in ('rib', 'stand') else (V_BOTTOM - 0.010 if s['collar'] == 'lapel' else 1.43)
        zs = np.arange(s['hem'] + 0.006, zt, SAMPLE)
        off = s.get('placket_w', 0.036) * 0.75 - 0.004 if s['open_kind'] == 'snap' else 0.0075
        for sx in (1, -1):
            O = np.stack([sx * (open_hg(zs) + off), np.zeros_like(zs), zs], 1).astype(F32)
            P.append((f'borde_{sx}', O, _front_rays(O)))
    elif s['front'] in ('snap', 'button'):
        w = s.get('placket_w', 0.036)
        zt = (s['ctop'] - 0.010) if s['collar'] in ('rib', 'stand') else 1.43
        zs = np.arange(s['hem'] + 0.006, zt, SAMPLE)
        for k, xo in enumerate((-w / 2 + 0.005, w / 2 - 0.005)):
            O = np.stack([np.full_like(zs, xo), np.zeros_like(zs), zs], 1).astype(F32)
            P.append((f'tapeta_{k}', O, _front_rays(O)))
    if 'flapchest' in s['pockets']:
        for sx in (1, -1):
            cx_, cz_, w_, h_ = chest_pk(); O = _u_path(sx * cx_, cz_, w_, h_); P.append((f'bolsillo_p_{sx}', O, _front_rays(O)))
    if 'flaphip' in s['pockets']:
        for sx in (1, -1):
            cx_, cz_, w_, h_ = hip_pk(); O = _u_path(sx * cx_, cz_, w_, h_); P.append((f'bolsillo_c_{sx}', O, _front_rays(O)))
    if s.get('denim'):
        xs = np.concatenate([np.linspace(-0.185, -0.028, 60), np.linspace(0.028, 0.185, 60)])
        O = np.stack([xs, np.zeros_like(xs), np.full_like(xs, YOKE_Z - 0.005)], 1).astype(F32)
        P.append(('canesu_d', O, _front_rays(O)))
        xs = np.linspace(-0.185, 0.185, 140)
        O = np.stack([xs, np.zeros_like(xs), np.full_like(xs, 1.37 - 0.005)], 1).astype(F32)
        P.append(('canesu_t', O, np.tile(np.array([0, 1.0, 0], F32), (len(O), 1))))
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
    g = jacket(V)
    x, y, z = V[:, 0], V[:, 1], V[:, 2]
    pieza = np.where(y >= 0.004, 2, np.where(x >= 0, 0, 1)).astype(np.int8)
    tej = np.zeros((len(V), 2), F32)
    r = np.hypot(x, y); th = np.arctan2(y, x)
    tej[:, 0] = th * _rnom(z, r, 0.01); tej[:, 1] = z
    interior = (N[:, 0] * x + N[:, 1] * y) / (r + 1e-6) < -0.15
    b = g.b
    for k, sd in enumerate((1, -1) if not s.get('vest') else ()):
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
        if s['cuffk'] in ('rib', 'band', 'button', 'elastic'):
            c = m.copy(); c[m] = g.sleeve_in[m] < s['cuff']
            pieza[c] = 5 + k
    if s['collar'] in ('rib', 'stand'):
        pieza[(z > NECK_Z) & (r < 0.14) & (pieza <= 2)] = 7
    else:
        db = np.abs(g.layer()[1]) - g.th / 2
        dc = np.full(len(V), 1.0, F32)
        for kind, sh, R, thv in _collar_layers(V):
            dc = np.minimum(dc, np.maximum(np.abs(sh) - thv / 2, R))
        pieza[(dc < 0.0015) & (dc < np.maximum(db, g.R))] = 7
    if s.get('band'):
        pieza[(g.hem_in < s['band']) & (pieza <= 2)] = 8
    if s['front'] in ('snap', 'button'):
        w = s.get('placket_w', 0.036)
        pieza[(y < 0) & (pieza <= 1) & (np.abs(x) < w / 2)] = 9
    elif s.get('open_kind') == 'snap':
        w = s.get('placket_w', 0.036) * 0.75
        pieza[(y < 0) & (pieza <= 1) & (np.abs(x) - open_hg(z) < w)] = 9
    cp, hp = chest_pk(), hip_pk()
    for cx, cz, w_, h_ in ([(sx * cp[0],) + cp[1:] for sx in (1, -1)] if 'flapchest' in s['pockets'] else []) + \
                          ([(sx * hp[0],) + hp[1:] for sx in (1, -1)] if 'flaphip' in s['pockets'] else []):
        pieza[(y < 0) & (pieza <= 1) & (np.abs(x - cx) < w_ / 2 + 0.003) & (np.abs(z - cz) < h_ / 2 + 0.003) & ~interior] = 10
    canale = np.zeros(len(V), F32)
    if s['hemk'] == 'rib':
        canale = np.maximum(canale, sstep(s['band'] + 0.0025, s['band'] - 0.0005, g.hem_in))
    if s['cuffk'] == 'rib':
        canale = np.maximum(canale, sstep(s['cuff'] + 0.0025, s['cuff'] - 0.0005, g.sleeve_in) * (np.abs(x) > 0.2))
    if s['collar'] == 'rib':
        canale = np.maximum(canale, sstep(NECK_Z - 0.004, NECK_Z + 0.002, z) * (r < 0.14))
    return pieza, tej, interior.astype(np.uint8), canale.astype(F32)


def ejes():
    s = ST
    return {'estilo': KEY, 'cierre': CIERRE, 'nombre': CATALOG[0][1], 'color': s['color'], 'color2': s.get('color2'), 'tejido': s['tejido'],
            'tejido2': s.get('tejido2'), 'forro': s.get('forro'), 'color_trim': s.get('color_trim'), 'piezas': PIEZAS,
            'L': s['L'], 'hem': s['hem']}


configure(__import__('os').environ.get('CHAQUETA_ESTILO', 'bomber'))
