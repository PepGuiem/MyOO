"""Camisas para Blender (8 variantes), sobre el cuerpo de referencia de 1,78 m con los brazos a 32°.

Mismo sistema que camisetas.py y sudaderas.py. Tela plana (popelín, oxford, lino, franela o denim):

  01 formal (cuello clásico, puño con botón, faldón)    02 oxford (cuello con botones, bolsillo, tabla)
  03 oversize (hombro caído)                            04 lino (holgada, manga remangada)
  05 franela (cuadros, dos bolsillos con cartera)       06 vaquera (dos bolsillos, broches)
  07 cubana (cuello camp abierto, manga corta, recta)   08 manga corta (cuello clásico y bolsillo)

Piezas (papel del material): body (la tela, con cuello de pie y caída), button (botones),
hardware (broches de la vaquera). Aparte (_costuras.glb): pespuntes de tapeta, cuello, canesú,
bolsillos, puños, bajo y costuras de la manga.
Coordenadas: Z arriba, frente = -Y.
"""
import math
import numpy as np
from kit import *
from items2 import cuff_blend
from items3 import B
from items4 import (SHELL, SOLID, placed, front_points, button_specs, collar, flap_pocket, _surf_from_axis,
                    _cuff_button_specs, solids_bbox, _cache)
from camisetas import arm_rays, ring_rays_at, _rnom, SAMPLE

UP = ((-0.60, -0.26, 0.60), (0.60, 0.26, 1.60))

# hem: altura del bajo en el centro; tail: cuánto sube en los costados (faldón); L: manga; cuff: puño;
# roll: manga remangada (vuelta, m); at: sisa; collar: argumentos de items4.collar (gap, stand, fall,
# spread, e); bd: cuello con botones; pocket: 'left' (bolsillo de pecho) o 'two' (dos con cartera);
# pleat: tabla en la espalda; tejido y colores de Blender.
STYLES = {
    'formal': dict(num=1, file='camisa_formal', name='Camisa formal', ease=0.012, drape=0.55, arm_ease=0.014, arm_drape=0.25,
                   hem=0.715, tail=0.070, L=0.600, cuff=0.065, at=0.050, th=0.0034, n_btn=8,
                   collar=dict(gap=0.012, stand=0.038, fall=0.052, spread=1.0), tejido='popelin', color='#F2F3F4',
                   folds=(0.007, 0.007, 0.0055)),
    'oxford': dict(num=2, file='camisa_oxford', name='Camisa oxford', ease=0.020, drape=0.7, arm_ease=0.020, arm_drape=0.3,
                   hem=0.720, tail=0.065, L=0.600, cuff=0.062, at=0.052, th=0.0040, n_btn=7, bd=True, pocket='left', pleat=True,
                   collar=dict(gap=0.014, stand=0.034, fall=0.054, spread=1.05), tejido='oxford', color='#A9C3DE',
                   folds=(0.0075, 0.008, 0.006)),
    'oversize': dict(num=3, file='camisa_oversize', name='Camisa oversize', ease=0.045, drape=0.9, arm_ease=0.036, arm_drape=0.45,
                     hem=0.690, tail=0.060, L=0.640, cuff=0.065, at=0.095, th=0.0042, n_btn=7, pocket='left',
                     collar=dict(gap=0.016, stand=0.038, fall=0.062, spread=1.15, e=0.024), tejido='popelin', color='#E6E0D2',
                     folds=(0.009, 0.011, 0.007)),
    'lino': dict(num=4, file='camisa_lino', name='Camisa de lino', ease=0.028, drape=0.85, arm_ease=0.026, arm_drape=0.35,
                 hem=0.725, tail=0.055, L=0.600, roll=0.090, at=0.058, th=0.0036, n_btn=7, open_top=True,
                 collar=dict(gap=0.040, stand=0.032, fall=0.052, spread=1.15), tejido='lino', color='#D9CDB5',
                 folds=(0.009, 0.010, 0.007)),
    'franela': dict(num=5, file='camisa_franela', name='Camisa de franela', ease=0.026, drape=0.75, arm_ease=0.024, arm_drape=0.3,
                    hem=0.735, tail=0.045, L=0.600, cuff=0.062, at=0.056, th=0.0048, n_btn=7, pocket='two',
                    collar=dict(gap=0.014, stand=0.036, fall=0.056, spread=1.08, e=0.003), tejido='franela', color='#8E2A2A',
                    color2='#1E1E22', folds=(0.0075, 0.009, 0.006)),
    'vaquera': dict(num=6, file='camisa_vaquera', name='Camisa vaquera', ease=0.024, drape=0.7, arm_ease=0.022, arm_drape=0.3,
                    hem=0.735, tail=0.045, L=0.600, cuff=0.062, at=0.056, th=0.0050, n_btn=7, pocket='two', snaps=True,
                    collar=dict(gap=0.014, stand=0.036, fall=0.056, spread=1.05, e=0.003), tejido='denim', color='#4F6E98',
                    folds=(0.007, 0.008, 0.006)),
    'cubana': dict(num=7, file='camisa_cubana', name='Camisa cubana', ease=0.030, drape=0.95, arm_ease=0.030, arm_drape=0.6,
                   hem=0.745, tail=0.0, L=0.240, at=0.062, th=0.0036, n_btn=5, camp=True,
                   collar=dict(gap=0.135, stand=0.012, fall=0.070, spread=1.30, e=0.026), tejido='popelin', color='#2F4A3F',
                   folds=(0.006, 0.008, 0.005)),
    'manga_corta': dict(num=8, file='camisa_manga_corta', name='Camisa de manga corta', ease=0.022, drape=0.8, arm_ease=0.026,
                        arm_drape=0.45, hem=0.745, tail=0.035, L=0.235, at=0.056, th=0.0038, n_btn=7, pocket='left',
                        collar=dict(gap=0.014, stand=0.034, fall=0.052, spread=1.0), tejido='popelin', color='#C9CDD2',
                        folds=(0.006, 0.008, 0.005)),
}

PIEZAS = ['Delantero izquierdo', 'Delantero derecho', 'Espalda', 'Manga izquierda', 'Manga derecha', 'Puño izquierdo',
          'Puño derecho', 'Cuello', 'Canesú', 'Tapeta', 'Bolsillos']
YOKE_Z = 1.365
PLACKET_W = 0.032
CAMP_Z = 1.300          # base de la abertura en V de la cubana


def configure(key):
    global ST, KEY, CATALOG
    ST = STYLES[key]; KEY = key
    for k in [k for k in _cache if str(k).startswith('cm_')]:
        del _cache[k]
    CATALOG = [(f"{ST['num']:02d}_{ST['file']}", ST['name'], camisa, UP)]


def body():
    s = ST
    return B(ease=s['ease'], drape=s['drape'], drape_from=1.30, arm_ease=s['arm_ease'], arm_drape=s['arm_drape'])


def _placket(g, z_lo, z_hi):
    """Tapeta delantera (cruza a la izquierda de quien la lleva) con su pespunte."""
    m = (g.y < 0) * (g.z > z_lo) * (g.z < z_hi)
    w = PLACKET_W
    g.o += 0.0012 * sstep(w / 2 + 0.002, w / 2 - 0.002, np.abs(g.x)) * m
    g.groove(g.x + w / 2, depth=0.0011, width=0.0016, mask=m)
    g.groove(g.x - w / 2, depth=0.0008, width=0.0014, mask=m)


def shirt(P):
    s = ST
    b = body()
    g = Gar(P, b, 'upper', th=s['th'])
    L = s['L']
    long = L > 0.4
    if s.get('cuff'):
        cuff_blend(g, L, s['cuff'], B(ease=0.012, arm_ease=0.010).upper(P), extra=0.012)
    hz = s['hem'] + s['tail'] * np.clip(np.abs(g.x) / 0.21, 0, 1) ** 2.4 * (1 if s['tail'] else 0) + 0.0015 * noise(g.P * [1, 1, 0], 6, 3)
    g.keep(hz - g.z); hem = g.z - hz
    if s.get('roll'):          # manga remangada: se acorta y la vuelta abulta
        Lr = L - s['roll'] * 1.9
        sl = g.cut_sleeve(Lr)
    else:
        Lr = L
        sl = g.cut_sleeve(L)
    neck = -g.cut_neck(a=0.086, b=0.084, z_back=1.462, z_front=1.440)
    if s.get('camp'):          # cubana: abertura en V hasta el primer botón, solapas vueltas
        zv = CAMP_Z
        half = np.clip(g.z - zv, 0, None) * 0.42
        v = half - np.abs(g.x)
        g.keep(np.where((g.y < 0) & (g.z > zv), v, -1.0))
        g.o += 0.0016 * sstep(0.034, 0.030, -v) * (g.z > zv - 0.01) * (g.y < 0)
        g.groove(-v - 0.034, depth=0.0010, width=0.0018, mask=(g.z > zv) * (g.y < 0))
    elif s.get('open_top'):    # lino: primer botón desabrochado (pequeña V)
        zv = 1.395
        v = np.clip(g.z - zv, 0, None) * 0.30 - np.abs(g.x)
        g.keep(np.where((g.y < 0) & (g.z > zv), v, -1.0))
    fs, ft, fd = s['folds']
    if long:
        g.sleeve_strokes(8, 0.05, Lr - 0.08, amp=fs, w=0.009, seed=51 + s['num'], dense_at=Lr - (s.get('cuff') or s.get('roll') or 0.05),
                         dense_n=6, dense_len=0.13)
    else:
        g.sleeve_strokes(5, 0.05, L - 0.03, amp=fs, w=0.009, seed=51 + s['num'])
    g.drape_strokes(9, 1.20, s['hem'] + 0.03, amp=ft, w=0.013, seed=53 + s['num'])
    g.drag_strokes(3, amp=fd, w=0.007, seed=57 + s['num'])
    g.wobble(0.0013 if s['tejido'] != 'lino' else 0.0019)
    g.side_seams(zmin=0.0, xmin=0.10)
    g.armhole_seams(s['at'])
    shoulder = (g.z > 1.40) * sstep(0.065, 0.08, np.abs(g.x)) * g._not_arm()
    g.groove(g.y - 0.004, depth=0.0008, width=0.0018, mask=shoulder)
    # bajo estrecho (dobladillo de 6 mm)
    g.hem(hem, 0.006, roll=0.0014, band=0.007)
    # puño, vuelta o dobladillo de manga
    if s.get('cuff'):
        g.band(sl, s['cuff'], raise_=0.0022)
        g.groove(sl - 0.005, depth=0.0005, width=0.0012)
        for sd in (1, -1):          # abertura (cartera) de la manga sobre el puño
            u, a, w = g.arm(sd)
            ang = np.angle(np.exp(1j * (a - 2.5)))
            m = (w > 0.5) * (u > L - 0.17) * (u < L - s['cuff'])
            g.groove(ang * 0.05, depth=0.0011, width=0.0016, mask=m)
    elif s.get('roll'):
        r = s['roll']
        m = sstep(r + 0.003, r - 0.003, sl)
        g.o += 0.0045 * m; g.th += 0.0025 * m
        g.groove(sl - r, depth=0.0016, width=0.0022)
        g.groove(sl - r * 0.5, depth=0.0010, width=0.0020)
    else:
        g.hem(sl, 0.025, roll=0.0020, band=0.028)
    g.band(neck, 0.004, raise_=0.0008)
    # tapeta, canesú, tabla
    _placket(g, s['hem'] - 0.01, CAMP_Z if s.get('camp') else 1.445)
    yoke = (g.y > 0) * g._not_arm() * (np.abs(g.x) < 0.19)
    g.groove(g.z - YOKE_Z, depth=0.0011, width=0.0018, mask=yoke)
    if s.get('pleat'):
        m = (g.y > 0) * (g.z < YOKE_Z) * (g.z > YOKE_Z - 0.10)
        g.groove(np.abs(g.x) - 0.018, depth=0.0010, width=0.0020, mask=m * sstep(YOKE_Z - 0.10, YOKE_Z - 0.04, g.z))
        g.bump_xz(0.0, YOKE_Z - 0.012, 0.010, 0.0025, front=False)        # presilla
    if s.get('snaps'):             # canesú delantero en pico (vaquera)
        zf = 1.36 + 0.06 * np.clip(0.12 - np.abs(np.abs(g.x) - 0.10), 0, 0.06) / 0.06
        g.groove(g.z - zf, depth=0.0011, width=0.0018, mask=(g.y < 0) * g._not_arm() * (np.abs(g.x) > PLACKET_W / 2 + 0.005) * (np.abs(g.x) < 0.18))
    # bolsillos
    if s.get('pocket') == 'left':
        pk = rrect(0.090, 1.255, 0.110, 0.130, 0.008)
        g.patch_xz(lambda x, z: pk(x, z) if True else 0, lift=0.0018, puff=0.0010, stitch=0.0045)
    elif s.get('pocket') == 'two':
        for sx in (1, -1):
            flap_pocket(g, sx * 0.092, 1.235, 0.112, 0.130, 0.040, lift=0.0020, flap_lift=0.0045)
    g.neck_in, g.sleeve_in, g.hem_in = neck, sl, hem
    return g


def _collar_layers(P):
    c = dict(ST['collar'])
    th = 0.0042 if ST['tejido'] != 'franela' else 0.0052
    return [l[:4] for l in collar(P, th=th, **c)]


def _sdf(Q):
    d = shirt(Q).sdf()
    for kind, sh, R, th in _collar_layers(Q):
        d = np.minimum(d, np.maximum(np.abs(sh) - th / 2, R))
    return d.astype(F32)


def camisa():
    s = ST
    out = [SHELL(lambda P: shirt(P).layer())]
    out += [SHELL((lambda k: lambda P: _collar_layers(P)[k])(k)) for k in range(2)]
    z0 = s['hem'] + 0.06
    z1 = CAMP_Z - 0.012 if s.get('camp') else (1.375 if s.get('open_top') else 1.420)
    zs = np.linspace(z0, z1, s['n_btn'])
    role = 'hardware' if s.get('snaps') else 'button'
    r = 0.0062 if s.get('snaps') else 0.0052
    kind = 'stud' if s.get('snaps') else 'disc'
    btn = placed('cm_btn', _sdf, front_points([(0.0, z) for z in zs]))
    out += button_specs(btn, role=role, r=r, t=0.0026 if kind == 'stud' else 0.0022, kind=kind)
    if s.get('cuff'):
        if 'cm_cuff' not in _cache:
            _cache['cm_cuff'] = _surf_from_axis(_sdf, _cuff_button_specs(s['L'], ang=2.75))
        out += button_specs(_cache['cm_cuff'], role=role, r=r * 0.95, kind=kind, t=0.0022)
    if s.get('bd'):        # botones de las puntas del cuello
        c = s['collar']; top = 1.452 + c['stand'] + 0.006
        xt = c['gap'] / 2 + 0.006 + 0.040 * c['spread']; zt = top - c['fall'] - 0.034 * c['spread']
        pts = placed('cm_bd', _sdf, front_points([(sx * (xt - 0.004), zt + 0.010) for sx in (1, -1)]))
        out += button_specs(pts, role='button', r=0.0040, t=0.0018)
    if s.get('pocket') == 'two':
        flap = placed('cm_flap', _sdf, front_points([(sx * 0.092, 1.235 + 0.065 - 0.018) for sx in (1, -1)]))
        out += button_specs(flap, role=role, r=r * 0.9, kind=kind, t=0.0022)
    return out


# ---------------------------------------------------------------- pespuntes
def seam_paths():
    s = ST
    P = []
    # bajo
    ths = np.linspace(-np.pi, np.pi, int(2 * np.pi * 0.20 / SAMPLE), endpoint=False).astype(F32)
    ths = ths[np.abs(np.angle(np.exp(1j * (ths + np.pi / 2)))) > 0.06]
    r = 0.19 + s['ease']
    x, y = r * np.cos(ths), r * np.sin(ths)
    z = s['hem'] + s['tail'] * np.clip(np.abs(x) / 0.21, 0, 1) ** 2.4 + 0.0045
    for k, m in enumerate((ths > -np.pi / 2, ths < -np.pi / 2)):
        P.append((f'bajo_{k}',) + ring_rays_at(z[m].astype(F32), ths[m]))
    # tapeta: dos pespuntes a lo largo
    z_hi = CAMP_Z if s.get('camp') else 1.440
    zs = np.arange(s['hem'] + 0.008, z_hi, SAMPLE)
    for k, xo in enumerate((-PLACKET_W / 2 + 0.004, PLACKET_W / 2 - 0.004)):
        O = np.stack([np.full_like(zs, xo), np.zeros_like(zs), zs], 1).astype(F32)
        P.append((f'tapeta_{k}', O, np.tile(np.array([0, -1.0, 0], F32), (len(zs), 1))))
    # canesú trasero
    xs = np.linspace(-0.18, 0.18, int(0.36 / SAMPLE))
    O = np.stack([xs, np.zeros_like(xs), np.full_like(xs, YOKE_Z - 0.006)], 1).astype(F32)
    P.append(('canesu', O, np.tile(np.array([0, 1.0, 0], F32), (len(xs), 1))))
    # mangas: puño (dos pespuntes) o dobladillo
    angs = np.linspace(-np.pi, np.pi, int(2 * np.pi * 0.07 / SAMPLE), endpoint=False).astype(F32)
    for sd in (1, -1):
        if s.get('cuff'):
            for k, off in enumerate((0.005, s['cuff'] - 0.005)):
                P.append((f'puno_{sd}_{k}',) + arm_rays(sd, s['L'] - off, angs))
        elif not s.get('roll'):
            P.append((f'manga_{sd}',) + arm_rays(sd, s['L'] - 0.022, angs))
    # bolsillos: contorno (U)
    def u_path(cx, cz, w, h, ins=0.0045):
        poly = np.array([(cx - w / 2 + ins, cz + h / 2 - 0.004), (cx - w / 2 + ins, cz - h / 2 + ins),
                         (cx + w / 2 - ins, cz - h / 2 + ins), (cx + w / 2 - ins, cz + h / 2 - 0.004)], F32)
        seg = np.linalg.norm(np.diff(poly, axis=0), axis=1); sc = np.concatenate([[0], np.cumsum(seg)])
        t = np.linspace(0, sc[-1], int(sc[-1] / SAMPLE))
        xz = np.stack([np.interp(t, sc, poly[:, 0]), np.interp(t, sc, poly[:, 1])], 1)
        return np.stack([xz[:, 0], np.zeros(len(xz)), xz[:, 1]], 1).astype(F32)
    if s.get('pocket') == 'left':
        O = u_path(0.090, 1.255, 0.110, 0.130)
        P.append(('bolsillo', O, np.tile(np.array([0, -1.0, 0], F32), (len(O), 1))))
    elif s.get('pocket') == 'two':
        for sx in (1, -1):
            O = u_path(sx * 0.092, 1.235, 0.112, 0.130)
            P.append((f'bolsillo_{sx}', O, np.tile(np.array([0, -1.0, 0], F32), (len(O), 1))))
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
    g = shirt(V)
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
        if s.get('cuff'):
            c = m.copy(); c[m] = g.sleeve_in[m] < s['cuff']
            pieza[c] = 5 + k
    # cuello (las dos capas del cuello: lo que está más cerca de ellas que del cuerpo)
    db = np.abs(g.layer()[1]) - g.th / 2
    dc = np.full(len(V), 1.0, F32)
    for kind, sh, R, thv in _collar_layers(V):
        dc = np.minimum(dc, np.maximum(np.abs(sh) - thv / 2, R))
    pieza[(dc < 0.0015) & (dc < np.maximum(db, g.R))] = 7
    pieza[(pieza == 2) & (z > YOKE_Z) & (np.abs(x) < 0.19)] = 8
    front = (y < 0) & (pieza <= 1)
    pieza[front & (np.abs(x) < PLACKET_W / 2) & (z > s['hem'])] = 9
    if s.get('pocket') == 'left':
        pieza[front & (np.abs(x - 0.090) < 0.055) & (np.abs(z - 1.255) < 0.065) & ~interior] = 10
    elif s.get('pocket') == 'two':
        for sx in (1, -1):
            pieza[front & (np.abs(x - sx * 0.092) < 0.056) & (np.abs(z - 1.235) < 0.065) & ~interior] = 10
    return pieza, tej, interior.astype(np.uint8), np.zeros(len(V), F32)


def ejes():
    s = ST
    return {'estilo': KEY, 'nombre': s['name'], 'color': s['color'], 'color2': s.get('color2'), 'tejido': s['tejido'],
            'piezas': PIEZAS, 'L': s['L'], 'hem': s['hem']}


configure(__import__('os').environ.get('CAMISA_ESTILO', 'formal'))
