"""Maniquí de tienda de MyOut en Blender (probado con Blender 5.2).

Parte de las piezas que genera build_tienda.py (cuerpo, cabeza y mano, hombre y mujer).
Las medidas tienen que ser esas: la ropa de la web está ajustada a ellas. En Blender:
  1. Remallado por vóxeles: malla uniforme, sin los triángulos alargados de marching cubes.
  2. Suavizado laplaciano que conserva el volumen: acabado de fibra lacada.
  3. Juntas de maniquí desmontable: una ranura fina en la cintura y otra en cada brazo,
     bajo el hombro. Solo se hunden (0,8 mm): no cambian el ajuste de la ropa.
  4. Material «Fibra lacada», colecciones Hombre / Mujer / Manos.
  5. Guarda maniqui_tienda.blend (para retocar o esculpir a mano) y exporta un .glb por
     pieza a maniqui/blender/, con los mismos nombres que usa la web.
Después, desde Frontend:
  node scripts/prepare-garments.mjs ../prendas_casual_glb/maniqui/blender public/models/maniqui 30000

Uso: en Blender, pestaña Scripting → Text → Open → este archivo → Run Script.
O sin ventana:  blender --background --python blender_maniqui.py
Coordenadas: las de los .glb (Blender las pasa a Z arriba; frente = -Y).
"""
import math
import os

import bmesh
import bpy
import numpy as np

try:
    HERE = os.path.dirname(os.path.abspath(__file__))
except NameError:  # ejecutado con exec(): se usa la ruta del proyecto
    HERE = r"C:\Users\Usuario\Documents\MyOut\prendas_casual_glb\generador"
SRC = os.path.normpath(os.path.join(HERE, "..", "maniqui"))
OUT = os.path.join(SRC, "blender")

# Articulaciones del cuerpo de referencia (cuerpo.py, brazos a 18°), en Z arriba / frente -Y.
SHOULDER = np.array([0.168, 0.004, 1.405])
ELBOW = np.array([0.25607, 0.004, 1.13395])

PIECES = [
    # (archivo, colección, tamaño de vóxel, iteraciones de suavizado, triángulos finales, juntas)
    ("cuerpo_tienda", "Hombre", 0.002, 6, 320000, True),
    ("cabeza_tienda", "Hombre", 0.0009, 4, 90000, False),
    ("cuerpo_tienda_f", "Mujer", 0.002, 6, 320000, True),
    ("cabeza_tienda_f", "Mujer", 0.0009, 4, 90000, False),
    ("mano_tienda", "Manos", 0.0007, 3, 40000, False),
]

GROOVE_DEPTH = 0.0008   # m
GROOVE_HALF = 0.0011    # m (semiancho de la ranura)
WAIST_Z = 0.99


LOG_LINES = []


def log(*a):
    line = " ".join(str(x) for x in a)
    LOG_LINES.append(line)
    print("[maniquí]", line, flush=True)


def repair(ob):
    """Deja la malla cerrada antes del remallado por vóxeles (que necesita un volumen
    cerrado). La simplificación de los .glb deja algún borde suelto o compartido por
    más de dos caras (unos cientos en el cuerpo): se quitan esas caras y se tapan los
    agujeros."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bad = {f for e in bm.edges if len(e.link_faces) > 2 for f in e.link_faces}
    if bad:
        bmesh.ops.delete(bm, geom=list(bad), context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    for _ in range(3):
        border = [e for e in bm.edges if e.is_boundary]
        if not border:
            break
        bmesh.ops.holes_fill(bm, edges=border, sides=0)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    left = sum(1 for e in bm.edges if not e.is_manifold)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return len(bad), left


def clear_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)


def material():
    mat = bpy.data.materials.get("Fibra lacada") or bpy.data.materials.new("Fibra lacada")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        values = {
            "Base Color": (0.80, 0.79, 0.76, 1.0),
            "Roughness": 0.38,
            "Coat Weight": 0.55,
            "Coat Roughness": 0.22,
        }
        for name, value in values.items():
            if name in bsdf.inputs:
                bsdf.inputs[name].default_value = value
    mat["role"] = "body"   # la web lo trata como la pieza principal (extras.role)
    return mat


def import_piece(name):
    path = os.path.join(SRC, name + ".glb")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [ob for ob in bpy.data.objects if ob not in before and ob.type == "MESH"]
    if not new:
        raise RuntimeError("No hay malla en " + path)
    ob = new[0]
    # Fuera jerarquías y transformaciones: la geometría queda en coordenadas del mundo.
    for extra in [o for o in bpy.data.objects if o not in before and o is not ob]:
        bpy.data.objects.remove(extra, do_unlink=True)
    ob.parent = None
    ob.data.transform(ob.matrix_world)
    ob.matrix_world.identity()
    ob.name = name
    ob.data.name = name
    return ob


def bake_modifiers(ob):
    """Aplica los modificadores sin operadores (vale con o sin ventana)."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    me.name = ob.name
    if old.users == 0:
        bpy.data.meshes.remove(old)


def shade_smooth(me):
    flags = np.ones(len(me.polygons), dtype=bool)
    me.polygons.foreach_set("use_smooth", flags)
    me.update()


def add_seams(ob):
    """Juntas de maniquí desmontable: ranura en la cintura y en los dos brazos."""
    me = ob.data
    n = len(me.vertices)
    co = np.empty(n * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    nor = np.empty(n * 3)
    me.vertices.foreach_get("normal", nor)
    nor = nor.reshape(-1, 3)

    push = np.zeros(n)
    # cintura: plano horizontal, solo en el tronco (no en los antebrazos)
    s = co[:, 2] - WAIST_Z
    torso = np.abs(co[:, 0]) < 0.20
    push += np.where(torso, np.exp(-(s / GROOVE_HALF) ** 2), 0.0)
    # brazos: plano perpendicular al húmero, 9,5 cm por debajo del hombro
    axis = (ELBOW - SHOULDER) / np.linalg.norm(ELBOW - SHOULDER)
    p0 = SHOULDER + axis * 0.095
    q = co.copy()
    q[:, 0] = np.abs(q[:, 0])
    s = (q - p0) @ axis
    radial = np.linalg.norm((q - p0) - np.outer(s, axis), axis=1)
    arm = (q[:, 0] > 0.12) & (radial < 0.075)
    push += np.where(arm, np.exp(-(s / GROOVE_HALF) ** 2), 0.0)

    co -= nor * (GROOVE_DEPTH * np.clip(push, 0, 1))[:, None]
    me.vertices.foreach_set("co", co.ravel())
    me.update()


def process(name, coll, voxel, smooth_iters, tris, seams, mat):
    ob = import_piece(name)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)
    log(name, "importado:", len(ob.data.polygons), "caras")
    removed, left = repair(ob)
    log(name, "reparado: quitadas", removed, "caras; bordes no cerrados:", left)

    rem = ob.modifiers.new("Remallado", "REMESH")
    rem.mode = "VOXEL"
    rem.voxel_size = voxel
    rem.adaptivity = 0.0
    lap = ob.modifiers.new("Suavizado", "LAPLACIANSMOOTH")
    lap.iterations = smooth_iters
    lap.lambda_factor = 0.5
    lap.use_volume_preserve = True
    lap.use_normalized = True
    bake_modifiers(ob)
    shade_smooth(ob.data)
    log(name, "remallado y suavizado:", len(ob.data.polygons), "caras")

    if seams:
        add_seams(ob)

    # triángulos finales (prepare-garments vuelve a simplificar con un error de 0,35 mm)
    tri_now = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if tri_now > tris:
        dec = ob.modifiers.new("Simplificar", "DECIMATE")
        dec.decimate_type = "COLLAPSE"
        dec.ratio = tris / tri_now
        bake_modifiers(ob)
    shade_smooth(ob.data)
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    log(name, "listo:", len(ob.data.polygons), "caras")
    return ob


def export(ob, path):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
    try:
        bpy.ops.export_scene.gltf(**kw, export_extras=True, export_materials="EXPORT")
    except TypeError:  # opciones con otro nombre en otra versión de Blender
        bpy.ops.export_scene.gltf(**kw)


def main():
    os.makedirs(OUT, exist_ok=True)
    clear_scene()
    mat = material()
    colls = {}
    for name in ("Hombre", "Mujer", "Manos"):
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
        colls[name] = c
    done = []
    for name, coll, voxel, iters, tris, seams in PIECES:
        done.append(process(name, colls[coll], voxel, iters, tris, seams, mat))
    for ob in done:
        export(ob, os.path.join(OUT, ob.name + ".glb"))
        log("exportado", ob.name + ".glb")
    # En el .blend, la mujer y las manos se apartan para verlo todo junto (ya exportado).
    for ob in done:
        if ob.name.endswith("_f"):
            ob.location.x = 0.9
        if ob.name.startswith("mano"):
            ob.location = (-0.6, 0.0, 1.0)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, "maniqui_tienda.blend"))
    log("guardado maniqui_tienda.blend en", SRC)
    with open(os.path.join(OUT, "registro.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(LOG_LINES))


main()
