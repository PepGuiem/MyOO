"""Vaquero BAGGY de 5 bolsillos (denim lavado), sobre el cuerpo de referencia de 1,78 m.

Se construye como una prenda confeccionada, no como un tubo:
- tela (`body`): cinturilla con doble pespunte, 7 trabillas, bragueta con pespunte en J,
  bolsillos delanteros de boca curva con bolsa que abomba, bolsillo monedero, canesú
  trasero en V, costura central trasera, bolsillos traseros de parche, costuras
  laterales e interiores, bajo doblado con acumulación de tela (stacking), pliegues de
  rodilla, corva y entrepierna;
- `hardware`: botón de caña y remaches (metal);
- `trim`: etiqueta de piel en la cinturilla trasera;
- `stitch` (archivo aparte): el hilo de los pespuntes como puntadas individuales, sobre la
  superficie (rayos contra la prenda). Para Blender y el render; la web no lo necesita.

Corte: tiro algo bajo (cintura 0,978), cadera amplia, pierna muy ancha desde el muslo al
tobillo, ligeramente curvada, y bajo ancho que se acumula sobre la zapatilla.
Coordenadas: Z arriba, frente = -Y (como el resto de colecciones).
Los surcos de los pespuntes son anchos y poco hondos (2,6 mm x 0,35 mm): más estrechos que la
rejilla de extracción (3 mm) salían dentados. El hilo de verdad va en el archivo de costuras.
"""
import numpy as np
from kit import *
from core import frame
from items2 import belt_loops, fly, inseam_outseam, waist
from items4 import SHELL, SOLID, lazy_solid, placed, front_points, button_specs, surf_ray, sdf_normal, unit, _cache

# ---------------------------------------------------------------- cortes
# radii: radios de la pernera YA con holgura (m) en cadera, rodilla, pantorrilla, tobillo y bajo.
# folds: pliegues (caídas, rodilla, acumulación en el bajo, corva, bigotes, ondulación).
# wash: lavado para Blender (índigo oscuro, medio, desgaste) y cuánto desgaste.
_F = lambda dn, da, kn, sn, sa, ss, bu, ho, wh, wo: dict(drape_n=dn, drape_amp=da, knee=kn, stack_n=sn, stack_amp=sa,
                                                          stack_span=ss, bulge=bu, honey=ho, whisk=wh, wobble=wo)
STYLES = {
    'baggy': dict(num=19, file='vaquero_baggy', name='Vaquero baggy', legacy=True, waist=0.978, L=0.808, bow=0.016, hem_back=0.011,
                  folds=_F(8, 0.010, 1.0, 19, 1.0, 0.29, 0.007, 1.0, 1.0, 0.0016),
                  wash=('#22375C', '#3D5A88', '#7D97BD', 1.0)),
    'clasico': dict(num=20, file='vaquero_clasico', name='Vaquero clásico', ease=0.016, radii=(0.106, 0.086, 0.083, 0.080, 0.080),
                    waist=0.985, L=0.792, bow=0.003, hem_back=0.007, folds=_F(5, 0.005, 0.8, 12, 0.55, 0.15, 0.003, 0.8, 0.8, 0.0010),
                    wash=('#1C2D4F', '#304B78', '#6E88B0', 0.75)),
    'skinny': dict(num=21, file='vaquero_skinny', name='Vaquero skinny', ease=0.008, radii=(0.094, 0.064, 0.062, 0.050, 0.048),
                   waist=0.980, L=0.770, bow=0.002, hem_back=0.003, folds=_F(0, 0.0, 0.45, 10, 0.40, 0.10, 0.0, 0.7, 1.1, 0.0006),
                   wash=('#141F38', '#22365C', '#53698F', 0.55)),
    'slim': dict(num=22, file='vaquero_slim', name='Vaquero slim', ease=0.012, radii=(0.099, 0.074, 0.070, 0.064, 0.063),
                 waist=0.982, L=0.785, bow=0.002, hem_back=0.005, folds=_F(3, 0.004, 0.6, 10, 0.45, 0.12, 0.002, 0.8, 0.9, 0.0008),
                 wash=('#18284A', '#2B4470', '#647FA8', 0.65)),
    'recto': dict(num=23, file='vaquero_recto', name='Vaquero recto', ease=0.016, radii=(0.104, 0.088, 0.088, 0.088, 0.088),
                  waist=0.985, L=0.796, bow=0.003, hem_back=0.007, folds=_F(5, 0.006, 0.8, 12, 0.6, 0.16, 0.003, 0.8, 0.8, 0.0010),
                  wash=('#24395F', '#3D5A88', '#7D97BD', 0.85)),
    'wide': dict(num=24, file='vaquero_wide_leg', name='Vaquero wide leg', ease=0.022, radii=(0.120, 0.118, 0.120, 0.124, 0.127),
                 waist=1.020, L=0.814, bow=0.006, hem_back=0.010, folds=_F(9, 0.011, 0.5, 8, 0.5, 0.12, 0.003, 0.6, 0.6, 0.0012),
                 wash=('#1E3156', '#344F7E', '#7189B2', 0.8)),
    'flare': dict(num=25, file='vaquero_flare', name='Vaquero de campana', ease=0.010, radii=(0.098, 0.072, 0.086, 0.106, 0.120),
                  waist=1.000, L=0.816, bow=0.003, hem_back=0.012, folds=_F(7, 0.009, 0.6, 8, 0.5, 0.10, 0.0, 0.7, 0.9, 0.0010),
                  wash=('#22375C', '#3D5A88', '#7D97BD', 0.85)),
    'bootcut': dict(num=26, file='vaquero_bootcut', name='Vaquero bootcut', ease=0.012, radii=(0.100, 0.076, 0.082, 0.090, 0.095),
                    waist=0.985, L=0.810, bow=0.003, hem_back=0.010, folds=_F(5, 0.007, 0.7, 10, 0.55, 0.12, 0.002, 0.8, 0.9, 0.0010),
                    wash=('#16264A', '#29426E', '#6680AA', 0.7)),
    'mom': dict(num=27, file='vaquero_mom', name='Mom jeans', ease=0.022, radii=(0.112, 0.094, 0.084, 0.072, 0.070),
                waist=1.030, L=0.748, bow=0.006, hem_back=0.003, folds=_F(4, 0.006, 0.9, 6, 0.4, 0.08, 0.0, 0.9, 1.2, 0.0012),
                wash=('#3A5482', '#5A78A6', '#9EB4D2', 1.15)),
    'boyfriend': dict(num=28, file='vaquero_boyfriend', name='Vaquero boyfriend', ease=0.022, radii=(0.112, 0.098, 0.094, 0.090, 0.090),
                      waist=0.968, L=0.748, bow=0.008, hem_back=0.004, cuff=0.036,
                      folds=_F(6, 0.008, 1.0, 6, 0.4, 0.08, 0.0, 1.0, 1.0, 0.0014),
                      wash=('#2F4774', '#4C6A99', '#93AACB', 1.05)),
}

WAIST_SLOPE = 0.012
BAND_W = 0.042
HEM_STITCH = 0.024
TH = 0.0068                   # denim de 14 oz
RISE_FRONT = 0.80             # base de la bragueta / entrepierna delantera
FP_END = 1.5 * np.pi + 0.5    # ángulo donde la boca del bolsillo delantero llega al costado


def configure(key):
    """Activa un corte: medidas del cuerpo, alturas (tiro), posiciones de los bolsillos (escaladas al
    ancho de la cadera de ese corte) y el catálogo con su archivo."""
    global STYLE, KEY, WAIST_Z, L, DZ, XS, BP_SCALE, FP_XMAX, COIN, CUFF, CATALOG
    STYLE = STYLES[key]; KEY = key
    WAIST_Z = STYLE['waist']; L = STYLE['L']; DZ = WAIST_Z - 0.978; CUFF = STYLE.get('cuff', 0.0)
    _AXIS.clear()
    for k in [k for k in _cache if str(k).startswith('vb_')]:
        del _cache[k]
    XS = 1.0
    if not STYLE.get('legacy'):
        b = body(); ref = JBody(ease=0.026)
        zp = 0.90 + DZ
        XS = (np.interp(zp, b._zf, b.rx) + STYLE['ease']) / (np.interp(0.90, ref._zf, ref.rx) + 0.026)
    BP_SCALE = 0.85 + 0.15 * XS
    FP_XMAX = 0.207 * XS
    COIN = (-0.150 * XS, 0.904 + DZ, 0.040, 0.046)   # bolsillo monedero: dentro de la boca del bolsillo
    CATALOG = [(f"{STYLE['num']}_{STYLE['file']}", STYLE['name'], vaquero_baggy, ((-0.40, -0.29, -0.03), (0.40, 0.29, 1.08)))]


class JBody(Body):
    """El perfil del tronco acaba en z = 0,74; por debajo se prolonga con su pendiente (si no, la
    corrección del gradiente salta y deja un escalón de 1 mm bajo los bolsillos traseros)."""
    def __init__(s, *a, **k):
        super().__init__(*a, **k)
        import core
        zf = core._ZF; ext = np.linspace(0.55, zf[0], 60, endpoint=False).astype(F32)
        s._zf = np.concatenate([ext, zf])
        for nm in ('rx', 'rf', 'rb'):
            arr = getattr(s, nm); sl = (arr[6] - arr[0]) / (zf[6] - zf[0])
            setattr(s, nm, np.concatenate([arr[0] + sl * (ext - zf[0]), arr]).astype(F32))

    leg_rad = None

    def leg_d(s, P, side):
        """Pernera con radios propios (cadera, rodilla, pantorrilla, tobillo y bajo): pitillo, campana...
        Distancia en horizontal al eje suave de la pierna menos un radio que varía con suavidad a lo largo
        (con conos unidos quedaba una arista en la rodilla); por encima de la cadera, la esfera de siempre."""
        if s.leg_rad is None:
            return super().leg_d(P, side)
        from scipy.interpolate import PchipInterpolator
        z, cx, cy, uu = leg_axis(side)
        H, K, C, A = s.leg[side]
        key = ('rfun', side)
        if key not in s.__dict__:
            us = [float(np.interp(n[2], z, uu)) for n in (H, K, C, A)]
            us.append(us[-1] + 0.12)
            s.__dict__[key] = PchipInterpolator(us, list(s.leg_rad), extrapolate=True)
        u = np.interp(P[:, 2], z, uu)
        rr = s.__dict__[key](np.clip(u, 0, None)).astype(F32)
        d = np.hypot(P[:, 0] - np.interp(P[:, 2], z, cx), P[:, 1] - np.interp(P[:, 2], z, cy)) - rr
        cap = np.linalg.norm(P - H, axis=1) - s.leg_rad[0]
        return np.where(P[:, 2] > H[2], cap, d).astype(F32)

    def _torso_f(s, P):
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        e = s.ease
        rx = np.interp(z, s._zf, s.rx) + e; rf = np.interp(z, s._zf, s.rf) + e; rb = np.interp(z, s._zf, s.rb) + e
        ry = np.where(y < 0, rf, rb)
        return np.sqrt((x / rx) ** 2 + (y / ry) ** 2), rx, ry


def body():
    """Cuerpo del corte activo (ver STYLES). En el baggy: pierna ancha (muslo ~0,114 m de radio,
    bajo ~0,10) y algo curvada; en el resto, radios propios por rodilla, pantorrilla, tobillo y bajo."""
    st = STYLE
    if st.get('legacy'):
        b = JBody(ease=0.026, leg_ease=0.026, leg_drape=0.85, hip_ease=0.026)
    else:
        b = JBody(ease=st['ease'], leg_ease=st['ease'], leg_drape=0.0)
        b.leg_rad = st['radii']
        base = {1: [], -1: []}
        for side in (1, -1):        # ejes separados para que las perneras no se toquen por dentro
            nodes = []
            for N, rr in zip((np.array([0.090 * side, 0.004, 0.84], F32), np.array([0.098 * side, -0.004, 0.485], F32),
                              np.array([0.101 * side, 0.010, 0.33], F32), np.array([0.103 * side, 0.016, 0.085], F32)),
                             st['radii'][:4]):
                N = N.copy(); N[0] = side * max(abs(float(N[0])), rr + 0.007); nodes.append(N)
            b.leg[side] = tuple(nodes)
    bowv = st.get('bow', 0.016)
    for side in (1, -1):
        H, K, C, A = b.leg[side]
        bow = np.array([side * bowv, -0.006 * bowv / 0.016, 0], F32)
        b.leg[side] = (H, K + bow, C + bow * 0.75 + np.array([side * 0.004 * bowv / 0.016, 0, 0], F32),
                       A + np.array([side * 0.010 * bowv / 0.016, 0.004 * bowv / 0.016, 0], F32))
    return b


def _catmull(pts, n=60):
    P = [pts[0] * 2 - pts[1]] + list(pts) + [pts[-1] * 2 - pts[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-2])
    return np.array(out, F32)


_AXIS = {}


def leg_axis(side):
    """Eje suave de la pierna (spline por cadera, rodilla, pantorrilla y tobillo), por alturas:
    devuelve z (creciente), centro x, centro y y la coordenada u (longitud desde la cadera)."""
    if side not in _AXIS:
        H, K, C, A = body().leg[side]
        c = _catmull([np.asarray(p, F32) for p in (H + np.array([0, 0, 0.25], F32), H, K, C, A, A + np.array([0, 0, -0.15], F32))])
        s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(c, axis=0), axis=1))])
        sH = np.interp(-H[2], -c[:, 2], s)
        o = np.argsort(c[:, 2])
        _AXIS[side] = (c[o, 2], c[o, 0], c[o, 1], (s - sH)[o])
    return _AXIS[side]


class JGar(Gar):
    """Coordenadas de pierna continuas: el eje es una curva suave y el ángulo se mide en horizontal
    (con la cadena de segmentos, la u salta en la cara cóncava de la rodilla y abre agujeros)."""
    def leg(s, side):
        if side not in s._leg:
            z, cx, cy, uu = leg_axis(side)
            u = np.interp(s.z, z, uu).astype(F32)
            a = np.arctan2(s.x - np.interp(s.z, z, cx), s.y - np.interp(s.z, z, cy)).astype(F32)
            s._leg[side] = (u, a, sstep(0.0, 0.02, s.x * side))
        return s._leg[side]


def waist_z(theta):
    return WAIST_Z + WAIST_SLOPE * np.sin(theta)


def front_pocket(sx):
    """Boca del bolsillo delantero: arco de círculo (centro, radio) y su máscara."""
    return np.array([sx * 0.172 * XS, 0.948 + DZ]), 0.078 * (0.5 + 0.5 * XS)


def back_pocket(sx):
    k = BP_SCALE
    return [(sx * 0.028, 0.900 + DZ), (sx * (0.028 + 0.140 * k), 0.906 + DZ), (sx * (0.028 + 0.134 * k), 0.900 + DZ - 0.125 * k),
            (sx * (0.028 + 0.070 * k), 0.900 + DZ - 0.152 * k), (sx * (0.028 + 0.008 * k), 0.900 + DZ - 0.125 * k)]


def yoke_z(x):
    return 0.905 + DZ + 0.034 * np.clip(np.abs(x) / (0.17 * XS), 0, 1)


def _fold(t, w):
    return np.exp(-(t / w) ** 2) - 0.35 * np.exp(-(t / (2.2 * w)) ** 2)


def _not_inner(a, sd):
    """Atenúa los pliegues por la cara interior de la pierna (las perneras no se tocan)."""
    inner = np.cos(a + sd * np.pi / 2)
    return 1 - 0.85 * sstep(0.55, 0.92, inner)


def hem_len(a, sd):
    return L + STYLE.get('hem_back', 0.011) * np.cos(a) + 0.0025 * np.sin(3 * a + sd)


def cut_hem(g):
    """Bajo: más largo por detrás (se apoya en la zapatilla) y algo irregular."""
    out = np.ones(len(g.P), F32)
    for sd in (1, -1):
        u, a, w = g.leg(sd); m = (g.x * sd >= 0)
        Lf = hem_len(a, sd)
        g.keep(np.where(m, u - Lf, -1.0)); out = np.where(m, Lf - u, out)
    return out


def leg_drapes(g, n=8, amp=0.010, seed=181):
    """Caídas verticales: la tela ancha cuelga del muslo y forma pliegues largos hasta el bajo."""
    rng = np.random.default_rng(seed)
    for sd in (1, -1):
        u, a, wm = g.leg(sd)
        acc = np.zeros(len(g.P), F32)
        for _ in range(n):
            a0 = rng.uniform(-np.pi, np.pi)
            if np.cos(a0 + sd * np.pi / 2) > 0.3: a0 += np.pi       # lejos de la entrepierna
            u0 = rng.uniform(0.06, 0.40); u1 = rng.uniform(0.55, L); twist = rng.uniform(-0.9, 0.9)
            A = amp * rng.uniform(0.55, 1.1); w = rng.uniform(0.014, 0.024)
            ang = np.angle(np.exp(1j * (a - a0 - twist * (u - u0))))
            t = 0.11 * ang
            grow = sstep(u0, u0 + 0.10, u) * sstep(u1 + 0.05, u1 - 0.05, u)
            acc += A * grow * _fold(t, w)
        g.o += acc * (g.x * sd > 0) * sstep(0.04, 0.10, u) * _not_inner(a, sd)


def stack_folds(g, n=19, seed=191, amp=1.0, zone=0.29, bulge_amp=0.007):
    """Acumulación en el bajo: pliegues parciales, inclinados y rotos (no anillos), más juntos abajo."""
    rng = np.random.default_rng(seed)
    for sd in (1, -1):
        u, a, wm = g.leg(sd)
        acc = np.zeros(len(g.P), F32)
        for i in range(n):
            r = (i + rng.uniform(0, 0.8)) / n
            ui = L - 0.012 - zone * r ** 1.35
            a0 = rng.uniform(-np.pi, np.pi); span = rng.uniform(0.8, 2.1)
            tilt = rng.uniform(-0.040, 0.040); bend = rng.uniform(-0.012, 0.012)
            A = amp * rng.uniform(0.008, 0.0145) * (1.2 - 0.55 * r); w = rng.uniform(0.010, 0.016) * (0.9 + 0.4 * r)
            da = np.angle(np.exp(1j * (a - a0)))
            t = u - ui - tilt * np.sin(da) - bend * np.cos(2 * da)
            prof = np.exp(-(t / w) ** 2) - 0.45 * np.exp(-((t + 0.6 * w) / (1.6 * w)) ** 2)   # cresta con sombra debajo
            acc += A * sstep(1.0, 0.45, np.abs(da) / span) * prof
        bulge = bulge_amp * sstep(L - 0.24, L - 0.06, u)          # la tela acumulada abomba el bajo
        g.o += (acc + bulge) * (g.x * sd > 0) * _not_inner(a, sd)


def knee_folds(g, seed=201, amp=1.0):
    """Rodilla y muslo: pliegues diagonales cortos (la tela se dobla al andar)."""
    rng = np.random.default_rng(seed)
    for sd in (1, -1):
        u, a, wm = g.leg(sd)
        acc = np.zeros(len(g.P), F32)
        for i in range(7):
            ui = rng.uniform(0.14, 0.50); a0 = np.pi + rng.uniform(-1.3, 1.3)        # delante
            span = rng.uniform(0.5, 1.1); tilt = rng.uniform(0.02, 0.06) * rng.choice((-1, 1))
            A = amp * rng.uniform(0.004, 0.0075); w = rng.uniform(0.010, 0.015)
            da = np.angle(np.exp(1j * (a - a0)))
            t = u - ui - tilt * np.sin(da)
            acc += A * sstep(1.0, 0.4, np.abs(da) / span) * _fold(t, w)
        g.o += acc * (g.x * sd > 0) * _not_inner(a, sd)


def whiskers(g, amp=1.0):
    """Bigotes de la entrepierna delantera: pliegues cortos en abanico desde el tiro."""
    rng = np.random.default_rng(7)
    m = sstep(0.02, -0.03, g.y)
    for sx in (1, -1):
        for k in range(5):
            z0 = 0.77 + 0.016 * k + rng.uniform(-0.004, 0.004)
            ang = np.radians(16 + 7 * k + rng.uniform(-3, 3))
            p0 = np.array([sx * 0.045, z0]); e = np.array([sx * np.cos(ang), np.sin(ang)]) * rng.uniform(0.09, 0.13)
            wx, wz = g.x - p0[0], g.z - p0[1]
            t = np.clip((wx * e[0] + wz * e[1]) / (e @ e), 0, 1)
            d = np.sqrt((wx - e[0] * t) ** 2 + (wz - e[1] * t) ** 2)
            fade = np.sin(np.pi * t) ** 0.7
            g.o += amp * 0.0022 * fade * _fold(d, 0.0045) * m


def honeycombs(g, amp=1.0):
    """Panal de la corva: pliegues horizontales detrás de la rodilla."""
    rng = np.random.default_rng(11)
    for sd in (1, -1):
        u, a, wm = g.leg(sd)
        back = sstep(0.05, 0.45, np.cos(a))         # a = 0 es la parte de atrás
        for k in range(4):
            u0 = 0.335 + 0.026 * k + rng.uniform(-0.005, 0.005)
            span = rng.uniform(0.6, 1.0)
            tilt = rng.uniform(-0.02, 0.02)
            t = u - u0 - tilt * np.sin(a)
            taper = sstep(span, span * 0.5, np.abs(np.angle(np.exp(1j * a))))
            g.o += amp * 0.0034 * taper * _fold(t, 0.0065) * back * (g.x * sd > 0) * _not_inner(a, sd)


def jeans(P):
    g = JGar(P, body(), 'lower', th=TH)
    wz = waist(g, WAIST_Z, WAIST_SLOPE); lg = cut_hem(g)
    # pliegues: caídas largas, muslo y rodilla, corva, entrepierna y acumulación en el bajo
    F = STYLE['folds']
    if F['drape_n']:
        leg_drapes(g, F['drape_n'], F['drape_amp'])
    knee_folds(g, amp=F['knee'])
    stack_folds(g, F['stack_n'], amp=F['stack_amp'], zone=F['stack_span'], bulge_amp=F['bulge'])
    honeycombs(g, F['honey']); whiskers(g, F['whisk'])
    g.wobble(F['wobble'])
    # cinturilla, trabillas, bragueta, costuras
    g.band(wz, BAND_W, raise_=0.0022)
    g.groove(wz - 0.006, depth=0.00035, width=0.0026); g.groove(wz - (BAND_W - 0.006), depth=0.00035, width=0.0026)
    fly(g, 0.036, WAIST_Z - BAND_W, RISE_FRONT + 0.02)
    g.groove(g.x - 0.0295, depth=0.00035, width=0.0026, mask=(g.y < 0) * (g.z > RISE_FRONT + 0.056) * (g.z < WAIST_Z - BAND_W))
    inseam_outseam(g)
    if CUFF:   # bajo vuelto (boyfriend): la vuelta abulta, con su borde de arriba marcado
        m = sstep(CUFF + 0.002, CUFF - 0.002, lg)
        g.o += 0.0042 * m; g.th += 0.0030 * m
        g.groove(lg - CUFF, depth=0.0010, width=0.0026)
        g.hem(lg, 0.012, roll=0.0030, band=0.010)
    else:
        g.hem(lg, HEM_STITCH, roll=0.0026, band=0.028)
        g.groove(lg - (HEM_STITCH - 0.0062), depth=0.00035, width=0.0026)     # segundo pespunte del bajo
    # bolsillos delanteros: boca curva, bolsa que abomba, refuerzo
    for sx in (1, -1):
        c, r0 = front_pocket(sx)
        r = np.sqrt((g.x - c[0]) ** 2 + (g.z - c[1]) ** 2)
        m = (g.y < 0) * (g.z < wz - BAND_W + 0.004) * (g.x * sx > 0.05) * sstep(FP_XMAX + 0.006, FP_XMAX - 0.004, g.x * sx)
        g.groove(r - r0, depth=0.0018, width=0.0024, mask=m)
        g.groove(r - r0 - 0.0035, depth=0.00035, width=0.0026, mask=m)
        g.groove(r - r0 - 0.0095, depth=0.00035, width=0.0026, mask=m)
        g.o += 0.0016 * sstep(r0 + 0.01, r0 - 0.012, r) * m * sstep(0.0, 0.02, g.x * sx - 0.06)
    # bolsillo monedero (derecho del que lo lleva)
    g.patch_xz(rrect(COIN[0], COIN[1], COIN[2], COIN[3], 0.003), lift=0.0013, puff=0.0, stitch=0.0065)
    # canesú en V, costura central trasera y bolsillos de parche
    back = g.y > 0
    yk = yoke_z(g.x)
    g.groove(g.z - yk, depth=0.0013, width=0.0024, mask=back * (g.z > 0.86))
    g.groove(g.z - yk - 0.0095, depth=0.00035, width=0.0026, mask=back * (g.z > 0.86))
    g.groove(np.abs(g.x), depth=0.0014, width=0.0024, mask=back * (g.z > 0.78))
    for sx in (1, -1):
        pk = lambda x, z, sx=sx: sd_poly(x, z, back_pocket(sx))
        g.patch_xz(pk, front=False, lift=0.0026, puff=0.0016, stitch=0.0086)
    return g


# ---------------------------------------------------------------- piezas sólidas
def _sdf(Q):
    return jeans(Q).sdf()


def _rounded_rect_on_surface(c, n, half_w, half_h, r):
    n = n / np.linalg.norm(n)
    up = np.array([0, 0, 1.0]); t1 = np.cross(up, n); t1 /= np.linalg.norm(t1); t2 = np.cross(n, t1)
    def f(Q):
        d = Q - c
        u, v, w = d @ t1, d @ t2, d @ n
        qx = np.abs(u) - half_w + r; qy = np.abs(v) - half_h + r
        rect = np.minimum(np.maximum(qx, qy), 0) + np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) - r
        slab = np.abs(w - 0.0016) - 0.0009
        return np.maximum(rect, slab).astype(F32)
    return f


# Trabillas: ángulo alrededor de la cintura (frente = -pi/2, espalda = +pi/2)
LOOPS = [-np.pi / 2 - 0.60, -np.pi / 2 + 0.60, -np.pi / 2 - 1.42, -np.pi / 2 + 1.42,
         np.pi / 2 - 0.80, np.pi / 2 + 0.80, np.pi / 2]
PATCH_PHI = np.pi / 2 + 0.40          # etiqueta de piel: espalda, a la derecha de quien lo lleva


def _surface_grid(phis, zs):
    """Radio de la cara exterior de la prenda en una rejilla (ángulo, altura), con rayos desde el eje."""
    from stitches import surface_hits
    PH, ZZ = np.meshgrid(phis, zs, indexing='ij')
    O = np.stack([np.zeros(PH.size), np.zeros(PH.size), ZZ.ravel()], 1).astype(F32)
    D = np.stack([np.cos(PH.ravel()), np.sin(PH.ravel()), np.zeros(PH.size)], 1).astype(F32)
    sdf = lambda Q: _sdf(Q)
    H = surface_hits(sdf, O, D, span=0.34, n=900)
    rho = np.linalg.norm(H[:, :2], axis=1).reshape(PH.shape)
    for i in range(len(phis)):              # por encima del borde no hay tela: se prolonga el último valor
        ok = ~np.isnan(rho[i])
        rho[i] = np.interp(zs, zs[ok], rho[i, ok])
    return rho


def wrapped_solid(key, phi_c, z0, z1, half_w, th, lift, lift_mid, rr=0.0008):
    """Pieza plana (trabilla, etiqueta) que se ciñe a la superficie: coordenadas cilíndricas
    alrededor del eje Z, con el radio de la tela interpolado bajo ella."""
    from scipy.interpolate import RegularGridInterpolator
    if key not in _cache:
        r_est = 0.21
        dphi = (half_w + 0.01) / r_est
        phis = np.linspace(phi_c - dphi, phi_c + dphi, 7); zs = np.linspace(z0 - 0.006, z1 + 0.006, 7)
        _cache[key] = (phis, zs, _surface_grid(phis, zs))
    phis, zs, rho = _cache[key]
    itp = RegularGridInterpolator((phis, zs), rho, bounds_error=False, fill_value=None)
    rho_c = float(itp([[phi_c, (z0 + z1) / 2]])[0])

    def f(Q):
        phi = np.arctan2(Q[:, 1], Q[:, 0]); dphi = np.angle(np.exp(1j * (phi - phi_c)))
        R = np.linalg.norm(Q[:, :2], axis=1); z = Q[:, 2]
        surf = itp(np.stack([np.clip(phi_c + dphi, phis[0], phis[-1]), np.clip(z, zs[0], zs[-1])], 1))
        t = np.clip((z - z0) / (z1 - z0), 0, 1)
        off = lift + lift_mid * np.sin(np.pi * t)
        s = dphi * rho_c; zz = z - (z0 + z1) / 2; r = R - surf - off - th / 2
        qx = np.abs(s) - half_w + rr; qz = np.abs(zz) - (z1 - z0) / 2 + rr; qr = np.abs(r) - th / 2 + rr
        q = np.stack([qx, qz, qr], 1)
        return (np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(q.max(1), 0) - rr).astype(F32)
    c = np.array([np.cos(phi_c) * rho_c, np.sin(phi_c) * rho_c, (z0 + z1) / 2], F32)
    pad = np.array([half_w + 0.02, half_w + 0.02, (z1 - z0) / 2 + 0.01], F32)
    return f, (c - pad, c + pad)


def belt_loop_specs():
    out = []
    for i, ph in enumerate(LOOPS):
        zt = waist_z(ph)
        f, box = wrapped_solid(f'vb_loop{i}', ph, zt - BAND_W - 0.007, zt - 0.0015, 0.0055, 0.0024, 0.0003, 0.0016)
        out.append(SOLID(f, box, 'body', h=0.0006))
    return out


def leather_patch():
    zt = waist_z(PATCH_PHI)
    f, box = wrapped_solid('vb_patch', PATCH_PHI, zt - 0.0055 - 0.031, zt - 0.0055, 0.036, 0.0014, 0.0016, 0.0, rr=0.0012)
    return [SOLID(f, box, 'trim', h=0.0006)]


def vaquero_baggy():
    zt = WAIST_Z - BAND_W - 0.012
    riv = placed('vb_riv', _sdf, front_points([(sx * 0.098 * XS, zt + 0.004) for sx in (1, -1)] +
                                              [(sx * 0.232 * XS, 0.876 + DZ) for sx in (1, -1)] +
                                              [(COIN[0] + COIN[2] / 2 - 0.003, COIN[1] + COIN[3] / 2 - 0.005), (COIN[0] - COIN[2] / 2 + 0.003, COIN[1] + COIN[3] / 2 - 0.005)]))
    top = placed('vb_btn', _sdf, front_points([(0.0, WAIST_Z - WAIST_SLOPE - BAND_W / 2)]))
    return ([SHELL(lambda P: jeans(P).layer())] +
            button_specs(riv, role='hardware', r=0.0038, t=0.0026, kind='stud') +
            button_specs(top, role='hardware', r=0.0090, t=0.0040, kind='stud') +
            belt_loop_specs() + leather_patch())


configure(__import__('os').environ.get('VAQUERO_ESTILO', 'baggy'))
