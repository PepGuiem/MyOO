"""Jerséis y punto para Blender (7 variantes), sobre el cuerpo de referencia de 1,78 m con los brazos a 32°.

Mismo sistema que camisetas.py y sudaderas.py: campo de distancia por corte (tabla STYLES) que se extrae
con marching cubes. Punto de lana con su grosor real (6-9 mm) y dos galgas: «media» (jersey fino, malla
de unos 4 mm) y «gruesa» (punto grueso, malla de unos 6 mm). La malla se ve en Blender (material de punto
sobre el atributo «tejido»); los ochos, el canalé y el cuello vuelto son geometría:

  01 cuello redondo     02 pico              03 cuello alto (vuelto)    04 cárdigan (botones)
  05 ochos (trenzas)    06 oversize grueso   07 chaleco de punto (sin manga, pico)

Piezas (papel del material):
- body       el punto;
- button     botones del cárdigan.
Aparte (_costuras.glb): remallado de la unión del cuello y de las tapetas del cárdigan.
Coordenadas: Z arriba, frente = -Y.
"""
import math
import numpy as np
from kit import *
from items2 import cuff_blend, arm_ang
from items3 import B, fit_base, tank_armhole
from items4 import SHELL, SOLID, placed, front_points, button_specs, _cache
from camisetas import arm_rays, ring_rays_at, _rnom, SAMPLE

UP = ((-0.58, -0.27, 0.62), (0.58, 0.27, 1.64))

# galga: «media» o «gruesa». neck: (a, b, z_back, z_front) del escote; vneck: altura del pico; rib: ancho
# del canalé del cuello. turtle: cuello alto vuelto (top, doblez). open: cárdigan (tapetas y botones).
# vest: sin mangas (sisa con canalé). cables: trenzas en delantero, espalda y mangas.
STYLES = {
    'cuello_redondo': dict(num=1, file='jersey_cuello_redondo', name='Jersey de cuello redondo', ease=0.026, drape=0.85,
                           arm_ease=0.026, arm_drape=0.45, hem=0.745, band=0.060, L=0.590, cuff=0.065, at=0.058, th=0.0060,
                           neck=(0.095, 0.091, 1.480, 1.440), rib=0.022, galga='media', folds=(0.0070, 0.008, 0.005),
                           color='#3B4252'),
    'pico': dict(num=2, file='jersey_pico', name='Jersey de pico', ease=0.024, drape=0.85, arm_ease=0.026, arm_drape=0.45,
                 hem=0.745, band=0.060, L=0.590, cuff=0.065, at=0.058, th=0.0058, neck=(0.092, 0.088, 1.478, 1.440),
                 vneck=1.300, rib=0.020, galga='media', folds=(0.0070, 0.008, 0.005), color='#6B2E35'),
    'cuello_alto': dict(num=3, file='jersey_cuello_alto', name='Jersey de cuello alto', ease=0.022, drape=0.8, arm_ease=0.024,
                        arm_drape=0.4, hem=0.750, band=0.060, L=0.595, cuff=0.070, at=0.056, th=0.0058, turtle=(1.605, 1.530),
                        galga='media', folds=(0.0065, 0.007, 0.005), color='#2A2A2D'),
    'cardigan': dict(num=4, file='cardigan', name='Cárdigan de punto', ease=0.032, drape=0.85, arm_ease=0.030, arm_drape=0.5,
                     hem=0.735, band=0.055, L=0.590, cuff=0.060, at=0.060, th=0.0064, neck=(0.094, 0.090, 1.480, 1.440),
                     vneck=1.180, rib=0.026, open=True, buttons=(0.790, 0.880, 0.970, 1.060, 1.150), galga='media',
                     folds=(0.0075, 0.009, 0.0055), color='#8A8071', boton='#4A3A2C'),
    'ochos': dict(num=5, file='jersey_ochos', name='Jersey de ochos', ease=0.032, drape=0.85, arm_ease=0.032, arm_drape=0.45,
                  hem=0.740, band=0.065, L=0.590, cuff=0.070, at=0.062, th=0.0085, neck=(0.098, 0.094, 1.482, 1.444),
                  rib=0.028, cables=True, galga='gruesa', folds=(0.0060, 0.006, 0.004), color='#E2DACA'),
    'oversize': dict(num=6, file='jersey_oversize', name='Jersey oversize de punto grueso', ease=0.052, drape=0.95,
                     arm_ease=0.042, arm_drape=0.6, hem=0.700, band=0.075, L=0.615, cuff=0.080, at=0.100, th=0.0090,
                     neck=(0.104, 0.100, 1.484, 1.448), rib=0.030, galga='gruesa', folds=(0.0095, 0.011, 0.006),
                     color='#9A968E'),
    'chaleco': dict(num=7, file='chaleco_punto', name='Chaleco de punto', ease=0.020, drape=0.8, hem=0.760, band=0.055,
                    th=0.0058, neck=(0.092, 0.088, 1.478, 1.440), vneck=1.310, rib=0.018, vest=(0.238, 1.330, 0.066, 0.140),
                    arm_rib=0.018, galga='media', folds=(0.0, 0.007, 0.0), color='#4B5140'),
}

PIEZAS = ['Delantero', 'Espalda', 'Manga izquierda', 'Manga derecha', 'Cuello', 'Puño izquierdo', 'Puño derecho', 'Tapeta',
          'Cintura', 'Sisa']
CARD_GAP = 0.002             # el cárdigan abierto: las dos tapetas se tocan en el centro


def configure(key):
    global ST, KEY, CATALOG
    ST = STYLES[key]; KEY = key
    for k in [k for k in _cache if str(k).startswith('jr_')]:
        del _cache[k]
    CATALOG = [(f"{ST['num']:02d}_{ST['file']}", ST['name'], jersey, UP)]


def body():
    s = ST
    return B(ease=s['ease'], drape=s['drape'], drape_from=1.30, arm_ease=s.get('arm_ease', 0.02), arm_drape=s.get('arm_drape', 0.4))


def turtle_d(P):
    """Tubo del cuello alto (algo cónico), con el grosor del cuello vuelto."""
    return round_cone(P, [0, 0.008, 1.40], [0, 0.014, 1.66], 0.080, 0.075)


def base_fn(b):
    s = ST
    def f(P):
        if s.get('vest'):
            d = smin(b.torso(P), b.neck_d(P), 0.03)
        else:
            d = b.upper(P)
        if s.get('turtle'):
            d = smin(d, turtle_d(P), 0.035)
        return d
    return f


# ---------------------------------------------------------------- ochos
def _cable(s, t, c, A, rs, P, phase=0.0):
    """Trenza de dos cabos (s: posición a lo ancho, t: a lo largo, en m). El cabo que va hacia +s pasa por
    encima en cada cruce (trenza de cuerda). Devuelve la altura 0..1."""
    ph = 2 * np.pi * t / P + phase
    h = np.zeros_like(s)
    for sg in (1, -1):
        xi = sg * A * np.sin(ph)
        dx = sg * np.cos(ph)
        prof = np.sqrt(np.clip(1 - ((s - c - xi) / rs) ** 2, 0, 1))
        near = np.exp(-(xi / (0.55 * A)) ** 2)
        lvl = 1 - 0.45 * near * (dx < 0)
        h = np.maximum(h, prof * lvl)
    return h


# panel del delantero y la espalda: (centro x, amplitud, radio del cabo, paso, fase)
PANEL = [(0.0, 0.0095, 0.0090, 0.080, 0.0), (0.062, 0.0055, 0.0058, 0.050, 0.0), (-0.062, 0.0055, 0.0058, 0.050, 0.0),
         (0.118, 0.0055, 0.0058, 0.050, np.pi), (-0.118, 0.0055, 0.0058, 0.050, np.pi)]
SLEEVE_CABLE = (0.0075, 0.0075, 0.065)
CABLE_AMP = 0.0042


def _sleeve_a0(b, sd):
    """Ángulo de Gar.arm en el lado de fuera (arriba) de la manga, donde va la trenza."""
    S, E, W = b.arm[sd]
    W2 = W + (W - E) / np.linalg.norm(W - E) * 0.2
    d = (E - S) / np.linalg.norm(E - S)
    n = np.cross(d, np.array([0, 1.0, 0], F32))
    if n[2] < 0: n = -n
    q = ((S + E) / 2 + n * 0.06).astype(F32)[None]
    u, a, dist = limb_coords(q, [S, E, W2])
    return float(a[0])


def cables(g, zb, ztop):
    s = ST
    x, z = g.x, g.z
    body_m = g._not_arm() * sstep(zb + 0.004, zb + 0.016, z)
    h = np.zeros(len(g.P), F32)
    for c, A, rs, P, ph in PANEL:
        h = np.maximum(h, _cable(x, z - zb, c, A, rs, P, ph))
        for e in (-1, 1):       # surcos de punto del revés a los lados de cada trenza
            g.groove(x - (c + e * (A + rs + 0.0035)), depth=0.0016, width=0.0024, mask=body_m * sstep(ztop, ztop - 0.03, z))
    m = body_m * sstep(ztop, ztop - 0.03, z) * sstep(0.150, 0.140, np.abs(x))
    g.o += CABLE_AMP * h * m
    # mangas: una trenza por arriba, del puño al hombro
    A, rs, P = SLEEVE_CABLE
    for sd in (1, -1):
        u, a, w = g.arm(sd)
        a0 = _sleeve_a0(g.b, sd)
        da = np.angle(np.exp(1j * (a - a0)))
        sv = da * 0.058
        hs = _cable(sv, u, 0.0, A, rs, P)
        ms = (w > 0.5) * sstep(s['at'] + 0.01, s['at'] + 0.03, u) * sstep(s['L'] - s['cuff'] - 0.004, s['L'] - s['cuff'] - 0.016, u)
        g.o += CABLE_AMP * 0.9 * hs * ms
        for e in (-1, 1):
            g.groove(sv - e * (A + rs + 0.0035), depth=0.0014, width=0.0022, mask=ms)


# ---------------------------------------------------------------- prenda
def neck_cut(g):
    s = ST
    a, bb, zbk, zf = s['neck']
    neck = -g.cut_neck(a=a, b=bb, z_back=zbk, z_front=zf)       # positiva dentro de la prenda
    if s.get('vneck'):
        slope = 1.45 if not s.get('open') else 2.9
        dv = (s['vneck'] + slope * np.abs(g.x) - g.z) / math.sqrt(1 + slope * slope)
        front = sstep(-0.02, -0.05, g.y)
        g.keep(np.where(front > 0.5, -dv, -1.0))
        neck = np.where(front > 0.5, np.minimum(neck, dv), neck).astype(F32)
    return neck


def knit(P):
    s = ST
    b = body()
    g = Gar(P, b, base_fn(b), th=s['th'])
    zb = s['hem'] + s['band']
    # canalé de la cintura ceñido y el punto que se abolsa encima
    g.blend(fit_base(P, 0.014, 0.006), sstep(zb + 0.03, zb - 0.01, g.z) * g._not_arm() * (0.75 if not s.get('open') else 0.45))
    hz = s['hem'] + 0.002 * noise(g.P * [1, 1, 0], 6, 3)
    g.keep(hz - g.z); hem = g.z - hz
    if s.get('vest'):
        cx, cz, ax, az = s['vest']
        sl = tank_armhole(g, cx=cx, cz=cz, ax=ax, az=az)             # positiva dentro de la prenda
    else:
        L = s['L']
        cuff_blend(g, L, s['cuff'], fit_base(P, 0.012, 0.006), extra=0.05)
        sl = g.cut_sleeve(L)
    if s.get('turtle'):
        top, fold = s['turtle']
        topz = top + 0.004 * np.sin(g.theta)
        g.keep(g.z - topz)
        neck = (topz - g.z).astype(F32)
    else:
        neck = neck_cut(g)
    front_edge = None
    if s.get('open'):
        fe = g.cut_front_open(gap=CARD_GAP)                       # |x| - gap/2
        front_edge = np.where(g.y < 0, fe, 1.0).astype(F32)
    # pliegues (el punto cae más blando y con menos aristas que la felpa)
    fs, ft, fd = s['folds']
    if not s.get('vest'):
        g.sleeve_strokes(7, 0.07, s['L'] - 0.08, amp=fs, w=0.013, seed=201 + s['num'], dense_at=s['L'] - s['cuff'], dense_n=6, dense_len=0.13)
        g.drag_strokes(3, amp=fd, w=0.011, seed=207 + s['num'])
    g.drape_strokes(9, 1.20, zb + 0.02, amp=ft, w=0.017, seed=203 + s['num'])
    g.hem_blouse(zb, zb + 0.09, 9, amp=0.0045, seed=209 + s['num'])
    g.wobble(0.0016 if s['galga'] == 'gruesa' else 0.0013)
    # costuras de remallado (sin pespunte): costados, hombros y sisa
    g.side_seams(zmin=s['hem'] + 0.01, xmin=0.10)
    shoulder = (g.z > 1.40) * sstep(0.07, 0.085, np.abs(g.x)) * g._not_arm()
    if s.get('vest'):
        shoulder = (g.z > 1.40) * sstep(0.07, 0.085, np.abs(g.x))
    g.groove(g.y - 0.004, depth=0.0011, width=0.0024, mask=shoulder)
    if not s.get('vest'):
        g.armhole_seams(s['at'])
    # canalé: cintura, puños (o sisas), cuello y tapetas
    gr = s['galga'] == 'gruesa'
    g.ribbed(hem, s['band'], g.theta, 64 if gr else 74, 0.0014, 0.0024)
    if s.get('vest'):
        g.ribbed(sl, s['arm_rib'], np.arctan2(g.z - s['vest'][1], np.abs(g.x) - s['vest'][0]), 40, 0.0010, 0.0018)
    else:
        g.ribbed(sl, s['cuff'], arm_ang(g), 20 if gr else 24, 0.0013, 0.0022)
    if s.get('turtle'):
        top, fold = s['turtle']
        cz = sstep(1.455, 1.48, g.z)
        g.o += 0.0011 * np.cos(36 * g.theta) * cz                               # canalé vertical del cuello
        g.hem_blouse(1.48, fold - 0.004, 8, amp=0.0035, w=0.008, seed=17)       # arrugas del cuello subido
        lip = sstep(fold - 0.004, fold + 0.004, g.z)
        g.o += 0.0042 * lip * cz; g.th += 0.0030 * lip                          # la vuelta: doble capa
        g.groove(g.z - fold, depth=0.0016, width=0.0026, mask=cz)               # borde de la vuelta
        g.hem(neck, 0.008, roll=0.0024, band=0.010)                             # doblez de arriba
        g.groove(g.z - 1.474, depth=0.0013, width=0.0024, mask=(np.abs(g.x) < 0.12))   # unión cuello-cuerpo
    elif s.get('open'):
        edge = np.minimum(neck, front_edge)
        g.band(edge, s['rib'], raise_=0.0036)
        g.th += 0.0020 * sstep(s['rib'] + 0.002, s['rib'] - 0.002, edge)
    else:
        g.ribbed(neck, s['rib'], g.theta, 64 if gr else 90, 0.0004, 0.0020)
        if s.get('vneck'):        # el canalé se cruza en el pico
            g.groove(np.abs(g.x) * 3, depth=0.0010, width=0.002, mask=(g.y < 0) * (g.z < s['vneck'] + 0.03) * (g.z > s['vneck'] - s['rib'] - 0.012))
    if s.get('cables'):
        cables(g, zb, 1.430)
    g.neck_in, g.sleeve_in, g.hem_in, g.front_in = neck, sl, hem, front_edge
    return g


def _sdf(Q):
    return knit(Q).sdf()


def _buttons():
    s = ST
    # en el centro de una de las tapetas
    pts = placed('jr_btn', _sdf, front_points([(-(CARD_GAP / 2 + s['rib'] / 2), z) for z in s['buttons']]))
    return button_specs(pts, role='button', r=0.0078, t=0.0032, kind='disc')


def jersey():
    out = [SHELL(lambda P: knit(P).layer(), 'body')]
    if ST.get('open'):
        out += _buttons()
    return out


# ---------------------------------------------------------------- remallados (pespuntes)
def _neck_points(off):
    s = ST
    a, b, zb, zf = s['neck']
    yoff = 0.006
    ph = np.linspace(-np.pi, np.pi, int(2 * np.pi * 0.10 / SAMPLE), endpoint=False)
    x = (a + off * 0.75) * np.cos(ph); y = yoff + (b + off * 0.75) * np.sin(ph)
    t = np.clip((y - yoff) / b, -1, 1)
    zn = zb + (zf - zb) * np.clip(-t, 0, 1) ** 1.6 - 0.005 * (1 - np.abs(t))
    z = zn - off * (0.35 + 0.65 * np.clip(-t, 0, 1))
    if s.get('vneck'):
        slope = 1.45 if not s.get('open') else 2.9
        front = y < -0.02
        zv = s['vneck'] + slope * np.abs(x)
        z = np.where(front, np.minimum(z, zv - off * 1.6), z)
    return np.stack([x, y, z], 1).astype(F32)


def seam_paths():
    s = ST
    P = []
    if s.get('turtle'):
        ths = np.linspace(-np.pi, np.pi, int(2 * np.pi * 0.085 / SAMPLE), endpoint=False).astype(F32)
        P.append(('cuello',) + ring_rays_at(np.full_like(ths, 1.470), ths))
    elif s.get('open'):
        # tapetas: costura de unión al delantero, del bajo al pico, a cada lado
        zs = np.arange(s['hem'] + 0.004, s['vneck'] - 0.02, SAMPLE)
        for sx in (1, -1):
            O = np.stack([np.full_like(zs, sx * (CARD_GAP / 2 + s['rib'] + 0.003)), np.zeros_like(zs), zs], 1).astype(F32)
            D = np.tile(np.array([0, -1.0, 0], F32), (len(zs), 1))
            P.append((f'tapeta_{sx}', O, D))
        tgt = _neck_points(s['rib'] + 0.003)
        keep = tgt[:, 1] > -0.03
        tgt = tgt[keep]
        O = np.tile(np.array([0, 0.004, 1.30], F32), (len(tgt), 1)); D = tgt - O; D /= np.linalg.norm(D, axis=1)[:, None]
        rel = np.angle(np.exp(1j * (np.arctan2(tgt[:, 1] - 0.006, tgt[:, 0]) + np.pi / 2)))
        idx = np.argsort(rel)
        P.append(('cuello', O[idx], D[idx]))
    else:
        tgt = _neck_points(s['rib'] + 0.004)
        O = np.tile(np.array([0, 0.004, 1.30], F32), (len(tgt), 1)); D = tgt - O; D /= np.linalg.norm(D, axis=1)[:, None]
        if s.get('vneck'):
            rel = np.angle(np.exp(1j * (np.arctan2(tgt[:, 1] - 0.006, tgt[:, 0]) + np.pi / 2)))
            for k, m in enumerate((rel > 0.02, rel < -0.02)):
                idx = np.nonzero(m)[0]; idx = idx[np.argsort(rel[idx])]
                P.append((f'escote_{k}', O[idx], D[idx]))
        else:
            P.append(('escote', O, D))
    return P


# ---------------------------------------------------------------- campos para Blender
def campos(V, N):
    V = np.asarray(V, F32); N = np.asarray(N, F32)
    out_p = np.zeros(len(V), np.int8); tej = np.zeros((len(V), 2), F32); inter = np.zeros(len(V), np.uint8); can = np.zeros(len(V), F32)
    for i in range(0, len(V), 60000):
        p, t, it, c = _campos(V[i:i + 60000], N[i:i + 60000])
        out_p[i:i + 60000] = p; tej[i:i + 60000] = t; inter[i:i + 60000] = it; can[i:i + 60000] = c
    return out_p, tej, inter, can


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
    if not s.get('vest'):
        for k, sd in enumerate((1, -1)):
            u, a, w = g.arm(sd)
            m = (x * sd > 0) & (w > 0.35) & (u > s['at'])
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
    if s.get('turtle'):
        collar = (z > 1.468) & (r < 0.13)
        neck_rib = collar.astype(F32) * 1.0
    else:
        collar = (g.neck_in < s['rib'] + 0.0015) & (z > 1.40)
        neck_rib = sstep(s['rib'] + 0.0025, s['rib'] - 0.0005, g.neck_in) * (z > 1.10)
    pieza[collar & (pieza <= 1)] = 4
    band = g.hem_in < s['band']
    pieza[band & (pieza <= 1)] = 8
    canale = np.maximum(sstep(s['band'] + 0.0025, s['band'] - 0.0005, g.hem_in), neck_rib)
    if s.get('vest'):
        arm = g.sleeve_in < s['arm_rib']
        pieza[arm & (pieza <= 1)] = 9
        canale = np.maximum(canale, sstep(s['arm_rib'] + 0.0025, s['arm_rib'] - 0.0005, g.sleeve_in) * (z > 1.0))
    else:
        canale = np.maximum(canale, sstep(s['cuff'] + 0.0025, s['cuff'] - 0.0005, g.sleeve_in) * (np.abs(x) > 0.2))
    if s.get('open'):
        fb = (g.front_in < s['rib']) & (y < 0)
        pieza[fb & ~band & (pieza <= 1)] = 7
        canale = np.maximum(canale, sstep(s['rib'] + 0.0025, s['rib'] - 0.0005, g.front_in) * (y < 0))
    if s.get('cables'):            # la trenza se teje con la malla del derecho (sin canalé)
        pass
    return pieza, tej, interior.astype(np.uint8), canale.astype(F32)


def ejes():
    s = ST
    return {'estilo': KEY, 'nombre': s['name'], 'color': s['color'], 'color2': s.get('color2'), 'tejido': 'punto',
            'galga': s['galga'], 'color_boton': s.get('boton'), 'piezas': PIEZAS, 'L': s.get('L', 0.0), 'hem': s['hem']}


configure(__import__('os').environ.get('JERSEY_ESTILO', 'cuello_redondo'))
