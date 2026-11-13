"""Pespuntes del vaquero: el hilo como puntadas sueltas que siguen la superficie real de la prenda.

1. Cada costura se describe como una serie de rayos (origen dentro de la prenda, dirección hacia fuera)
   muy juntos (~1,5 mm).
2. Se avanza por cada rayo y se busca donde sale de la tela (la cara exterior), con interpolación.
3. Sobre esa polilínea (que ya sigue pliegues y relieves) se reparten las puntadas cada `pitch`:
   cápsulas de hilo de 2,2 mm, algo hundidas en la tela, orientadas con la normal de la superficie.
"""
import numpy as np
from core import F32, frame
import vaquero_baggy as vb
from kit import rrect

PITCH = 0.0032          # una puntada cada 3,2 mm (unas 8 por pulgada, como en el denim)
DASH = 0.0023
RADIUS = 0.00040
SAMPLE = 0.0014


# ------------------------------------------------------------------ geometría de apoyo
def _leg_chain(side):
    H, K, C, A = vb.body().leg[side]
    return [np.asarray(p, F32) for p in (H, K, C, A)]


def leg_rays(side, us, angs):
    """Rayos desde el eje de la pierna (coordenadas u, a de JGar.leg) hacia fuera, en horizontal."""
    z, cx, cy, uu = vb.leg_axis(side)
    us, angs = np.broadcast_arrays(np.asarray(us, F32), np.asarray(angs, F32))
    o = np.argsort(uu)
    zz = np.interp(us, uu[o], z[o])
    O = np.stack([np.interp(zz, z, cx), np.interp(zz, z, cy), zz], 1).astype(F32)
    D = np.stack([np.sin(angs), np.cos(angs), np.zeros_like(angs)], 1).astype(F32)
    return O, D


def xz_rays(xz, front=True):
    xz = np.asarray(xz, F32)
    O = np.stack([xz[:, 0], np.zeros(len(xz), F32), xz[:, 1]], 1)
    D = np.tile(np.array([0, -1.0 if front else 1.0, 0], F32), (len(xz), 1))
    return O, D


def ring_rays(zfun, thetas):
    th = np.asarray(thetas, F32)
    O = np.stack([np.zeros_like(th), np.zeros_like(th), zfun(th)], 1).astype(F32)
    D = np.stack([np.cos(th), np.sin(th), np.zeros_like(th)], 1).astype(F32)
    return O, D


def resample(poly, step=SAMPLE):
    poly = np.asarray(poly, F32)
    seg = np.linalg.norm(np.diff(poly, axis=0), axis=1); s = np.concatenate([[0], np.cumsum(seg)])
    n = max(2, int(s[-1] / step) + 1); t = np.linspace(0, s[-1], n)
    return np.stack([np.interp(t, s, poly[:, k]) for k in range(poly.shape[1])], 1).astype(F32)


def offset_open(poly, d):
    """Desplaza una polilínea 2D (x, z) una distancia d hacia su izquierda."""
    p = np.asarray(poly, F32); t = np.gradient(p, axis=0); t /= np.linalg.norm(t, axis=1)[:, None] + 1e-9
    n = np.stack([-t[:, 1], t[:, 0]], 1)
    return p + n * d


def arc(c, r, a0, a1, step=SAMPLE):
    n = max(3, int(abs(a1 - a0) * r / step))
    a = np.linspace(a0, a1, n)
    return np.stack([c[0] + r * np.cos(a), c[1] + r * np.sin(a)], 1).astype(F32)


# ------------------------------------------------------------------ las costuras
def seam_paths():
    P = []          # (nombre, origen, dirección)
    band_top = lambda th: vb.waist_z(th) - 0.006
    band_bot = lambda th: vb.waist_z(th) - (vb.BAND_W - 0.006)
    ths = np.linspace(-np.pi, np.pi, int(2 * np.pi * 0.21 / SAMPLE))
    ths = ths[np.abs(np.angle(np.exp(1j * (ths + np.pi / 2)))) > 0.03]       # abertura de la bragueta
    for nm, f in (('cinturilla_sup', band_top), ('cinturilla_inf', band_bot)):
        # se parte en dos trozos para no unir los extremos de la abertura
        for k, part in enumerate((ths[ths < -np.pi / 2], ths[ths > -np.pi / 2])):
            if len(part) > 2: P.append((f'{nm}_{k}',) + ring_rays(f, part))
    zb = vb.WAIST_Z - vb.WAIST_SLOPE - vb.BAND_W        # base de la cinturilla delante
    # bragueta en J (doble pespunte) y costura central delantera bajo la bragueta
    for w in (0.036, 0.0295):
        zc = vb.RISE_FRONT + 0.02 + 0.036
        line = np.stack([np.full(40, w), np.linspace(zb - 0.002, zc, 40)], 1)
        rr = w if w == 0.036 else 0.036 - (0.036 - w)
        a = arc((0.0, zc), w, 0.0, -np.pi / 2 + 0.05)
        P.append((f'bragueta_{w}',) + xz_rays(resample(np.concatenate([line, a])), True))
    # bolsillos delanteros: dos pespuntes paralelos a la boca
    for sx in (1, -1):
        c, r0 = vb.front_pocket(sx)
        for k, dr in enumerate((0.0035, 0.0095)):
            r = r0 + dr
            a_top = np.arcsin(np.clip((zb - 0.003 - c[1]) / r, -1, 1))
            a0, a1 = (np.pi - a_top, vb.FP_END) if sx > 0 else (a_top, np.pi - vb.FP_END)
            pts = arc(c, r, a0, a1 if sx > 0 else a1)
            pts = pts[pts[:, 0] * sx < vb.FP_XMAX]
            P.append((f'bolsillo_del_{sx}_{k}',) + xz_rays(pts, True))
    # bolsillo monedero: lados y fondo (doble) + remate de la boca
    cx, cz, w, h = vb.COIN
    for k, ins in enumerate((0.002, 0.0065)):
        poly = [(cx - w / 2 + ins, cz + h / 2 - 0.001), (cx - w / 2 + ins, cz - h / 2 + ins), (cx + w / 2 - ins, cz - h / 2 + ins),
                (cx + w / 2 - ins, cz + h / 2 - 0.001)]
        P.append((f'monedero_{k}',) + xz_rays(resample(poly), True))
    P.append(('monedero_boca',) + xz_rays(resample([(cx - w / 2 + 0.002, cz + h / 2 - 0.009), (cx + w / 2 - 0.002, cz + h / 2 - 0.009)]), True))
    # canesú trasero (doble), costura central trasera (doble)
    xs = np.linspace(-0.195 * vb.XS, 0.195 * vb.XS, int(0.39 / SAMPLE))
    for k, dz in enumerate((0.0035, 0.0095)):
        P.append((f'canesu_{k}',) + xz_rays(np.stack([xs, vb.yoke_z(xs) + dz], 1), False))
    for k, dx in enumerate((0.0035, 0.0095)):
        zs = np.linspace(vb.WAIST_Z + vb.WAIST_SLOPE - vb.BAND_W - 0.002, 0.80, 160)
        P.append((f'central_trasera_{k}',) + xz_rays(np.stack([np.full_like(zs, dx), zs], 1), False))
    # bolsillos traseros: doble pespunte en lados y fondo, dobladillo arriba
    for sx in (1, -1):
        poly = vb.back_pocket(sx)
        ring = np.array(poly[1:] + poly[:1], F32) if sx > 0 else np.array(poly[::-1][:-1] + [poly[0]], F32)
        loop = np.array(poly + [poly[0]], F32)
        # orden: esquina superior exterior -> fondo -> esquina superior interior
        top_in, top_out = np.array(poly[0], F32), np.array(poly[1], F32)
        side_path = np.array([poly[1], poly[2], poly[3], poly[4], poly[0]], F32)
        sp = resample(side_path)
        cen = np.mean(np.array(poly, F32), 0)
        for k, ins in enumerate((0.0022, 0.0075)):
            q = sp + (cen - sp) / np.linalg.norm(cen - sp, axis=1)[:, None] * ins * 1.15
            P.append((f'bolsillo_tras_{sx}_{k}',) + xz_rays(q, False))
        top = resample([top_in + (0.004 * sx, -0.013), top_out + (-0.004 * sx, -0.013)])
        P.append((f'bolsillo_tras_boca_{sx}',) + xz_rays(top, False))
    # piernas: entrepierna (doble), costado (simple) y bajo
    for sd in (1, -1):
        H = _leg_chain(sd)[0]
        u_top = -(vb.WAIST_Z - vb.BAND_W - H[2]) + 0.004
        us = np.arange(u_top, vb.L - 0.004, SAMPLE)
        P.append((f'costado_{sd}',) + leg_rays(sd, us, np.full_like(us, sd * np.pi / 2 - sd * 0.06)))
        us = np.arange(0.085, vb.L - 0.004, SAMPLE)
        for k, da in enumerate((0.035, 0.085)):
            P.append((f'entrepierna_{sd}_{k}',) + leg_rays(sd, us, np.full_like(us, -sd * np.pi / 2 + sd * da)))
        aa = np.linspace(-np.pi, np.pi, int(2 * np.pi * 0.14 / SAMPLE))
        for k, dh in enumerate(() if vb.CUFF else (0.0, 0.0062)):   # bajo con doble pespunte (con vuelta, queda dentro)
            P.append((f'bajo_{sd}_{k}',) + leg_rays(sd, vb.hem_len(aa, sd) - vb.HEM_STITCH + dh, aa))
    return P


def bartack_paths():
    """Presillas arriba y abajo de cada trabilla (sobre la pieza suelta)."""
    out = []
    for i, ph in enumerate(vb.LOOPS):
        zt = vb.waist_z(ph)
        for k, z in enumerate((zt - vb.BAND_W - 0.007 + 0.0035, zt - 0.0015 - 0.0035)):
            dph = 0.0042 / 0.21
            th = np.linspace(ph - dph, ph + dph, 9)
            O, D = ring_rays(lambda t, z=z: np.full_like(t, z), th)
            out.append((f'presilla_{i}_{k}', O, D, {'pitch': 0.0007, 'across': 0.0028, 'r': 0.00030}))
    return out


# ------------------------------------------------------------------ de rayos a superficie
def surface_hits(sdf, O, D, span=0.34, n=700, chunk=900, last=False):
    """Punto donde cada rayo (de dentro a fuera) sale de la tela por la cara exterior."""
    ts = np.linspace(0, span, n).astype(F32)
    hits = np.full((len(O), 3), np.nan, F32)
    for s in range(0, len(O), chunk):
        o = O[s:s + chunk]; d = D[s:s + chunk]
        Q = (o[:, None, :] + ts[None, :, None] * d[:, None, :]).reshape(-1, 3).astype(F32)
        v = sdf(Q).reshape(len(o), n)
        inside = v < 0
        for i in range(len(o)):
            idx = np.nonzero(inside[i])[0]
            if len(idx) == 0: continue
            # último tramo dentro de la tela que se toca (la primera capa desde dentro es la buena)
            j = idx[-1] if last else idx[0]
            while j + 1 < n and inside[i, j + 1]: j += 1
            if j + 1 >= n: continue
            a, b = v[i, j], v[i, j + 1]
            t = ts[j] + (ts[j + 1] - ts[j]) * (-a) / (b - a + 1e-12)
            hits[s + i] = o[i] + d[i] * t
    return hits


def normals(sdf, P, h=0.0006):
    g = np.zeros_like(P)
    for k in range(3):
        e = np.zeros(3, F32); e[k] = h
        g[:, k] = sdf(P + e) - sdf(P - e)
    return g / (np.linalg.norm(g, axis=1)[:, None] + 1e-12)


# ------------------------------------------------------------------ malla del hilo
def _capsule(p0, p1, nrm, r, sides=6, rings=5):
    ax = p1 - p0; L = np.linalg.norm(ax); ax /= L
    b1 = nrm - ax * (nrm @ ax); b1 /= np.linalg.norm(b1) + 1e-12; b2 = np.cross(ax, b1)
    V = []; N = []
    for i in range(rings):
        t = i / (rings - 1); prof = np.sin(np.pi * (0.08 + 0.84 * t)) ** 0.6
        c = p0 + ax * L * t
        for j in range(sides):
            ang = 2 * np.pi * j / sides
            n = b1 * np.cos(ang) * 0.85 + b2 * np.sin(ang)          # un poco aplastada contra la tela
            V.append(c + (b1 * np.cos(ang) * 0.75 + b2 * np.sin(ang)) * r * prof); N.append(n / np.linalg.norm(n))
    V.append(p0 - ax * r * 0.2); N.append(-ax); V.append(p1 + ax * r * 0.2); N.append(ax)
    F = []
    for i in range(rings - 1):
        for j in range(sides):
            a = i * sides + j; b = i * sides + (j + 1) % sides; c = a + sides; d = b + sides
            F += [(a, b, c), (b, d, c)]          # caras hacia fuera (como las normales)
    s0 = rings * sides; s1 = s0 + 1
    for j in range(sides):
        F.append((s0, (j + 1) % sides, j))
        F.append((s1, (rings - 1) * sides + j, (rings - 1) * sides + (j + 1) % sides))
    return np.array(V, F32), np.array(F, np.uint32), np.array(N, F32)


def stitch_mesh(sdf, paths, pitch=PITCH, dash=DASH, r=RADIUS, sink=-0.00005, extra=()):   # el hilo queda por encima de la tela
    """paths: costuras sobre la tela (sdf). extra: [(sdf_pieza, [(nombre, O, D, opciones)])] para
    piezas sueltas (presillas de las trabillas): el rayo busca la ÚLTIMA capa que atraviesa."""
    allO = np.concatenate([p[1] for p in paths]); allD = np.concatenate([p[2] for p in paths])
    H = surface_hits(sdf, allO, allD)
    Nn = np.full_like(H, np.nan); ok = ~np.isnan(H[:, 0])
    Nn[ok] = normals(sdf, H[ok])
    paths = [p if len(p) == 4 else p + ({},) for p in paths]
    for fn, ps in extra:
        O = np.concatenate([p[1] for p in ps]); D = np.concatenate([p[2] for p in ps])
        h = surface_hits(fn, O, D, last=True); nn = np.full_like(h, np.nan); okk = ~np.isnan(h[:, 0])
        nn[okk] = normals(fn, h[okk])
        H = np.concatenate([H, h]); Nn = np.concatenate([Nn, nn]); paths = paths + list(ps)
    VV = []; FF = []; NN = []; off = 0; count = 0; info = {'costuras': {}}
    k0 = 0
    for name, O, D, opt in paths:
        p_pitch = opt.get('pitch', pitch); p_dash = opt.get('dash', dash); p_r = opt.get('r', r)
        h = H[k0:k0 + len(O)]; n = Nn[k0:k0 + len(O)]; k0 += len(O)
        m = ~np.isnan(h[:, 0])
        if name.startswith('entrepierna'): m &= np.abs(np.nan_to_num(h[:, 0], nan=1.0)) > 0.014
        # trozos continuos (sin saltos grandes: rayos que fallan o saltan de capa)
        runs = []; cur = []
        for i in range(len(h)):
            if m[i] and (not cur or np.linalg.norm(h[i] - h[cur[-1]]) < 0.012):
                cur.append(i)
            else:
                if len(cur) > 3: runs.append(cur)
                cur = [i] if m[i] else []
        if len(cur) > 3: runs.append(cur)
        nst = 0
        for run in runs:
            p = h[run]; nr = n[run]
            seg = np.linalg.norm(np.diff(p, axis=0), axis=1); s = np.concatenate([[0], np.cumsum(seg)])
            if opt.get('across'):        # presilla: puntadas cortas cruzadas, muy juntas
                tw = opt['across']
            for s0 in np.arange(p_pitch * 0.4, s[-1] - (0 if opt.get('across') else p_dash), p_pitch):
                a = np.array([np.interp(s0, s, p[:, k]) for k in range(3)], F32)
                nn = np.array([np.interp(s0, s, nr[:, k]) for k in range(3)], F32); nn /= np.linalg.norm(nn) + 1e-12
                if opt.get('across'):
                    tg = np.array([np.interp(min(s0 + 0.001, s[-1]), s, p[:, k]) for k in range(3)], F32) - a
                    side = np.cross(nn, tg); side /= np.linalg.norm(side) + 1e-12
                    b = a + side * tw / 2; a = a - side * tw / 2
                else:
                    b = np.array([np.interp(s0 + p_dash, s, p[:, k]) for k in range(3)], F32)
                a -= nn * sink; b -= nn * sink
                v, f, vn = _capsule(a, b, nn, p_r)
                VV.append(v); FF.append(f + off); NN.append(vn); off += len(v); nst += 1
        info['costuras'][name] = {'rayos': int(len(O)), 'fallos': int((~m).sum()), 'puntadas': nst}
        count += nst
    info['puntadas'] = count
    return np.concatenate(VV), np.concatenate(FF), np.concatenate(NN), info
