"""Tops y prendas sin manga para Blender (10 variantes), sobre el cuerpo de referencia de 1,78 m.

Mismo sistema que camisetas.py: campo de distancia por corte (tabla STYLES) extraído con marching cubes.

  01 camiseta de tirantes     02 tirantes de canalé (A-shirt)   03 muscle (sisa amplia)    04 polo (piqué)
  05 body (con braguita)      06 corsé (ballenas, cordones)      07 halter (cuello atado)   08 bandeau (fruncido)
  09 chaleco de vestir        10 camisa sin mangas

Piezas (papel del material): body; secondary (espalda de satén del chaleco); trim (tira del halter,
cordones del corsé); button (botones); hardware (ojetes del corsé, broches del body).
Aparte (_costuras.glb): pespuntes.
Coordenadas: Z arriba, frente = -Y.
"""
import math
import numpy as np
from kit import *
from core import Body
from items2 import cuff_blend, arm_ang
from items3 import B, fit_base, tank_armhole, polo_collar, ARM
from items4 import (SHELL, SOLID, placed, front_points, button_specs, collar, surf_ray, sdf_normal, unit, solids_bbox,
                    _cache)
from camisetas import arm_rays, ring_rays_at, _rnom, SAMPLE
from chaquetas import _seg_dist, _u_path, _front_rays

UP = ((-0.56, -0.25, 0.70), (0.56, 0.25, 1.60))
UP_BODY = ((-0.56, -0.25, 0.72), (0.56, 0.25, 1.60))

# armhole: (cx, cz, ax, az) de tank_armhole.  neck: (a, b, z_back, z_front).  vneck: fondo del pico.
STYLES = {
    'tirantes': dict(num=1, file='camiseta_tirantes', name='Camiseta de tirantes', ease=0.012, drape=0.6, hem=0.775,
                     th=0.0042, armhole=(0.222, 1.335, 0.090, 0.160), neck=(0.102, 0.098, 1.462, 1.330), bind=0.012,
                     tejido='punto', color='#EDEBE6', folds=(0.0, 0.007, 0.0)),
    'canale': dict(num=2, file='tirantes_canale', name='Camiseta de tirantes de canalé', ease=0.0, drape=0.2, hem=0.790,
                   th=0.0040, armhole=(0.228, 1.330, 0.100, 0.170), neck=(0.108, 0.104, 1.458, 1.300), bind=0.008,
                   ribbed=True, tejido='punto', color='#F4F3EF', folds=(0.0, 0.003, 0.0)),
    'muscle': dict(num=3, file='camiseta_muscle', name='Camiseta muscle', ease=0.024, drape=0.75, hem=0.770, th=0.0046,
                   armhole=(0.205, 1.300, 0.075, 0.150), neck=(0.090, 0.088, 1.478, 1.442), rib=0.016, raw=True,
                   tejido='punto', color='#1E1E21', folds=(0.0, 0.008, 0.0)),
    'polo': dict(num=4, file='polo', name='Polo', ease=0.018, drape=0.6, arm_ease=0.020, arm_drape=0.5, hem=0.760,
                 th=0.0050, L=0.215, at=0.052, cuff=0.024, polo=True, vents=0.045, tejido='punto',
                 color='#22334F', folds=(0.006, 0.007, 0.0045)),
    'body': dict(num=5, file='body', name='Body', ease=0.002, drape=0.0, arm_ease=0.004, arm_drape=0.0, th=0.0036,
                 L=0.580, at=0.048, neck=(0.104, 0.100, 1.462, 1.360), bodysuit=True, bind=0.008, tejido='punto',
                 color='#141416', folds=(0.004, 0.003, 0.0)),
    'corse': dict(num=6, file='corse', name='Corsé', ease=0.000, drape=0.0, th=0.0060, corset=True, hem=0.985,
                  tejido='saten', color='#E6DCD3', color_trim='#E6DCD3', folds=(0.0, 0.0, 0.0)),
    'halter': dict(num=7, file='top_halter', name='Top halter', ease=0.006, drape=0.3, hem=1.020, th=0.0040, halter=True,
                   bind=0.010, tejido='punto', color='#7E1F2A', color_trim='#7E1F2A', folds=(0.0, 0.004, 0.0)),
    'bandeau': dict(num=8, file='top_bandeau', name='Top bandeau', ease=0.004, drape=0.0, th=0.0045, bandeau=(1.215, 1.375),
                    tejido='punto', color='#B8B0A6', folds=(0.0, 0.0, 0.0)),
    'chaleco': dict(num=9, file='chaleco_vestir', name='Chaleco de vestir', ease=0.012, drape=0.3, hem=0.900, th=0.0055,
                    armhole=(0.220, 1.300, 0.062, 0.125), vneck=1.180, waistcoat=True, n_btn=5, tejido='traje',
                    tejido2='saten', color='#3C3F45', color2='#2A2B30', forro='#2A2B30', boton='#1C1C1E',
                    folds=(0.0, 0.004, 0.0)),
    'chaleco_traje': dict(num=4, file='chaleco_traje', name='Chaleco de traje cruzado', ease=0.010, drape=0.3, hem=0.905,
                          th=0.0058, armhole=(0.218, 1.295, 0.060, 0.125), vneck=1.150, waistcoat=True, db=True, lapels=True,
                          tejido='traje', tejido2='saten', color='#2E3035', color2='#24252B', forro='#24252B',
                          boton='#1A1A1C', folds=(0.0, 0.004, 0.0)),
    'camisa_sin_mangas': dict(num=10, file='camisa_sin_mangas', name='Camisa sin mangas', ease=0.020, drape=0.7, hem=0.735,
                              th=0.0036, armhole=(0.212, 1.330, 0.060, 0.135), shirt=True, n_btn=7, tejido='popelin',
                              color='#E9E8E3', folds=(0.0, 0.008, 0.0)),
}

PIEZAS = ['Delantero', 'Espalda', 'Manga izquierda', 'Manga derecha', 'Cuello', 'Sisa', 'Bajo', 'Tapeta', 'Copas', 'Braguita']


def configure(key):
    global ST, KEY, CATALOG
    ST = STYLES[key]; KEY = key
    for k in [k for k in _cache if str(k).startswith('tp_')]:
        del _cache[k]
    CATALOG = [(f"{ST['num']:02d}_{ST['file']}", ST['name'], top, UP_BODY if ST.get('bodysuit') else UP)]


def body():
    s = ST
    return B(ease=s['ease'], drape=s['drape'], drape_from=1.30, arm_ease=s.get('arm_ease', 0.02), arm_drape=s.get('arm_drape', 0.3))


def _torso_only(b):
    return lambda P: smin(b.torso(P), b.neck_d(P), 0.03)


def _corset_torso(b):
    """Tronco ceñido en la cintura (el corsé moldea): secciones más estrechas entre 1,00 y 1,15."""
    def f(P):
        z = P[:, 2]
        k = 1 - 0.055 * np.exp(-((z - 1.06) / 0.07) ** 2)
        Q = P.copy(); Q[:, 0] /= k; Q[:, 1] /= (1 - 0.035 * np.exp(-((z - 1.06) / 0.07) ** 2))
        return (b.torso(Q) * k).astype(F32)
    return f


def _bodysuit_base(b):
    lo = Body(ease=0.003, leg_ease=0.002, arm_deg=ARM)
    def f(P):
        up = b.upper(P)
        pel = lo.lower(P)
        pel = np.where(P[:, 2] < 0.98, pel, 0.05)
        return smin(up, pel, 0.03).astype(F32)
    return f


def knit(P):
    s = ST
    b = body()
    sleeveless = 'armhole' in s or s.get('corset') or s.get('halter') or s.get('bandeau')
    if s.get('corset'):
        base = _corset_torso(b)
    elif s.get('bodysuit'):
        base = _bodysuit_base(b)
    elif sleeveless:
        base = _torso_only(b)
    else:
        base = 'upper'
    g = Gar(P, b, base, th=s['th'])
    n = len(P)
    sl = np.ones(n, F32); hem = np.ones(n, F32); neck = np.ones(n, F32)
    # ---------- bajo
    if s.get('bodysuit'):           # braguita de corte alto con las aberturas de pierna
        zc = 0.800 + 0.120 * np.clip((np.abs(g.x) - 0.035) / 0.130, 0, 1) ** 1.3 + 0.012 * (g.y > 0)
        g.keep(zc - g.z); hem = (g.z - zc).astype(F32)
    elif s.get('bandeau'):
        z0, z1 = s['bandeau']
        g.keep(z0 - g.z); g.keep(g.z - (z1 + 0.012 * np.cos(g.theta + np.pi / 2) * 0)); hem = g.z - z0
        neck = (z1 - g.z).astype(F32)
    elif s.get('corset'):
        zh = s['hem'] - 0.045 * np.clip(1 - np.abs(g.x) / 0.07, 0, 1) * (g.y < 0)      # pico delante
        g.keep(zh - g.z); hem = (g.z - zh).astype(F32)
    else:
        zh = s['hem'] + 0.0020 * noise(g.P * [1, 1, 0], 6, 3)
        if s.get('waistcoat'):     # puntas delanteras
            zh = zh - 0.040 * np.clip(1 - np.abs(np.abs(g.x) - 0.055) / 0.07, 0, 1) * (g.y < 0) * (np.abs(g.x) > 0.01)
        g.keep(zh - g.z); hem = (g.z - zh).astype(F32)
    # ---------- sisa o manga
    if 'armhole' in s:
        cx, cz, ax, az = s['armhole']
        sl = tank_armhole(g, cx=cx, cz=cz, ax=ax, az=az)
    elif s.get('L'):
        if s.get('cuff'):
            cuff_blend(g, s['L'], s['cuff'], fit_base(P, 0.010, 0.006), extra=0.02)
        sl = g.cut_sleeve(s['L'])
    # ---------- escote
    if s.get('corset'):            # escote corazón
        ax_ = np.abs(g.x)
        ztop = 1.345 - 0.030 * np.exp(-(g.x / 0.022) ** 2) - 0.020 * sstep(0.10, 0.17, ax_) * (g.y < 0.02) \
            - 0.025 * sstep(0.0, 0.06, g.y)
        g.keep(g.z - ztop); neck = (ztop - g.z).astype(F32)
    elif s.get('halter'):
        w = 0.165 - (0.165 - 0.050) * np.clip((g.z - 1.20) / 0.25, 0, 1) ** 1.2
        front = g.y < 0.025
        side = ax_ = np.abs(g.x)
        g.keep(np.where(front & (g.z > 1.18), ax_ - w, -1.0))
        g.keep(np.where(~front, g.z - (s['hem'] + 0.075), -1.0))
        g.keep(g.z - 1.455)
        neck = np.where(front, np.minimum(w - ax_, 1.455 - g.z), (s['hem'] + 0.075) - g.z).astype(F32)
        sl = neck
    elif s.get('polo'):
        neck = -g.cut_neck(a=0.086, b=0.084, z_back=1.462, z_front=1.440)
    elif s.get('shirt'):
        neck = -g.cut_neck(a=0.086, b=0.084, z_back=1.462, z_front=1.440)
    elif s.get('bandeau'):
        pass
    else:
        a, bb, zbk, zf = s.get('neck', (0.094, 0.090, 1.470, 1.440))
        neck = -g.cut_neck(a=a, b=bb, z_back=zbk, z_front=zf)
    if s.get('vneck'):
        slope = (1.445 - s['vneck']) / 0.095
        dv = (s['vneck'] + slope * np.abs(g.x) - g.z) / math.sqrt(1 + slope * slope)
        front = sstep(-0.02, -0.05, g.y)
        g.keep(np.where(front > 0.5, -dv, -1.0))
        neck = np.where(front > 0.5, np.minimum(neck, dv), neck).astype(F32)
    # ---------- pliegues
    fs, ft, fd = s['folds']
    if s.get('L'):
        g.sleeve_strokes(5 if s['L'] < 0.4 else 7, 0.04, s['L'] - 0.03, amp=fs, w=0.009, seed=501 + s['num'])
    if ft > 0:
        g.drape_strokes(8, 1.20, max(0.80, s.get('hem', 0.8)) - 0.02, amp=ft, w=0.013, seed=503 + s['num'])
    g.wobble(0.0009 if s['ease'] < 0.01 else 0.0012)
    # ---------- costuras
    if not s.get('bandeau'):
        g.side_seams(zmin=0.0, xmin=0.10)
    if not (s.get('corset') or s.get('halter') or s.get('bandeau')):
        shoulder = (g.z > 1.40) * sstep(0.065, 0.08, np.abs(g.x)) * g._not_arm()
        g.groove(g.y - 0.004, depth=0.0008, width=0.0018, mask=shoulder)
    if s.get('L'):
        g.armhole_seams(s['at'])
    # ---------- canalé en toda la prenda (A-shirt)
    if s.get('ribbed'):
        g.o += 0.0011 * np.cos(80 * g.theta)          # canalé 2x2 (el 1x1 fino lo pone el material)
    # ---------- bordes
    if s.get('bind'):              # vivos de punto en escote y sisas
        g.band(neck, s['bind'], raise_=0.0012)
        if 'armhole' in s:
            g.band(sl, s['bind'], raise_=0.0012)
        if not s.get('bodysuit'):
            g.hem(hem, 0.020, roll=0.0016, band=0.022)
        else:
            g.band(hem, 0.008, raise_=0.0010)            # elástico de las piernas
            g.band(sl, 0.020, raise_=0.0010) if s.get('L') else None
    if s.get('raw'):               # muscle: sisa cortada en crudo (se enrolla) y cuello de canalé
        g.hem(sl, 0.004, roll=0.0022, band=0.006)
        g.band(neck, s['rib'], raise_=0.0010)
        g.groove(neck - s['rib'] - 0.004, depth=0.0006, width=0.0015)
        g.hem(hem, 0.019, roll=0.0018, band=0.028)
    if s.get('polo'):
        g.ribbed(sl, s['cuff'], arm_ang(g), 30, 0.0006, 0.0016)
        g.hem(hem, 0.020, roll=0.0018, band=0.024)
        # tapeta de 3 botones
        pl = rrect(0.0, 1.385, 0.034, 0.120, 0.003)
        g.patch_xz(pl, lift=0.0014, puff=0.0, stitch=0.0035)
        g.groove(np.abs(g.x), depth=0.0010, width=0.0015, mask=(g.y < 0) * (g.z > 1.330) * (g.z < 1.45))
        for sx in (1, -1):         # aberturas laterales del bajo
            g.groove(np.abs(g.y - 0.004), depth=0.0016, width=0.0012, mask=(np.sign(g.x) == sx) * (np.abs(g.x) > 0.14) * (hem < s['vents']))
        g.band(neck, 0.004, raise_=0.0008)
    if s.get('corset'):
        g.band(neck, 0.010, raise_=0.0018); g.band(hem, 0.010, raise_=0.0018)
        for cx in (0.030, 0.075, 0.125):            # ballenas (canales verticales)
            for sxx in (1, -1):
                g.ridge(g.x - sxx * cx, height=0.0016, width=0.0030, mask=(g.y < 0.02) * (g.z < 1.34))
                g.groove(g.x - sxx * cx - 0.006, depth=0.0008, width=0.0012, mask=(g.y < 0.02) * (g.z < 1.34))
                g.groove(g.x - sxx * cx + 0.006, depth=0.0008, width=0.0012, mask=(g.y < 0.02) * (g.z < 1.34))
        for cx in (0.050, 0.110):
            g.ridge(np.abs(g.x) - cx, height=0.0016, width=0.0030, mask=(g.y > 0.02))
        # abertura de los cordones detrás
        g.groove(np.abs(g.x) - 0.022, depth=0.0016, width=0.0016, mask=(g.y > 0.02))
        g.o -= 0.0020 * sstep(0.020, 0.012, np.abs(g.x)) * (g.y > 0.02)
        # copas: costura en arco
        for sx in (1, -1):
            d = np.hypot(g.x - sx * 0.090, g.z - 1.36) - 0.085
            g.groove(d, depth=0.0010, width=0.0018, mask=(g.y < 0) * (g.z < 1.35) * (g.z > 1.24))
    if s.get('bandeau'):
        z0, z1 = s['bandeau']
        g.band(neck, 0.012, raise_=0.0016); g.band(hem, 0.012, raise_=0.0016)
        mid = sstep(0.0, 0.012, hem) * sstep(0.0, 0.012, neck)
        g.o += 0.0024 * np.sin(np.arcsin(np.clip(np.sin(g.theta * 22 + 0.6 * np.sin(g.z * 40)), -1, 1))) * mid   # fruncido vertical suave
        g.groove(np.abs(g.x), depth=0.0030, width=0.0050, mask=(g.y < 0) * mid)                          # frunce del centro
    if s.get('halter'):
        g.band(neck, s['bind'], raise_=0.0014)
        g.hem(hem, 0.018, roll=0.0016, band=0.020)
        g.gather(sstep(0.04, 0.0, np.abs(g.x)) * (g.y < 0) * sstep(1.30, 1.40, g.z), amp=0.0018, n=10, fz=20)
    if s.get('waistcoat') or s.get('shirt'):
        g.band(neck, 0.010 if s.get('waistcoat') else 0.004, raise_=0.0014 if s.get('waistcoat') else 0.0008)
        g.band(sl, 0.008, raise_=0.0012)
        g.hem(hem, 0.008, roll=0.0016, band=0.010)
        if s.get('waistcoat'):     # tapeta montada, vivos de los bolsillos y pinzas
            m = (g.y < 0) * (g.z < s['vneck'] + 0.01)
            edge = -0.060 if s.get('db') else -0.010
            g.o += 0.0016 * sstep(-0.002, 0.004, g.x - edge) * m
            g.groove(g.x - edge, depth=0.0015, width=0.0016, mask=m)
            if s.get('lapels'):    # solapas pequeñas a lo largo del pico
                for sx in (1, -1):
                    poly = [(0.012, s['vneck']), (0.092, 1.432), (0.128, 1.385), (0.060, s['vneck'] - 0.015)]
                    poly = [(sx * px, pz) for px, pz in poly]
                    if sx < 0: poly = poly[::-1]
                    d2 = sd_poly(g.x, g.z, poly)
                    fr = sstep(0.02, -0.02, g.y)
                    g.o += 0.0035 * sstep(0.0015, -0.0015, d2) * fr
                    g.groove(d2, depth=0.0014, width=0.0018, mask=fr)
            for sx in (1, -1):
                for cx, cz, w in ((0.115, 0.990, 0.105), (0.105, 1.230, 0.085)):
                    if cz > 1.2 and sx < 0:
                        continue
                    a = (sx * (cx - w / 2), cz - 0.006); c = (sx * (cx + w / 2), cz + 0.006)
                    d, t = _seg_dist(g.x, g.z, a, c)
                    mm = (g.y < 0) * (t > 0.002) * (t < w - 0.002)
                    g.o += 0.0020 * sstep(0.0065, 0.0045, np.abs(d)) * mm
                    g.groove(np.abs(d) - 0.0062, depth=0.0008, width=0.0013, mask=mm)
                g.groove(np.abs(g.x) - 0.085, depth=0.0010, width=0.0016, mask=(g.y < 0) * (np.sign(g.x) == sx) * (g.z < 1.20) * (g.z > 0.95))
            g.groove(np.abs(g.x) - 0.12, depth=0.0010, width=0.0016, mask=(g.y > 0) * (g.z < 1.25))
        else:
            pl = (g.y < 0) * (g.z > s['hem'] - 0.01) * (g.z < 1.445)
            g.o += 0.0012 * sstep(0.018, 0.014, np.abs(g.x)) * pl
            g.groove(g.x + 0.016, depth=0.0011, width=0.0016, mask=pl)
            g.groove(g.x - 0.016, depth=0.0008, width=0.0014, mask=pl)
            g.groove(g.z - 1.365, depth=0.0011, width=0.0018, mask=(g.y > 0) * (np.abs(g.x) < 0.19))
    if s.get('bodysuit'):
        g.band(neck, s['bind'], raise_=0.0012)
        g.band(sl, 0.012, raise_=0.0010)
        g.groove(g.z - 0.810, depth=0.0010, width=0.0016, mask=(np.abs(g.x) < 0.05))       # entrepierna con broches
    g.neck_in, g.sleeve_in, g.hem_in = neck, sl, hem
    return g


# ---------------------------------------------------------------- piezas
def _secondary_d(g):
    """Espalda de satén del chaleco: positiva en la espalda (por detrás de las costuras de los costados)."""
    return (g.y - 0.006 - 0.02 * sstep(0.12, 0.20, np.abs(g.x))).astype(F32)


def _extra_layers(P):
    s = ST
    if s.get('polo'):
        return [l[:4] for l in polo_collar(P, gap=0.034, e=0.004)]
    if s.get('shirt'):
        return [l[:4] for l in collar(P, th=0.0042, gap=0.014, stand=0.034, fall=0.050, spread=1.0)]
    return []


def _sdf(Q):
    d = knit(Q).sdf()
    for kind, csh, cR, cth in _extra_layers(Q):
        d = np.minimum(d, np.maximum(np.abs(csh) - cth / 2, cR))
    return d.astype(F32)


def _neck_strap():
    """Tira del halter: sube desde el escote, rodea la nuca y se ata (trim)."""
    if 'tp_strap' not in _cache:
        pts = []
        for t in np.linspace(-1, 1, 41):
            ang = t * np.pi * 0.62 + np.pi / 2        # alrededor del cuello por detrás
            r = 0.072
            pts.append(np.array([r * np.cos(ang) * 1.0, 0.012 + r * np.sin(ang) * 1.05, 1.462 + 0.022 * (1 - abs(t)) ** 2], F32))
        tie = [pts[20] + np.array([0.0, 0.004, 0.0], F32), pts[20] + np.array([0.010, 0.012, -0.050], F32),
               pts[20] + np.array([0.018, 0.016, -0.095], F32)]
        _cache['tp_strap'] = (pts, tie)
    pts, tie = _cache['tp_strap']
    a = SOLID(lambda Q: capsule_pts(Q, pts, 0.0060), solids_bbox(pts, 0.012), 'trim', h=0.0008)
    b2 = SOLID(lambda Q: capsule_pts(Q, tie, 0.0045), solids_bbox(tie, 0.012), 'trim', h=0.0008)
    knot = SOLID(lambda Q: (np.linalg.norm(Q - pts[20], axis=1) - 0.010).astype(F32), (pts[20] - 0.02, pts[20] + 0.02), 'trim', h=0.0008)
    return [a, b2, knot]


def _laces():
    """Ojetes (hardware) y cordón cruzado (trim) en la espalda del corsé."""
    if 'tp_lace' not in _cache:
        rows = np.linspace(1.010, 1.310, 9)
        holes = []
        for z in rows:
            for sx in (1, -1):
                p = surf_ray(_sdf, (sx * 0.030, 0.0, z), (0, 1, 0), span=0.40)
                if p is not None:
                    holes.append((p, sdf_normal(_sdf, p)))
        _cache['tp_lace'] = holes
    holes = _cache['tp_lace']
    out = []
    for p, n in holes:
        def eyelet(Q, c=p, n=n):
            q = Q - c; al = q @ n; rad = np.linalg.norm(q - np.outer(al, n), axis=1)
            return (np.sqrt((rad - 0.0040) ** 2 + al ** 2) - 0.0012).astype(F32)
        out.append(SOLID(eyelet, (p - 0.01, p + 0.01), 'hardware', h=0.0005))
    L = [h[0] + h[1] * 0.004 for h in holes]
    left = [p for p in L if p[0] > 0]; right = [p for p in L if p[0] < 0]
    left.sort(key=lambda p: p[2]); right.sort(key=lambda p: p[2])
    path = []
    for k in range(min(len(left), len(right))):
        path += [left[k], right[min(k + 1, len(right) - 1)]] if k % 2 == 0 else [right[k], left[min(k + 1, len(left) - 1)]]
    dedup = []
    for q in path:                 # sin puntos repetidos seguidos (capsule_pts divide por la longitud del tramo)
        if not dedup or np.linalg.norm(q - dedup[-1]) > 1e-4:
            dedup.append(q)
    path = dedup
    if len(path) > 2:
        out.append(SOLID(lambda Q: capsule_pts(Q, path, 0.0017), solids_bbox(path, 0.01), 'trim', h=0.0005))
        top = path[-1]
        bow = [top, top + np.array([0.025, 0.010, 0.015], F32), top + np.array([0.0, 0.006, 0.0], F32),
               top + np.array([-0.025, 0.010, 0.015], F32), top, top + np.array([0.012, 0.008, -0.060], F32)]
        out.append(SOLID(lambda Q: capsule_pts(Q, bow, 0.0017), solids_bbox(bow, 0.012), 'trim', h=0.0005))
    return out


def top():
    s = ST
    if s.get('waistcoat'):
        def part(back):
            def f(P):
                g = knit(P)
                kind, sh, R, th = g.layer()
                d = _secondary_d(g)
                return (kind, sh, np.maximum(R, -d if back else d).astype(F32), th)
            return f
        out = [SHELL(part(False), 'body'), SHELL(part(True), 'secondary')]
    else:
        out = [SHELL(lambda P: knit(P).layer(), 'body')]
    n_extra = 2 if (s.get('polo') or s.get('shirt')) else 0
    out += [SHELL((lambda k: lambda P: _extra_layers(P)[k])(k), 'body') for k in range(n_extra)]
    if s.get('polo'):
        pts = placed('tp_btn', _sdf, front_points([(0.0, z) for z in (1.352, 1.392, 1.428)]))
        out += button_specs(pts, role='button', r=0.0055, t=0.0024)
    if s.get('shirt'):
        zs = np.linspace(s['hem'] + 0.06, 1.420, s['n_btn'])
        pts = placed('tp_btn', _sdf, front_points([(0.0, z) for z in zs]))
        out += button_specs(pts, role='button', r=0.0052, t=0.0022)
    if s.get('waistcoat'):
        if s.get('db'):
            zs = np.linspace(s['vneck'] - 0.040, 0.955, 3)
            pts = placed('tp_btn', _sdf, front_points([(x, z) for z in zs for x in (-0.045, 0.045)]))
        else:
            zs = np.linspace(s['vneck'] - 0.035, 0.935, s['n_btn'])
            pts = placed('tp_btn', _sdf, front_points([(-0.002, z) for z in zs]))
        out += button_specs(pts, role='button', r=0.0068, t=0.0028)
    if s.get('halter'):
        out += _neck_strap()
    if s.get('corset'):
        out += _laces()
    if s.get('bodysuit'):
        pts = placed('tp_snap', _sdf, [((x, 0.0, 0.70), (0, 0, 1)) for x in (-0.020, 0.0, 0.020)])
        out += button_specs(pts, role='hardware', r=0.0045, t=0.0020, kind='stud')
    return out


# ---------------------------------------------------------------- pespuntes
def seam_paths():
    s = ST
    P = []
    ths = np.linspace(-np.pi, np.pi, int(2 * np.pi * 0.19 / SAMPLE), endpoint=False).astype(F32)
    if s.get('bandeau'):
        for k, z in enumerate((s['bandeau'][0] + 0.010, s['bandeau'][1] - 0.010)):
            P.append((f'banda_{k}',) + ring_rays_at(np.full(len(ths), z, F32), ths))
        return P
    if s.get('corset') or s.get('bodysuit'):
        zs = np.arange(1.00 if s.get('corset') else 0.85, 1.30, SAMPLE)
        for k, cx in enumerate((0.024, -0.024, 0.081, -0.081)):
            O = np.stack([np.full_like(zs, cx), np.zeros_like(zs), zs], 1).astype(F32)
            P.append((f'ballena_{k}', O, _front_rays(O)))
        return P
    zh = s.get('hem', 0.78)
    if s.get('waistcoat'):
        ths = ths[np.abs(np.angle(np.exp(1j * (ths + np.pi / 2)))) > 0.35]
    P.append(('bajo',) + ring_rays_at(np.full(len(ths), zh + (0.018 if not s.get('waistcoat') else 0.010), F32), ths))
    if s.get('L'):
        angs = np.linspace(-np.pi, np.pi, int(2 * np.pi * 0.06 / SAMPLE), endpoint=False).astype(F32)
        for sd in (1, -1):
            P.append((f'manga_{sd}',) + arm_rays(sd, s['L'] - (s.get('cuff') or 0.02) - 0.004, angs))
    if s.get('shirt'):
        zs = np.arange(s['hem'] + 0.008, 1.44, SAMPLE)
        for k, xo in enumerate((-0.012, 0.012)):
            O = np.stack([np.full_like(zs, xo), np.zeros_like(zs), zs], 1).astype(F32)
            P.append((f'tapeta_{k}', O, _front_rays(O)))
    if s.get('polo'):
        O = _u_path(0.0, 1.385, 0.034, 0.120, ins=0.0035)
        P.append(('tapeta', O, _front_rays(O)))
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
    g = knit(V)
    x, y, z = V[:, 0], V[:, 1], V[:, 2]
    pieza = np.where(y < 0.004, 0, 1).astype(np.int8)
    tej = np.zeros((len(V), 2), F32)
    r = np.hypot(x, y); th = np.arctan2(y, x)
    tej[:, 0] = th * _rnom(z, r, 0.01); tej[:, 1] = z
    interior = (N[:, 0] * x + N[:, 1] * y) / (r + 1e-6) < -0.15
    b = g.b
    if s.get('L'):
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
            pieza[m] = 2 + k
            tej[m, 0] = ang * _rnom(uu, rr, 0.01); tej[m, 1] = uu
            interior[m] = np.sum(N[m] * rv, 1) / (rr + 1e-6) < -0.15
    if s.get('polo') or s.get('shirt'):
        db = np.abs(g.layer()[1]) - g.th / 2
        dc = np.full(len(V), 1.0, F32)
        for kind, sh, R, thv in _extra_layers(V):
            dc = np.minimum(dc, np.maximum(np.abs(sh) - thv / 2, R))
        pieza[(dc < 0.0015) & (dc < np.maximum(db, g.R))] = 4
    else:
        pieza[(g.neck_in < 0.012) & (pieza <= 1)] = 4
    if 'armhole' in s:
        pieza[(g.sleeve_in < 0.012) & (pieza <= 1)] = 5
    pieza[(g.hem_in < 0.020) & (pieza <= 1)] = 6
    if s.get('corset'):
        pieza[(y < 0) & (z > 1.24) & (pieza == 0)] = 8
    if s.get('bodysuit'):
        pieza[(z < 0.92) & (pieza <= 1)] = 9
    canale = np.zeros(len(V), F32)
    if s.get('ribbed'):
        canale[:] = 1.0
    if s.get('polo'):
        canale = sstep(s['cuff'] + 0.0025, s['cuff'] - 0.0005, g.sleeve_in) * (np.abs(x) > 0.2)
    if s.get('raw'):
        canale = np.maximum(canale, sstep(s['rib'] + 0.0025, s['rib'] - 0.0005, g.neck_in) * (z > 1.30))
    if s.get('bandeau'):
        canale = np.maximum(sstep(0.0145, 0.0115, g.neck_in), sstep(0.0145, 0.0115, g.hem_in))
    return pieza, tej, interior.astype(np.uint8), canale.astype(F32)


def ejes():
    s = ST
    return {'estilo': KEY, 'nombre': s['name'], 'color': s['color'], 'color2': s.get('color2'), 'tejido': s['tejido'],
            'tejido2': s.get('tejido2'), 'galga': s.get('galga'), 'forro': s.get('forro'), 'color_trim': s.get('color_trim'),
            'color_boton': s.get('boton'), 'piezas': PIEZAS, 'L': s.get('L', 0.0), 'hem': s.get('hem', 0.8)}


configure(__import__('os').environ.get('TOP_ESTILO', 'tirantes'))
