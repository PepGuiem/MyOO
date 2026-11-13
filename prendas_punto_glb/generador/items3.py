"""Segunda referencia: 10 prendas de punto (sudaderas, camisetas, polo, tirantes)."""
from kit import *
from items2 import cuff_blend, arm_ang, hood_cut, _collar

ARM = 32.0
UP = ((-0.50, -0.24, 0.62), (0.50, 0.24, 1.62))
UPH = ((-0.50, -0.25, 0.62), (0.50, 0.27, 1.84))

def B(**kw):
    kw.setdefault('arm_deg', ARM); return Body(**kw)

def fit_base(P, e=0.010, ae=0.005):
    return B(ease=e, arm_ease=ae).upper(P)

def hem_band_blend(g, P, z_top, e=0.012, k=0.85):
    g.blend(fit_base(P, e, 0.006), sstep(z_top + 0.03, z_top - 0.01, g.z) * g._not_arm() * k)

def soft_folds(g, L, amp_s=0.006, amp_t=0.007, dense=True, cuff_w=0.06, seed=0):
    if L > 0.35 and dense:
        g.sleeve_strokes(7, 0.05, L - 0.09, amp=amp_s, w=0.009, seed=1 + seed, dense_at=L - cuff_w, dense_n=5, dense_len=0.11)
    else:
        g.sleeve_strokes(4, 0.04, max(0.06, L - 0.02), amp=amp_s * 0.8, w=0.009, seed=1 + seed)
    g.drape_strokes(8, 1.20, 0.80, amp=amp_t, w=0.013, seed=5 + seed)
    g.drag_strokes(3, amp=amp_t * 0.8, w=0.007, seed=9 + seed)
    g.wobble(0.0011)

def v_neck(g, depth_z=1.37, slope=1.45, a=0.088, b=0.084):
    """Escote en V: óvalo detrás + V delante. Devuelve distancia hacia dentro."""
    neck = g.cut_neck(a=a, b=b, z_back=1.475, z_front=1.44)
    zv = depth_z + slope * np.abs(g.x)
    front = sstep(-0.02, -0.05, g.y)
    dv = (zv - g.z) / math.sqrt(1 + slope * slope)          # >0 dentro de la prenda
    g.keep(np.where(front > 0.5, -dv, -1.0))
    return np.where(front > 0.5, np.minimum(neck, dv), neck)

def tank_armhole(g, cx=0.215, cz=1.37, ax=0.088, az=0.155):
    """Sisa profunda de camiseta de tirantes (elipse en el plano |x|-z)."""
    ax_ = np.abs(g.x)
    q = np.sqrt(((ax_ - cx) / ax) ** 2 + ((g.z - cz) / az) ** 2)
    inside = (q - 1) * min(ax, az)                       # <0 dentro del hueco
    outer = np.where((ax_ > cx) & (g.z > cz), -(ax_ - cx), 1.0)
    d = np.minimum(inside, outer)
    g.keep(-d); return d

def polo_collar(P, gap=0.036, e=0.006):
    """Cuello de polo: pie bajo + caída que descansa sobre los hombros, abierto sobre la tapeta."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    th = np.full(len(P), 0.0042, F32)
    f1 = round_cone(P, [0, 0.008, 1.38], [0, 0.012, 1.62], 0.083 + e * 0.4, 0.080 + e * 0.4)
    R1 = smax(1.448 - z, z - 1.488, 0.003)
    R1 = smax(R1, np.where(y < 0, gap / 2 - np.abs(x), -1.0), 0.004)
    f2 = round_cone(P, [0, 0.008, 1.494], [0, 0.0, 1.40], 0.090 + e, 0.150 + e)
    fy = sstep(0.0, -0.07, y) * sstep(gap / 2, gap / 2 + 0.03, np.abs(x)) * sstep(0.10, 0.05, np.abs(x))
    zlow = 1.448 - 0.055 * fy
    R2 = smax(zlow - z, z - 1.495, 0.003)
    R2 = smax(R2, np.where(y < 0, gap / 2 + 0.002 - np.abs(x), -1.0), 0.004)
    return [('shell', f1, R1.astype(F32), th), ('shell', f2, R2.astype(F32), th)]

# ======================================================================== prendas
def sudadera(P):
    b = B(ease=0.030, drape=0.85, drape_from=1.30, arm_ease=0.032, arm_drape=0.5)
    g = Gar(P, b, 'upper', th=0.006)
    L = 0.58
    cuff_blend(g, L, 0.065, fit_base(P, 0.012, 0.006)); hem_band_blend(g, P, 0.80)
    hem = g.cut_below(0.735, wave=0.002); sl = g.cut_sleeve(L); neck = g.cut_neck(a=0.108, b=0.104, z_back=1.48, z_front=1.445)
    soft_folds(g, L, 0.008, 0.009, cuff_w=0.065)
    g.hem_blouse(0.80, 0.88, 8, amp=0.004)
    g.side_seams(zmin=0.80); g.armhole_seams(0.06)
    g.ribbed(hem, 0.065, g.theta, 70, 0.001, 0.0022); g.ribbed(sl, 0.065, arm_ang(g), 22, 0.001, 0.0018)
    g.ribbed(neck, 0.022, g.theta, 60, 0.0007, 0.002)
    return [g.layer()]

def manga_larga_bolsillo(P):
    b = B(ease=0.020, drape=0.65, drape_from=1.30, arm_ease=0.022, arm_drape=0.45)
    g = Gar(P, b, 'upper', th=0.0048)
    L = 0.585
    cuff_blend(g, L, 0.05, fit_base(P, 0.01, 0.006))
    hem = g.cut_below(0.755, wave=0.003); sl = g.cut_sleeve(L); neck = g.cut_neck(a=0.088, b=0.085, z_front=1.445)
    soft_folds(g, L, 0.007, 0.008, cuff_w=0.05, seed=3)
    g.side_seams(); g.armhole_seams(0.05)
    g.hem(hem, 0.022, roll=0.0018); g.ribbed(sl, 0.05, arm_ang(g), 22, 0.0009, 0.0016); g.band(neck, 0.018)
    g.patch_xz(rrect(0.078, 1.285, 0.10, 0.115, 0.006), lift=0.0022, puff=0.0012)     # bolsillo de pecho
    g.line_groove((0.028, 1.336), (0.128, 1.336), depth=0.0007, width=0.0014)         # vuelta del bolsillo
    return [g.layer()]

def sudadera_capucha(P):
    b = B(ease=0.032, drape=0.9, drape_from=1.30, arm_ease=0.034, arm_drape=0.5)
    base = smin(b.upper(P), head_d(P, 0.040, back=0.022, peak=0.25), 0.07)
    g = Gar(P, b, lambda Q: base, th=0.006)
    L = 0.58
    cuff_blend(g, L, 0.065, fit_base(P, 0.012, 0.006)); hem_band_blend(g, P, 0.80)
    hem = g.cut_below(0.735, wave=0.002); sl = g.cut_sleeve(L); face = hood_cut(g); g.cut_above(1.83)
    soft_folds(g, L, 0.009, 0.010, cuff_w=0.065, seed=7)
    g.hem_blouse(0.80, 0.89, 8, amp=0.0045)
    g.side_seams(zmin=0.8); g.armhole_seams(0.06)
    g.ribbed(hem, 0.065, g.theta, 70, 0.001, 0.0022); g.ribbed(sl, 0.065, arm_ang(g), 22, 0.001, 0.0018)
    g.band(face, 0.02, raise_=0.002)
    g.groove(g.x, mask=(g.z > 1.55) * (g.y > -0.02))
    # cruce de la capucha en el escote
    g.line_groove((-0.06, 1.47), (0.03, 1.425), depth=0.0016, width=0.0026)
    pk = lambda x, z: sd_poly(x, z, [(-0.15, 0.80), (0.15, 0.80), (0.11, 0.99), (-0.11, 0.99)])
    g.patch_xz(pk, lift=0.004, puff=0.003)
    return [g.layer()]

def manga_larga_raglan(P):
    b = B(ease=0.014, drape=0.5, drape_from=1.30, arm_ease=0.018, arm_drape=0.4)
    g = Gar(P, b, 'upper', th=0.0046)
    L = 0.585
    cuff_blend(g, L, 0.06, fit_base(P, 0.008, 0.004))
    hem = g.cut_below(0.765, wave=0.002); sl = g.cut_sleeve(L); neck = g.cut_neck(a=0.088, b=0.085, z_front=1.445)
    soft_folds(g, L, 0.006, 0.006, cuff_w=0.06, seed=11)
    g.side_seams()
    for front in (True, False):                             # costuras raglán
        for sx in (1, -1):
            g.line_groove((sx * 0.07, 1.475), (sx * 0.175, 1.29), front=front, depth=0.0013, width=0.0026)
    g.hem(hem, 0.022, roll=0.0018); g.ribbed(sl, 0.06, arm_ang(g), 22, 0.0009, 0.0016); g.band(neck, 0.018)
    return [g.layer()]

def cuello_alto(P):
    b = B(ease=0.014, drape=0.45, drape_from=1.30, arm_ease=0.018, arm_drape=0.35)
    neck_tube = round_cone(P, [0, 0.010, 1.40], [0, 0.014, 1.64], 0.074, 0.070)
    base = smin(b.upper(P), neck_tube, 0.035)
    g = Gar(P, b, lambda Q: base, th=0.0052)
    L = 0.59
    cuff_blend(g, L, 0.07, fit_base(P, 0.008, 0.004)); hem_band_blend(g, P, 0.82, 0.010, 0.9)
    hem = g.cut_below(0.755, wave=0.002); sl = g.cut_sleeve(L)
    top = g.cut_above(1.605 + 0.006 * np.sin(g.theta))
    soft_folds(g, L, 0.007, 0.007, cuff_w=0.07, seed=13)
    # cuello: arrugas horizontales y vuelta
    neckm = sstep(1.46, 1.49, g.z)
    g.hem_blouse(1.48, 1.585, 9, amp=0.006, w=0.008, seed=17)
    g.o += 0.0035 * sstep(1.545, 1.555, g.z) * neckm                    # doblez del cuello vuelto
    g.groove(g.z - 1.55, depth=0.0018, width=0.0025, mask=neckm)
    g.groove(g.z - 1.475, depth=0.0012, mask=(np.abs(g.x) < 0.11))     # unión cuello-cuerpo
    g.side_seams(); g.armhole_seams(0.05)
    g.ribbed(hem, 0.07, g.theta, 70, 0.0009, 0.002); g.ribbed(sl, 0.07, arm_ang(g), 22, 0.0009, 0.0016)
    g.hem(top, 0.012, roll=0.0018, band=0.01)
    return [g.layer()]

def camiseta(P):
    b = B(ease=0.016, drape=0.6, drape_from=1.30, arm_ease=0.022, arm_drape=0.55)
    g = Gar(P, b, 'upper', th=0.0048)
    hem = g.cut_below(0.77, wave=0.003); neck = g.cut_neck(a=0.09, b=0.088, z_front=1.44); sl = g.cut_sleeve(0.20)
    soft_folds(g, 0.20, 0.006, 0.007, seed=19)
    g.side_seams(); g.armhole_seams(0.05)
    g.hem(hem, 0.022, roll=0.0018); g.hem(sl, 0.022); g.band(neck, 0.018)
    return [g.layer()]

def polo(P):
    b = B(ease=0.018, drape=0.65, drape_from=1.30, arm_ease=0.024, arm_drape=0.55)
    g = Gar(P, b, 'upper', th=0.005)
    L = 0.20
    hem = g.cut_below(0.765, wave=0.002, curve=lambda s: 0.02 * (s.y > 0.04) * sstep(0.14, 0.05, np.abs(s.x)))
    sl = g.cut_sleeve(L); neck = g.cut_neck(a=0.084, b=0.082, z_back=1.46, z_front=1.44)
    soft_folds(g, L, 0.006, 0.007, seed=23)
    g.side_seams(); g.armhole_seams(0.05)
    g.hem(hem, 0.022, roll=0.0018); g.ribbed(sl, 0.028, arm_ang(g), 22, 0.0008, 0.0018)
    # tapeta con tres botones
    pl = rrect(0.0, 1.385, 0.034, 0.12, 0.004)
    g.patch_xz(pl, lift=0.0016, puff=0.0)
    g.groove(np.abs(g.x), depth=0.0012, width=0.0016, mask=(g.y < 0) * (g.z > 1.33) * (g.z < 1.445))
    for zb in (1.355, 1.395, 1.432): g.bump_xz(0.0, zb, 0.0062, 0.0028)
    return [g.layer()] + polo_collar(P, 0.036)

def camiseta_oversize(P):
    b = B(ease=0.03, drape=0.85, drape_from=1.32, arm_ease=0.034, arm_drape=0.7)
    g = Gar(P, b, 'upper', th=0.005)
    L = 0.25
    hem = g.cut_below(0.74, wave=0.003); neck = g.cut_neck(a=0.108, b=0.104, z_back=1.48, z_front=1.445); sl = g.cut_sleeve(L)
    soft_folds(g, L, 0.007, 0.010, seed=29)
    g.side_seams(); g.armhole_seams(0.075)        # hombro caído
    g.hem(hem, 0.025, roll=0.002); g.hem(sl, 0.028); g.ribbed(neck, 0.022, g.theta, 60, 0.0006, 0.002)
    return [g.layer()]

def camiseta_cuello_v(P):
    b = B(ease=0.016, drape=0.6, drape_from=1.30, arm_ease=0.022, arm_drape=0.55)
    g = Gar(P, b, 'upper', th=0.0048)
    hem = g.cut_below(0.765, wave=0.003); sl = g.cut_sleeve(0.20)
    neck = v_neck(g)
    soft_folds(g, 0.20, 0.006, 0.007, seed=31)
    g.side_seams(); g.armhole_seams(0.05)
    g.hem(hem, 0.022, roll=0.0018); g.hem(sl, 0.022); g.band(neck, 0.017)
    g.groove(np.abs(g.x) * 3, depth=0.0009, width=0.002, mask=(g.y < 0) * (g.z < 1.37) * (g.z > 1.33))  # costura de la V
    return [g.layer()]

def tirantes(P):
    b = B(ease=0.016, drape=0.75, drape_from=1.30, arm_ease=0.01)
    g = Gar(P, b, lambda Q: smin(b.torso(Q), b.neck_d(Q), 0.03), th=0.0045)
    hem = g.cut_below(0.74, wave=0.003)
    neck = g.cut_neck(a=0.105, b=0.10, z_back=1.46, z_front=1.37)
    ah = tank_armhole(g)
    g.drape_strokes(8, 1.18, 0.76, amp=0.008, w=0.013, seed=37); g.wobble(0.0011)
    g.side_seams(zmin=0.0, xmin=0.12)
    g.hem(hem, 0.022, roll=0.0018); g.band(ah, 0.014); g.band(neck, 0.016)
    return [g.layer()]

CATALOG = [
    ('01_sudadera_cuello_redondo', 'Sudadera cuello redondo', sudadera, UP),
    ('02_camiseta_manga_larga_bolsillo', 'Camiseta manga larga con bolsillo', manga_larga_bolsillo, UP),
    ('03_sudadera_capucha', 'Sudadera con capucha', sudadera_capucha, UPH),
    ('04_camiseta_manga_larga_raglan', 'Camiseta manga larga raglán', manga_larga_raglan, UP),
    ('05_jersey_cuello_alto', 'Jersey de cuello alto', cuello_alto, ((-0.50, -0.24, 0.62), (0.50, 0.24, 1.64))),
    ('06_camiseta', 'Camiseta', camiseta, ((-0.38, -0.22, 0.70), (0.38, 0.22, 1.58))),
    ('07_polo', 'Polo', polo, ((-0.38, -0.22, 0.70), (0.38, 0.22, 1.58))),
    ('08_camiseta_oversize', 'Camiseta oversize', camiseta_oversize, ((-0.40, -0.24, 0.68), (0.40, 0.24, 1.58))),
    ('09_camiseta_cuello_v', 'Camiseta cuello en V', camiseta_cuello_v, ((-0.38, -0.22, 0.70), (0.38, 0.22, 1.58))),
    ('10_camiseta_tirantes', 'Camiseta de tirantes', tirantes, ((-0.28, -0.22, 0.68), (0.28, 0.22, 1.56))),
]
