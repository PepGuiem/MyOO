"""Las 18 prendas de la referencia, modeladas como campos de distancia."""
from kit import *

UP = ((-0.62, -0.24, 0.66), (0.62, 0.24, 1.60))     # caja superior sin capucha
UPH = ((-0.62, -0.25, 0.66), (0.62, 0.27, 1.84))    # con capucha
LOW = ((-0.30, -0.22, -0.02), (0.30, 0.22, 1.08))
_cache = {}

def _bbox(pts, dz=0.0, pad=0.012):
    p = np.asarray(pts, F32); lo = p.min(0) - pad; hi = p.max(0) + pad; lo[2] += min(dz, 0)
    return (lo, hi)

def fitted_arm_base(P, e=0.006):
    return Body(ease=e, arm_ease=e).upper(P)

def cuff_blend(g, L, width, fit_base, extra=0.03):
    for sd in (1, -1):
        u, a, w = g.arm(sd)
        m = sstep(L - width - extra, L - width + 0.005, u) * (w > 0.5)
        g.blend(fit_base, m)

def leg_cuff_blend(g, L, width, fit_base, extra=0.035):
    for sd in (1, -1):
        u, a, w = g.leg(sd)
        m = sstep(L - width - extra, L - width + 0.005, u) * (g.x * sd > 0)
        g.blend(fit_base, m)

def leg_ang(g):
    a = np.zeros(len(g.P), F32)
    for sd in (1, -1):
        u, aa, w = g.leg(sd); a = np.where(g.x * sd >= 0, aa, a)
    return a

def arm_ang(g):
    a = g.theta.copy()
    for sd in (1, -1):
        u, aa, w = g.arm(sd); a = np.where(w > 0.5, aa, a)
    return a

def hood_cut(g, open_front=False, gap=0.0):
    """Abertura de la cara en la capucha."""
    q = np.sqrt((g.x / 0.088) ** 2 + ((g.z - 1.64) / 0.16) ** 2)
    e = np.maximum((q - 1) * 0.088, g.y + 0.005)          # dentro del óvalo y delante
    g.keep(-e)
    return -e

# ======================================================================== PARTE SUPERIOR
def camiseta(P):
    b = Body(ease=0.014, drape=0.6, drape_from=1.30, arm_ease=0.02, arm_drape=0.55)
    g = Gar(P, b, 'upper', th=0.0048)
    hem = g.cut_below(0.80, wave=0.004); neck = g.cut_neck(); sl = g.cut_sleeve(0.20)
    g.sleeve_strokes(5, 0.05, 0.19, amp=0.005, w=0.008); g.drape_strokes(9, 1.24 - 0.04, 0.80, amp=0.007 * 0.9, w=0.012); g.drag_strokes(3, amp=0.004 * 1.2, w=0.0065)
    g.wobble(); g.side_seams(); g.armhole_seams()
    g.hem(hem, 0.022); g.hem(sl, 0.02); g.band(neck, 0.018)
    return [g.layer()]

def camiseta_manga_larga(P):
    b = Body(ease=0.010, drape=0.45, drape_from=1.30, arm_ease=0.016, arm_drape=0.35)
    g = Gar(P, b, 'upper', th=0.0045)
    L = 0.575
    cuff_blend(g, L, 0.055, fitted_arm_base(P, 0.004))
    hem = g.cut_below(0.79, wave=0.003); neck = g.cut_neck(a=0.09, b=0.086, z_front=1.44); sl = g.cut_sleeve(L)
    g.sleeve_strokes(8, 0.05, L - 0.08, amp=0.0065, w=0.008, dense_at=L - 0.055, dense_n=6, dense_len=0.12)
    g.drape_strokes(9, 1.24 - 0.04, 0.80, amp=0.006 * 0.9, w=0.012); g.drag_strokes(3, amp=0.0035 * 1.2, w=0.0065)
    g.wobble(); g.side_seams(); g.armhole_seams()
    g.hem(hem, 0.02); g.ribbed(sl, 0.055, arm_ang(g), 22, 0.0008, 0.0012); g.band(neck, 0.016)
    return [g.layer()]

def camiseta_larga(P):
    b = Body(ease=0.02, drape=0.8, drape_from=1.30, arm_ease=0.026, arm_drape=0.6)
    g = Gar(P, b, 'upper', th=0.005)
    hem = g.cut_below(0.70, wave=0.004, curve=lambda s: 0.055 * np.clip(np.abs(s.x) / 0.21, 0, 1) ** 2)
    neck = g.cut_neck(); sl = g.cut_sleeve(0.23)
    g.sleeve_strokes(5, 0.05, 0.19, amp=0.005, w=0.008); g.drape_strokes(9, 1.22 - 0.04, 0.72, amp=0.010 * 0.9, w=0.012); g.drag_strokes(3, amp=0.005 * 1.2, w=0.0065)
    g.wobble(0.0015); g.side_seams(); g.armhole_seams()
    g.hem(hem, 0.022, roll=0.002); g.hem(sl, 0.03); g.band(neck, 0.02)
    return [g.layer()]

def camiseta_sin_mangas(P):
    b = Body(ease=0.007, drape=0.25, drape_from=1.30, arm_ease=0.007)
    g = Gar(P, b, 'upper', th=0.0045)
    hem = g.cut_below(0.79, wave=0.002); neck = g.cut_neck(a=0.085, b=0.082, z_front=1.445); ah = g.cut_armhole(0.03)
    g.drape_strokes(9, 1.20 - 0.04, 0.80, amp=0.0035 * 0.9, w=0.012); g.wobble(0.0009)
    # costuras princesa (delante y detrás)
    for front in (True, False):
        xs = 0.075 + 0.035 * sstep(1.30, 0.85, g.z) + 0.06 * sstep(1.26, 1.36, g.z)
        m = ((g.y < 0) if front else (g.y > 0)) * (g.z < 1.38)
        g.groove(np.abs(g.x) - xs, mask=m)
    g.side_seams()
    g.hem(hem, 0.02); g.band(ah, 0.014); g.band(neck, 0.018)
    # logotipo en relieve suave en el pecho
    return [g.layer()]

def _hoodie_body(P, quarter_zip=True):
    b = Body(ease=0.03, drape=0.85, drape_from=1.30, arm_ease=0.032, arm_drape=0.5)
    base = smin(b.upper(P), head_d(P, 0.038, back=0.02, peak=0.25), 0.07)
    g = Gar(P, b, lambda Q: base, th=0.006)
    L = 0.58
    fit = Body(ease=0.012, arm_ease=0.006).upper(P)
    cuff_blend(g, L, 0.065, fit)
    hm = sstep(0.83, 0.79, g.z) * g._not_arm(); g.blend(fit, hm * 0.8)
    hem = g.cut_below(0.74, wave=0.002); sl = g.cut_sleeve(L); face = hood_cut(g); g.cut_above(1.83)
    g.sleeve_strokes(8, 0.05, L - 0.08, amp=0.009, w=0.008, dense_at=L - 0.065, dense_n=6, dense_len=0.12)
    g.drape_strokes(9, 1.22 - 0.04, 0.80, amp=0.011 * 0.9, w=0.012); g.drag_strokes(3, amp=0.006 * 1.2, w=0.0065)
    g.hem_blouse(0.81, 0.90, 9, amp=0.004 * 1.2)
    g.wobble(0.0016); g.side_seams(zmin=0.8); g.armhole_seams(0.06)
    g.ribbed(hem, 0.065, g.theta, 70, 0.001, 0.002); g.ribbed(sl, 0.065, arm_ang(g), 22, 0.001, 0.0018)
    g.band(face, 0.02, raise_=0.002)
    # capucha: costura central
    g.groove(g.x, mask=(g.z > 1.55) * (g.y > -0.02))
    # bolsillo canguro
    pk = lambda x, z: sd_poly(x, z, [(-0.15, 0.80), (0.15, 0.80), (0.11, 0.99), (-0.11, 0.99)]) + 0.0
    g.patch_xz(pk, lift=0.004, puff=0.003)
    if quarter_zip:
        zm = (np.abs(g.x) < 0.007) * (g.z > 1.30) * (g.z < 1.505) * (g.y < 0)
        g.o += 0.0022 * sstep(0.008, 0.004, np.abs(g.x)) * zm
        g.groove(np.abs(g.x) - 0.008, mask=(g.z > 1.30) * (g.z < 1.505) * (g.y < 0))
        g.bump_xz(0.0, 1.47, 0.012, 0.004)
    return [g.layer()]

def sudadera_capucha(P):
    body = lambda Q: _hoodie_body(Q, True)
    sdf_body = lambda Q: np.maximum(np.abs(body(Q)[0][1]) - body(Q)[0][3] / 2, body(Q)[0][2])
    if 'hood_cords' not in _cache:
        pts = []
        for sd in (1, -1):
            x0 = sd * 0.05; y0 = find_surface_y(sdf_body, x0, 1.505) or -0.13
            pts.append([(x0, y0 + 0.001, 1.505), (sd * 0.052, y0 - 0.010, 1.44), (sd * 0.05, y0 - 0.014, 1.36), (sd * 0.049, y0 - 0.014, 1.31)])
        _cache['hood_cords'] = pts
    out = body(P)
    for pts in _cache['hood_cords']:
        d = capsule_pts(P, pts, 0.0042)
        d = np.minimum(d, capsule_pts(P, [pts[-1], np.asarray(pts[-1]) + [0, 0, -0.03]], 0.0056))
        out.append(('solid', d, _bbox(pts, -0.035)))
    return out

def anorak(P):
    b = Body(ease=0.04, drape=0.95, drape_from=1.32, arm_ease=0.04, arm_drape=0.6)
    g = Gar(P, b, 'upper', th=0.0055)
    L = 0.58; fit = Body(ease=0.016, arm_ease=0.008).upper(P)
    cuff_blend(g, L, 0.04, fit); g.blend(fit, sstep(0.82, 0.78, g.z) * g._not_arm() * 0.85)
    hem = g.cut_below(0.74, wave=0.002); sl = g.cut_sleeve(L); top = g.cut_above(1.575)
    g.sleeve_strokes(8, 0.05, L - 0.08, amp=0.01, w=0.008, dense_at=L - 0.04, dense_n=6, dense_len=0.12)
    g.drape_strokes(9, 1.24 - 0.04, 0.78, amp=0.013 * 0.9, w=0.012); g.drag_strokes(3, amp=0.008 * 1.2, w=0.0065); g.hem_blouse(0.79, 0.88, 9, amp=0.005 * 1.2)
    g.wobble(0.002); g.side_seams(zmin=0.76); g.armhole_seams(0.06)
    g.hem(hem, 0.012, roll=0.0025, band=0.035); g.band(sl, 0.04, raise_=0.0018); g.hem(top, 0.012, roll=0.002)
    g.groove(g.z - 1.43, mask=(g.y < 0) * g._not_arm() * (np.abs(g.x) < 0.17))     # canesú
    # media cremallera
    zm = (g.z > 1.27) * (g.y < 0)
    g.o += 0.0024 * sstep(0.009, 0.005, np.abs(g.x)) * zm; g.groove(np.abs(g.x) - 0.011, mask=zm)
    g.bump_xz(0.0, 1.55, 0.011, 0.005)
    # bolsillo de pecho con solapa y broches
    g.patch_xz(rrect(0, 1.155, 0.25, 0.17, 0.012), lift=0.004, puff=0.004)
    g.patch_xz(rrect(0, 1.245, 0.262, 0.055, 0.01), lift=0.009, puff=0.001)
    for x in (-0.075, 0.075): g.bump_xz(x, 1.236, 0.009, 0.004)
    # bolsillo inferior
    g.patch_xz(rrect(0, 0.905, 0.32, 0.11, 0.015), lift=0.0035, puff=0.003)
    return [g.layer()]

def chaqueta_capucha(P):
    b = Body(ease=0.03, drape=0.8, drape_from=1.30, arm_ease=0.032, arm_drape=0.5)
    base = smin(b.upper(P), head_d(P, 0.04, back=0.025, peak=0.3), 0.07)
    g = Gar(P, b, lambda Q: base, th=0.0055)
    L = 0.585; fit = Body(ease=0.014, arm_ease=0.007).upper(P)
    cuff_blend(g, L, 0.03, fit)
    hem = g.cut_below(0.76, wave=0.002); sl = g.cut_sleeve(L); face = hood_cut(g); g.cut_above(1.84)
    fr = g.cut_front_open(0.075, z_from=0.0)
    g.sleeve_strokes(8, 0.05, L - 0.08, amp=0.009, w=0.008, dense_at=L - 0.03, dense_n=6, dense_len=0.12)
    g.drape_strokes(9, 1.24 - 0.04, 0.80, amp=0.012 * 0.9, w=0.012); g.drag_strokes(3, amp=0.007 * 1.2, w=0.0065)
    g.wobble(0.0018); g.side_seams(zmin=0.78); g.armhole_seams(0.06)
    g.hem(hem, 0.012, roll=0.003, band=0.03); g.band(sl, 0.03, raise_=0.0016)
    g.band(face, 0.018, raise_=0.002); g.groove(g.x, mask=(g.z > 1.56) * (g.y > -0.01))
    g.ridge(fr, 0.0022, 0.004, mask=(g.y < 0)); g.groove(fr - 0.012, mask=(g.y < 0))   # cinta de cremallera
    g.patch_limb('arm', (-1,), 0.13, 0.25, 0.10, 0.12, 0.008, lift=0.003, puff=0.003)
    g.groove(np.abs(g.z - 1.32) , mask=0)   # (sin efecto, marcador)
    return [g.layer()]

def bomber(P):
    b = Body(ease=0.042, drape=0.75, drape_from=1.30, arm_ease=0.045, arm_drape=0.55)
    g = Gar(P, b, 'upper', th=0.0075)
    L = 0.585; fit = Body(ease=0.018, arm_ease=0.006).upper(P)
    cuff_blend(g, L, 0.07, fit, extra=0.05)
    g.blend(fit, sstep(0.90, 0.85, g.z) * g._not_arm())
    hem = g.cut_below(0.78, wave=0.002); sl = g.cut_sleeve(L); top = g.cut_above(1.54)
    fr = g.cut_front_open(0.05, z_from=0.0)
    g.sleeve_strokes(8, 0.05, L - 0.08, amp=0.012, w=0.008, dense_at=L - 0.07, dense_n=6, dense_len=0.12)
    g.drape_strokes(9, 1.25 - 0.04, 0.86, amp=0.012 * 0.9, w=0.012); g.drag_strokes(3, amp=0.009 * 1.2, w=0.0065); g.hem_blouse(0.86, 0.97, 9, amp=0.007 * 1.2)
    g.wobble(0.0025, 7); g.side_seams(zmin=0.85); g.armhole_seams(0.06)
    g.ribbed(hem, 0.07, g.theta, 80, 0.0012, 0.003); g.ribbed(sl, 0.07, arm_ang(g), 22, 0.0012, 0.0025)
    g.ribbed(top, 0.05, g.theta, 70, 0.0012, 0.003)
    g.ridge(fr, 0.003, 0.004, mask=(g.y < 0)); g.groove(fr - 0.012, mask=(g.y < 0))
    # bolsillo de manga con cremallera
    d = g.patch_limb('arm', (-1,), 0.12, 0.35, 0.075, 0.11, 0.006, lift=0.003, puff=0.002)
    for sd in (-1,):
        u, a, w = g.arm(sd)
    # bolsillos de ojal delanteros
    for sx in (1, -1):
        g.line_groove((sx * 0.085, 1.04), (sx * 0.13, 0.91), depth=0.003, width=0.003)
        g.line_groove((sx * 0.095, 1.04), (sx * 0.14, 0.91), depth=-0.002, width=0.004)
    return [g.layer()]

def _collar(P, gap=0.03):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    th = np.full(len(P), 0.0042, F32)
    f1 = round_cone(P, [0, 0.008, 1.38], [0, 0.012, 1.62], 0.083, 0.080)
    R1 = np.maximum(1.452 - z, z - 1.50)
    R1 = np.maximum(R1, np.where(y < 0, gap / 2 + 0.004 - np.abs(x), -1.0))
    f2 = round_cone(P, [0, 0.008, 1.508], [0, 0.0, 1.40], 0.089, 0.137)
    fy = sstep(0.0, -0.07, y) * sstep(0.0, 0.035, np.abs(x)) * sstep(0.10, 0.04, np.abs(x))
    zlow = 1.452 - 0.075 * fy
    R2 = np.maximum(zlow - z, z - 1.507)
    R2 = np.maximum(R2, np.where(y < 0, gap / 2 + 0.006 - np.abs(x), -1.0))
    return [('shell', f1, R1.astype(F32), th), ('shell', f2, R2.astype(F32), th)]

def camisa(P):
    b = Body(ease=0.022, drape=0.8, drape_from=1.30, arm_ease=0.024, arm_drape=0.5)
    g = Gar(P, b, 'upper', th=0.004)
    L = 0.60; fit = Body(ease=0.012, arm_ease=0.010).upper(P)
    cuff_blend(g, L, 0.065, fit, extra=0.02)
    hem = g.cut_below(0.72, wave=0.002, curve=lambda s: 0.06 * np.clip(np.abs(s.x) / 0.2, 0, 1) ** 2.5)
    sl = g.cut_sleeve(L); neck = g.cut_neck(a=0.084, b=0.082, z_back=1.46, z_front=1.44)
    gap = 0.035; fr = g.cut_front_open(gap, z_from=0.0)
    g.sleeve_strokes(8, 0.05, L - 0.08, amp=0.008, w=0.008, dense_at=L - 0.065, dense_n=6, dense_len=0.12)
    g.drape_strokes(9, 1.24 - 0.04, 0.76, amp=0.010 * 0.9, w=0.012); g.drag_strokes(3, amp=0.006 * 1.2, w=0.0065)
    g.wobble(0.0014); g.side_seams(zmin=0.74); g.armhole_seams(0.05)
    g.hem(hem, 0.01, roll=0.0015, band=0.008)
    cuff = g.band(sl, 0.065, raise_=0.002)
    # tapetas delanteras con botones y ojales
    m = (g.y < 0)
    g.band(fr, 0.032, raise_=0.0018)
    for zb in np.arange(0.80, 1.43, 0.087):
        g.bump_xz(gap / 2 + 0.016, zb, 0.0065, 0.0028)
        g.line_groove((-gap / 2 - 0.022, zb), (-gap / 2 - 0.009, zb), depth=0.0012, width=0.0012)
    g.groove(g.z - 1.37, mask=(g.y > 0) * g._not_arm() * (np.abs(g.x) < 0.17))   # canesú
    g.groove(g.x - 0.0, mask=(g.y > 0) * (g.z < 1.37) * 0)                      # sin pliegue central
    for sd in (1, -1):   # botón del puño
        u, a, w = g.arm(sd)
        bpos = np.exp(-((u - (L - 0.035)) / 0.0055) ** 2) * np.exp(-((np.angle(np.exp(1j * (a - 2.4))) * 0.05) / 0.006) ** 2)
        g.o += 0.003 * bpos * (w > 0.5)
    return [g.layer()] + _collar(P, gap)

# ======================================================================== PARTE INFERIOR
def _lower(P, ease, leg_ease, leg_drape, th=0.005):
    b = Body(ease=ease, leg_ease=leg_ease, leg_drape=leg_drape)
    return Gar(P, b, 'lower', th=th)

def waist(g, z=1.015, slope=0.012):
    return g.cut_above(z + slope * np.sin(g.theta))

def belt_loops(g, n=7, z0=0.975, z1=1.012):
    for k in range(n):
        ph = -np.pi / 2 + (k - (n - 1) / 2) * (2 * np.pi / n) * 0.95 + np.pi * (k >= n)
        ang = np.angle(np.exp(1j * (g.theta - ph)))
        m = sstep(z0 - 0.004, z0, g.z) * sstep(z1 + 0.004, z1, g.z)
        g.o += 0.0035 * sstep(0.0075, 0.0045, np.abs(ang) * 0.18) * m
        g.th += 0.002 * sstep(0.0075, 0.0045, np.abs(ang) * 0.18) * m

def fly(g, w=0.035, z_top=1.0, z_bot=0.86):
    m = (g.y < 0)
    d = np.where(g.z > z_bot + w, np.abs(g.x - w), np.sqrt((g.x - 0.0) ** 2 + (g.z - (z_bot + w)) ** 2) - w)
    d = np.where((g.z > z_bot + w), np.abs(g.x - w), np.where(g.x > 0, np.abs(np.sqrt(g.x ** 2 + (g.z - z_bot - w) ** 2) - w), 1))
    g.groove(d, depth=0.0011, mask=m * (g.z < z_top))
    g.groove(g.x, depth=0.0014, mask=m * (g.z < z_top) * (g.z > z_bot - 0.01))

def inseam_outseam(g):
    for sd in (1, -1):
        u, a, w = g.leg(sd)
        out = np.angle(np.exp(1j * (a - sd * np.pi / 2)))
        inn = np.angle(np.exp(1j * (a + sd * np.pi / 2)))
        m = (g.x * sd > 0) * (u > 0.02)
        g.groove(out * 0.07, mask=m); g.groove(inn * 0.06, mask=m * (u > 0.08))

def _pouch(g, zc, h):
    g.o += h * np.exp(-((g.x / 0.05) ** 2 + ((g.z - zc) / 0.06) ** 2)) * sstep(0.02, -0.04, g.y)

def mallas_cortas(P):
    g = _lower(P, 0.003, 0.004, 0.0, 0.0042)
    L = 0.30; wz = waist(g, 1.0, 0.012); lg = g.cut_leg(L)
    g.leg_strokes(5, 0.05, L - 0.03, amp=0.0018, w=0.008); g.wobble(0.0007)
    g.band(wz, 0.05, raise_=0.0018); g.hem(lg, 0.018, roll=0.0016)
    inseam_outseam(g)
    g.groove(sd_poly(g.x, g.z, [(-0.055, 0.95), (0.055, 0.95), (0.05, 0.80), (-0.05, 0.80)]), mask=(g.y < 0))
    return [g.layer()]

def slip(P):
    g = _lower(P, 0.002, 0.003, 0.0, 0.004)
    top = waist(g, 0.975, 0.006)
    xl = np.abs(g.x)
    zleg = 0.775 + 0.85 * np.maximum(0, xl - 0.035) - 0.035 * sstep(-0.02, 0.06, g.y) * sstep(0.03, 0.12, xl)
    legd = g.z - zleg; g.keep(-legd)
    _pouch(g, 0.845, 0.010)
    g.wobble(0.0006)
    g.ribbed(top, 0.03, g.theta, 70, 0.0008, 0.002)
    g.band(legd, 0.007, raise_=0.0015)
    return [g.layer()]

def boxer_corto(P):
    g = _lower(P, 0.003, 0.004, 0.0, 0.0042)
    L = 0.10; wz = waist(g, 0.98, 0.006); lg = g.cut_leg(L)
    _pouch(g, 0.855, 0.010); g.wobble(0.0006); g.leg_strokes(3, 0.0, L, amp=0.0012, w=0.008)
    g.ribbed(wz, 0.04, g.theta, 70, 0.0008, 0.002); g.band(lg, 0.012, raise_=0.0012)
    g.groove(sd_poly(g.x, g.z, [(-0.065, 0.94), (0.065, 0.94), (0.06, 0.80), (-0.06, 0.80)]), mask=(g.y < 0))
    inseam_outseam(g)
    return [g.layer()]

def boxer_largo(P):
    g = _lower(P, 0.004, 0.005, 0.0, 0.0044)
    L = 0.17; wz = waist(g, 0.985, 0.006); lg = g.cut_leg(L)
    _pouch(g, 0.855, 0.010); g.wobble(0.0007); g.leg_strokes(5, 0.05, L - 0.03, amp=0.0018, w=0.008)
    g.band(wz, 0.042, raise_=0.002); g.hem(lg, 0.014)
    g.groove(sd_poly(g.x, g.z, [(-0.065, 0.945), (0.065, 0.945), (0.06, 0.79), (-0.06, 0.79)]), mask=(g.y < 0))
    inseam_outseam(g)
    for sd in (1, -1):   # panel lateral
        u, a, w = g.leg(sd)
        g.groove(np.angle(np.exp(1j * (a - sd * np.pi / 2 - sd * 0.5))) * 0.07, mask=(g.x * sd > 0) * (g.z < 0.93))
    return [g.layer()]

def _jogger(P, cargo=False):
    g = _lower(P, 0.02, 0.03, 0.55, 0.0055)
    L = 0.79; fit = Body(ease=0.01, leg_ease=0.006, leg_drape=0.0).lower(P)
    leg_cuff_blend(g, L, 0.07 if not cargo else 0.05, fit, extra=0.04)
    g.blend(Body(ease=0.006, leg_ease=0.02).lower(P), sstep(0.965, 0.985, g.z))
    wz = waist(g, 1.02, 0.01); lg = g.cut_leg(L)
    g.leg_strokes(7, 0.15, L - 0.15, amp=0.008, w=0.009, knee_n=3, dense_at=L - (0.07 if not cargo else 0.05), dense_n=7, dense_len=0.15)
    g.wobble(0.0016)
    g.gather(sstep(0.965, 0.975, g.z), 0.0028, n=14, fz=4)
    g.band(wz, 0.05, raise_=0.002)
    if cargo: g.band(lg, 0.05, raise_=0.002)
    else: g.ribbed(lg, 0.07, leg_ang(g), 22, 0.001, 0.002)
    inseam_outseam(g)
    for sx in (1, -1):   # bolsillos delanteros sesgados
        g.line_groove((sx * 0.11, 0.965), (sx * 0.165, 0.85), depth=0.0018, width=0.0024)
    # rodillas articuladas
    for sd in (1, -1):
        u, a, w = g.leg(sd)
        fm = (g.x * sd > 0) * (np.cos(a) < 0.2)
        g.groove(u - 0.31, mask=fm); g.groove(u - 0.43, mask=fm)
        g.o += 0.003 * sstep(0.31, 0.33, u) * sstep(0.43, 0.41, u) * fm * (0.5 + 0.5 * noise(g.P, 9, 77))
    # bolsillo de muslo
    g.patch_limb('leg', (1, -1), 0.24 if cargo else 0.20, 0.15, 0.15, 0.17 if cargo else 0.14, 0.012, lift=0.005 if cargo else 0.0035, puff=0.005 if cargo else 0.003)
    if cargo:
        g.patch_limb('leg', (1, -1), 0.17, 0.15, 0.158, 0.05, 0.01, lift=0.010, puff=0.001)
    return g

def jogger_cargo(P):
    body = lambda Q: [_jogger(Q, False).layer()]
    sdf_body = lambda Q: _jogger(Q, False).sdf()
    if 'jog_cords' not in _cache:
        pts = []
        for sd in (1, -1):
            x0 = sd * 0.018; y0 = find_surface_y(sdf_body, x0, 0.995) or -0.13
            pts.append([(x0, y0 + 0.002, 0.995), (sd * 0.024, y0 - 0.008, 0.95), (sd * 0.028, y0 - 0.010, 0.89), (sd * 0.03, y0 - 0.010, 0.86)])
        _cache['jog_cords'] = pts
    out = body(P)
    for pts in _cache['jog_cords']:
        d = capsule_pts(P, pts, 0.0042)
        d = np.minimum(d, capsule_pts(P, [pts[-1], np.asarray(pts[-1]) + [0, 0, -0.03]], 0.0055))
        out.append(('solid', d, _bbox(pts, -0.035)))
    return out

def pantalon_cargo(P):
    g = _jogger(P, True)
    belt_loops(g, 7, 0.972, 1.012)
    fly(g)
    return [g.layer()]

def pantalon_slim(P):
    g = _lower(P, 0.013, 0.014, 0.22, 0.005)
    L = 0.77; wz = waist(g, 1.01, 0.012); lg = g.cut_leg(L)
    g.leg_strokes(7, 0.15, L - 0.15, amp=0.005, w=0.009, knee_n=3, dense_at=L - 0, dense_n=7, dense_len=0.15)
    g.wobble(0.0012)
    g.band(wz, 0.038, raise_=0.0018); g.hem(lg, 0.02)
    belt_loops(g, 7, 0.974, 1.008); fly(g, 0.032, 0.97, 0.87); inseam_outseam(g)
    for sx in (1, -1):
        g.line_groove((sx * 0.10, 0.972), (sx * 0.155, 0.9), depth=0.0016, width=0.0022)
    g.patch_limb('leg', (1,), 0.24, 0.1, 0.12, 0.15, 0.01, lift=0.0035, puff=0.003)
    g.patch_limb('leg', (1,), 0.16, 0.1, 0.13, 0.04, 0.008, lift=0.008, puff=0.0)
    for sd in (1, -1):   # costuras de rodilla
        u, a, w = g.leg(sd)
        g.groove(u - 0.40, mask=(g.x * sd > 0) * (np.cos(a) < 0.0))
    return [g.layer()]

def bermuda_cargo(P):
    g = _lower(P, 0.026, 0.034, 0.85, 0.0055)
    L = 0.45; wz = waist(g, 1.015, 0.012); lg = g.cut_leg(L)
    g.leg_strokes(5, 0.05, L - 0.03, amp=0.009, w=0.008); g.wobble(0.0018)
    g.band(wz, 0.04, raise_=0.002); g.hem(lg, 0.025, roll=0.002)
    belt_loops(g, 7, 0.975, 1.01); fly(g); inseam_outseam(g)
    for sx in (1, -1): g.line_groove((sx * 0.105, 0.975), (sx * 0.16, 0.87), depth=0.0018, width=0.0024)
    g.patch_limb('leg', (1, -1), 0.27, 0.12, 0.16, 0.17, 0.012, lift=0.006, puff=0.006)
    g.patch_limb('leg', (1, -1), 0.20, 0.12, 0.168, 0.05, 0.01, lift=0.011, puff=0.001)
    for sd in (1, -1):
        u, a, w = g.leg(sd)
        bp = np.exp(-((u - 0.205) / 0.006) ** 2) * np.exp(-((np.angle(np.exp(1j * (a - sd * np.pi / 2 - sd * 0.12))) * 0.09) / 0.006) ** 2)
        g.o += 0.004 * bp * (g.x * sd > 0)
    return [g.layer()]

# ======================================================================== GORRA
def crown_d(P, e=0.0):
    c = np.array([0, 0.012, 1.632], F32); r = np.array([0.097 + e, 0.110 + e, 0.122 + e], F32)
    Q = (P - c) / r
    Q[:, 1] += 0.10 * np.clip((P[:, 2] - 1.66) / 0.1, 0, 1) * (P[:, 1] < 0.0)   # frontal estructurado
    return ((np.linalg.norm(Q, axis=1) - 1) * r.min()).astype(F32)

def gorra(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    g = Gar(P, Body(), crown_d, th=0.0045)
    zc = 1.638 + 0.022 * sstep(0.0, 0.10, y)
    g.keep(zc - g.z); dist_edge = g.z - zc
    th = g.theta
    for k in range(6):
        ph = -np.pi / 2 + k * np.pi / 3
        g.groove(np.angle(np.exp(1j * (th - ph))) * 0.09, depth=0.0014, width=0.0024, mask=sstep(1.645, 1.665, g.z))
        g.groove(np.angle(np.exp(1j * (th - ph))) * 0.09 - 0.006, depth=0.0006, width=0.0014, mask=sstep(1.645, 1.665, g.z))
        ce = ph + np.pi / 6
        ex = np.array([0.0, 0.012, 1.632]) + np.array([np.cos(ce) * 0.077, np.sin(ce) * 0.088, 0.075])
        g.o -= 0.0022 * np.clip(1 - (np.linalg.norm(g.P - ex.astype(F32), axis=1) / 0.0055) ** 2, 0, 1)
    g.bump(np.array([0, 0.012, 1.754], F32), 0.011, 0.005)
    g.band(dist_edge, 0.014, raise_=0.0012); g.wobble(0.0006)
    # visera curva
    qy = (y + 0.112) / 0.088; qx = x / 0.102
    reg = np.maximum((np.sqrt(qx ** 2 + qy ** 2) - 1) * 0.088, y + 0.085)
    zb = 1.642 - 0.03 * (x / 0.10) ** 2 - 0.010 * np.clip(-(y + 0.09) / 0.1, 0, 1)
    edge = -reg
    gr = sum(0.0008 * np.exp(-((edge - e0) / 0.0016) ** 2) for e0 in (0.007, 0.0135, 0.020, 0.0265))
    fb = ((z - zb) * 0.97 + gr).astype(F32)
    return [g.layer(), ('shell', fb, reg.astype(F32), np.full(len(P), 0.0062, F32))]

CATALOG = [
    ('01_camiseta', 'Camiseta', camiseta, UP),
    ('02_camiseta_manga_larga', 'Camiseta manga larga', camiseta_manga_larga, UP),
    ('03_camiseta_larga', 'Camiseta larga', camiseta_larga, UP),
    ('04_camiseta_sin_mangas', 'Camiseta sin mangas', camiseta_sin_mangas, ((-0.30, -0.22, 0.70), (0.30, 0.22, 1.56))),
    ('05_sudadera_capucha', 'Sudadera con capucha y media cremallera', sudadera_capucha, UPH),
    ('06_anorak', 'Anorak', anorak, ((-0.63, -0.26, 0.66), (0.63, 0.25, 1.62))),
    ('07_chaqueta_capucha', 'Chaqueta con capucha', chaqueta_capucha, UPH),
    ('08_bomber', 'Bomber', bomber, ((-0.64, -0.26, 0.70), (0.64, 0.26, 1.58))),
    ('09_camisa', 'Camisa', camisa, UP),
    ('10_mallas_cortas', 'Mallas cortas', mallas_cortas, ((-0.26, -0.18, 0.46), (0.26, 0.18, 1.05))),
    ('11_slip', 'Slip', slip, ((-0.24, -0.18, 0.70), (0.24, 0.18, 1.02))),
    ('12_boxer_corto', 'Bóxer corto', boxer_corto, ((-0.25, -0.18, 0.66), (0.25, 0.18, 1.03))),
    ('13_boxer_largo', 'Bóxer largo', boxer_largo, ((-0.25, -0.18, 0.58), (0.25, 0.18, 1.03))),
    ('14_jogger', 'Jogger', jogger_cargo, LOW),
    ('15_pantalon_cargo', 'Pantalón cargo', pantalon_cargo, LOW),
    ('16_pantalon_slim', 'Pantalón slim', pantalon_slim, LOW),
    ('17_bermuda_cargo', 'Bermuda cargo', bermuda_cargo, ((-0.30, -0.22, 0.32), (0.30, 0.22, 1.07))),
    ('18_gorra', 'Gorra', gorra, ((-0.13, -0.215, 1.585), (0.13, 0.14, 1.78))),
]
