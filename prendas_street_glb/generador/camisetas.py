"""Camisetas para Blender (11 variantes), sobre el cuerpo de referencia de 1,78 m con los brazos a 32°.

Mismo sistema que los vaqueros (vaquero_baggy.py): la prenda es un campo de distancia (SDF) que se
extrae con marching cubes. Cada corte (tabla STYLES) fija holguras, largos, cuello, sisa y pliegues:

  01 clásica    02 oversize   03 slim      04 boxy       05 crop        06 longline
  07 baby tee   08 raglán     09 pico      10 henley     11 manga larga

Piezas (papel del material):
- body       la tela de punto (jersey de algodón). En la raglán, el cuerpo;
- secondary  las mangas de la raglán (para teñirlas de otro color);
- button     los botones de la henley.
Aparte (archivo _costuras.glb): el hilo de la recubridora (dos agujas) en bajos, puños y escote, la
tapeta de la henley y las costuras raglán, puntada a puntada.

Construcción: costura de hombro, costados, sisa (montada o caída), cuello de canalé con su costura
y pespunte, bajos con doble pespunte, pliegues de caída, de arrastre desde la axila y de manga.
Coordenadas: Z arriba, frente = -Y.
"""
import math
import numpy as np
from kit import *
from items2 import cuff_blend, arm_ang
from items3 import B, fit_base
from items4 import SHELL, SOLID, placed, front_points, button_specs, _cache

UP = ((-0.56, -0.25, 0.60), (0.56, 0.25, 1.58))

# ---------------------------------------------------------------- cortes
# ease/arm_ease: holgura del cuerpo y de la manga (m). drape: cuánto cae recta la tela desde el pecho.
# hem: altura del bajo; curve: el bajo sube por los costados (longline). L: largo de manga (desde el
# hombro). at: costura de la sisa a lo largo del brazo (0,05 montada; más, hombro caído).
# neck: (a, b, z_back, z_front) del escote; rib: ancho del canalé del cuello.
# folds: (manga, cuerpo, arrastre). color: el de los renders de Blender.
STYLES = {
    'clasica': dict(num=1, file='camiseta_clasica', name='Camiseta clásica', ease=0.018, drape=0.6, arm_ease=0.022, arm_drape=0.55,
                    hem=0.775, L=0.205, at=0.050, neck=(0.090, 0.088, 1.478, 1.442), rib=0.016, th=0.0046,
                    folds=(0.006, 0.007, 0.0045), color='#ECEBE7'),
    'oversize': dict(num=2, file='camiseta_oversize', name='Camiseta oversize', ease=0.040, drape=0.9, arm_ease=0.040, arm_drape=0.75,
                     hem=0.735, L=0.285, at=0.090, neck=(0.100, 0.098, 1.482, 1.446), rib=0.018, th=0.0052,
                     folds=(0.008, 0.010, 0.0038), color='#2C2C2F'),
    'slim': dict(num=3, file='camiseta_slim', name='Camiseta slim', ease=0.006, drape=0.25, arm_ease=0.010, arm_drape=0.25,
                 hem=0.785, L=0.185, at=0.048, neck=(0.088, 0.086, 1.478, 1.444), rib=0.016, th=0.0042,
                 folds=(0.004, 0.004, 0.0035), color='#8E8E92'),
    'boxy': dict(num=4, file='camiseta_boxy', name='Camiseta boxy', ease=0.036, drape=1.0, arm_ease=0.036, arm_drape=0.7,
                 hem=0.880, L=0.235, at=0.085, neck=(0.094, 0.092, 1.480, 1.448), rib=0.017, th=0.0054,
                 folds=(0.006, 0.006, 0.005), color='#E4E0D6'),
    'crop': dict(num=5, file='camiseta_crop', name='Camiseta crop', ease=0.016, drape=0.8, arm_ease=0.020, arm_drape=0.5,
                 hem=1.045, L=0.195, at=0.052, neck=(0.090, 0.088, 1.478, 1.444), rib=0.016, th=0.0046,
                 folds=(0.005, 0.004, 0.004), color='#F1F0EC'),
    'longline': dict(num=6, file='camiseta_longline', name='Camiseta longline', ease=0.022, drape=0.85, arm_ease=0.026, arm_drape=0.6,
                     hem=0.675, curve=0.060, L=0.235, at=0.060, neck=(0.092, 0.090, 1.480, 1.446), rib=0.017, th=0.0050,
                     folds=(0.006, 0.011, 0.005), color='#1F1F22'),
    'baby': dict(num=7, file='baby_tee', name='Baby tee', ease=0.003, drape=0.15, arm_ease=0.005, arm_drape=0.1,
                 hem=0.960, L=0.115, at=0.046, neck=(0.092, 0.090, 1.476, 1.440), rib=0.012, th=0.0038,
                 folds=(0.003, 0.003, 0.003), color='#D9CFCB'),
    'raglan': dict(num=8, file='camiseta_raglan', name='Camiseta raglán', ease=0.018, drape=0.6, arm_ease=0.020, arm_drape=0.4,
                   hem=0.775, L=0.420, at=None, neck=(0.090, 0.088, 1.478, 1.444), rib=0.016, th=0.0046,
                   folds=(0.006, 0.007, 0.004), color='#ECEBE7', color2='#22324F', raglan=True),
    'pico': dict(num=9, file='camiseta_pico', name='Camiseta cuello pico', ease=0.016, drape=0.6, arm_ease=0.022, arm_drape=0.55,
                 hem=0.770, L=0.205, at=0.050, neck=(0.088, 0.084, 1.476, 1.440), rib=0.017, th=0.0046,
                 folds=(0.006, 0.007, 0.0045), color='#B9B8B4', vneck=1.355),
    'henley': dict(num=10, file='camiseta_henley', name='Camiseta henley', ease=0.020, drape=0.6, arm_ease=0.022, arm_drape=0.5,
                   hem=0.770, L=0.210, at=0.052, neck=(0.088, 0.086, 1.478, 1.444), rib=0.016, th=0.0048,
                   folds=(0.006, 0.007, 0.0045), color='#D6CDBE', henley=True),
    'manga_larga': dict(num=11, file='camiseta_manga_larga', name='Camiseta de manga larga', ease=0.014, drape=0.5, arm_ease=0.018, arm_drape=0.35,
                        hem=0.780, L=0.585, at=0.050, neck=(0.090, 0.087, 1.478, 1.444), rib=0.017, th=0.0046,
                        folds=(0.0065, 0.006, 0.004), color='#F0EFEB', cuff=0.060),
}

HEM_ST = (0.019, 0.0254)      # pespuntes del bajo (recubridora de dos agujas, 6,4 mm)
SLEEVE_ST = (0.017, 0.0234)
RAG = ((0.072, 1.470), (0.178, 1.282))     # costura raglán en |x|-z (cuello -> axila)
PLACKET = dict(w=0.034, z0=1.322, buttons=(1.346, 1.383, 1.420))


def configure(key):
    global ST, KEY, CATALOG
    ST = STYLES[key]; KEY = key
    for k in [k for k in _cache if str(k).startswith('tee_')]:
        del _cache[k]
    CATALOG = [(f"{ST['num']:02d}_{ST['file']}", ST['name'], camiseta, UP)]


def body():
    s = ST
    return B(ease=s['ease'], drape=s['drape'], drape_from=1.30, arm_ease=s['arm_ease'], arm_drape=s['arm_drape'])


def hem_z(x, y):
    """Altura del bajo en (x, y): un poco ondulado y, en la longline, más alto por los costados."""
    s = ST
    P = np.stack([x, y, np.zeros_like(x)], 1).astype(F32)
    z = s['hem'] + 0.0025 * noise(P, 6, 3)
    if s.get('curve'):
        z = z + s['curve'] * np.clip(np.abs(x) / 0.21, 0, 1) ** 2 - 0.012 * (y > 0) * 0
    return z


def raglan_d(g):
    """Distancia firmada a la costura raglán (positiva hacia la manga), en proyección x-z."""
    (x0, z0), (x1, z1) = RAG
    e = np.array([x1 - x0, z1 - z0]); e /= np.linalg.norm(e)
    n = np.array([-e[1], e[0]])          # normal hacia fuera (+x)
    if n[0] < 0: n = -n
    d = np.full(len(g.P), -1.0, F32)
    for sx in (1, -1):
        dl = (g.x * sx - x0) * n[0] + (g.z - z0) * n[1]
        u, a, w = g.arm(sx)
        ds = np.maximum(dl, (w - 0.5) * 0.08)
        d = np.where(g.x * sx > 0, ds, d)
    return d.astype(F32)


def tee(P):
    s = ST
    b = body()
    g = Gar(P, b, 'upper', th=s['th'])
    L = s['L']
    if s.get('cuff'):
        cuff_blend(g, L, s['cuff'], fit_base(P, 0.008, 0.004))
    if KEY == 'baby':      # puño de la manga corta ceñido al brazo
        cuff_blend(g, L, 0.02, fit_base(P, 0.004, 0.004), extra=0.03)
    # cortes: bajo, manga y cuello
    hz = hem_z(g.x, g.y)
    g.keep(hz - g.z); hem = g.z - hz
    sl = g.cut_sleeve(L)
    a, bb, zb, zf = s['neck']
    neck = -g.cut_neck(a=a, b=bb, z_back=zb, z_front=zf)       # (cut_neck devuelve la distancia con el signo cambiado)
    if s.get('vneck'):      # pico: V delante, por debajo del escote redondo
        slope = 1.45
        dv = (s['vneck'] + slope * np.abs(g.x) - g.z) / math.sqrt(1 + slope * slope)
        front = sstep(-0.02, -0.05, g.y)
        g.keep(np.where(front > 0.5, -dv, -1.0))
        neck = np.where(front > 0.5, np.minimum(neck, dv), neck).astype(F32)
    # pliegues: manga, caídas del cuerpo, arrastre desde la axila
    fs, ft, fd = s['folds']
    if L > 0.35:
        g.sleeve_strokes(8, 0.06, L - 0.08, amp=fs, w=0.009, seed=1 + s['num'], dense_at=L - (s.get('cuff') or 0.02), dense_n=6, dense_len=0.12)
    else:
        g.sleeve_strokes(5, 0.04, max(0.06, L - 0.02), amp=fs * 0.85, w=0.009, seed=1 + s['num'])
    g.drape_strokes(9, 1.22, max(s['hem'], 0.80) - 0.02, amp=ft, w=0.013, seed=5 + s['num'])
    g.drag_strokes(3, amp=fd, w=0.0068, seed=9 + s['num'])
    g.wobble(0.0011 + 0.0004 * (s['ease'] > 0.03))
    # costuras: costados, hombros, sisa (o raglán)
    g.side_seams(zmin=0.0, xmin=0.10)
    shoulder = (g.z > 1.40) * sstep(0.065, 0.08, np.abs(g.x)) * g._not_arm()
    g.groove(g.y - 0.004, depth=0.0008, width=0.0020, mask=shoulder)
    if s.get('raglan'):
        for front in (True, False):
            for sx in (1, -1):
                g.line_groove((sx * RAG[0][0], RAG[0][1]), (sx * RAG[1][0], RAG[1][1]), front=front, depth=0.0013, width=0.0024)
    else:
        g.armhole_seams(s['at'])
    # bajos con doble pespunte
    g.hem(hem, HEM_ST[0], roll=0.0018, band=0.028)
    g.groove(hem - HEM_ST[1], depth=0.0007, width=0.0016)
    if s.get('cuff'):
        g.ribbed(sl, s['cuff'], arm_ang(g), 22, 0.0006, 0.0014)
    else:
        g.hem(sl, SLEEVE_ST[0], roll=0.0016, band=0.026)
        g.groove(sl - SLEEVE_ST[1], depth=0.0007, width=0.0016)
    # cuello de canalé: tira que abulta, costura de unión y pespunte
    rib = s['rib']
    g.band(neck, rib, raise_=0.0010)
    g.groove(neck - rib - 0.0045, depth=0.0006, width=0.0015)
    if s.get('vneck'):        # costura en inglete del pico
        g.groove(np.abs(g.x) * 3, depth=0.0009, width=0.002, mask=(g.y < 0) * (g.z < s['vneck'] + 0.03) * (g.z > s['vneck'] - rib - 0.01))
    if s.get('henley'):
        pl = PLACKET
        zt = 1.448
        f = rrect(0.0, (pl['z0'] + zt) / 2, pl['w'], zt - pl['z0'], 0.003)
        g.patch_xz(f, lift=0.0014, puff=0.0, stitch=0.0035)
        g.groove(np.abs(g.x), depth=0.0010, width=0.0015, mask=(g.y < 0) * (g.z > pl['z0'] + 0.004) * (g.z < zt))
    g.neck_in, g.sleeve_in, g.hem_in = neck, sl, hem
    return g


# ---------------------------------------------------------------- piezas
def _sdf(Q):
    return tee(Q).sdf()


def camiseta():
    s = ST
    if s.get('raglan'):
        def part(keep_body):
            def f(P):
                g = tee(P)
                kind, sh, R, th = g.layer()
                d = raglan_d(g)
                return (kind, sh, np.maximum(R, d if keep_body else -d).astype(F32), th)
            return f
        out = [SHELL(part(True), 'body'), SHELL(part(False), 'secondary')]
    else:
        out = [SHELL(lambda P: tee(P).layer(), 'body')]
    if s.get('henley'):
        pts = placed('tee_btn', _sdf, front_points([(0.0, z) for z in PLACKET['buttons']]))
        out += button_specs(pts, role='button', r=0.0050, t=0.0024, kind='disc')
    return out


# ---------------------------------------------------------------- pespuntes (rayos hacia la tela)
SAMPLE = 0.0014


def arm_rays(side, u, angs):
    """Rayos desde el eje del brazo (coordenada u desde el hombro) hacia fuera, en el ángulo a de Gar.arm."""
    S, E, W = body().arm[side]
    W2 = W + (W - E) / np.linalg.norm(W - E) * 0.2
    pts = [S, E, W2]
    L1 = float(np.linalg.norm(E - S))
    seg = 0 if u <= L1 else 1
    a0, a1 = pts[seg], pts[seg + 1]
    d = (a1 - a0) / np.linalg.norm(a1 - a0)
    t = u - (0 if seg == 0 else L1)
    c = a0 + d * t
    e1, e2 = frame(d)
    angs = np.asarray(angs, F32)
    D = np.cos(angs)[:, None] * e1[None] + np.sin(angs)[:, None] * e2[None]
    O = np.tile(c.astype(F32), (len(angs), 1))
    return O.astype(F32), D.astype(F32)


def ring_rays_at(zs, ths):
    O = np.stack([np.zeros_like(ths), np.zeros_like(ths), zs], 1).astype(F32)
    D = np.stack([np.cos(ths), np.sin(ths), np.zeros_like(ths)], 1).astype(F32)
    return O, D


def neck_points(off):
    """Puntos aproximados a `off` metros del borde del escote, hacia dentro de la prenda (para apuntar)."""
    s = ST
    a, b, zb, zf = s['neck']
    yoff = 0.006
    ph = np.linspace(-np.pi, np.pi, int(2 * np.pi * 0.10 / SAMPLE), endpoint=False)
    x = (a + off * 0.75) * np.cos(ph); y = yoff + (b + off * 0.75) * np.sin(ph)
    t = np.clip((y - yoff) / b, -1, 1)
    zn = zb + (zf - zb) * np.clip(-t, 0, 1) ** 1.6 - 0.005 * (1 - np.abs(t))
    z = zn - off * (0.35 + 0.65 * np.clip(-t, 0, 1))
    if s.get('vneck'):
        front = y < -0.02
        zv = s['vneck'] + 1.45 * np.abs(x)
        z = np.where(front, np.minimum(z, zv - off * 1.6), z)
    return np.stack([x, y, z], 1).astype(F32)


def seam_paths():
    s = ST
    P = []
    # bajo: dos filas
    ths = np.linspace(-np.pi, np.pi, int(2 * np.pi * 0.20 / SAMPLE), endpoint=False).astype(F32)
    r = 0.19 + s['ease']
    for k, off in enumerate(HEM_ST):
        z = hem_z(r * np.cos(ths), r * np.sin(ths)) + off
        P.append((f'bajo_{k}',) + ring_rays_at(z.astype(F32), ths))
    # mangas
    angs = np.linspace(-np.pi, np.pi, int(2 * np.pi * 0.07 / SAMPLE), endpoint=False).astype(F32)
    for sd in (1, -1):
        if s.get('cuff'):
            P.append((f'puno_{sd}',) + arm_rays(sd, s['L'] - s['cuff'] - 0.004, angs))
        else:
            for k, off in enumerate(SLEEVE_ST):
                P.append((f'manga_{sd}_{k}',) + arm_rays(sd, s['L'] - off, angs))
    # escote: pespunte sobre la costura del canalé (rayos desde dentro del pecho hacia la línea)
    tgt = neck_points(s['rib'] + 0.0045 + 0.0025)
    O = np.tile(np.array([0, 0.004, 1.30], F32), (len(tgt), 1))
    D = tgt - O; D /= np.linalg.norm(D, axis=1)[:, None]
    if s.get('vneck'):            # se parte en el pico (delante, en el centro)
        rel = np.angle(np.exp(1j * (np.arctan2(tgt[:, 1] - 0.006, tgt[:, 0]) + np.pi / 2)))
        for k, m in enumerate((rel > 0.02, rel < -0.02)):
            idx = np.nonzero(m)[0]
            idx = idx[np.argsort(rel[idx])]
            P.append((f'escote_{k}', O[idx], D[idx]))
    else:
        P.append(('escote', O, D))
    # raglán: doble pespunte a ambos lados de la costura, delante y detrás
    if s.get('raglan'):
        (x0, z0), (x1, z1) = RAG
        n = int(np.hypot(x1 - x0, z1 - z0) / SAMPLE)
        e = np.array([x1 - x0, z1 - z0]); e /= np.linalg.norm(e); nn = np.array([e[1], -e[0]])
        if nn[0] < 0: nn = -nn
        for sx in (1, -1):
            for front in (True, False):
                for k, off in enumerate((0.0035, -0.0035)):
                    t = np.linspace(0.04, 1.0, n)[:, None]
                    xz = np.array([x0, z0]) + (np.array([x1, z1]) - np.array([x0, z0])) * t + nn * off
                    xz[:, 0] *= sx
                    O = np.stack([xz[:, 0], np.zeros(n), xz[:, 1]], 1).astype(F32)
                    D = np.tile(np.array([0, -1.0 if front else 1.0, 0], F32), (n, 1))
                    P.append((f'raglan_{sx}_{int(front)}_{k}', O, D))
    # henley: pespunte de la tapeta (U) y su remate
    if s.get('henley'):
        pl = PLACKET; zt = 1.444; w = pl['w'] / 2 - 0.0035
        poly = np.array([(-w, zt), (-w, pl['z0'] + 0.0035), (w, pl['z0'] + 0.0035), (w, zt)], F32)
        seg = np.linalg.norm(np.diff(poly, axis=0), axis=1); sc = np.concatenate([[0], np.cumsum(seg)])
        tt = np.linspace(0, sc[-1], int(sc[-1] / SAMPLE))
        xz = np.stack([np.interp(tt, sc, poly[:, 0]), np.interp(tt, sc, poly[:, 1])], 1)
        O = np.stack([xz[:, 0], np.zeros(len(xz)), xz[:, 1]], 1).astype(F32)
        D = np.tile(np.array([0, -1.0, 0], F32), (len(xz), 1))
        P.append(('tapeta', O, D))
    return P


PIEZAS = ['Delantero', 'Espalda', 'Manga izquierda', 'Manga derecha', 'Cuello', 'Puño izquierdo', 'Puño derecho', 'Tapeta']


def _rnom(key, val, step):
    """Radio de referencia por franjas (mediana suavizada), interpolado: el punto no tuerce con los pliegues."""
    kb = np.floor(key / step).astype(np.int64); k0 = int(kb.min()); kb -= k0
    med = np.array([np.median(val[kb == k]) if np.any(kb == k) else np.nan for k in range(kb.max() + 1)])
    ok = ~np.isnan(med)
    med = np.interp(np.arange(len(med)), np.nonzero(ok)[0], med[ok])
    med = np.convolve(np.pad(med, 3, mode='edge'), np.ones(7) / 7, mode='valid')
    return np.interp(key / step - k0 - 0.5, np.arange(len(med)), med).astype(F32)


def campos(V, N):
    """Por vértice de la tela: pieza de patrón (PIEZAS), coordenadas del tejido (s a lo ancho, t a lo largo
    de las columnas del punto, en metros) y cara interior. Para el script de Blender."""
    s = ST
    V = np.asarray(V, F32); N = np.asarray(N, F32)
    g = tee(V)
    x, y, z = V[:, 0], V[:, 1], V[:, 2]
    pieza = np.where(y < 0.004, 0, 1).astype(np.int8)
    tej = np.zeros((len(V), 2), F32)
    r = np.hypot(x, y)
    th = np.arctan2(y, x)
    tej[:, 0] = th * _rnom(z, r, 0.01); tej[:, 1] = z
    radial = (N[:, 0] * x + N[:, 1] * y) / (r + 1e-6)
    interior = radial < -0.15
    rag = raglan_d(g) if s.get('raglan') else None
    b = g.b
    for k, sd in enumerate((1, -1)):
        u, a, w = g.arm(sd)
        if rag is not None:
            m = (x * sd > 0) & (rag > 0)
        else:
            m = (x * sd > 0) & (w > 0.35) & (u > s['at'])
        if not m.any():
            continue
        S, E, W = b.arm[sd]
        W2 = W + (W - E) / np.linalg.norm(W - E) * 0.2
        # vector perpendicular al eje del brazo y ángulo medido desde el lado de fuera (corte por debajo)
        uu, aa, dist = limb_coords(V[m], [S, E, W2])
        d1 = (E - S) / np.linalg.norm(E - S); d2 = (W2 - E) / np.linalg.norm(W2 - E)
        d = np.where((uu <= np.linalg.norm(E - S))[:, None], d1[None], d2[None])
        base = np.where((uu <= np.linalg.norm(E - S))[:, None], S[None] + d1[None] * uu[:, None],
                        E[None] + d2[None] * (uu - np.linalg.norm(E - S))[:, None])
        rv = V[m] - base
        rv -= d * np.sum(rv * d, 1)[:, None]
        out = np.array([sd, 0, 0], F32)
        ref = out[None] - d * np.sum(out[None] * d, 1)[:, None]; ref /= np.linalg.norm(ref, axis=1)[:, None]
        ort = np.cross(d, ref)
        ang = np.arctan2(np.sum(rv * ort, 1), np.sum(rv * ref, 1))
        rr = np.linalg.norm(rv, axis=1)
        pieza[m] = 2 + k
        tej[m, 0] = ang * _rnom(uu, rr, 0.01); tej[m, 1] = uu
        interior[m] = np.sum(N[m] * rv, 1) / (rr + 1e-6) < -0.15
        if s.get('cuff'):
            c = m.copy(); c[m] = g.sleeve_in[m] < s['cuff']
            pieza[c] = 5 + k
    rib = (g.neck_in < s['rib'] + 0.0015) & (z > 1.30)
    pieza[rib] = 4          # (mismas coordenadas que el cuerpo: las columnas del canalé van en vertical, sin saltos)
    if s.get('henley'):
        pl = PLACKET
        m = (np.abs(x) < pl['w'] / 2) & (y < 0) & (z > pl['z0']) & ~rib
        pieza[m] = 7; tej[m, 0] = x[m]; tej[m, 1] = z[m]
    # peso continuo del canalé (cuello y puños): el borde del punto acanalado no sale dentado
    canale = sstep(s['rib'] + 0.0025, s['rib'] - 0.0005, g.neck_in) * (z > 1.30)
    if s.get('cuff'):
        canale = np.maximum(canale, sstep(s['cuff'] + 0.0025, s['cuff'] - 0.0005, g.sleeve_in) * (np.abs(x) > 0.2))
    return pieza, tej, interior.astype(np.uint8), canale.astype(F32)


def ejes():
    """Medidas que usa el script de Blender (coordenadas del tejido, canalé, piezas y color)."""
    s = ST
    b = body()
    out = {'estilo': KEY, 'nombre': s['name'], 'hem': s['hem'], 'curve': s.get('curve', 0.0), 'L': s['L'],
           'at': s['at'] if s['at'] is not None else 0.05, 'neck': s['neck'], 'rib': s['rib'], 'cuff': s.get('cuff', 0.0),
           'vneck': s.get('vneck', 0.0), 'raglan': RAG if s.get('raglan') else None, 'henley': PLACKET if s.get('henley') else None,
           'color': s['color'], 'color2': s.get('color2'), 'ease': s['ease']}
    for sd in (1, -1):
        S, E, W = b.arm[sd]
        out[f'brazo_{sd}'] = [list(map(float, p)) for p in (S, E, W)]
    return out


configure(__import__('os').environ.get('CAMISETA_ESTILO', 'clasica'))
