"""Cuarta referencia: colección «street» (sudadera oversize, plumífero corto, chaleco acolchado,
cargo baggy y pantalón corto de baloncesto).

Mismo cuerpo de referencia y brazos a 32° que las colecciones de punto y casual. Cada componente
lleva su papel: 'body' (la tela, teñible), 'trim' (cordones, franjas), 'zipper', 'hardware'
(punteras de los cordones, ojales, botón)... La web colorea cada papel por separado.
"""
from kit import *
from items2 import cuff_blend, arm_ang, leg_ang, belt_loops, fly, inseam_outseam, waist
from items3 import B, fit_base, hem_band_blend, tank_armhole
from items4 import (SHELL, SOLID, lazy_solid, placed, front_points, surf_ray, sdf_normal, solids_bbox, unit,
                    hood_down_d, button_specs)

ARM = 32.0
_cache = {}


def _pts_line(sdf, xs_zs, lift=0.0015):
    """Puntos sobre la superficie delantera (rayo hacia +Y) levantados según la normal."""
    out = []
    for x, z in xs_zs:
        p = surf_ray(sdf, (x, -0.0, z), (0, -1, 0), span=0.40)
        if p is not None: out.append(p + sdf_normal(sdf, p) * lift)
    return out


def _zip_line(key, sdf, z0, z1, step=0.012, x=0.0):
    if key not in _cache:
        zz = []
        for z in np.arange(z0, z1, step):
            p = surf_ray(sdf, (x, 0.0, z), (0, -1, 0), span=0.40)
            if p is not None: zz.append(p)
        _cache[key] = zz
    return np.asarray(_cache[key], F32)


def _zipper_solids(zp, key):
    """Cinta con dientes a lo largo de la línea y tirador arriba (papel 'zipper')."""
    line = [p + np.array([0, -0.0016, 0], F32) for p in zp]
    out = [SOLID(lambda Q: (capsule_pts(Q, line, 0.0036) + 0.0004 * np.sign(np.sin(Q[:, 2] * 2 * np.pi / 0.0055))).astype(F32),
                 solids_bbox(zp, 0.008), 'zipper', h=0.0011)]
    zt = zp[:, 2].max() - 0.032
    near = zp[np.argmin(np.abs(zp[:, 2] - zt))]
    c = near + np.array([0, -0.0068, 0], F32)
    def puller(Q):
        a = round_cone(Q, c + np.array([0, 0, 0.021], F32), c - np.array([0, 0, 0.014], F32), 0.0050, 0.0065)
        hole = round_cone(Q, c - np.array([0, 0, 0.004], F32), c - np.array([0, 0, 0.009], F32), 0.0022, 0.0022)
        return smax(np.maximum(a, np.abs(Q[:, 1] - c[1]) - 0.0019), -hole, 0.0005).astype(F32)
    out.append(SOLID(puller, (c - 0.03, c + 0.03), 'zipper', h=0.0007))
    return out


# ======================================================================== acolchado
def quilt(g, sp=0.078, amp=0.011, arm_sp=0.072, z0=0.0, torso=True, arms=True, seam=0.0026):
    """Canales del plumífero: almohadillas entre pespuntes (horizontales en el cuerpo y a lo
    largo de la manga). Cada canal se hincha y se hunde en la costura."""
    if torso:
        na = g._not_arm()
        fr = ((g.z - z0) / sp) % 1.0
        pill = np.sin(np.pi * fr) ** 0.55
        wob = 1 + 0.12 * noise(g.P, 7, 61)
        g.o += amp * pill * na * wob
        dist = np.minimum(fr, 1 - fr) * sp
        g.groove(dist, depth=0.0018, width=seam, mask=na)
        # arrugas cortas que tiran hacia la costura
        g.o += 0.0009 * (g.ridged(np.cos(g.theta) * 4, np.sin(g.theta) * 4, g.z * 9, 63) - 0.3) * na * pill
    if arms:
        for sd in (1, -1):
            u, a, w = g.arm(sd)
            fr = ((u + 0.01) / arm_sp) % 1.0
            pill = np.sin(np.pi * fr) ** 0.55
            g.o += amp * 0.85 * pill * w
            g.groove(np.minimum(fr, 1 - fr) * arm_sp, depth=0.0016, width=seam, mask=w)


# ======================================================================== SUDADERA OVERSIZE
def hood_rest_d(P):
    """Capucha bajada, aplastada sobre la espalda alta (más baja y plana que la de la parka)."""
    c = np.array([0, 0.095, 1.425], F32); r = np.array([0.150, 0.072, 0.092], F32)
    Q = (P - c) / r
    k = np.linalg.norm(Q, axis=1)
    return ((k - 1) * r.min()).astype(F32)


def _hoodie(P):
    b = B(ease=0.046, drape=0.88, drape_from=1.30, arm_ease=0.036, arm_drape=0.5)
    base = smin(b.upper(P), hood_rest_d(P), 0.04)
    g = Gar(P, b, lambda Q: base, th=0.0064)
    L = 0.600
    cuff_blend(g, L, 0.07, fit_base(P, 0.012, 0.007), extra=0.06)
    hem_band_blend(g, P, 0.79, 0.030, 0.7)
    hem = g.cut_below(0.705, wave=0.002); sl = g.cut_sleeve(L)
    neck = g.cut_neck(a=0.110, b=0.106, z_back=1.49, z_front=1.445)
    # mangas que se amontonan en el puño, caída ancha y pliegues de arrastre
    g.sleeve_strokes(7, 0.08, L - 0.08, amp=0.008, w=0.011, seed=101, dense_at=L - 0.07, dense_n=6, dense_len=0.13)
    g.drape_strokes(10, 1.20, 0.74, amp=0.013, w=0.016, seed=103); g.drag_strokes(4, amp=0.009, w=0.009, seed=107)
    g.hem_blouse(0.79, 0.88, 9, amp=0.006)
    g.wobble(0.0016)
    g.side_seams(zmin=0.78); g.armhole_seams(0.085)          # hombro caído
    g.ribbed(hem, 0.075, g.theta, 76, 0.0011, 0.0024); g.ribbed(sl, 0.075, arm_ang(g), 24, 0.0011, 0.002)
    g.band(neck, 0.012, raise_=0.002)
    # capucha bajada: costura central y borde
    g.groove(g.x, depth=0.0022, width=0.004, mask=(g.y > 0.03) * (g.z > 1.43))
    # borde de la capucha: la abertura queda doblada sobre la espalda alta
    hc = np.array([0, 0.075, 1.475], F32)
    q = np.sqrt((g.x / 0.14) ** 2 + ((g.z - 1.46) / 0.06) ** 2)
    rim = (q - 1) * 0.07
    hm = sstep(0.05, 0.10, g.y) * sstep(1.37, 1.40, g.z)
    g.o += 0.0035 * sstep(0.004, -0.004, rim) * hm
    g.groove(rim, depth=0.0025, width=0.003, mask=hm)
    # bolsillo canguro con las bocas en diagonal
    pk = lambda x, z: sd_poly(x, z, [(-0.17, 0.79), (0.17, 0.79), (0.125, 1.00), (-0.125, 1.00)])
    g.patch_xz(pk, lift=0.0048, puff=0.004)
    for sx in (1, -1):
        g.line_groove((sx * 0.172, 0.80), (sx * 0.128, 0.99), depth=0.0022, width=0.0024)
    return g


def sudadera_oversize():
    sdf = lambda Q: _hoodie(Q).sdf()
    if 'ho_cord' not in _cache:
        lines = []
        for sx in (1, -1):
            top = _pts_line(sdf, [(sx * 0.036, 1.447)], lift=0.002)
            if not top: continue
            t = top[0]
            ys = []
            for z in (1.40, 1.34, 1.29):
                y = find_surface_y(sdf, sx * (0.040 + (1.447 - z) * 0.05), z)
                ys.append(y if y is not None else t[1])
            lines.append([t] + [np.array([sx * (0.040 + (1.447 - z) * 0.05), y - 0.0045, z], F32) for z, y in zip((1.40, 1.34, 1.29), ys)])
        _cache['ho_cord'] = lines
    lines = _cache['ho_cord']
    out = [SHELL(lambda P: _hoodie(P).layer())]
    for l in lines:
        fn = (lambda l: lambda Q: capsule_pts(Q, l, 0.0034))(l)
        out.append(SOLID(fn, solids_bbox(l, 0.01), 'trim', h=0.0009))
        tip = l[-1]; d = unit(l[-1] - l[-2]); e = tip + d * 0.026
        out.append(SOLID((lambda a, b: lambda Q: round_cone(Q, a, b, 0.0040, 0.0037))(tip - d * 0.002, e),
                         solids_bbox([tip, e], 0.01), 'hardware', h=0.0006))
        c = l[0]; n = sdf_normal(sdf, c)
        def eyelet(Q, c=c, n=n):
            q = Q - c; al = q @ n; rad = np.linalg.norm(q - np.outer(al, n), axis=1)
            return (np.sqrt((rad - 0.0052) ** 2 + al ** 2) - 0.0014).astype(F32)
        out.append(SOLID(eyelet, (c - 0.012, c + 0.012), 'hardware', h=0.0005))
    return out


# ======================================================================== PLUMÍFERO CORTO / CHALECO
def _puffer(P, vest=False):
    if vest:
        b = B(ease=0.040, drape=0.55, drape_from=1.30, arm_ease=0.020, arm_drape=0.0)
        tube = round_cone(P, [0, 0.010, 1.40], [0, 0.014, 1.62], 0.092, 0.089)
        th = 0.0075
    else:
        b = B(ease=0.050, drape=0.55, drape_from=1.30, arm_ease=0.044, arm_drape=0.35)
        tube = round_cone(P, [0, 0.010, 1.40], [0, 0.014, 1.62], 0.096, 0.092)
        th = 0.0078
    base = smin(b.upper(P), tube, 0.04)
    g = Gar(P, b, lambda Q: base, th=th)
    zh = 0.90 if not vest else 0.86
    hem_band_blend(g, P, zh + 0.05, 0.034, 0.65)
    hem = g.cut_below(zh, wave=0.0015)
    top = g.cut_above(1.548 + 0.008 * np.cos(g.theta + np.pi / 2))
    if vest:
        # sisa: sin manga y algo más honda que la del cuerpo
        ah = np.minimum(g.cut_sleeve(0.015), tank_armhole(g, cx=0.205, cz=1.285, ax=0.045, az=0.115))
        quilt(g, 0.080, 0.012, z0=zh - 0.01, arms=False)
        g.band(ah, 0.016, raise_=0.003)
    else:
        L = 0.585
        cuff_blend(g, L, 0.045, fit_base(P, 0.014, 0.010), extra=0.05)
        sl = g.cut_sleeve(L)
        quilt(g, 0.080, 0.012, arm_sp=0.074, z0=zh - 0.01)
        g.sleeve_strokes(5, 0.10, L - 0.05, amp=0.004, w=0.010, seed=121, dense_at=L - 0.04, dense_n=5, dense_len=0.08)
        g.band(sl, 0.03, raise_=0.002)
        g.armhole_seams(0.06)
    g.wobble(0.0016)
    g.side_seams(zmin=zh)
    g.band(hem, 0.03, raise_=0.0024)
    g.hem(top, 0.012, roll=0.002, band=0.01)
    g.groove(g.z - 1.468, depth=0.0014, mask=(np.abs(g.x) < 0.13))           # unión cuello-cuerpo
    g.groove(np.abs(g.x) - 0.007, depth=0.0014, width=0.0016, mask=(g.y < 0) * (g.z > zh))   # canal de la cremallera
    return g


def _puffer_item(vest):
    key = 'vs' if vest else 'pf'
    sdf = lambda Q: _puffer(Q, vest).sdf()
    zp = _zip_line(key + '_zip', sdf, (0.865 if vest else 0.905), 1.545)
    return [SHELL(lambda P: _puffer(P, vest).layer())] + _zipper_solids(zp, key)


def plumifero_corto(): return _puffer_item(False)
def chaleco_acolchado(): return _puffer_item(True)


# ======================================================================== CARGO BAGGY
def _baggy(P):
    g = Gar(P, Body(ease=0.022, leg_ease=0.034, leg_drape=0.95, hip_ease=0.030), 'lower', th=0.0062)
    L = 0.788
    wz = waist(g, 0.995, 0.012); lg = g.cut_leg(L)
    g.leg_strokes(8, 0.12, L - 0.16, amp=0.010, w=0.013, knee_n=3, dense_at=L - 0.01, dense_n=9, dense_len=0.22, seed=131)
    g.wobble(0.0018)
    g.band(wz, 0.042, raise_=0.002); g.hem(lg, 0.022, roll=0.0024, band=0.024)
    g.groove(wz - 0.006, depth=0.0005, width=0.001); g.groove(wz - 0.036, depth=0.0005, width=0.001)
    belt_loops(g, 7, 0.955, 0.998); fly(g, 0.036, 0.955, 0.84); inseam_outseam(g)
    for sx in (1, -1):
        g.line_groove((sx * 0.105, 0.952), (sx * 0.17, 0.83), depth=0.0018, width=0.0024)    # bolsillos delanteros
    # bolsillos cargo grandes con fuelle y solapa
    g.patch_limb('leg', (1, -1), 0.31, 0.10, 0.125, 0.19, 0.012, lift=0.007, puff=0.008)
    g.patch_limb('leg', (1, -1), 0.218, 0.10, 0.132, 0.055, 0.012, lift=0.0125, puff=0.001)
    # bolsillos traseros de solapa
    for sx in (1, -1):
        g.patch_xz(rrect(sx * 0.09, 0.86, 0.13, 0.15, 0.008), front=False, lift=0.003, puff=0.002)
        g.patch_xz(rrect(sx * 0.09, 0.925, 0.14, 0.045, 0.006), front=False, lift=0.006, puff=0.0)
    yoke = 0.925 + 0.03 * np.clip(np.abs(g.x) / 0.16, 0, 1)
    g.groove(g.z - yoke - 0.03, depth=0.001, mask=(g.y > 0) * (g.z > 0.9))
    return g


def cargo_baggy():
    sdf = lambda Q: _baggy(Q).sdf()
    top = placed('bg_btn', sdf, front_points([(0.0, 0.975)]))
    snaps = []
    if 'bg_snap' not in _cache:
        pts = []
        # broches de las solapas: centro de la solapa sobre la pierna, en el exterior
        b = Body(ease=0.022, leg_ease=0.034, leg_drape=0.95)
        for sd in (1, -1):
            H, K, C, A = b.leg[sd]
            c = H + (K - H) / np.linalg.norm(K - H) * 0.215
            ang = sd * np.pi / 2 + 0.10 * sd
            # dirección de fuera según la convención de limb_coords (ángulo desde e1)
            dvec = unit(K - H)
            e1, e2 = frame(dvec)
            out = unit(e1 * np.cos(ang) + e2 * np.sin(ang))
            p = surf_ray(sdf, c, out, span=0.30)
            if p is not None: pts.append((p, sdf_normal(sdf, p)))
        _cache['bg_snap'] = pts
    snaps = _cache['bg_snap']
    return ([SHELL(lambda P: _baggy(P).layer())] +
            button_specs(top, role='hardware', r=0.0082, t=0.0036, kind='stud') +
            button_specs(snaps, role='hardware', r=0.0068, t=0.003, kind='stud'))


# ======================================================================== PANTALÓN CORTO DE BALONCESTO
BB_L = 0.405
def _bball(P):
    g = Gar(P, Body(ease=0.020, leg_ease=0.050, leg_drape=0.9, hip_ease=0.024), 'lower', th=0.0046)
    L = BB_L
    wz = waist(g, 1.00, 0.008); lg = g.cut_leg(L)
    g.leg_strokes(6, 0.04, L - 0.03, amp=0.010, w=0.013, seed=141)
    g.drape_strokes(6, 0.92, 0.70, amp=0.006, w=0.014, seed=143)
    g.wobble(0.0017)
    g.gather(sstep(0.935, 0.945, g.z), 0.0032, n=20, fz=5)                # el elástico frunce la cintura
    g.ribbed(wz, 0.058, g.theta, 90, 0.0007, 0.0026)
    g.hem(lg, 0.028, roll=0.0022, band=0.032)
    inseam_outseam(g)
    for sx in (1, -1):
        g.line_groove((sx * 0.155, 0.93), (sx * 0.185, 0.80), depth=0.0018, width=0.0022)   # bolsillos de costura
    return g


def _stripe_mask(g):
    m = np.zeros(len(g.P), F32)
    for sd in (1, -1):
        u, a, w = g.leg(sd)
        ang = np.angle(np.exp(1j * (a - sd * np.pi / 2)))
        m = np.maximum(m, (g.x * sd > 0) * sstep(0.025, 0.021, np.abs(ang) * 0.12) * (u < BB_L - 0.0))
    return m


def franja(P):
    """Franja lateral de otro color, cosida por encima de la tela (papel 'trim')."""
    g = _bball(P)
    s = g.base - g.o
    d = np.abs(s - 0.0036) - 0.0010
    region = np.maximum(0.5 - _stripe_mask(g), 0.0) * 0.05
    zb = 1.00 + 0.008 * np.sin(g.theta) - 0.058
    region = np.maximum(region, g.z - zb)
    region = np.maximum(region, g.R)
    return smax(d, region, 0.0006).astype(F32)


def shorts_baloncesto():
    sdf = lambda Q: _bball(Q).sdf()
    if 'bb_cord' not in _cache:
        lines = []
        for sx in (1, -1):
            y0 = find_surface_y(sdf, sx * 0.012, 0.975) or -0.13
            y1 = find_surface_y(sdf, sx * 0.03, 0.90) or y0
            lines.append([(sx * 0.010, y0 - 0.002, 0.975), (sx * 0.026, y0 - 0.006, 0.955), (sx * 0.034, y1 - 0.004, 0.90),
                          (sx * 0.038, y1 - 0.004, 0.875)])
        _cache['bb_cord'] = [np.asarray(l, F32) for l in lines]
    out = [SHELL(lambda P: _bball(P).layer()),
           SOLID(franja, ((0.17, -0.10, 0.40), (0.37, 0.10, 0.95)), 'trim', h=0.0014),
           SOLID(franja, ((-0.37, -0.10, 0.40), (-0.17, 0.10, 0.95)), 'trim', h=0.0014)]
    for l in _cache['bb_cord']:
        out.append(SOLID((lambda l: lambda Q: capsule_pts(Q, l, 0.0033))(list(l)), solids_bbox(l, 0.01), 'trim', h=0.0009))
    return out


CATALOG = [
    ('01_sudadera_oversize', 'Sudadera oversize con capucha', sudadera_oversize, ((-0.58, -0.30, 0.66), (0.58, 0.31, 1.64))),
    ('02_plumifero_corto', 'Plumífero corto', plumifero_corto, ((-0.58, -0.30, 0.84), (0.58, 0.30, 1.66))),
    ('03_chaleco_acolchado', 'Chaleco acolchado', chaleco_acolchado, ((-0.36, -0.29, 0.80), (0.36, 0.29, 1.66))),
    ('04_cargo_baggy', 'Cargo baggy', cargo_baggy, ((-0.38, -0.27, -0.03), (0.38, 0.27, 1.06))),
    ('05_shorts_baloncesto', 'Pantalón corto de baloncesto', shorts_baloncesto, ((-0.38, -0.27, 0.38), (0.38, 0.27, 1.06))),
]
