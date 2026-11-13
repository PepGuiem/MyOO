"""Colección «street», segunda tanda: chaqueta varsity (cuerpo de lana y mangas de piel), cortavientos
(nailon con canesú de otro color) y pantalón paracaídas (nailon, tobillos fruncidos con cordón).

Mismo cuerpo de referencia y brazos a 32° que el resto. Papeles: 'body' (tela, teñible),
'secondary' (mangas de piel de la varsity, canesú del cortavientos), 'trim' (rayas del canalé,
cordones), 'zipper', 'hardware' (corchetes, topes de los cordones).
"""
from kit import *
from items2 import cuff_blend, leg_cuff_blend, arm_ang, leg_ang, inseam_outseam, waist
from items3 import B, fit_base, hem_band_blend
from items4 import (SHELL, SOLID, lazy_solid, placed, front_points, surf_ray, sdf_normal, solids_bbox, unit, button_specs)
from items5 import _zip_line, _zipper_solids, _pts_line

ARM = 32.0
_cache = {}


def _split(layer, d, keep_negative):
    """Divide una capa en dos piezas por el signo de `d` (para teñirlas por separado)."""
    kind, s, R, th = layer
    return (kind, s, np.maximum(R, d if keep_negative else -d).astype(F32), th)


# ======================================================================== VARSITY
VL = 0.59          # largo de manga
V_CUFF = 0.066     # puño de canalé
V_AT = 0.05        # costura de la sisa (a lo largo del brazo)
V_HEM = 0.78
V_RIB = 0.066


def _varsity(P):
    b = B(ease=0.034, drape=0.5, drape_from=1.30, arm_ease=0.028, arm_drape=0.3)
    tube = round_cone(P, [0, 0.008, 1.40], [0, 0.012, 1.62], 0.082, 0.079)
    base = smin(b.upper(P), tube, 0.03)
    g = Gar(P, b, lambda Q: base, th=0.0054)
    fit = B(ease=0.012, arm_ease=0.006).upper(P)
    cuff_blend(g, VL, V_CUFF, fit, extra=0.02)
    hem_band_blend(g, P, V_HEM + V_RIB, 0.014, 0.9)
    hem = g.cut_below(V_HEM, wave=0.001); sl = g.cut_sleeve(VL)
    # cuello de canalé alto (como el de la chaqueta de chándal), no un escote abierto
    neck = g.cut_above(1.505 + 0.008 * np.cos(g.theta + np.pi / 2))
    g.sleeve_strokes(7, 0.06, VL - 0.08, amp=0.007, w=0.010, seed=161, dense_at=VL - V_CUFF, dense_n=5, dense_len=0.10)
    g.drape_strokes(6, 1.20, 0.86, amp=0.005, w=0.014, seed=163); g.drag_strokes(3, amp=0.005, w=0.008, seed=167)
    g.hem_blouse(V_HEM + V_RIB, V_HEM + V_RIB + 0.07, 8, amp=0.005)
    g.wobble(0.0012)
    g.side_seams(zmin=V_HEM); g.armhole_seams(V_AT)
    g.ribbed(hem, V_RIB, g.theta, 84, 0.0010, 0.0026)
    g.ribbed(sl, V_CUFF, arm_ang(g), 26, 0.0010, 0.0022)
    g.ribbed(neck, 0.034, g.theta, 64, 0.0009, 0.0026)
    g.groove(g.z - 1.468, depth=0.0012, mask=(np.abs(g.x) < 0.12))          # unión cuello-cuerpo
    # cierre de corchetes: tapeta delantera
    m = (g.y < 0) * (g.z > V_HEM) * (g.z < 1.50)
    g.groove(g.x, depth=0.0018, width=0.0011, mask=m)
    g.groove(np.abs(g.x) - 0.016, depth=0.0008, width=0.0014, mask=m)
    # bolsillos de ribete en diagonal
    for sx in (1, -1):
        g.line_groove((sx * 0.112, 1.02), (sx * 0.142, 0.885), depth=0.0022, width=0.0026)
        g.line_groove((sx * 0.118, 1.02), (sx * 0.148, 0.885), depth=0.0008, width=0.0012)
    return g


def _sleeve_d(g):
    """<0 en la manga de piel (de la sisa al puño de canalé), >0 en el resto."""
    d = np.full(len(g.P), 1.0, F32)
    for sd in (1, -1):
        u, a, w = g.arm(sd)
        inside = np.maximum(V_AT - u, u - (VL - V_CUFF))
        d = np.where(w > 0.5, np.minimum(d, inside), d)
    return d


def _rib_stripes(P):
    """Dos rayas en el canalé del bajo y de los puños (papel 'trim')."""
    g = _varsity(P)
    s = g.base - g.o
    d = np.abs(s - 0.0040) - 0.0009
    hem_d = np.full(len(P), 1.0, F32)
    for zc in (V_HEM + 0.026, V_HEM + 0.040):
        hem_d = np.minimum(hem_d, np.abs(g.z - zc) - 0.0035)
    hem_d = np.where(g._not_arm() > 0.5, hem_d, 1.0)
    cuff_d = np.full(len(P), 1.0, F32)
    for sd in (1, -1):
        u, a, w = g.arm(sd)
        for uc in (VL - 0.040, VL - 0.026):
            cuff_d = np.where(w > 0.5, np.minimum(cuff_d, np.abs(u - uc) - 0.0035), cuff_d)
    region = np.maximum(np.minimum(hem_d, cuff_d), g.R)
    return smax(d, region, 0.0006).astype(F32)


def chaqueta_varsity():
    sdf = lambda Q: _varsity(Q).sdf()
    zs = np.linspace(V_HEM + 0.045, 1.43, 7)
    snaps = placed('va_snaps', sdf, front_points([(0.0, z) for z in zs]))
    b = B(ease=0.034, arm_ease=0.028)
    cuff_boxes = []
    for sd in (1, -1):
        S, E, W = b.arm[sd]
        W2 = W + unit(W - E) * 0.06
        cuff_boxes.append((np.minimum(W, W2) - 0.10, np.maximum(W, W2) + 0.10))
    out = [SHELL(lambda P: (lambda g: _split(g.layer(), _sleeve_d(g), False))(_varsity(P)), 'body'),
           SHELL(lambda P: (lambda g: _split(g.layer(), _sleeve_d(g), True))(_varsity(P)), 'secondary'),
           SOLID(_rib_stripes, ((-0.36, -0.26, V_HEM - 0.005), (0.36, 0.26, V_HEM + 0.05)), 'trim', h=0.0010)]
    for lo, hi in cuff_boxes:
        out.append(SOLID(_rib_stripes, (lo, hi), 'trim', h=0.0010))
    out += button_specs(snaps, role='hardware', r=0.0068, t=0.0030, kind='disc')
    return out


# ======================================================================== CORTAVIENTOS
WL = 0.60


def _yoke_z(g):
    """Canesú en pico: baja en el centro del pecho y cruza la parte alta de las mangas."""
    return (1.215 + 0.30 * np.clip(np.abs(g.x), 0, 0.17)).astype(F32)


def _windbreaker(P):
    b = B(ease=0.048, drape=0.7, drape_from=1.30, arm_ease=0.038, arm_drape=0.45)
    tube = round_cone(P, [0, 0.008, 1.40], [0, 0.012, 1.62], 0.084, 0.080)
    base = smin(b.upper(P), tube, 0.035)
    g = Gar(P, b, lambda Q: base, th=0.0040)
    fit = B(ease=0.014, arm_ease=0.008).upper(P)
    cuff_blend(g, WL, 0.035, fit, extra=0.07)            # puño elástico: la manga se frunce
    hem_band_blend(g, P, 0.775, 0.030, 0.55)
    hem = g.cut_below(0.735, wave=0.002); sl = g.cut_sleeve(WL)
    top = g.cut_above(1.540 + 0.008 * np.cos(g.theta + np.pi / 2))
    g.sleeve_strokes(10, 0.06, WL - 0.05, amp=0.008, w=0.008, seed=171, dense_at=WL - 0.04, dense_n=8, dense_len=0.12)
    g.drape_strokes(11, 1.22, 0.76, amp=0.011, w=0.012, seed=173); g.drag_strokes(6, amp=0.008, w=0.007, seed=177)
    g.hem_blouse(0.76, 0.84, 10, amp=0.006)
    g.wobble(0.0015)
    g.o += 0.0006 * fbm(P, 36, 2, 179)                     # nailon arrugado
    g.side_seams(zmin=0.74); g.armhole_seams(0.07)
    g.hem(hem, 0.016, roll=0.0028, band=0.020)              # jareta del bajo
    g.band(sl, 0.024, raise_=0.0018)
    g.hem(top, 0.012, roll=0.0018, band=0.010)
    g.groove(g.z - 1.468, depth=0.0012, mask=(np.abs(g.x) < 0.13))           # unión cuello-cuerpo
    g.groove(np.abs(g.x) - 0.0065, depth=0.0013, width=0.0015, mask=(g.y < 0) * (g.z > 0.73))
    # costura del canesú (pespunte doble)
    yz = _yoke_z(g)
    g.groove(g.z - yz, depth=0.0011, width=0.0018)
    g.groove(g.z - yz - 0.006, depth=0.0005, width=0.0010)
    # bolsillos con cremallera oculta (vivo en diagonal)
    for sx in (1, -1):
        g.line_groove((sx * 0.10, 0.98), (sx * 0.135, 0.84), depth=0.0020, width=0.0024)
    return g


def cortavientos():
    sdf = lambda Q: _windbreaker(Q).sdf()
    zp = _zip_line('wb_zip', sdf, 0.745, 1.536)
    yoke = lambda g: (g.z - _yoke_z(g)).astype(F32)
    return [SHELL(lambda P: (lambda g: _split(g.layer(), yoke(g), True))(_windbreaker(P)), 'body'),
            SHELL(lambda P: (lambda g: _split(g.layer(), yoke(g), False))(_windbreaker(P)), 'secondary')] + _zipper_solids(zp, 'wb')


# ======================================================================== PANTALÓN PARACAÍDAS
PL = 0.80


def _parachute(P):
    g = Gar(P, Body(ease=0.022, leg_ease=0.036, leg_drape=0.95, hip_ease=0.028), 'lower', th=0.0042)
    fit = Body(ease=0.010, leg_ease=0.012, leg_drape=0.0).lower(P)
    leg_cuff_blend(g, PL, 0.030, fit, extra=0.075)         # el cordón del tobillo recoge la pernera
    wz = waist(g, 1.00, 0.010); lg = g.cut_leg(PL)
    g.leg_strokes(14, 0.10, PL - 0.06, amp=0.013, w=0.009, knee_n=4, dense_at=PL - 0.04, dense_n=12, dense_len=0.18, seed=181)
    g.drape_strokes(6, 0.95, 0.60, amp=0.006, w=0.013, seed=183)
    g.wobble(0.0016)
    g.o += 0.0007 * fbm(P, 34, 2, 187)                     # nailon arrugado
    g.gather(sstep(0.950, 0.962, g.z), 0.0024, n=16, fz=3)  # cintura elástica
    g.ribbed(wz, 0.048, g.theta, 72, 0.0005, 0.0024)
    g.hem(lg, 0.018, roll=0.0026, band=0.022)               # jareta del tobillo
    inseam_outseam(g)
    for sx in (1, -1):
        g.line_groove((sx * 0.112, 0.948), (sx * 0.168, 0.835), depth=0.0018, width=0.0024)
    # rodillas con pinzas y bolsillos de muslo con cremallera en diagonal
    for sd in (1, -1):
        u, a, w = g.leg(sd)
        fm = (g.x * sd > 0) * (np.cos(a) < 0.25)
        g.groove(u - 0.33, mask=fm); g.groove(u - 0.40, mask=fm)
    g.patch_limb('leg', (1, -1), 0.27, 0.10, 0.14, 0.16, 0.012, lift=0.0045, puff=0.004)
    return g


def _ankle_points(sdf):
    if 'pc_ank' not in _cache:
        pts = []
        b = Body(ease=0.022, leg_ease=0.036, leg_drape=0.95)
        for sd in (1, -1):
            H, K, C, A = b.leg[sd]
            # a lo largo de la pierna hasta el bajo (PL), por fuera
            segs = [H, K, C, A + np.array([0, 0, -0.15], F32)]
            rem = PL - 0.012; c = None
            for a0, a1 in zip(segs[:-1], segs[1:]):
                L = np.linalg.norm(a1 - a0)
                if rem <= L: c = a0 + unit(a1 - a0) * rem; break
                rem -= L
            if c is None: continue
            p = surf_ray(sdf, c, np.array([sd, -0.25, 0], F32) / np.hypot(1, 0.25), span=0.25)
            if p is not None: pts.append((p, sdf_normal(sdf, p)))
        _cache['pc_ank'] = pts
    return _cache['pc_ank']


def pantalon_paracaidas():
    sdf = lambda Q: _parachute(Q).sdf()
    out = [SHELL(lambda P: _parachute(P).layer())]
    for p, n in _ankle_points(sdf):
        # cordón elástico que sale de la jareta y cuelga, con su tope
        a = p + n * 0.003
        b = a + np.array([0, 0, -0.030], F32) + n * 0.004
        c = b + np.array([0, -0.004, -0.022], F32)
        cord = [a, b, c]
        out.append(SOLID((lambda l: lambda Q: capsule_pts(Q, l, 0.0018))(cord), solids_bbox(cord, 0.01), 'trim', h=0.0006))
        t0 = b + (c - b) * 0.25; t1 = b + (c - b) * 0.75
        out.append(SOLID((lambda u, v: lambda Q: round_cone(Q, u, v, 0.0042, 0.0038))(t0, t1), solids_bbox([t0, t1], 0.01), 'hardware', h=0.0005))
    return out


CATALOG = [
    ('08_chaqueta_varsity', 'Chaqueta varsity', chaqueta_varsity, ((-0.58, -0.30, 0.74), (0.58, 0.30, 1.62))),
    ('09_cortavientos', 'Cortavientos', cortavientos, ((-0.58, -0.30, 0.70), (0.58, 0.31, 1.66))),
    ('10_pantalon_paracaidas', 'Pantalón paracaídas', pantalon_paracaidas, ((-0.40, -0.28, -0.03), (0.40, 0.28, 1.06))),
]
