"""Tercera referencia: colección «casual» (camisas, sobrecamisa, parka, chándal, bufanda, vaquero).

Mismo cuerpo de referencia y brazos a 32° que la colección de punto. Cada componente lleva
su papel (role) al final de la tupla: 'body' (la tela, teñible), 'button', 'trim', 'zipper',
'hardware'... La web colorea cada papel por separado (personalización).
"""
from kit import *
from items2 import cuff_blend, leg_cuff_blend, arm_ang, leg_ang, _bbox, belt_loops, fly, inseam_outseam, waist
from items3 import B, fit_base, hem_band_blend, soft_folds

ARM = 32.0
_cache = {}

# ======================================================================== especificaciones
# Cada prenda devuelve una lista de componentes "perezosos": solo se evalúa el que se extrae.
def SHELL(fn, role='body'):
    """fn(P) -> ('shell', f, R, th)"""
    return dict(kind='shell', role=role, fn=fn)

def SOLID(fn, bbox, role, h=0.0011):
    return dict(kind='solid', role=role, fn=fn, bbox=(np.asarray(bbox[0], F32), np.asarray(bbox[1], F32)), h=h)

def lazy_solid(fn, bbox):
    """Evalúa fn solo dentro de la caja (fuera devuelve una distancia grande)."""
    lo, hi = np.asarray(bbox[0], F32), np.asarray(bbox[1], F32)
    def f(P):
        m = np.all((P >= lo) & (P <= hi), axis=1)
        out = np.full(len(P), 0.05, F32)
        if m.any(): out[m] = fn(P[m])
        return out
    return f

def button_specs(pts, role='button', r=0.0058, t=0.0024, lift=0.0006, kind='disc'):
    out = []
    for p, n in pts:
        c = p + n * (t / 2 + lift) if kind == 'disc' else p
        if kind == 'disc':
            fn = (lambda c, n: lambda Q: disc_d(Q, c, n, r, t))(c, n)
        else:
            fn = (lambda c, n: lambda Q: stud_d(Q, c, n, r, t))(c, n)
        pad = r + 0.006
        out.append(SOLID(fn, (c - pad, c + pad), role, h=0.0007))
    return out

# ======================================================================== utilidades
def unit(v):
    v = np.asarray(v, F32); return v / max(1e-9, float(np.linalg.norm(v)))

def surf_ray(fn, origin, direction, span=0.30, n=1600):
    """Primer punto de la superficie al avanzar desde fuera (origin + dir·span) hacia origin."""
    d = unit(direction); o = np.asarray(origin, F32)
    ts = np.linspace(span, 0, n).astype(F32)
    P = (o[None, :] + ts[:, None] * d[None, :]).astype(F32)
    idx = np.where(fn(P) < 0)[0]
    if len(idx) == 0: return None
    return P[idx[0]].copy()

def sdf_normal(fn, p, h=0.0008):
    p = np.asarray(p, F32)[None, :]
    g = np.zeros(3, F32)
    for k in range(3):
        o = np.zeros(3, F32); o[k] = h
        g[k] = float(fn(p + o)[0] - fn(p - o)[0])
    return unit(g)

def disc_d(P, c, n, r, t, rr=0.0009):
    """Botón: disco redondeado de radio r y grosor t con eje n (y cuatro agujeros)."""
    c = np.asarray(c, F32); n = unit(n)
    q = P - c; a = q @ n; rad = np.linalg.norm(q - np.outer(a, n), axis=1)
    dx = rad - (r - rr); dy = np.abs(a) - (t / 2 - rr)
    d = np.sqrt(np.maximum(dx, 0) ** 2 + np.maximum(dy, 0) ** 2) + np.minimum(np.maximum(dx, dy), 0) - rr
    # borde algo levantado y centro hundido (botón de camisa)
    d = d + 0.0006 * sstep(r * 0.75, 0.0, rad) * (a > 0)
    e1, e2 = frame(n)
    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        hc = c + (e1 * sx + e2 * sy) * (r * 0.28)
        qh = P - hc; ah = qh @ n; rh = np.linalg.norm(qh - np.outer(ah, n), axis=1)
        d = np.maximum(d, -(rh - r * 0.11))
    return d.astype(F32)

def stud_d(P, c, n, r, t):
    """Remache o broche: casquete redondeado."""
    c = np.asarray(c, F32); n = unit(n)
    q = P - c; a = q @ n; rad = np.linalg.norm(q - np.outer(a, n), axis=1)
    dome = np.sqrt(rad ** 2 + (np.maximum(a, 0) * (r / max(t, 1e-4))) ** 2) - r
    return np.maximum(dome, -a - 0.0008).astype(F32)

def solids_bbox(pts, pad=0.014):
    p = np.asarray(pts, F32); return (p.min(0) - pad, p.max(0) + pad)

def placed(key, fn_sdf, specs):
    """Calcula (una vez) puntos sobre la superficie de la prenda. specs: lista de (origen, dirección)."""
    if key not in _cache:
        out = []
        for o, d in specs:
            p = surf_ray(fn_sdf, o, d)
            if p is None: continue
            out.append((p, sdf_normal(fn_sdf, p)))
        _cache[key] = out
    return _cache[key]

def buttons_solid(pts, r=0.0058, t=0.0024, lift=0.0006):
    def f(P):
        d = np.full(len(P), 1.0, F32)
        for p, n in pts:
            d = np.minimum(d, disc_d(P, p + n * (t / 2 + lift), n, r, t))
        return d
    return f

def studs_solid(pts, r=0.0045, t=0.0028):
    def f(P):
        d = np.full(len(P), 1.0, F32)
        for p, n in pts:
            d = np.minimum(d, stud_d(P, p, n, r, t))
        return d
    return f

def front_points(xs_zs, front=True, y0=-0.40):
    """Rayos horizontales desde delante (o detrás) hacia el centro, en (x, z)."""
    sgn = -1 if front else 1
    return [((x, 0.0, z), (0, sgn, 0)) for x, z in xs_zs]

def collar(P, gap=0.014, e=0.0, stand=0.036, fall=0.050, spread=1.0, th=0.0042, point=0.034):
    """Cuello camisero (pie + caída) abierto `gap` delante. `e` lo agranda para prendas de abrigo.

    La caída termina delante en dos puntas: el borde delantero baja en diagonal desde el centro
    hasta la punta y el inferior vuelve a subir hacia el lado (antes era una curva suave y el
    cuello parecía redondeado, tipo bebé)."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ax = np.abs(x)
    thv = np.full(len(P), th, F32)
    z0 = 1.452 - e * 0.4
    f1 = round_cone(P, [0, 0.008, 1.38], [0, 0.012, 1.62], 0.083 + e, 0.080 + e)
    R1 = np.maximum(z0 - z, z - (z0 + stand))
    R1 = np.maximum(R1, np.where(y < 0, gap / 2 + 0.004 - ax, -1.0))
    top = z0 + stand + 0.006
    # Caída algo menos abierta: baja casi pegada al pie y se abre solo un poco.
    f2 = round_cone(P, [0, 0.008, top], [0, 0.0, top - 0.11], 0.089 + e, 0.089 + e + 0.034 * spread * (fall / 0.05))
    front = sstep(0.01, -0.05, y)
    x0 = gap / 2 + 0.006                       # el borde delantero arranca arriba, junto al centro
    xt = x0 + 0.040 * spread + e * 0.5         # punta
    zt = top - fall - point * spread           # altura de la punta
    t_in = np.clip((ax - x0) / (xt - x0), 0, 1)
    t_out = np.clip((ax - xt) / (0.030 + e * 0.5), 0, 1)
    z_front = np.where(ax < xt, top - (top - zt) * t_in ** 0.85, zt + (top - fall - zt) * (t_out * (2 - t_out)))
    zlow = front * z_front + (1 - front) * (top - fall)
    R2 = np.maximum(zlow - z, z - top)
    R2 = np.maximum(R2, np.where(y < 0, x0 - ax, -1.0))
    return [('shell', f1, R1.astype(F32), thv, 'body'), ('shell', f2, R2.astype(F32), thv, 'body')]

def flap_pocket(g, cx, cz, w, h, flap_h=0.04, front=True, lift=0.0026, flap_lift=0.006):
    g.patch_xz(rrect(cx, cz, w, h, 0.006), front=front, lift=lift, puff=0.0016)
    g.patch_xz(rrect(cx, cz + h / 2 - flap_h / 2 + 0.006, w + 0.006, flap_h, 0.006), front=front, lift=flap_lift, puff=0.0008)

def shirt_body(P, e=0.020, drape=0.75, ae=0.024, adr=0.5, th=0.004):
    b = B(ease=e, drape=drape, drape_from=1.30, arm_ease=ae, arm_drape=adr)
    return b, Gar(P, b, 'upper', th=th)

def shirt_placket(g, z_lo, z_hi=1.445, w=0.032):
    """Tapeta delantera cerrada: franja algo levantada con su pespunte."""
    m = (g.y < 0) * (g.z > z_lo) * (g.z < z_hi)
    g.o += 0.0013 * sstep(w / 2 + 0.002, w / 2 - 0.002, np.abs(g.x)) * m
    g.groove(g.x + w / 2, depth=0.0011, width=0.0016, mask=m)       # borde de la tapeta (cruza a la izquierda)
    g.groove(g.x - w / 2, depth=0.0008, width=0.0014, mask=m)
    g.groove(g.x + w / 2 - 0.004, depth=0.0005, width=0.001, mask=m)  # pespunte

# ======================================================================== CAMISAS
def _shirt_short(P):
    b, g = shirt_body(P, e=0.024, drape=0.85, ae=0.026, adr=0.45, th=0.0042)
    L = 0.24
    hem = g.cut_below(0.775, wave=0.002, curve=lambda s: 0.035 * np.clip(np.abs(s.x) / 0.21, 0, 1) ** 2.2)
    sl = g.cut_sleeve(L); neck = g.cut_neck(a=0.086, b=0.084, z_back=1.462, z_front=1.44)
    g.sleeve_strokes(5, 0.05, L - 0.03, amp=0.006, w=0.009, seed=41)
    g.drape_strokes(9, 1.20, 0.79, amp=0.009, w=0.013, seed=43); g.drag_strokes(3, amp=0.006, w=0.007, seed=47)
    g.wobble(0.0013)
    g.side_seams(zmin=0.78); g.armhole_seams(0.06)
    g.hem(hem, 0.01, roll=0.0015, band=0.008); g.hem(sl, 0.028, roll=0.0022, band=0.03)   # vuelta de la manga
    g.band(neck, 0.004, raise_=0.001)
    shirt_placket(g, 0.70)
    g.groove(g.z - 1.37, mask=(g.y > 0) * g._not_arm() * (np.abs(g.x) < 0.17))            # canesú
    g.groove(np.abs(g.x), depth=0.0008, width=0.002, mask=(g.y > 0) * (g.z < 1.37) * (g.z > 1.33))  # pliegue central
    for sx in (1, -1):
        flap_pocket(g, sx * 0.085, 1.26, 0.105, 0.125, 0.042)
    return g

def collar_specs(**kw):
    return [SHELL(lambda P: collar(P, **kw)[0][:4]), SHELL(lambda P: collar(P, **kw)[1][:4])]

def camisa_manga_corta():
    sdf = lambda Q: _shirt_short(Q).sdf()
    zs = [0.80 + k * 0.088 for k in range(7)]
    btn = placed('cmc_btn', sdf, front_points([(0.0, z) for z in zs]))
    flap = placed('cmc_flap', sdf, front_points([(sx * 0.085, 1.297) for sx in (1, -1)]))
    return [SHELL(lambda P: _shirt_short(P).layer())] + collar_specs(gap=0.014) + button_specs(btn) + button_specs(flap, r=0.0048)

def _shirt_long(P):
    b, g = shirt_body(P, e=0.018, drape=0.7, ae=0.018, adr=0.25, th=0.004)
    L = 0.60; fit = B(ease=0.012, arm_ease=0.010).upper(P)
    cuff_blend(g, L, 0.065, fit, extra=0.012)
    hem = g.cut_below(0.725, wave=0.002, curve=lambda s: 0.065 * np.clip(np.abs(s.x) / 0.2, 0, 1) ** 2.5)
    sl = g.cut_sleeve(L); neck = g.cut_neck(a=0.084, b=0.082, z_back=1.46, z_front=1.44)
    g.sleeve_strokes(8, 0.05, L - 0.08, amp=0.008, w=0.008, seed=51, dense_at=L - 0.065, dense_n=6, dense_len=0.12)
    g.drape_strokes(9, 1.20, 0.76, amp=0.0085, w=0.012, seed=53); g.drag_strokes(3, amp=0.006, w=0.0065, seed=57)
    g.wobble(0.0013); g.side_seams(zmin=0.74); g.armhole_seams(0.05)
    g.hem(hem, 0.009, roll=0.0015, band=0.007)
    g.band(sl, 0.065, raise_=0.002); g.band(neck, 0.004, raise_=0.001)
    shirt_placket(g, 0.66)
    g.groove(g.z - 1.37, mask=(g.y > 0) * g._not_arm() * (np.abs(g.x) < 0.17))
    for sd in (1, -1):    # abertura de la manga (cartera) sobre el puño
        u, a, w = g.arm(sd)
        ang = np.angle(np.exp(1j * (a - 2.5)))
        m = (w > 0.5) * (u > L - 0.17) * (u < L - 0.065)
        g.groove(ang * 0.05, depth=0.0011, width=0.0016, mask=m)
    return g

def _cuff_button_specs(L, sides=(1, -1), du=0.035, ang=2.2):
    b = B()
    out = []
    for sd in sides:
        S, E, W = b.arm[sd]
        W2 = W + (W - E) / np.linalg.norm(W - E) * 0.2
        d = unit(W - E); e1, e2 = frame(d)
        u0 = L - du - 0.285      # a lo largo del antebrazo
        c = E + d * u0
        rdir = e1 * np.cos(ang) + e2 * np.sin(ang)
        out.append((c, rdir))
    return out

def _surf_from_axis(fn, specs, span=0.12):
    out = []
    for c, rdir in specs:
        p = surf_ray(fn, c, rdir, span=span)
        if p is not None: out.append((p, sdf_normal(fn, p)))
    return out

def camisa_manga_larga():
    sdf = lambda Q: _shirt_long(Q).sdf()
    zs = [0.76 + k * 0.087 for k in range(8)]
    btn = placed('cml_btn', sdf, front_points([(0.0, z) for z in zs]))
    if 'cml_cuff' not in _cache:
        _cache['cml_cuff'] = _surf_from_axis(sdf, _cuff_button_specs(0.60, ang=2.75))
    cuff = _cache['cml_cuff']
    return [SHELL(lambda P: _shirt_long(P).layer())] + collar_specs(gap=0.014) + button_specs(btn) + button_specs(cuff, r=0.0052)

# ======================================================================== SOBRECAMISA (chaqueta casual)
GAP_OVER = 0.07

def _overshirt(P):
    b = B(ease=0.040, drape=0.75, drape_from=1.30, arm_ease=0.024, arm_drape=0.15)
    g = Gar(P, b, 'upper', th=0.0062)
    L = 0.595; fit = B(ease=0.024, arm_ease=0.014).upper(P)
    cuff_blend(g, L, 0.06, fit, extra=0.015)
    hem = g.cut_below(0.765, wave=0.002)
    sl = g.cut_sleeve(L); neck = g.cut_neck(a=0.098, b=0.096, z_back=1.462, z_front=1.43)
    fr = g.cut_front_open(GAP_OVER, z_from=0.0)
    g.sleeve_strokes(6, 0.06, L - 0.09, amp=0.0065, w=0.010, seed=61, dense_at=L - 0.06, dense_n=4, dense_len=0.10)
    g.drape_strokes(8, 1.20, 0.78, amp=0.009, w=0.014, seed=63); g.drag_strokes(3, amp=0.006, w=0.007, seed=67)
    g.wobble(0.0018, 7)
    g.side_seams(zmin=0.76); g.armhole_seams(0.06)
    g.hem(hem, 0.014, roll=0.0025, band=0.02)
    g.band(sl, 0.06, raise_=0.0022)
    g.band(np.where(g.y < 0, fr, 1.0), 0.034, raise_=0.002)   # tapetas (solo delante)
    g.groove(fr - 0.006, depth=0.0006, width=0.0012, mask=(g.y < 0))
    g.groove(g.z - 1.36, mask=(g.y > 0) * g._not_arm() * (np.abs(g.x) < 0.18))     # canesú trasero
    g.groove(g.z - 1.38, mask=(g.y < 0) * g._not_arm() * (np.abs(g.x) > GAP_OVER / 2 + 0.035) * (np.abs(g.x) < 0.18))  # canesú delantero
    for sx in (1, -1):
        flap_pocket(g, sx * 0.105, 1.245, 0.12, 0.14, 0.046, lift=0.0032, flap_lift=0.0075)
        flap_pocket(g, sx * 0.118, 0.905, 0.14, 0.15, 0.05, lift=0.0032, flap_lift=0.0075)
    return g

def sobrecamisa():
    sdf = lambda Q: _overshirt(Q).sdf()
    xs = GAP_OVER / 2 + 0.017
    zs = [0.80 + k * 0.105 for k in range(6)]
    snaps = placed('ov_snap', sdf, front_points([(-xs, z) for z in zs] + [(sx * 0.105, 1.29) for sx in (1, -1)] + [(sx * 0.118, 0.955) for sx in (1, -1)]))
    if 'ov_cuff' not in _cache:
        _cache['ov_cuff'] = _surf_from_axis(sdf, _cuff_button_specs(0.595, ang=2.6))
    cuff = _cache['ov_cuff']
    return ([SHELL(lambda P: _overshirt(P).layer())] +
            collar_specs(gap=GAP_OVER + 0.01, e=0.024, stand=0.042, fall=0.07, spread=1.3, th=0.0055) +
            button_specs(snaps + cuff, r=0.0068, t=0.003))

# ======================================================================== PARKA
class LongBody(Body):
    """Tronco que sigue por debajo de la cadera (abrigos)."""
    def torso(s, P):
        d = Body.torso(s, P)
        # el tronco de referencia se cierra a 0,72: lo prolongamos recto hacia abajo
        Q = P.copy(); Q[:, 2] = np.maximum(Q[:, 2], 0.745)
        d2 = Body.torso(s, Q)
        d2 = np.maximum(d2, (0.50 - s.ease) - P[:, 2])
        return np.where(P[:, 2] < 0.745, d2, d).astype(F32)

GAP_PARKA = 0.11

def hood_down_d(P, e=0.0):
    """Capucha bajada: bolsa de tela que descansa sobre la espalda alta."""
    c = np.array([0, 0.075, 1.475], F32); r = np.array([0.165 + e, 0.095 + e, 0.115 + e], F32)
    Q = (P - c) / r
    k = np.linalg.norm(Q, axis=1)
    return ((k - 1) * r.min()).astype(F32)

def _parka(P):
    b = LongBody(ease=0.055, drape=0.95, drape_from=1.30, arm_ease=0.034, arm_drape=0.20, arm_deg=ARM)
    base = smin(b.upper(P), hood_down_d(P, 0.0), 0.05)
    g = Gar(P, b, lambda Q: base, th=0.0072)
    L = 0.60; fit = B(ease=0.03, arm_ease=0.016).upper(P)
    cuff_blend(g, L, 0.05, fit, extra=0.015)
    hem = g.cut_below(0.655, wave=0.002)
    sl = g.cut_sleeve(L)
    neck = g.cut_neck(a=0.118, b=0.112, z_back=1.505, z_front=1.45)
    fr = g.cut_front_open(GAP_PARKA, z_from=0.0)
    g.sleeve_strokes(7, 0.06, L - 0.07, amp=0.0095, w=0.011, seed=71, dense_at=L - 0.05, dense_n=5, dense_len=0.11)
    g.drape_strokes(10, 1.18, 0.66, amp=0.014, w=0.015, seed=73); g.drag_strokes(3, amp=0.009, w=0.008, seed=77)
    g.wobble(0.0022, 6)
    # cordón de la cintura (jareta) frunce la tela
    g.gather(sstep(1.00, 1.03, g.z) * sstep(1.09, 1.06, g.z), 0.003, n=16, fz=5)
    g.groove(g.z - 1.035, depth=0.0012, mask=g._not_arm()); g.groove(g.z - 1.065, depth=0.0012, mask=g._not_arm())
    g.side_seams(zmin=0.66); g.armhole_seams(0.065)
    g.hem(hem, 0.016, roll=0.003, band=0.025)
    g.band(sl, 0.05, raise_=0.002)
    g.band(neck, 0.01, raise_=0.002)
    g.band(np.where(g.y < 0, fr, 1.0), 0.05, raise_=0.0026)    # tapeta tapacremallera
    g.groove(fr - 0.008, depth=0.0006, width=0.0012, mask=(g.y < 0))
    g.groove(g.z - 1.37, mask=(g.y > 0) * g._not_arm() * (np.abs(g.x) < 0.20) * (g.z < 1.40))
    for sx in (1, -1):
        flap_pocket(g, sx * 0.13, 0.84, 0.17, 0.17, 0.055, lift=0.0045, flap_lift=0.009)   # bolsillos de fuelle
        flap_pocket(g, sx * 0.11, 1.22, 0.12, 0.13, 0.045, lift=0.0032, flap_lift=0.0075)
    # trabilla en la manga
    g.patch_limb('arm', (1, -1), 0.15, 0.0, 0.03, 0.10, 0.006, lift=0.003, puff=0.0)
    return g

def fur_ruff(P):
    """Pelo del borde de la capucha bajada: rodea el cuello por detrás y baja hasta el pecho."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    # curva del borde: elipse inclinada alrededor del cuello
    th = np.arctan2(x, -(y - 0.04))          # 0 delante, ±π detrás
    ca = np.cos(th)
    zc = 1.53 - 0.11 * sstep(-0.2, 0.9, ca)  # más alto detrás
    rx = 0.13 + 0.015 * sstep(0.0, 0.9, ca); ry = 0.12
    rad = np.sqrt((x / rx) ** 2 + ((y - 0.04) / ry) ** 2)
    dr = (rad - 1) * 0.125
    tube = np.sqrt(dr ** 2 + (z - zc) ** 2)
    # se abre delante (la cremallera)
    openm = np.where((y < 0) & (np.abs(x) < GAP_PARKA / 2 + 0.01), 1.0, 0.0)
    r = 0.030 + 0.006 * sstep(0.5, -0.6, ca)
    # pelo: muchas puntas (ruido estriado)
    fur = 0.0055 * (fbm(P, 90, 2, 5) + 0.6 * noise(P * [1, 1, 0.5], 160, 7))
    d = tube - r - fur
    d = np.maximum(d, openm * 0.05 + (1 - openm) * -1)
    d = np.maximum(d, 1.34 - z)
    return d.astype(F32)

def parka():
    sdf = lambda Q: _parka(Q).sdf()
    xs = GAP_PARKA / 2 + 0.03
    snaps = placed('pk_snap', sdf, front_points([(-xs, 0.72 + k * 0.12) for k in range(6)] +
                                               [(sx * 0.13, 0.905) for sx in (1, -1)] + [(sx * 0.11, 1.265) for sx in (1, -1)]))
    if 'pk_zip' not in _cache:
        zz = []
        for sx in (1, -1):
            for z in np.arange(0.67, 1.44, 0.02):
                p = surf_ray(sdf, (sx * (GAP_PARKA / 2 + 0.004), 0.0, z), (0, -1, 0))
                if p is not None: zz.append(p)
        _cache['pk_zip'] = zz
    zp = np.asarray(_cache['pk_zip'], F32)
    out = [SHELL(lambda P: _parka(P).layer()),
           SOLID(fur_ruff, ((-0.20, -0.18, 1.33), (0.20, 0.22, 1.63)), 'trim', h=0.002)]
    for sx in (1, -1):
        pts = zp[np.sign(zp[:, 0]) == sx]; pts = pts[np.argsort(pts[:, 2])]
        line = [p + np.array([0, -0.001, 0], F32) for p in pts]
        fn = (lambda line: lambda Q: (capsule_pts(Q, line, 0.0035) + 0.00036 * np.sign(np.sin(Q[:, 2] * 2 * np.pi / 0.006))).astype(F32))(line)
        out.append(SOLID(fn, solids_bbox(pts, 0.008), 'zipper', h=0.0011))
    return out + button_specs(snaps, role='hardware', r=0.0065, t=0.003, kind='stud')

# ======================================================================== CHAQUETA DE CHÁNDAL
def _track(P):
    b = B(ease=0.026, drape=0.55, drape_from=1.30, arm_ease=0.017, arm_drape=0.15)
    tube = round_cone(P, [0, 0.008, 1.40], [0, 0.012, 1.62], 0.080, 0.077)
    base = smin(b.upper(P), tube, 0.03)
    g = Gar(P, b, lambda Q: base, th=0.0045)
    L = 0.59; fit = B(ease=0.012, arm_ease=0.006).upper(P)
    cuff_blend(g, L, 0.06, fit, extra=0.012); hem_band_blend(g, P, 0.80, 0.014, 0.9)
    hem = g.cut_below(0.755, wave=0.0015); sl = g.cut_sleeve(L)
    top = g.cut_above(1.54 + 0.008 * np.cos(g.theta + np.pi / 2))
    g.sleeve_strokes(8, 0.05, L - 0.08, amp=0.008, w=0.008, seed=81, dense_at=L - 0.06, dense_n=6, dense_len=0.12)
    g.drape_strokes(8, 1.20, 0.80, amp=0.007, w=0.012, seed=83); g.drag_strokes(3, amp=0.006, w=0.0065, seed=87)
    g.hem_blouse(0.81, 0.89, 8, amp=0.004)
    g.wobble(0.0011)
    g.side_seams(zmin=0.80)
    g.ribbed(hem, 0.06, g.theta, 80, 0.0009, 0.002); g.ribbed(sl, 0.06, arm_ang(g), 24, 0.0009, 0.0016)
    g.hem(top, 0.01, roll=0.0016, band=0.008)
    g.groove(g.z - 1.468, depth=0.0012, mask=(np.abs(g.x) < 0.12))          # unión cuello-cuerpo
    # cremallera central: canal
    m = (g.y < 0) * (g.z > 0.75)
    g.groove(np.abs(g.x) - 0.006, depth=0.0012, width=0.0015, mask=m)
    # costuras raglán (donde va el vivo)
    for front in (True, False):
        for sx in (1, -1):
            g.line_groove((sx * 0.078, 1.47), (sx * 0.185, 1.285), front=front, depth=0.0012, width=0.0024)
    # bolsillos de ojal con cremallera
    for sx in (1, -1):
        g.line_groove((sx * 0.10, 0.99), (sx * 0.13, 0.86), depth=0.002, width=0.0024)
    return g

def chaqueta_chandal():
    sdf = lambda Q: _track(Q).sdf()
    if 'tr_pipe' not in _cache:
        lines = []
        b = B()
        for sd in (1, -1):
            # vivo a lo largo de la manga (por fuera) y por la costura raglán delantera
            S, E, W = b.arm[sd]
            W2 = W + (W - E) / np.linalg.norm(W - E) * 0.2
            pts = []
            for t in np.linspace(0.0, 1.0, 22):
                u = t * 0.52
                if u < 0.285:
                    c = S + unit(E - S) * u; d = unit(E - S)
                else:
                    c = E + unit(W - E) * (u - 0.285); d = unit(W - E)
                out = unit(np.cross(d, [0, 1, 0]) * sd)        # hacia arriba-fuera
                p = surf_ray(sdf, c, out, span=0.12)
                if p is not None: pts.append(p + sdf_normal(sdf, p) * 0.0016)
            lines.append(pts)
            pts = []
            for t in np.linspace(0, 1, 14):
                x = sd * (0.080 + 0.105 * t); z = 1.47 - 0.185 * t
                p = surf_ray(sdf, (x, 0.0, z), (0, -1, 0))
                if p is not None: pts.append(p + sdf_normal(sdf, p) * 0.0016)
            lines.append(pts)
        _cache['tr_pipe'] = lines
        zz = []
        for z in np.arange(0.76, 1.545, 0.012):
            p = surf_ray(sdf, (0.0, 0.0, z), (0, -1, 0))
            if p is not None: zz.append(p)
        _cache['tr_zip'] = zz
    lines = _cache['tr_pipe']; zp = np.asarray(_cache['tr_zip'], F32)
    out = [SHELL(lambda P: _track(P).layer())]
    for l in lines:
        if len(l) < 2: continue
        fn = (lambda l: lambda Q: capsule_pts(Q, l, 0.0024))(l)
        out.append(SOLID(fn, solids_bbox(l, 0.008), 'trim', h=0.0012))
    line = [p + np.array([0, -0.0012, 0], F32) for p in zp]
    out.append(SOLID(lambda Q: (capsule_pts(Q, line, 0.0034) + 0.0004 * np.sign(np.sin(Q[:, 2] * 2 * np.pi / 0.005))).astype(F32),
                     solids_bbox(zp, 0.008), 'zipper', h=0.0011))
    top = zp[np.argmax(zp[:, 2])]
    c = top + np.array([0, -0.0075, -0.026], F32)
    def puller(Q):
        a = round_cone(Q, c + np.array([0, 0, 0.018], F32), c - np.array([0, 0, 0.012], F32), 0.0045, 0.0058)
        return np.maximum(a, np.abs(Q[:, 1] - c[1]) - 0.0018).astype(F32)
    out.append(SOLID(puller, (c - 0.025, c + 0.025), 'zipper', h=0.0007))
    return out

# ======================================================================== BUFANDA
def _wrap(P, tilt, phase, zc0, rx, ry, r):
    """Una vuelta de la bufanda: tubo blando alrededor del cuello, algo inclinado."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    th = np.arctan2(x, -(y - 0.005))
    zc = zc0 + tilt * np.cos(th + phase)
    rad = np.sqrt((x / rx) ** 2 + ((y - 0.005) / ry) ** 2)
    dr = (rad - 1) * 0.5 * (rx + ry)
    vz = z - zc
    rr = r * (1 + 0.10 * np.sin(th * 2 + phase * 3) + 0.08 * noise(P, 9, 3))
    d = np.sqrt((dr / 1.2) ** 2 + (vz / 1.45) ** 2) * 1.1 - rr
    # pliegues que se enroscan a lo largo del tubo
    a = np.arctan2(vz, dr)
    d = d - 0.0022 * np.cos(a * 3 + th * 5 + phase + 1.5 * noise(P, 14, 5))
    return d

def bufanda(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ring = smin(_wrap(P, 0.012, 0.3, 1.488, 0.118, 0.112, 0.022), _wrap(P, -0.010, 2.1, 1.458, 0.124, 0.118, 0.021), 0.012)
    # caídas delante: dos paneles que cuelgan sobre el pecho (uno más largo)
    body = B(ease=0.062, arm_ease=0.05).upper(P)
    out = None
    for xc, zbot, tilt, seed in ((0.045, 1.02, 0.08, 1), (-0.035, 1.10, -0.06, 2)):
        xx = x - xc - tilt * (1.40 - z) - 0.006 * np.sin(z * 18 + seed)
        w = 0.076 + 0.004 * np.sin(z * 25 + seed)
        panel_reg = np.maximum(np.abs(xx) - w, np.maximum(zbot - z, z - 1.47))
        fold = 0.0035 * np.cos(xx / w * np.pi * 1.5 + seed) * sstep(1.40, 1.25, z)
        panel = np.abs(body - 0.004 * (xc > 0) - fold) - 0.0055
        d = np.maximum(panel, panel_reg)
        d = np.maximum(d, y + 0.02)     # solo delante
        out = d if out is None else np.minimum(out, d)
    d = smin(ring, out, 0.012)
    # punto de canalé (suave) y textura de punto
    d = d + 0.00035 * np.cos(x * 2 * np.pi / 0.008) + 0.0003 * fbm(P, 120, 1, 13)
    return d.astype(F32)

def flecos(P):
    pts = []
    out = np.full(len(P), 1.0, F32)
    body = None
    for xc, zbot, tilt in ((0.045, 1.02, 0.08), (-0.035, 1.10, -0.06)):
        for k in range(11):
            xx = xc + tilt * (1.40 - zbot) + (k - 5) * 0.0145
            yy = -_front_y(xx, zbot) - 0.002
            a = np.array([xx, yy, zbot + 0.004], F32); b2 = np.array([xx + 0.002 * np.sin(k), yy - 0.002, zbot - 0.05 - 0.008 * np.cos(k * 1.7)], F32)
            out = np.minimum(out, round_cone(P, a, b2, 0.0028, 0.0022))
    return out

_fy_cache = {}
def _front_y(x, z):
    key = (round(float(x), 4), round(float(z), 4))
    if key not in _fy_cache:
        f = lambda Q: B(ease=0.062, arm_ease=0.05).upper(Q) - 0.0055
        p = surf_ray(f, (x, 0.0, z), (0, -1, 0))
        _fy_cache[key] = -float(p[1]) if p is not None else 0.15
    return _fy_cache[key]

def bufanda_all():
    return [SOLID(bufanda, ((-0.17, -0.21, 0.97), (0.17, 0.16, 1.56)), 'body', h=0.0022),
            SOLID(flecos, ((-0.13, -0.25, 0.93), (0.16, -0.04, 1.14)), 'trim', h=0.0009)]

# ======================================================================== VAQUERO RECTO
def _jeans(P):
    g = Gar(P, Body(ease=0.012, leg_ease=0.016, leg_drape=0.14), 'lower', th=0.006)
    L = 0.79
    wz = waist(g, 1.005, 0.012); lg = g.cut_leg(L)
    g.leg_strokes(6, 0.12, L - 0.14, amp=0.0042, w=0.011, knee_n=3, dense_at=L - 0.005, dense_n=6, dense_len=0.13, seed=91)
    g.wobble(0.0012)
    g.band(wz, 0.04, raise_=0.002); g.hem(lg, 0.018, roll=0.0022, band=0.02)
    g.groove(wz - 0.006, depth=0.0005, width=0.001); g.groove(wz - 0.034, depth=0.0005, width=0.001)
    belt_loops(g, 7, 0.968, 1.008); fly(g, 0.034, 0.965, 0.86); inseam_outseam(g)
    for sx in (1, -1):     # bolsillos delanteros redondeados
        cx, cz = sx * 0.165, 0.965
        r = np.sqrt((g.x - cx) ** 2 + (g.z - cz) ** 2)
        m = (g.y < 0) * (g.z < 0.968) * (g.x * sx > 0.06)
        g.groove(r - 0.075, depth=0.0016, width=0.0022, mask=m)
        g.groove(r - 0.081, depth=0.0005, width=0.001, mask=m)
        g.o += 0.0012 * sstep(0.08, 0.06, r) * m        # el bolsillo abomba un poco
    g.patch_xz(rrect(-0.118, 0.935, 0.045, 0.05, 0.004), lift=0.0012, puff=0.0)     # bolsillo pequeño
    # canesú trasero en V y bolsillos de parche
    yoke = 0.93 + 0.035 * np.clip(np.abs(g.x) / 0.16, 0, 1)
    g.groove(g.z - yoke, depth=0.0012, mask=(g.y > 0) * (g.z > 0.88))
    g.groove(g.z - yoke - 0.006, depth=0.0005, width=0.001, mask=(g.y > 0) * (g.z > 0.88))
    g.groove(np.abs(g.x), depth=0.0012, mask=(g.y > 0) * (g.z > 0.80))
    for sx in (1, -1):
        pk = lambda x, z, sx=sx: sd_poly(x, z, [(sx * 0.03, 0.915), (sx * 0.155, 0.92), (sx * 0.15, 0.80), (sx * 0.093, 0.775), (sx * 0.037, 0.80)])
        g.patch_xz(pk, front=False, lift=0.0024, puff=0.0014, stitch=0.005)
    for sd in (1, -1):     # pliegues de la rodilla trasera y bigotes delanteros
        u, a, w = g.leg(sd)
        fm = (g.x * sd > 0)
        g.o += 0.002 * np.exp(-((u - 0.06) / 0.04) ** 2) * np.cos(a * 3) * fm
    return g

def vaquero_recto():
    sdf = lambda Q: _jeans(Q).sdf()
    riv = placed('jn_riv', sdf, front_points([(sx * 0.093, 0.966) for sx in (1, -1)] + [(sx * 0.215, 0.905) for sx in (1, -1)] +
                                             [(-0.098, 0.958), (-0.14, 0.958)]))
    top = placed('jn_btn', sdf, front_points([(0.0, 0.985)]))
    return ([SHELL(lambda P: _jeans(P).layer())] +
            button_specs(riv, role='hardware', r=0.0036, t=0.0024, kind='stud') +
            button_specs(top, role='hardware', r=0.0082, t=0.0036, kind='stud'))

UPC = ((-0.52, -0.25, 0.68), (0.52, 0.25, 1.62))
CATALOG = [
    ('01_camisa_manga_corta', 'Camisa de manga corta', camisa_manga_corta, ((-0.40, -0.24, 0.70), (0.40, 0.24, 1.62))),
    ('02_camisa_manga_larga', 'Camisa de manga larga', camisa_manga_larga, UPC),
    ('03_sobrecamisa', 'Sobrecamisa', sobrecamisa, ((-0.54, -0.27, 0.70), (0.54, 0.27, 1.64))),
    ('04_parka', 'Parka con capucha de pelo', parka, ((-0.55, -0.29, 0.60), (0.55, 0.30, 1.66))),
    ('05_chaqueta_chandal', 'Chaqueta de chándal', chaqueta_chandal, ((-0.52, -0.25, 0.70), (0.52, 0.25, 1.60))),
    ('06_bufanda', 'Bufanda', bufanda_all, ((-0.17, -0.25, 0.93), (0.17, 0.16, 1.56))),
    ('07_vaquero_recto', 'Vaquero recto', vaquero_recto, ((-0.30, -0.22, -0.02), (0.30, 0.22, 1.08))),
]
