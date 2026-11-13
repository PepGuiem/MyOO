# -*- coding: utf-8 -*-
"""
Maniquí de tienda para MyOut: modelado, exportación para la web e imágenes 360°.

Ejecutar en Blender 5.2:
  - Consola de Python (espacio Scripting):
        exec(open(r'C:\\Users\\Usuario\\Documents\\MyOut\\prendas_casual_glb\\generador\\blender_maniqui_360.py', encoding='utf-8').read())
  - o en segundo plano:
        blender --background --python blender_maniqui_360.py

Se puede cambiar la configuración antes de ejecutarlo con variables de entorno
(MANIQUI_SEXO=mujer, MANIQUI_FASES=modelar,exportar, MANIQUI_VISTAS=8, MANIQUI_MUESTRAS=64)
o editando el bloque CONFIGURACIÓN.

Unidades en metros, Z arriba, origen entre los pies (Z = 0), el maniquí mira a −Y.
En el GLB (glTF, +Y arriba) eso queda con el frente hacia +Z, como espera la web.
"""
import math
import os
import time

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

# =============================================================================
# CONFIGURACIÓN
# =============================================================================
SALIDA = os.environ.get('MANIQUI_SALIDA', r'C:\Users\Usuario\Documents\MyOut\prendas_casual_glb\maniqui\blender_360')
SEXO = os.environ.get('MANIQUI_SEXO', 'hombre')          # 'hombre' o 'mujer'
FASES = set(os.environ.get('MANIQUI_FASES', 'modelar,exportar,render').split(','))
VISTAS = int(os.environ.get('MANIQUI_VISTAS', '24'))      # vuelta de 360°: 24 = cada 15°
RESOLUCION = (1080, 1920)                                # ancho x alto de cada imagen
MUESTRAS = int(os.environ.get('MANIQUI_MUESTRAS', '128'))
FONDO_TRANSPARENTE = os.environ.get('MANIQUI_TRANSPARENTE', '1') == '1'
RIG = os.environ.get('MANIQUI_RIG', '0') == '1'
VIDEO = os.environ.get('MANIQUI_VIDEO', '0') == '1'       # MP4 de la vuelta (120 fotogramas)
LOD_TRIANGULOS = 30000                                   # versión ligera del cuerpo
REFERENCIAS = os.environ.get('MANIQUI_REFERENCIAS', '')   # carpeta con ref_000.jpg, ref_045.jpg…

# Tamaño de vóxel del remallado (m): más pequeño = más detalle y más triángulos
VOXEL = {'cuerpo': 0.002, 'cabeza': 0.0009, 'mano': 0.0007}

# Medidas (cm salvo la altura en m). Contornos de pecho, cintura y cadera; hombros de lado a lado.
MEDIDAS = {
    'hombre': {'altura': 1.78, 'hombros': 45, 'pecho': 98, 'cintura': 82, 'cadera': 96, 'brazo': 31},
    'mujer': {'altura': 1.68, 'hombros': 38, 'pecho': 90, 'cintura': 72, 'cadera': 96, 'brazo': 27},
}
BRAZOS_GRADOS = 32.0       # apertura de los brazos respecto al cuerpo (como la ropa)
SEPARACION_PIES = 0.18     # m entre los centros de los tobillos

# Acabado
LACADO = (0xE7, 0xE6, 0xE2)
FONDO = (0x1B, 0x1B, 0x1E)

# =============================================================================
COLECCION = 'Maniquí'
COL_REF = 'Maniquí referencias'
COL_ESTUDIO = 'Maniquí estudio'
SUF = '_f' if SEXO == 'mujer' else ''
M = MEDIDAS[SEXO]
H = M['altura']
K = H / 1.78               # escala vertical respecto al cuerpo de referencia
FEM = SEXO == 'mujer'
T0 = time.time()
REGISTRO = []


def log(msg):
    linea = f'[{time.time() - T0:6.1f} s] {msg}'
    print('[maniquí]', linea)
    REGISTRO.append(linea)


def srgb(c):
    """Color 0-255 (sRGB) a lineal RGBA para los materiales."""
    def lin(v):
        v = v / 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (lin(c[0]), lin(c[1]), lin(c[2]), 1.0)


# =============================================================================
# Utilidades de escena
# =============================================================================
def coleccion(nombre, limpiar=False):
    col = bpy.data.collections.get(nombre)
    if col is None:
        col = bpy.data.collections.new(nombre)
        bpy.context.scene.collection.children.link(col)
    elif limpiar:
        for o in list(col.objects):
            datos = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if datos is not None and getattr(datos, 'users', 1) == 0:
                if isinstance(datos, bpy.types.Mesh):
                    bpy.data.meshes.remove(datos)
                elif isinstance(datos, bpy.types.Light):
                    bpy.data.lights.remove(datos)
                elif isinstance(datos, bpy.types.Camera):
                    bpy.data.cameras.remove(datos)
                elif isinstance(datos, bpy.types.Armature):
                    bpy.data.armatures.remove(datos)
    return col


def nuevo_objeto(nombre, datos, col):
    viejo = bpy.data.objects.get(nombre)
    if viejo is not None:
        bpy.data.objects.remove(viejo, do_unlink=True)
    o = bpy.data.objects.new(nombre, datos)
    col.objects.link(o)
    return o


def aplicar_modificadores(o):
    """Aplica los modificadores sin depender del contexto de la interfaz."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    viejo = o.data
    o.modifiers.clear()
    o.data = me
    if viejo.users == 0:
        bpy.data.meshes.remove(viejo)


def material(nombre, color, rugosidad, metal=0.0, coat=0.0):
    mat = bpy.data.materials.get(nombre) or bpy.data.materials.new(nombre)
    if mat.node_tree is None:
        mat.use_nodes = True
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        bsdf = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    entradas = {'Base Color': color, 'Roughness': rugosidad, 'Metallic': metal, 'Coat Weight': coat, 'Coat Roughness': 0.08}
    for k, v in entradas.items():
        if k in bsdf.inputs:
            bsdf.inputs[k].default_value = v
    mat.diffuse_color = color
    return mat


def triangulos(o):
    me = o.data
    me.calc_loop_triangles()
    return len(me.loop_triangles)


# =============================================================================
# Geometría: anillos superelípticos y tubos cerrados
# =============================================================================
def perimetro_elipse(a, b):
    return math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))


def semiejes(contorno_cm, proporcion):
    """Semiejes (ancho, fondo) de una sección con ese contorno y fondo/ancho = proporción."""
    c = contorno_cm / 100.0
    a = c / perimetro_elipse(1.0, proporcion)
    return a, a * proporcion


def marco(tangente, lateral):
    t = tangente.normalized()
    s = (lateral - t * lateral.dot(t)).normalized()
    u = t.cross(s).normalized()
    return t, s, u


def _catmull(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


def densificar(anillos, pasos=10):
    """
    Muchos anillos intermedios con una curva suave (Catmull-Rom) por centros y
    semiejes: sin ellos, entre dos secciones la superficie es recta y se ven bandas.
    """
    if len(anillos) < 3:
        return anillos
    cs = [Vector(a[0]) for a in anillos]
    vals = [np.array([a[3], a[4], a[5]], dtype=float) for a in anillos]
    lat = Vector(anillos[0][2])
    out = []
    n = len(anillos)
    for i in range(n - 1):
        i0, i1, i2, i3 = max(i - 1, 0), i, i + 1, min(i + 2, n - 1)
        for k in range(pasos):
            t = k / pasos
            c = _catmull(cs[i0], cs[i1], cs[i2], cs[i3], t)
            v = _catmull(vals[i0], vals[i1], vals[i2], vals[i3], t)
            lo = np.minimum(vals[i1], vals[i2]) * 0.85   # sin rebotes raros
            hi = np.maximum(vals[i1], vals[i2]) * 1.08
            v = np.clip(v, lo, hi)
            out.append([c, None, lat, float(v[0]), float(v[1]), float(v[2])])
    out.append([cs[-1], None, lat, float(vals[-1][0]), float(vals[-1][1]), float(vals[-1][2])])
    # Tangente: la de la curva en cada punto
    for j, a in enumerate(out):
        p = out[max(j - 1, 0)][0]
        q = out[min(j + 1, len(out) - 1)][0]
        tan = q - p
        a[1] = tan if tan.length > 1e-9 else Vector(anillos[0][1])
    return [tuple(a) for a in out]


def tubo(bm, anillos, n_seg=96, tapas=True, suave=True):
    """
    Malla cerrada a partir de una lista de anillos. Cada anillo:
    (centro, tangente, lateral, a, b, n): a = semieje según «lateral», b según el otro
    eje perpendicular, n = exponente de superelipse (2 = elipse, más = más cuadrado).
    Con `suave`, se interpolan anillos intermedios con una curva.
    """
    if suave:
        anillos = densificar(anillos)
    filas = []
    for (c, tan, lat, a, b, n) in anillos:
        _, s, u = marco(Vector(tan), Vector(lat))
        fila = []
        for k in range(n_seg):
            ang = 2 * math.pi * k / n_seg
            ca, sa = math.cos(ang), math.sin(ang)
            x = math.copysign(abs(ca) ** (2.0 / n), ca) * a
            y = math.copysign(abs(sa) ** (2.0 / n), sa) * b
            fila.append(bm.verts.new(Vector(c) + s * x + u * y))
        filas.append(fila)
    for f0, f1 in zip(filas, filas[1:]):
        for k in range(n_seg):
            k2 = (k + 1) % n_seg
            bm.faces.new((f0[k], f0[k2], f1[k2], f1[k]))
    if tapas:
        for fila, centro in ((filas[0], anillos[0][0]), (filas[-1], anillos[-1][0])):
            v = bm.verts.new(Vector(centro))
            for k in range(n_seg):
                bm.faces.new((fila[k], fila[(k + 1) % n_seg], v))


def elipsoide(bm, centro, radios, seg=32, anillos_=16):
    """Elipsoide cerrado (para volúmenes: hombros, pecho, glúteos)."""
    m = Matrix.Diagonal((radios[0], radios[1], radios[2], 1.0))
    m.translation = Vector(centro)
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=anillos_, radius=1.0, matrix=m)


def malla_desde_bm(nombre, bm, col):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(nombre)
    bm.to_mesh(me)
    bm.free()
    return nuevo_objeto(nombre, me, col)


def remallar(o, voxel, suavizado=8, factor=0.55):
    """Une todas las piezas solapadas en una sola superficie cerrada y la suaviza."""
    r = o.modifiers.new('Remallado', 'REMESH')
    r.mode = 'VOXEL'
    r.voxel_size = voxel
    r.adaptivity = 0.0
    if hasattr(r, 'use_smooth_shade'):
        r.use_smooth_shade = True
    if suavizado:
        s = o.modifiers.new('Suavizado', 'LAPLACIANSMOOTH')
        s.iterations = suavizado
        s.lambda_factor = factor
        s.use_volume_preserve = True
        s.use_normalized = True
    aplicar_modificadores(o)
    for p in o.data.polygons:
        p.use_smooth = True


# =============================================================================
# Proporciones del cuerpo
# =============================================================================
def z(v):
    """Altura del cuerpo de referencia (1,78 m) escalada a la altura elegida."""
    return v * K


def puntos_brazo(s):
    """Hombro, dirección del brazo y su longitud para el lado s (+1 izquierda, −1 derecha)."""
    ancho = M['hombros'] / 100.0
    hombro = Vector((s * (ancho / 2 - 0.035), 0.0, z(1.405)))
    ang = math.radians(BRAZOS_GRADOS)
    d = Vector((s * math.sin(ang), 0.0, -math.cos(ang))).normalized()
    return hombro, d, 0.56 * K


def construir_cuerpo(col):
    bm = bmesh.new()
    X, Y, Zv = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    hombros = M['hombros'] / 100.0
    pecho, cintura, cadera = M['pecho'], M['cintura'], M['cadera']

    # --- Tronco: secciones de la entrepierna al cuello (contorno, fondo/ancho, n, desplazamiento y)
    r_pecho = 0.74 if FEM else 0.66
    filas = [
        (0.835, None, (0.085, 0.060), 2.2, 0.000),
        (0.870, cadera * 0.90, 0.68, 2.3, 0.006),
        (0.930, cadera, 0.70, 2.3, 0.012),
        (1.000, (cadera + cintura) / 2, 0.72, 2.2, 0.006),
        (1.080, cintura, 0.73 if not FEM else 0.70, 2.2, 0.000),
        (1.180, (cintura + pecho) / 2, 0.70, 2.3, -0.004),
        (1.280, pecho, r_pecho, 2.4, -0.008),
        (1.355, pecho * 0.97, 0.62, 2.6, -0.006),
        (1.410, None, (hombros / 2 - 0.022, 0.084), 2.8, 0.000),
        (1.445, None, (hombros / 2 - 0.045, 0.076), 2.6, 0.002),
        (1.480, None, (0.105 * (0.9 if FEM else 1), 0.064), 2.3, 0.005),
        (1.505, None, (0.066, 0.060), 2.0, 0.006),
    ]
    anillos = []
    for (zz, cont, prop, n, dy) in filas:
        if cont is None:
            a, b = prop
        else:
            a, b = semiejes(cont, prop)
        anillos.append(((0.0, dy, z(zz)), Zv, X, a, b, n))
    tubo(bm, anillos, n_seg=72)

    # --- Glúteos y (en mujer) pecho: volúmenes suaves que el remallado une al tronco
    for s in (1, -1):
        elipsoide(bm, (s * 0.058, 0.040, z(0.915)), (0.085, 0.075, 0.095))
        if FEM:
            elipsoide(bm, (s * 0.062, -0.052, z(1.255)), (0.068, 0.060, 0.062))

    # --- Piernas
    pie_x = SEPARACION_PIES / 2
    for s in (1, -1):
        pierna = [  # (x, y, z, ancho, fondo)
            (0.090, 0.004, 0.900, 0.090, 0.092),
            (0.090, 0.000, 0.760, 0.076, 0.080),
            (0.088, -0.004, 0.620, 0.062, 0.066),
            (pie_x, -0.004, 0.505, 0.050, 0.053),
            (pie_x, 0.008, 0.380, 0.054, 0.060),
            (pie_x, 0.006, 0.250, 0.042, 0.046),
            (pie_x, 0.004, 0.120, 0.031, 0.034),
            (pie_x, 0.008, 0.060, 0.033, 0.036),
        ]
        if FEM:
            pierna = [(x, y, zz, a * 0.93, b * 0.93) for (x, y, zz, a, b) in pierna]
        an = []
        for i, (x, y, zz, a, b) in enumerate(pierna):
            p = Vector((s * x, y, z(zz)))
            q = Vector((s * pierna[min(i + 1, len(pierna) - 1)][0], pierna[min(i + 1, len(pierna) - 1)][1], z(pierna[min(i + 1, len(pierna) - 1)][2])))
            pp = Vector((s * pierna[max(i - 1, 0)][0], pierna[max(i - 1, 0)][1], z(pierna[max(i - 1, 0)][2])))
            tan = (pp - q) if i < len(pierna) - 1 else (pp - p)
            an.append((p, tan, X, a, b, 2.1))
        tubo(bm, an)
        # Pie: del talón (detrás, +y) a la punta (−y), plano por debajo
        pie = [  # (y, ancho, alto)
            (0.050, 0.020, 0.022),
            (0.040, 0.031, 0.034),
            (-0.020, 0.042, 0.040),
            (-0.100, 0.046, 0.030),
            (-0.165, 0.040, 0.020),
            (-0.195, 0.022, 0.011),
        ]
        escala_pie = 0.92 if FEM else 1.0
        an = []
        for (y, a, b) in pie:
            an.append(((s * (pie_x + 0.004), y * escala_pie, b + 0.001), -Y, X, a * escala_pie, b, 2.6))
        tubo(bm, an)

    # --- Brazos (los hombros, redondeados con un volumen)
    c_brazo = M['brazo']
    r_brazo = c_brazo / 100.0 / (2 * math.pi)
    for s in (1, -1):
        hombro, d, largo = puntos_brazo(s)
        # deltoides: un volumen suave metido en el hombro (no una bola encima)
        elipsoide(bm, hombro + Vector((-s * 0.012, 0.0, -0.022)), (0.052 * (0.88 if FEM else 1), 0.054, 0.056))
        perfil = [  # (distancia a lo largo del brazo, radio lateral, radio delante-detrás)
            (0.000, 0.052, 0.054),
            (0.060, 0.050, 0.054),
            (0.150, r_brazo * 1.02, r_brazo * 0.98),
            (0.270, 0.038, 0.040),
            (0.360, 0.043, 0.036),
            (0.500, 0.029, 0.021),
            (0.560, 0.027, 0.019),
        ]
        an = []
        for (t, a, b) in perfil:
            f = 0.88 if FEM else 1.0
            an.append((hombro + d * (t * K), d, Y, b * f, a * f, 2.1))
        tubo(bm, an)

    o = malla_desde_bm(f'cuerpo_tienda{SUF}', bm, col)
    log(f'Cuerpo: piezas unidas, remallando a {VOXEL["cuerpo"] * 1000:.1f} mm…')
    remallar(o, VOXEL['cuerpo'], suavizado=24, factor=1.0)
    juntas(o)
    log(f'Cuerpo listo: {triangulos(o):,} triángulos')
    return o


def juntas(o, profundidad=0.0008, media_anchura=0.0022):
    """Ranuras de maniquí desmontable: cintura y brazos (solo hunden: no cambian el ajuste)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.normal_update()
    planos = [(Vector((0, 0, z(0.99))), Vector((0, 0, 1)), None)]
    for s in (1, -1):
        hombro, d, _ = puntos_brazo(s)
        planos.append((hombro + d * 0.095 * K, d, (hombro, d)))
    for v in bm.verts:
        for (p, n, eje) in planos:
            dist = (v.co - p).dot(n)
            if abs(dist) >= media_anchura:
                continue
            if eje is None:
                if abs(v.co.x) > 0.20:          # solo el tronco, no los brazos
                    continue
            else:
                h0, dd = eje
                rel = v.co - h0
                radial = (rel - dd * rel.dot(dd)).length
                if radial > 0.075:
                    continue
            peso = 1 - (dist / media_anchura) ** 2
            v.co -= v.normal * profundidad * peso
    bm.to_mesh(o.data)
    bm.free()


def construir_cabeza(col):
    bm = bmesh.new()
    Zv, X = Vector((0, 0, 1)), Vector((1, 0, 0))
    f = 0.95 if FEM else 1.0
    # Cuello largo (entra en el tronco) y cabeza en forma de huevo, sin cara
    cuello = [
        ((0, 0.004, z(1.440)), 0.064 * f, 0.061 * f),
        ((0, 0.006, z(1.490)), 0.060 * f, 0.058 * f),
        ((0, 0.008, z(1.545)), 0.052 * f, 0.051 * f),
        ((0, 0.010, z(1.600)), 0.050 * f, 0.050 * f),
    ]
    tubo(bm, [(c, Zv, X, a, b, 2.0) for (c, a, b) in cuello])
    cima = H
    perfil = [  # (altura bajo la cima, ancho, fondo)
        (0.230, 0.022, 0.024),
        (0.215, 0.052, 0.060),
        (0.180, 0.069, 0.084),
        (0.130, 0.076, 0.096),
        (0.080, 0.074, 0.094),
        (0.040, 0.061, 0.078),
        (0.015, 0.038, 0.050),
        (0.002, 0.008, 0.010),
    ]
    an = [((0, 0.012, cima - dz * f), Zv, X, a * f, b * f, 2.0) for (dz, a, b) in perfil]
    tubo(bm, an)
    o = malla_desde_bm(f'cabeza_tienda{SUF}', bm, col)
    log('Cabeza: remallando…')
    remallar(o, VOXEL['cabeza'], suavizado=20, factor=1.0)
    log(f'Cabeza lista: {triangulos(o):,} triángulos')
    return o


def construir_mano(col):
    """Mano derecha (lado −x) con los dedos juntos y el pulgar pegado."""
    bm = bmesh.new()
    s = -1
    hombro, d, largo = puntos_brazo(s)
    muneca = hombro + d * largo
    Y = Vector((0, 1, 0))
    f = (0.92 if FEM else 1.0) * K
    perfil = [  # (distancia desde la muñeca, ancho delante-detrás, grosor)
        (-0.010, 0.026, 0.019),
        (0.030, 0.040, 0.017),
        (0.085, 0.043, 0.014),
        (0.120, 0.040, 0.012),
        (0.160, 0.033, 0.010),
        (0.182, 0.018, 0.007),
    ]
    tubo(bm, [(muneca + d * (t * f), d, Y, a * f, b * f, 2.5) for (t, a, b) in perfil])
    # Pulgar: sale de la base de la palma hacia delante y abajo, pegado a la mano
    base = muneca + d * (0.035 * f) + Vector((0, -0.028 * f, 0))
    dir_p = (d * 0.75 + Vector((0, -0.45, 0))).normalized()
    pulgar = [(0.0, 0.013), (0.035, 0.012), (0.065, 0.009), (0.075, 0.005)]
    tubo(bm, [(base + dir_p * (t * f), dir_p, Y, r * f, r * f * 0.9, 2.0) for (t, r) in pulgar])
    o = malla_desde_bm('mano_tienda', bm, col)
    log('Mano: remallando…')
    remallar(o, VOXEL['mano'], suavizado=14, factor=0.8)
    log(f'Mano lista: {triangulos(o):,} triángulos')
    return o


def construir_peana(col):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=96, radius1=0.11, radius2=0.105, depth=0.015,
                          matrix=Matrix.Translation((0, 0, 0.0075)))
    me = bpy.data.meshes.new('peana')
    bm.to_mesh(me)
    bm.free()
    peana = nuevo_objeto('peana', me, col)
    peana.data.materials.append(material('Metal oscuro', srgb((28, 28, 30)), 0.35, metal=1.0))
    # Varilla: detrás del talón derecho, entra en la pantorrilla
    bm = bmesh.new()
    alto = z(0.36) - 0.015
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.006, radius2=0.006, depth=alto,
                          matrix=Matrix.Translation((-(SEPARACION_PIES / 2), 0.060, 0.015 + alto / 2)))
    me = bpy.data.meshes.new('varilla')
    bm.to_mesh(me)
    bm.free()
    varilla = nuevo_objeto('varilla', me, col)
    varilla.data.materials.append(material('Acero', srgb((170, 172, 176)), 0.25, metal=1.0))
    for o in (peana, varilla):
        for p in o.data.polygons:
            p.use_smooth = True
    return peana, varilla


def referencias():
    """Fotos de referencia 360° (ref_000.jpg, ref_045.jpg…) alrededor del maniquí."""
    if not REFERENCIAS or not os.path.isdir(REFERENCIAS):
        return
    col = coleccion(COL_REF, limpiar=True)
    for nombre in sorted(os.listdir(REFERENCIAS)):
        base, ext = os.path.splitext(nombre)
        if not base.startswith('ref_') or ext.lower() not in ('.jpg', '.jpeg', '.png'):
            continue
        try:
            ang = float(base[4:])
        except ValueError:
            continue
        img = bpy.data.images.load(os.path.join(REFERENCIAS, nombre), check_existing=True)
        e = nuevo_objeto(f'referencia_{int(ang):03d}', None, col)
        e.empty_display_type = 'IMAGE'
        e.data = img
        e.empty_display_size = H * 1.1
        e.empty_image_offset = (-0.5, 0.0)
        e.use_empty_image_alpha = True
        e.color[3] = 0.45
        a = math.radians(ang)
        # La foto de 0° mira al frente del maniquí (−y); se coloca detrás, a 1,2 m
        e.location = (math.sin(a) * 1.2, math.cos(a) * 1.2, 0.0)
        e.rotation_euler = (math.radians(90), 0.0, a + math.pi)
        e.hide_render = True
        log(f'Referencia {nombre} a {ang:.0f}°')


# =============================================================================
# Fases
# =============================================================================
def fase_modelar():
    col = coleccion(COLECCION, limpiar=True)
    referencias()
    lacado = material('Fibra lacada', srgb(LACADO), 0.38, coat=0.55)
    cuerpo = construir_cuerpo(col)
    cabeza = construir_cabeza(col)
    mano = construir_mano(col)
    for o in (cuerpo, cabeza, mano):
        o.data.materials.clear()
        o.data.materials.append(lacado)
    construir_peana(col)
    if RIG:
        rig(col, cuerpo, cabeza, mano)
    return col


def rig(col, cuerpo, cabeza, mano):
    arm = bpy.data.armatures.new('esqueleto')
    o = nuevo_objeto('esqueleto', arm, col)
    vl = bpy.context.view_layer
    vl.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT')
    huesos = {}

    def hueso(nombre, a, b, padre=None):
        h = arm.edit_bones.new(nombre)
        h.head, h.tail = Vector(a), Vector(b)
        if padre:
            h.parent = huesos[padre]
            h.use_connect = (h.parent.tail - h.head).length < 1e-4
        huesos[nombre] = h

    hueso('cadera', (0, 0, z(0.93)), (0, 0, z(1.02)))
    hueso('columna', (0, 0, z(1.02)), (0, 0, z(1.20)), 'cadera')
    hueso('pecho', (0, 0, z(1.20)), (0, 0, z(1.40)), 'columna')
    hueso('cuello', (0, 0, z(1.40)), (0, 0.01, z(1.56)), 'pecho')
    hueso('cabeza', (0, 0.01, z(1.56)), (0, 0.01, H), 'cuello')
    for s, lado in ((1, 'L'), (-1, 'R')):
        hombro, d, largo = puntos_brazo(s)
        hueso(f'clavicula.{lado}', (s * 0.02, 0, z(1.40)), hombro, 'pecho')
        codo = hombro + d * 0.28 * K
        muneca = hombro + d * largo
        hueso(f'brazo.{lado}', hombro, codo, f'clavicula.{lado}')
        hueso(f'antebrazo.{lado}', codo, muneca, f'brazo.{lado}')
        hueso(f'mano.{lado}', muneca, muneca + d * 0.17 * K, f'antebrazo.{lado}')
        px = s * SEPARACION_PIES / 2
        hueso(f'muslo.{lado}', (s * 0.09, 0, z(0.90)), (px, 0, z(0.50)), 'cadera')
        hueso(f'pierna.{lado}', (px, 0, z(0.50)), (px, 0.01, z(0.07)), f'muslo.{lado}')
        hueso(f'pie.{lado}', (px, 0.01, z(0.07)), (px, -0.15, 0.02), f'pierna.{lado}')
    bpy.ops.object.mode_set(mode='OBJECT')
    try:
        for x in vl.objects:
            x.select_set(False)
        cuerpo.select_set(True)
        cabeza.select_set(True)
        o.select_set(True)
        vl.objects.active = o
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        mano.parent = o
        mano.parent_type = 'BONE'
        mano.parent_bone = 'mano.R'
        mano.matrix_parent_inverse = (o.matrix_world @ Matrix.Translation(o.pose.bones['mano.R'].tail)).inverted()
        log('Rig: esqueleto con pesos automáticos')
    except Exception as err:  # noqa: BLE001
        log(f'Rig: no se pudieron calcular los pesos automáticos ({err})')


def exportar_glb(o, ruta):
    vl = bpy.context.view_layer
    for x in vl.objects:
        x.select_set(False)
    o.hide_set(False)
    o.select_set(True)
    vl.objects.active = o
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    opciones = dict(
        filepath=ruta, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
        export_texcoords=False, export_normals=True, export_cameras=False, export_lights=False,
        export_materials='EXPORT', export_animations=False, export_skins=False, export_morph=False,
        export_vertex_color='NONE', export_extras=False,
    )
    bpy.ops.export_scene.gltf(**{k: v for k, v in opciones.items() if k in props})


def fase_exportar(col):
    os.makedirs(os.path.join(SALIDA, 'lod'), exist_ok=True)
    piezas = [o for o in col.objects if o.type == 'MESH' and o.name.split('.')[0] in
              (f'cuerpo_tienda{SUF}', f'cabeza_tienda{SUF}', 'mano_tienda')]
    for o in piezas:
        ruta = os.path.join(SALIDA, f'{o.name}.glb')
        exportar_glb(o, ruta)
        tris = triangulos(o)
        log(f'Exportado {ruta} ({tris:,} triángulos, {os.path.getsize(ruta) / 1e6:.1f} MB)')
        # Versión ligera
        objetivo = LOD_TRIANGULOS if o.name.startswith('cuerpo') else LOD_TRIANGULOS // 3
        copia = o.copy()
        copia.data = o.data.copy()
        col.objects.link(copia)
        if tris > objetivo:
            dec = copia.modifiers.new('Ligera', 'DECIMATE')
            dec.decimate_type = 'COLLAPSE'
            dec.ratio = objetivo / tris
            aplicar_modificadores(copia)
        ruta_lod = os.path.join(SALIDA, 'lod', f'{o.name}.glb')
        copia.name = o.name + '_lod'
        exportar_glb(copia, ruta_lod)
        log(f'Exportado {ruta_lod} ({triangulos(copia):,} triángulos)')
        datos = copia.data
        bpy.data.objects.remove(copia, do_unlink=True)
        bpy.data.meshes.remove(datos)
    if RIG and bpy.data.objects.get('esqueleto'):
        vl = bpy.context.view_layer
        for x in vl.objects:
            x.select_set(False)
        for o in piezas + [bpy.data.objects['esqueleto']]:
            o.select_set(True)
        ruta = os.path.join(SALIDA, f'maniqui_tienda{SUF}_rig.glb')
        props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
        opciones = dict(filepath=ruta, export_format='GLB', use_selection=True, export_skins=True, export_cameras=False, export_lights=False)
        bpy.ops.export_scene.gltf(**{k: v for k, v in opciones.items() if k in props})
        log(f'Exportado {ruta} (con esqueleto)')
    ruta_blend = os.path.join(SALIDA, f'maniqui_tienda{SUF}.blend')
    bpy.ops.wm.save_as_mainfile(filepath=ruta_blend, copy=True)
    log(f'Guardado {ruta_blend}')


# -----------------------------------------------------------------------------
# Render
# -----------------------------------------------------------------------------
def configurar_cycles(escena):
    escena.render.engine = 'CYCLES'
    escena.cycles.samples = MUESTRAS
    escena.cycles.use_denoising = True
    escena.cycles.device = 'CPU'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for tipo in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
            try:
                prefs.compute_device_type = tipo
            except TypeError:
                continue
            if hasattr(prefs, 'refresh_devices'):
                prefs.refresh_devices()
            else:
                prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == tipo]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type == tipo
                escena.cycles.device = 'GPU'
                log(f'Render con GPU ({tipo}: {", ".join(d.name for d in gpus)})')
                break
        else:
            prefs.compute_device_type = 'NONE'
            log('Render con CPU (no se encontró GPU)')
    except Exception as err:  # noqa: BLE001
        log(f'Render con CPU ({err})')


def ciclorama(col):
    """Suelo que se curva hasta la pared del fondo, gris oscuro."""
    bm = bmesh.new()
    perfil = [(-6.0, 0.0), (1.4, 0.0)]
    radio = 1.2
    for k in range(1, 13):
        a = math.pi / 2 * k / 12
        perfil.append((1.4 + math.sin(a) * radio, radio - math.cos(a) * radio))
    perfil.append((1.4 + radio, 5.0))
    filas = []
    for x in (-6.0, 6.0):
        filas.append([bm.verts.new((x, y, zz)) for (y, zz) in perfil])
    for i in range(len(perfil) - 1):
        bm.faces.new((filas[0][i], filas[1][i], filas[1][i + 1], filas[0][i + 1]))
    me = bpy.data.meshes.new('ciclorama')
    bm.to_mesh(me)
    bm.free()
    o = nuevo_objeto('ciclorama', me, col)
    for p in o.data.polygons:
        p.use_smooth = True
    o.data.materials.append(material('Fondo estudio', srgb(FONDO), 0.85))
    return o


def luz(col, nombre, pos, energia, tam, objetivo=(0, 0, 1.0)):
    datos = bpy.data.lights.new(nombre, 'AREA')
    datos.energy = energia
    datos.size = tam
    o = nuevo_objeto(nombre, datos, col)
    o.location = pos
    d = Vector(objetivo) - Vector(pos)
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return o


def fase_render(col):
    escena = bpy.context.scene
    estudio = coleccion(COL_ESTUDIO, limpiar=True)
    configurar_cycles(escena)
    escena.render.resolution_x, escena.render.resolution_y = RESOLUCION
    escena.render.resolution_percentage = 100
    escena.render.film_transparent = FONDO_TRANSPARENTE
    escena.render.image_settings.file_format = 'PNG'
    escena.render.image_settings.color_mode = 'RGBA' if FONDO_TRANSPARENTE else 'RGB'
    try:
        escena.view_settings.view_transform = 'AgX'
        escena.view_settings.look = 'None'
    except TypeError:
        pass
    if escena.world is None:
        escena.world = bpy.data.worlds.new('Mundo')
    if escena.world.node_tree is None:
        escena.world.use_nodes = True
    fondo = escena.world.node_tree.nodes.get('Background')
    if fondo:
        fondo.inputs[0].default_value = srgb((12, 12, 14))
        fondo.inputs[1].default_value = 0.25

    cic = ciclorama(estudio)
    if FONDO_TRANSPARENTE:
        # Sin fondo: solo la sombra de contacto sobre un captador de sombras
        cic.visible_camera = False
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=3.0)
        me = bpy.data.meshes.new('suelo_sombra')
        bm.to_mesh(me)
        bm.free()
        suelo = nuevo_objeto('suelo_sombra', me, estudio)
        suelo.is_shadow_catcher = True
    luz(estudio, 'luz_principal', (-2.4, -2.4, 3.2), 330, 2.2, (0, 0, H * 0.55))
    luz(estudio, 'luz_relleno', (2.6, -1.8, 1.8), 70, 2.5, (0, 0, H * 0.5))
    luz(estudio, 'contraluz', (0.6, 2.8, 2.8), 260, 1.6, (0, 0, H * 0.7))

    # Mano izquierda (reflejo de la derecha) solo para las imágenes
    mano = col.objects.get('mano_tienda')
    if mano and not col.objects.get('mano_izquierda_render'):
        izq = mano.copy()
        izq.data = mano.data.copy()
        izq.name = 'mano_izquierda_render'
        col.objects.link(izq)
        izq.parent = None
        izq.matrix_world = Matrix.Scale(-1, 4, (1, 0, 0)) @ mano.matrix_world
    # Todo lo del maniquí cuelga de un vacío que gira (la cámara no se mueve)
    giro = nuevo_objeto('giro', None, estudio)
    for o in col.objects:
        if o.parent is None and o.type in ('MESH', 'ARMATURE'):
            mw = o.matrix_world.copy()
            o.parent = giro
            o.matrix_parent_inverse = Matrix.Identity(4)
            o.matrix_world = mw

    # Cámara de 50 mm a la altura del pecho, con todo el cuerpo y margen
    cam_datos = bpy.data.cameras.new('camara')
    cam_datos.lens = 50
    cam_datos.sensor_fit = 'AUTO'
    cam = nuevo_objeto('camara', cam_datos, estudio)
    fov = 2 * math.atan(cam_datos.sensor_width / 2 / cam_datos.lens)  # vertical (imagen vertical)
    dist = (H * 0.58) / math.tan(fov / 2)
    cam.location = (0.0, -dist, H * 0.72)
    objetivo = Vector((0.0, 0.0, H * 0.5))
    cam.rotation_euler = (objetivo - cam.location).to_track_quat('-Z', 'Y').to_euler()
    escena.camera = cam

    # Lo demás de la escena (p. ej. el cubo de un archivo nuevo) no sale en las imágenes;
    # al terminar se deja como estaba
    nuestras = {COLECCION, COL_ESTUDIO, COL_REF}
    ocultos = [o for o in escena.objects
               if not o.hide_render and not any(c.name in nuestras for c in o.users_collection)]
    for o in ocultos:
        o.hide_render = True
    if ocultos:
        log(f'Ocultos durante el render: {", ".join(o.name for o in ocultos)}')
    try:
        renders(escena, cam, cam_datos, giro, dist, objetivo)
    finally:
        for o in ocultos:
            o.hide_render = False


def renders(escena, cam, cam_datos, giro, dist, objetivo):
    dir_360 = os.path.join(SALIDA, '360')
    os.makedirs(dir_360, exist_ok=True)
    imagenes = []
    for i in range(VISTAS):
        grados = 360.0 * i / VISTAS
        giro.rotation_euler = (0.0, 0.0, math.radians(grados))
        ruta = os.path.join(dir_360, f'maniqui{SUF}_360_{int(round(grados)):03d}.png')
        escena.render.filepath = ruta
        bpy.ops.render.render(write_still=True)
        imagenes.append(ruta)
        log(f'Vista {i + 1}/{VISTAS}: {int(round(grados))}°')

    # Ortográficas: frente, perfil, espalda y tres cuartos
    cam_datos.type = 'ORTHO'
    cam_datos.ortho_scale = H * 1.15
    cam.location = (0.0, -6.0, H * 0.5)
    cam.rotation_euler = (math.radians(90), 0.0, 0.0)
    orto = []
    for nombre, grados in (('frente', 0), ('perfil', 90), ('espalda', 180), ('tres_cuartos', 45)):
        giro.rotation_euler = (0.0, 0.0, math.radians(grados))
        ruta = os.path.join(dir_360, f'maniqui{SUF}_orto_{nombre}.png')
        escena.render.filepath = ruta
        bpy.ops.render.render(write_still=True)
        orto.append(ruta)
        log(f'Vista ortográfica: {nombre}')
    giro.rotation_euler = (0.0, 0.0, 0.0)
    lamina(imagenes + orto, os.path.join(dir_360, f'maniqui{SUF}_360_lamina.jpg'))

    if VIDEO:
        video(escena, cam, cam_datos, giro, dist, objetivo, dir_360)


def lamina(rutas, destino, ancho_celda=270):
    """Cuadrícula con todas las vistas sobre el gris del fondo (numpy, sin librerías externas)."""
    celdas = []
    for r in rutas:
        img = bpy.data.images.load(r, check_existing=False)
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        bpy.data.images.remove(img)
        px = px.reshape(h, w, 4)
        paso = max(1, w // ancho_celda)
        px = px[::paso, ::paso][: int(ancho_celda * h / w), :ancho_celda]
        celdas.append(px)
    if not celdas:
        return
    ch, cw = celdas[0].shape[:2]
    cols = min(8, len(celdas))
    filas = math.ceil(len(celdas) / cols)
    fondo = np.array([c / 255.0 for c in FONDO] + [1.0], dtype=np.float32)
    lienzo = np.tile(fondo, (filas * ch, cols * cw, 1))
    for i, c in enumerate(celdas):
        f, k = divmod(i, cols)
        f = filas - 1 - f   # las filas de una imagen de Blender van de abajo arriba
        a = c[..., 3:4]
        zona = lienzo[f * ch:(f + 1) * ch, k * cw:(k + 1) * cw]
        zona[: c.shape[0], : c.shape[1]] = c[..., :4] * a + zona[: c.shape[0], : c.shape[1]] * (1 - a)
    lienzo[..., 3] = 1.0
    out = bpy.data.images.new('lamina', cols * cw, filas * ch, alpha=False)
    out.pixels.foreach_set(lienzo.ravel())
    out.filepath_raw = destino
    out.file_format = 'JPEG'
    out.save()
    bpy.data.images.remove(out)
    log(f'Lámina: {destino}')


def video(escena, cam, cam_datos, giro, dist, objetivo, carpeta):
    cam_datos.type = 'PERSP'
    cam.location = (0.0, -dist, H * 0.72)
    cam.rotation_euler = (objetivo - cam.location).to_track_quat('-Z', 'Y').to_euler()
    escena.frame_start, escena.frame_end = 1, 120
    escena.render.fps = 30
    giro.animation_data_clear()
    giro.rotation_euler = (0, 0, 0)
    giro.keyframe_insert('rotation_euler', index=2, frame=1)
    giro.rotation_euler = (0, 0, math.radians(360 * 119 / 120))
    giro.keyframe_insert('rotation_euler', index=2, frame=120)
    fc = giro.animation_data.action
    curvas = getattr(fc, 'fcurves', None) or []
    for c in curvas:
        for kp in c.keyframe_points:
            kp.interpolation = 'LINEAR'
    ajustes = escena.render.image_settings
    if hasattr(ajustes, 'media_type'):
        ajustes.media_type = 'VIDEO'
    ajustes.file_format = 'FFMPEG'
    escena.render.ffmpeg.format = 'MPEG4'
    escena.render.ffmpeg.codec = 'H264'
    escena.render.film_transparent = False
    escena.render.filepath = os.path.join(carpeta, f'maniqui{SUF}_360_')
    bpy.ops.render.render(animation=True)
    log('Vídeo de la vuelta guardado')


def comprobar_cerradas(col):
    for o in col.objects:
        if o.type != 'MESH' or o.name.endswith('_render'):
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        abiertas = sum(1 for e in bm.edges if e.is_boundary)
        raras = sum(1 for e in bm.edges if not e.is_manifold and not e.is_boundary)
        bm.free()
        estado = 'cerrada' if abiertas == 0 and raras == 0 else f'¡ATENCIÓN! {abiertas} aristas abiertas, {raras} no manifold'
        log(f'Malla {o.name}: {estado}')


# =============================================================================
def main():
    log(f'Maniquí {SEXO}, {H:.2f} m. Fases: {", ".join(sorted(FASES))}. Salida: {SALIDA}')
    os.makedirs(SALIDA, exist_ok=True)
    if 'modelar' in FASES:
        col = fase_modelar()
    else:
        col = bpy.data.collections.get(COLECCION)
        if col is None:
            raise RuntimeError('No hay maniquí: ejecuta antes la fase «modelar».')
    if 'exportar' in FASES:
        fase_exportar(col)
    comprobar_cerradas(col)
    if 'render' in FASES:
        fase_render(col)
    log(f'Terminado en {time.time() - T0:.0f} s')
    with open(os.path.join(SALIDA, f'registro{SUF}.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(REGISTRO) + '\n')


main()
