"""Maniquí de escaparate realista: cabeza esculpida (cara y pelo) y mano relajada con dedos.

Coordenadas de trabajo: Z arriba, frente = -Y (como el resto del generador).

- La cabeza está en el espacio del cuerpo de referencia (centro 0, 0.016, 1.655) y con el
  tamaño que, tras el ajuste de cabeza de la web (libraryFit, región 'head'), coincide con la
  cabeza ovalada del maniquí anterior: así gorras y capuchas siguen encajando.
- La mano es la derecha, con la muñeca en el origen, los dedos hacia -Z, el dorso hacia +X y
  el pulgar hacia delante (-Y). La izquierda es su reflejo (lo hace la web).
"""
import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import *
from kit import capsule_pts

def ell(P, c, r):
    """Elipsoide (distancia aproximada, buena cerca de la superficie)."""
    c = np.asarray(c, F32); r = np.asarray(r, F32)
    q = (P - c) / r
    k0 = np.linalg.norm(q, axis=1); k1 = np.linalg.norm(q / r, axis=1)
    return (k0 * (k0 - 1) / np.maximum(k1, 1e-6)).astype(F32)

def sph(P, c, r): return (np.linalg.norm(P - np.asarray(c, F32), axis=1) - r).astype(F32)

def seg(P, a, b, r1, r2=None): return round_cone(P, a, b, r1, r1 if r2 is None else r2)

# ======================================================================== CABEZA
C = np.array([0.0, 0.016, 1.655], F32)

def g2(x, z, cx, cz, wx, wz):
    return np.exp(-((x - cx) / wx) ** 2 - ((z - cz) / wz) ** 2)

def interp_abs(phi, pts):
    xs = np.array([p[0] for p in pts], F32); ys = np.array([p[1] for p in pts], F32)
    return np.interp(np.abs(phi), xs, ys).astype(F32)

# Línea del nacimiento del pelo: ángulo alrededor de la cabeza (0 delante, π detrás) -> altura
HAIRLINE = [(0.0, 1.713), (0.30, 1.708), (0.55, 1.702), (0.85, 1.694), (1.10, 1.686), (1.20, 1.655), (1.33, 1.648),
            (1.40, 1.688), (1.62, 1.688), (1.85, 1.655), (2.30, 1.605), (2.80, 1.588), (np.pi, 1.585)]

def head_base(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    Pm = P.copy(); Pm[:, 0] = np.abs(x)
    d = ell(P, (0, 0.030, 1.682), (0.0715, 0.089, 0.085))
    # cara: el plano frontal se inclina (frente hacia atrás, boca algo adelantada)
    Q = P.copy(); Q[:, 1] += 0.06 * (Q[:, 2] - 1.63) * sstep(0.0, -0.05, Q[:, 1])
    d = smin(d, ell(Q, (0, -0.004, 1.628), (0.0605, 0.077, 0.078)), 0.035)
    d = smin(d, seg(Pm, (0.050, 0.016, 1.600), (0.018, -0.049, 1.560), 0.0165, 0.015), 0.028)   # mandíbula
    d = smin(d, ell(P, (0, -0.057, 1.555), (0.019, 0.016, 0.016)), 0.022)                    # barbilla
    d = smin(d, seg(P, (0, 0.012, 1.50), (0, 0.014, 1.60), 0.049, 0.046), 0.035)             # cuello
    return d

EY = 1.654       # altura de los ojos
def face_relief(P):
    """Rasgos como relieve suave sobre la cara (desplazamiento hacia delante, en m)."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ax = np.abs(x)
    front = sstep(-0.01, -0.05, y)
    h = np.zeros(len(P), F32)
    # frente y arco superciliar
    h += 0.0024 * g2(ax, z, 0.026, EY + 0.016, 0.022, 0.008)
    h += 0.0015 * g2(ax, z, 0.0, EY + 0.04, 0.05, 0.02)
    h -= 0.0022 * g2(x, z, 0.0, EY + 0.006, 0.010, 0.007)          # raíz de la nariz
    # cuencas y ojos cerrados (párpado superior marcado)
    h -= 0.0068 * g2(ax, z, 0.030, EY + 0.001, 0.019, 0.012)
    h += 0.0058 * g2(ax, z, 0.0305, EY, 0.0125, 0.0082)
    h -= 0.0006 * np.exp(-((z - EY - 0.0068) / 0.0022) ** 2) * sstep(0.046, 0.038, ax) * sstep(0.014, 0.022, ax)
    # pómulos
    h += 0.0036 * g2(ax, z, 0.047, EY - 0.013, 0.019, 0.012)
    h += 0.0012 * g2(ax, z, 0.036, EY - 0.032, 0.016, 0.014)
    # nariz: caballete que crece hasta la punta, aletas y base
    n0, n1 = EY + 0.004, 1.611
    t = np.clip((n0 - z) / (n0 - n1), 0, 1)
    prof = (0.0008 + 0.0128 * t ** 1.8) * sstep(1.601, 1.609, z) * sstep(n0 + 0.006, n0 - 0.004, z)
    wid = 0.0068 + 0.0075 * t ** 2
    h += prof * np.exp(-(x / wid) ** 2)
    h += 0.0042 * g2(ax, z, 0.0122, 1.6075, 0.0078, 0.006)       # aletas
    h += 0.0030 * g2(x, z, 0.0, 1.6105, 0.0085, 0.0068)           # punta redondeada
    # boca
    h -= 0.0014 * g2(x, z, 0.0, 1.596, 0.0045, 0.0055)            # filtrum
    h += 0.0024 * g2(x, z, 0.0, 1.5885, 0.018, 0.0040) * (1 - 0.25 * g2(x, z, 0, 1.589, 0.004, 0.003))
    h += 0.0030 * g2(x, z, 0.0, 1.5755, 0.0158, 0.0050)
    h -= 0.0013 * np.exp(-((z - 1.5822 + 0.0012 * (ax / 0.02) ** 2) / 0.0009) ** 2) * sstep(0.024, 0.017, ax)
    h -= 0.0008 * g2(ax, z, 0.0225, 1.582, 0.004, 0.004)          # comisuras
    h -= 0.0013 * g2(x, z, 0.0, 1.5665, 0.012, 0.0035)            # surco del mentón
    h += 0.0028 * g2(x, z, 0.0, 1.555, 0.016, 0.009)              # barbilla
    return h * front

def ear_sdf(P):
    Pm = P.copy(); Pm[:, 0] = np.abs(P[:, 0])
    e = ell(Pm, (0.0735, 0.014, 1.652), (0.0105, 0.023, 0.030))
    e = smax(e, -ell(Pm, (0.0815, 0.010, 1.650), (0.0055, 0.0145, 0.019)), 0.005)   # concha
    e = smin(e, seg(Pm, (0.077, 0.0, 1.676), (0.078, 0.028, 1.655), 0.0035), 0.004)   # hélix
    return e

def hair_lift(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    phi = np.arctan2(x, -(y - 0.018))
    hl = interp_abs(phi, HAIRLINE)
    m = sstep(hl - 0.003, hl + 0.009, z)
    top = sstep(1.68, 1.765, z)
    t = 0.0045 + 0.0080 * top + 0.0065 * sstep(1.69, 1.745, z) * sstep(-0.01, -0.07, y) * (0.7 + 0.3 * np.cos(x * 40))   # algo de tupé
    # mechones peinados hacia atrás: surcos anchos y suaves
    th = np.arctan2(x, 0.09 + (z - 1.66) * 0.8)
    comb = np.cos(th * 16 + 2.2 * noise(P, 8, 4) + 1.2 * np.sin(y * 30))
    comb2 = np.cos(th * 37 + 3.0 * noise(P, 14, 6))
    t = t + 0.0016 * comb * (0.4 + 0.6 * top) + 0.0006 * comb2 + 0.0008 * fbm(P, 30, 2, 11)
    return (t * m).astype(F32)

def head_sdf(P, hair=True):
    d = head_base(P) - face_relief(P)
    d = smin(d, ear_sdf(P), 0.006)
    if hair: d = d - hair_lift(P)
    return np.maximum(d, 1.505 - P[:, 2]).astype(F32)

# ======================================================================== MANO
def finger(P, base, dirs, lens, r0, r1):
    pts = [np.asarray(base, F32)]
    for d, L in zip(dirs, lens):
        d = np.asarray(d, F32); d = d / np.linalg.norm(d)
        pts.append(pts[-1] + d * L)
    rs = np.linspace(r0, r1, len(pts))
    out = capsule_pts(P, pts, rs)
    # nudillos algo marcados
    for p, r in zip(pts[1:-1], rs[1:-1]):
        out = smin(out, sph(P, p, r * 1.07), 0.004)
    return out, pts

def bend(a):
    """Dirección hacia abajo (-Z) doblada `a` grados hacia la palma (-X)."""
    t = np.radians(a); return (-np.sin(t), 0.0, -np.cos(t))

def hand_sdf(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    # muñeca
    d = ell(P, (0.0, 0.0, 0.0), (0.019, 0.027, 0.03))
    d = smin(d, seg(P, (0, 0, 0.04), (0, 0, -0.005), 0.021), 0.01)
    # palma: metacarpianos aplanados (más finos en el grosor, eje X)
    Q = P.copy(); Q[:, 0] *= 1.55
    knuckles = []
    for yb in (-0.026, -0.008, 0.010, 0.027):
        k = np.array([0.001, yb, -0.088 + 0.005 * (abs(yb + 0.008) / 0.03) ** 2], F32)
        knuckles.append(k)
        a0 = np.array([0.0, yb * 0.45, -0.015], F32)
        Qa = a0.copy(); Qa[0] *= 1.55; Qk = k.copy(); Qk[0] *= 1.55
        d = smin(d, (seg(Q, Qa, Qk, 0.0135, 0.0125) / 1.25).astype(F32), 0.016)
    d = smin(d, ell(P, (-0.004, -0.004, -0.05), (0.0145, 0.036, 0.036)), 0.02)       # cuerpo de la palma
    d = smin(d, ell(P, (-0.011, -0.024, -0.040), (0.012, 0.016, 0.026)), 0.012)     # eminencia tenar
    d = smin(d, ell(P, (-0.009, 0.028, -0.058), (0.010, 0.011, 0.028)), 0.01)       # hipotenar
    # dedos (índice delante, meñique detrás), algo recogidos hacia la palma
    specs = [((0.043, 0.026, 0.021), 0.0090, 0.0072, (8, 20, 16)),
             ((0.047, 0.029, 0.022), 0.0092, 0.0074, (10, 24, 18)),
             ((0.044, 0.027, 0.021), 0.0088, 0.0071, (12, 26, 18)),
             ((0.036, 0.021, 0.018), 0.0078, 0.0062, (15, 28, 20))]
    for k, (lens, r0, r1, angs) in zip(knuckles, specs):
        spread = float(k[1]) * 0.22
        dirs = []; acc = 0
        for a in angs:
            acc += a; dx, _, dz = bend(acc); dirs.append((dx, spread, dz))
        f, pts = finger(P, k, dirs, lens, r0, r1)
        d = smin(d, f, 0.007)
    # pulgar: nace delante y abajo, cae hacia delante y algo hacia la palma
    tb = np.array([-0.008, -0.022, -0.020], F32)
    dirs = [(-0.30, -0.55, -0.78), (-0.38, -0.30, -0.87), (-0.42, -0.15, -0.89)]
    f, _ = finger(P, tb, dirs, (0.040, 0.030, 0.025), 0.0125, 0.0088)
    d = smin(d, f, 0.012)
    return d.astype(F32)

if __name__ == '__main__':
    from render import render, ao_vertices
    out = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/out_mannequin'
    glb = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/glb_mannequin'
    which = sys.argv[3] if len(sys.argv) > 3 else 'head,hand'
    os.makedirs(out, exist_ok=True); os.makedirs(glb, exist_ok=True)
    if 'head' in which:
        V, F, N, raw = mesh_from_sdf(head_sdf, (-0.10, -0.13, 1.50), (0.10, 0.13, 1.79), h=float(os.environ.get("HH", "0.0009")), target_tris=90000)
        np.savez(f'{out}/cabeza.npz', V=V, F=F, N=N)
        ao = ao_vertices(head_sdf, V + N * 0.0005, N)
        for yaw, tag in ((-28, ''), (-90, '_lado'), (0, '_frente'), (150, '_atras')):
            render([dict(V=V, F=F, N=N, lin=hex2lin('#D9D8D4'), ao=ao)], yaw=yaw, W=420, H=520, bg=(0.022, 0.022, 0.024)).save(f'{out}/cabeza{tag}.png')
        write_glb(f'{glb}/cabeza.glb', [dict(name='cabeza', V=V, F=F, N=N, color='#D9D8D4', rough=0.6, role='body')], 'Cabeza de maniquí')
        print('cabeza', raw, len(F))
    if 'hand' in which:
        V, F, N, raw = mesh_from_sdf(hand_sdf, (-0.07, -0.09, -0.21), (0.04, 0.06, 0.045), h=0.0007, target_tris=30000)
        np.savez(f'{out}/mano.npz', V=V, F=F, N=N)
        ao = ao_vertices(hand_sdf, V + N * 0.0005, N)
        for yaw, tag in ((-60, ''), (90, '_dorso'), (-90, '_palma'), (0, '_frente')):
            render([dict(V=V, F=F, N=N, lin=hex2lin('#D9D8D4'), ao=ao)], yaw=yaw, W=360, H=520, bg=(0.022, 0.022, 0.024)).save(f'{out}/mano{tag}.png')
        write_glb(f'{glb}/mano.glb', [dict(name='mano', V=V, F=F, N=N, color='#D9D8D4', rough=0.6, role='body')], 'Mano de maniquí')
        print('mano', raw, len(F))
