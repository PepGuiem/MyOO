"""Vaqueros de MyOut en Blender (probado con Blender 5.2): material denim, mapas PBR, estudio y renders.

Parte de lo que genera build_vaquero.py (en prendas_street_glb/), para cada corte <id> (p. ej. 19_vaquero_baggy,
21_vaquero_skinny):
  <id>.glb            tela (con trabillas), botón y remaches, etiqueta de piel
  <id>_costuras.glb   el hilo de los pespuntes, puntada a puntada
  <id>_ejes.json      ejes de las piernas (orientan la sarga), lavado del corte y bajo vuelto

Fases (todas por defecto; variable de entorno VAQUERO_FASES="preparar,hornear,exportar,render"):
  preparar  importa, atributos de desgaste y de tejido, materiales, versión ligera con UV, piezas.
  hornear   Base Color, Roughness, Normal, AO y Height (4096 px) de la tela de alta (con los
            pespuntes) sobre la versión ligera -> <nombre>/texturas/*.png
  exportar  <id>_pbr.glb: versión ligera con texturas (2048, JPEG) + metal + piel.
  render    estudio gris y Cycles -> <nombre>/render/: 8 vistas (VAQUERO_VISTAS=8, por defecto) o
            4 vistas 360° (VAQUERO_VISTAS=360: frente, derecha, atrás, izquierda) y la lámina <nombre>_360.png
Guarda <nombre>/<nombre>.blend al acabar cada fase y escribe <nombre>/registro.txt.
Varias prendas seguidas: VAQUERO_IDS="20_vaquero_clasico,21_vaquero_skinny" (resumen en vaqueros_lote.txt).

Uso: en Blender, Scripting -> consola de Python:
  import os; os.environ['VAQUERO_ID'] = '21_vaquero_skinny'; os.environ['VAQUERO_VISTAS'] = '360'
  exec(open(r'C:\\Users\\Usuario\\Documents\\MyOut\\prendas_street_glb\\generador\\blender_vaquero.py', encoding='utf-8').read())
Desde la ventana lanza un Blender en segundo plano (la ventana no se queda colgada) y el avance
se ve en registro.txt. Sin ventana:  blender -b --factory-startup --python blender_vaquero.py
Coordenadas: metros, Z arriba, frente = -Y (las de los .glb del proyecto).
"""
import json
import math
import os
import subprocess
import sys
import time

import bpy
import numpy as np
from mathutils import Vector

try:
    HERE = os.path.dirname(os.path.abspath(__file__))
except NameError:  # ejecutado con exec(): ruta del proyecto
    HERE = r"C:\Users\Usuario\Documents\MyOut\prendas_street_glb\generador"
SCRIPT = os.path.join(HERE, "blender_vaquero.py")
ROOT = os.path.normpath(os.path.join(HERE, ".."))
# Prenda (o lista de prendas) a procesar: VAQUERO_IDS="20_vaquero_clasico,21_vaquero_skinny" o VAQUERO_ID.
IDS = [i.strip() for i in os.environ.get("VAQUERO_IDS", os.environ.get("VAQUERO_ID", "19_vaquero_baggy")).split(",") if i.strip()]
VISTAS = os.environ.get("VAQUERO_VISTAS", "8")          # «8» (vistas y primeros planos) o «360» (4 vistas)
LOTE_LOG = os.path.join(ROOT, "vaqueros_lote.txt")


def set_garment(gid):
    """Rutas de una prenda: <ROOT>/<gid>.glb, _costuras.glb, _ejes.json -> <ROOT>/<nombre sin número>/."""
    global GID, NAME, SRC, SRC_ST, EJES, OUT, TEX, REN, BLEND, LOG, GLB_PBR
    GID = gid
    NAME = gid.split("_", 1)[1] if gid[:2].isdigit() else gid
    SRC = os.path.join(ROOT, gid + ".glb")
    SRC_ST = os.path.join(ROOT, gid + "_costuras.glb")
    EJES = os.path.join(ROOT, gid + "_ejes.json")
    OUT = os.path.join(ROOT, NAME)
    TEX = os.path.join(OUT, "texturas")
    REN = os.path.join(OUT, "render")
    BLEND = os.path.join(OUT, NAME + ".blend")
    LOG = os.path.join(OUT, "registro.txt")
    GLB_PBR = os.path.join(OUT, gid + "_pbr.glb")


set_garment(IDS[0])

TEX_RES = int(os.environ.get("VAQUERO_TEX", 4096))
GLB_TEX = 2048
LOW_TRIS = 150000
RENDER_SAMPLES = int(os.environ.get("VAQUERO_MUESTRAS", 160))
PHASES = [p.strip() for p in os.environ.get("VAQUERO_FASES", "preparar,hornear,exportar,render").split(",") if p.strip()]
ONLY_SHOTS = [s for s in os.environ.get("VAQUERO_TOMAS", "").split(",") if s]

T0 = time.time()


def log(*a):
    line = f"[{time.time() - T0:7.1f}s] " + " ".join(str(x) for x in a)
    print("[vaquero]", line, flush=True)
    os.makedirs(OUT, exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


# ============================================================================ utilidades
def setup_gpu(scene):
    scene.render.engine = "CYCLES"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for kind in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
            try:
                prefs.compute_device_type = kind
            except TypeError:
                continue
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == kind]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type == kind
                scene.cycles.device = "GPU"
                log("Cycles en GPU:", kind, ", ".join(d.name for d in gpus))
                return
        prefs.compute_device_type = "NONE"
    except Exception as e:  # noqa: BLE001
        log("sin GPU:", e)
    scene.cycles.device = "CPU"
    log("Cycles en CPU")


def clear_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)
    for blocks in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.lights, bpy.data.cameras):
        for b in list(blocks):
            if b.users == 0:
                blocks.remove(b)


def collection(name, parent=None):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    par = parent or bpy.context.scene.collection
    if c.name not in par.children:
        par.children.link(c)
    return c


def move_to(ob, coll):
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for ob in meshes:
        mw = ob.matrix_world.copy()
        ob.parent = None
        ob.data.transform(mw)
        ob.matrix_world.identity()
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    return meshes


def only_select(obs, active=None):
    bpy.ops.object.select_all(action="DESELECT")
    for o in obs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or obs[0]


def bake_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    me.name = ob.name
    if old.users == 0:
        bpy.data.meshes.remove(old)


def smooth(me, sharp_deg=None):
    me.polygons.foreach_set("use_smooth", np.ones(len(me.polygons), dtype=bool))
    if sharp_deg is not None and hasattr(me, "set_sharp_from_angle"):
        me.set_sharp_from_angle(angle=math.radians(sharp_deg))
    me.update()


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def mesh_arrays(me):
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32)
    me.vertices.foreach_get("co", co)
    nor = np.empty(n * 3, np.float32)
    me.vertices.foreach_get("normal", nor)
    return co.reshape(-1, 3), nor.reshape(-1, 3)


def set_point_attr(me, name, values, kind="FLOAT"):
    if name in me.attributes:
        me.attributes.remove(me.attributes[name])
    a = me.attributes.new(name, kind, "POINT")
    key = "value" if kind == "FLOAT" else "vector"
    a.data.foreach_set(key, np.ascontiguousarray(values, np.float32).ravel())


# ============================================================================ geometría de apoyo
def load_axes():
    with open(EJES, encoding="utf-8") as f:
        return json.load(f)


def leg_frame(ej, co):
    """Por vértice: lado (+1 izquierda de quien lo lleva = +X), desplazamiento al eje de su pierna."""
    side = np.where(co[:, 0] >= 0, 1, -1)
    cx = np.empty(len(co), np.float32)
    cy = np.empty(len(co), np.float32)
    for sd in (1, -1):
        m = side == sd
        a = ej[str(sd)]
        cx[m] = np.interp(co[m, 2], a["z"], a["cx"])
        cy[m] = np.interp(co[m, 2], a["z"], a["cy"])
    return side, co[:, 0] - cx, co[:, 1] - cy


def waist_z(ej, theta):
    return ej["waist_z"] + ej["waist_slope"] * np.sin(theta)


def compute_fabric_attributes(ob, ej):
    """tejido: coordenadas del patrón (contorno, altura) -> la sarga va en diagonal y continua por
    toda la pernera; el corte está en las costuras reales (costado y centro).
    desgaste: zonas de roce (muslos, rodillas, culera, bajos, borde de la cinturilla).
    interior: 1 en la cara de dentro de la tela (el revés del denim es más claro)."""
    me = ob.data
    co, nor = mesh_arrays(me)
    side, dx, dy = leg_frame(ej, co)
    a = np.arctan2(dx, dy)
    r = np.clip(np.hypot(dx, dy), 0.05, 0.30)
    a2 = np.mod(a - side * np.pi / 2, 2 * np.pi)
    # radio de referencia por altura (mediana de cada franja de 1 cm): con el radio de cada vértice,
    # los pliegues torcían la sarga; así los cordones van rectos y en diagonal por toda la pernera
    zb = np.floor(co[:, 2] / 0.01).astype(np.int64)
    zmin_bin = int(zb.min())
    zb -= zmin_bin
    r_nom = np.zeros(len(co), np.float32)
    for sd in (1, -1):
        m = side == sd
        med = np.array([np.median(r[m][zb[m] == k]) if np.any(zb[m] == k) else np.nan for k in range(zb.max() + 1)])
        ok = ~np.isnan(med)
        med = np.interp(np.arange(len(med)), np.nonzero(ok)[0], med[ok])
        med = np.convolve(np.pad(med, 3, mode="edge"), np.ones(7) / 7, mode="valid")
        # interpolado en altura (con escalones de 1 cm la sarga saltaba de franja en franja)
        r_nom[m] = np.interp(co[m, 2] / 0.01 - zmin_bin - 0.5, np.arange(len(med)), med)
    s = a2 * r_nom
    set_point_attr(me, "tejido", np.stack([s, co[:, 2], np.zeros_like(s)], 1), "FLOAT_VECTOR")

    # cara interior: la normal mira hacia el eje (de la pierna, o de la cintura por arriba)
    hip = co[:, 2] > 0.80
    rx = np.where(hip, co[:, 0], dx)
    ry = np.where(hip, co[:, 1], dy)
    rl = np.hypot(rx, ry) + 1e-6
    radial = (nor[:, 0] * rx + nor[:, 1] * ry) / rl
    interior = (radial < -0.15).astype(np.float32)
    if ej.get("vuelta"):        # bajo vuelto: por fuera se ve el revés de la tela (más claro)
        interior = np.maximum(interior, (co[:, 2] < co[:, 2].min() + ej["vuelta"] * 0.95).astype(np.float32))
    set_point_attr(me, "interior", interior)

    g = lambda t, w: np.exp(-(t / w) ** 2)
    front = np.clip(-nor[:, 1], 0, 1)
    back = np.clip(nor[:, 1], 0, 1)
    x, z = co[:, 0], co[:, 2]
    zmin = float(z.min())
    wear = (0.95 * g(np.abs(x) - 0.125, 0.065) * g(z - 0.64, 0.11) * front
            + 0.75 * g(np.abs(x) - 0.13, 0.05) * g(z - 0.45, 0.045) * front
            + 0.45 * g(np.abs(x) - 0.09, 0.06) * g(z - 0.82, 0.05) * back
            + 0.85 * g(z - zmin, 0.022)
            + 0.55 * np.clip((z - (waist_z(ej, np.arctan2(co[:, 1], co[:, 0])) - 0.006)) / 0.006, 0, 1))
    wear *= 1 - 0.7 * interior
    set_point_attr(me, "desgaste", np.clip(wear, 0, 1))
    log("atributos de tejido, interior y desgaste en", ob.name, f"({len(co)} vértices)")


# ============================================================================ nodos
class Nodes:
    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.x = 0

    def new(self, kind, **props):
        n = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(n, k, v)
        n.location = (self.x, 0)
        self.x += 40
        return n

    def link(self, a, b):
        self.nt.links.new(a, b)

    def val(self, sock, v):
        if isinstance(v, (int, float, tuple, list)):
            sock.default_value = v
        else:
            self.link(v, sock)

    def math(self, op, a, b=0.0, clamp=False):
        n = self.new("ShaderNodeMath", operation=op, use_clamp=clamp)
        self.val(n.inputs[0], a)
        self.val(n.inputs[1], b)
        return n.outputs[0]

    def mix(self, fac, a, b, blend="MIX"):
        n = self.new("ShaderNodeMix", data_type="RGBA", blend_type=blend, clamp_factor=True)
        ins = [s for s in n.inputs if s.type == "RGBA"]
        self.val(n.inputs[0], fac)
        self.val(ins[0], a)
        self.val(ins[1], b)
        return [s for s in n.outputs if s.type == "RGBA"][0]

    def noise(self, vec, scale, detail=2.0, rough=0.5, distortion=0.0):
        n = self.new("ShaderNodeTexNoise")
        if vec is not None:
            self.link(vec, n.inputs["Vector"])
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        n.inputs["Distortion"].default_value = distortion
        return n.outputs["Fac"]

    def ramp(self, fac, stops):
        n = self.new("ShaderNodeValToRGB")
        self.link(fac, n.inputs["Fac"])
        el = n.color_ramp.elements
        while len(el) > len(stops):
            el.remove(el[-1])
        while len(el) < len(stops):
            el.new(0.5)
        for e, (pos, val) in zip(el, stops):
            e.position = pos
            e.color = (val, val, val, 1.0) if isinstance(val, (int, float)) else val
        return n.outputs["Color"]

    def combine(self, x=0.0, y=0.0, z=0.0):
        n = self.new("ShaderNodeCombineXYZ")
        self.val(n.inputs[0], x)
        self.val(n.inputs[1], y)
        self.val(n.inputs[2], z)
        return n.outputs[0]

    def principled(self):
        return self.new("ShaderNodeBsdfPrincipled")

    def output(self):
        return self.new("ShaderNodeOutputMaterial")


def set_in(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value


def rgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c) + (1.0,)


def denim_material(obj_ref):
    """Denim lavado procedural. Devuelve el material y los enchufes de color, rugosidad y altura
    (se usan al hornear). Todo en metros: la sarga tiene ~0,9 mm entre cordones."""
    mat = bpy.data.materials.get("Denim lavado") or bpy.data.materials.new("Denim lavado")
    N = Nodes(mat)
    tc = N.new("ShaderNodeTexCoord", object=obj_ref)
    obj = tc.outputs["Object"]
    at = N.new("ShaderNodeAttribute", attribute_name="tejido")
    sep = N.new("ShaderNodeSeparateXYZ")
    N.link(at.outputs["Vector"], sep.inputs[0])
    s, z = sep.outputs[0], sep.outputs[1]
    # sarga 3x1 a derechas: cordones diagonales a ~66 grados
    tw = N.math("ADD", s, N.math("MULTIPLY", z, -0.45))     # sarga a derechas: sube hacia la derecha
    wave = N.new("ShaderNodeTexWave", wave_type="BANDS", bands_direction="X", wave_profile="SAW")
    N.link(N.combine(tw, z, 0.0), wave.inputs["Vector"])
    wave.inputs["Scale"].default_value = 2 * math.pi / (20 * 0.00092)   # bandas X: periodo = 2pi / (20 * escala)
    wave.inputs["Distortion"].default_value = 0.6
    wave.inputs["Detail"].default_value = 1.5
    wave.inputs["Detail Scale"].default_value = 2.0
    twill = N.math("POWER", wave.outputs["Fac"], 1.6)
    # hilos de urdimbre (vetas verticales con nudos) y jaspeado fino
    streak_v = N.combine(N.math("MULTIPLY", s, 1.0), N.math("MULTIPLY", z, 0.045), 0.0)
    streak = N.noise(streak_v, 260.0, 3.0, 0.6)
    heather = N.noise(streak_v, 1100.0, 1.0, 0.5)
    mottle = N.noise(obj, 5.0, 4.0, 0.55, 0.3)
    fuzz = N.noise(obj, 2600.0, 0.0)
    wrinkle = N.noise(obj, 30.0, 3.0, 0.45, 0.2)
    # desgaste: atributo + crestas (pointiness) - pliegues hundidos (AO)
    geo = N.new("ShaderNodeNewGeometry")
    crest = N.ramp(geo.outputs["Pointiness"], [(0.51, 0.0), (0.64, 1.0)])   # suave: la malla es de triángulos
    ao = N.new("ShaderNodeAmbientOcclusion", samples=8)
    ao.inputs["Distance"].default_value = 0.02
    crease = N.math("SUBTRACT", 1.0, ao.outputs["AO"], clamp=True)
    wear_at = N.new("ShaderNodeAttribute", attribute_name="desgaste", attribute_type="GEOMETRY")
    inter = N.new("ShaderNodeAttribute", attribute_name="interior", attribute_type="GEOMETRY")
    mot = N.ramp(mottle, [(0.35, 0.0), (0.70, 1.0)])
    # lavado a la piedra: manchas claras irregulares de pocos milímetros (como la referencia)
    stone = N.ramp(N.noise(obj, 70.0, 3.0, 0.6, 0.25), [(0.52, 0.0), (0.74, 1.0)])
    wear = N.math("MULTIPLY", wear_at.outputs["Fac"], N.math("ADD", 0.55, N.math("MULTIPLY", mot, 0.8)))
    # (la pointiness de una malla de triángulos simplificada sale a manchas triangulares: casi sin peso)
    fade = N.math("ADD", wear, N.math("MULTIPLY", crest, 0.03))
    fade = N.math("ADD", fade, N.math("MULTIPLY", mot, 0.10))
    fade = N.math("ADD", fade, N.math("MULTIPLY", stone, 0.10))
    fade = N.math("SUBTRACT", fade, N.math("MULTIPLY", crease, 0.75), clamp=True)
    # color
    # azul medio lavado (referencia): fondo índigo, desgaste claro y trama blanca asomando
    lav = load_axes().get("lavado") or ("#22375C", "#3D5A88", "#7D97BD", 1.0)   # lavado de cada corte
    deep, mid, light, weft = rgb(lav[0]), rgb(lav[1]), rgb(lav[2]), rgb("#C9CED5")
    fade = N.math("MULTIPLY", fade, float(lav[3]), clamp=True)
    base = N.mix(N.ramp(streak, [(0.3, 0.0), (0.75, 1.0)]), deep, mid)
    base = N.mix(N.math("MULTIPLY", heather, 0.25), base, tuple(0.5 * (a + b) for a, b in zip(deep, mid)))
    base = N.mix(fade, base, light)
    gap = N.math("POWER", N.math("SUBTRACT", 1.0, twill), 2.0)        # la trama blanca asoma entre cordones
    weft_amt = N.math("MULTIPLY", gap, N.math("ADD", 0.16, N.math("MULTIPLY", fade, 0.40)))
    base = N.mix(weft_amt, base, weft)
    base = N.mix(N.math("MULTIPLY", crease, 0.45), base, rgb("#1A2A4A"))
    inside = N.mix(N.math("MULTIPLY", heather, 0.5), rgb("#6A7890"), rgb("#56657F"))
    color = N.mix(inter.outputs["Fac"], base, inside)
    # rugosidad y relieve
    rough = N.math("ADD", 0.80, N.math("MULTIPLY", heather, 0.08))
    rough = N.math("SUBTRACT", rough, N.math("MULTIPLY", fade, 0.05))
    rough = N.math("ADD", rough, N.math("MULTIPLY", crease, 0.05), clamp=True)
    fine_h = N.math("ADD", N.math("MULTIPLY", twill, 0.8), N.math("MULTIPLY", fuzz, 0.25))
    height = N.math("ADD", N.math("MULTIPLY", fine_h, 0.55), N.math("MULTIPLY", wrinkle, 0.45), clamp=True)
    height.node.label = "Altura"
    b1 = N.new("ShaderNodeBump")
    b1.inputs["Strength"].default_value = 0.55
    b1.inputs["Distance"].default_value = 0.00035
    N.link(fine_h, b1.inputs["Height"])
    b2 = N.new("ShaderNodeBump")
    b2.inputs["Strength"].default_value = 0.12
    b2.inputs["Distance"].default_value = 0.0010
    N.link(wrinkle, b2.inputs["Height"])
    N.link(b1.outputs["Normal"], b2.inputs["Normal"])
    p = N.principled()
    N.link(color, p.inputs["Base Color"])
    N.link(rough, p.inputs["Roughness"])
    N.link(b2.outputs["Normal"], p.inputs["Normal"])
    set_in(p, "Sheen Weight", 0.35)
    set_in(p, "Sheen Roughness", 0.5)
    set_in(p, "Sheen Tint", (0.62, 0.70, 0.85, 1.0))
    set_in(p, "Specular IOR Level", 0.35)
    out = N.output()
    N.link(p.outputs["BSDF"], out.inputs["Surface"])
    mat["role"] = "body"
    return mat, {"color": color, "rough": rough, "height": height, "out": out, "bsdf": p.outputs["BSDF"], "nodes": N}


def simple_material(name, color, rough, metal=0.0, bump_scale=0.0, bump_dist=0.0003, sheen=0.0, role=None):
    """Material con valores fijos (el exportador glTF los entiende) y, si acaso, relieve."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    N = Nodes(mat)
    p = N.principled()
    p.inputs["Base Color"].default_value = color
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    set_in(p, "Sheen Weight", sheen)
    if bump_scale:
        tc = N.new("ShaderNodeTexCoord")
        b = N.new("ShaderNodeBump")
        b.inputs["Strength"].default_value = 0.5
        b.inputs["Distance"].default_value = bump_dist
        N.link(N.noise(tc.outputs["Object"], bump_scale, 6.0, 0.6), b.inputs["Height"])
        N.link(b.outputs["Normal"], p.inputs["Normal"])
    out = N.output()
    N.link(p.outputs["BSDF"], out.inputs["Surface"])
    if role:
        mat["role"] = role
    return mat


def assign(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)


# ============================================================================ fase: preparar
def phase_prepare():
    clear_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    ej = load_axes()
    root = collection("Vaquero baggy")
    c_tela = collection("Tela", root)
    c_herr = collection("Herrajes", root)
    c_piel = collection("Piel", root)
    c_hilo = collection("Pespuntes", root)
    c_low = collection("Versión ligera (PBR, web)")

    obs = {o.name.split(".")[0]: o for o in import_glb(SRC)}
    stitch = import_glb(SRC_ST)[0]
    tela, metal, piel = obs["body"], obs["hardware"], obs["trim"]
    tela.name = tela.data.name = "Tela"
    metal.name = metal.data.name = "Botón y remaches"
    piel.name = piel.data.name = "Etiqueta de piel"
    stitch.name = stitch.data.name = "Pespuntes"
    move_to(tela, c_tela); move_to(metal, c_herr); move_to(piel, c_piel); move_to(stitch, c_hilo)
    log("importado:", ", ".join(f"{o.name} {tri_count(o)} tri." for o in (tela, metal, piel, stitch)))

    compute_fabric_attributes(tela, ej)
    denim, _ = denim_material(tela)
    assign(tela, denim)
    assign(metal, simple_material("Latón envejecido", rgb("#9C8458"), 0.32, 1.0, bump_scale=900, bump_dist=0.0002, role="hardware"))
    assign(piel, simple_material("Piel curtida", rgb("#4A2D18"), 0.58, 0.0, bump_scale=1400, bump_dist=0.00025, role="trim"))
    assign(stitch, simple_material("Hilo de pespunte", rgb("#C9893A"), 0.62, 0.0, sheen=0.6, role="stitch"))
    for ob in (metal, piel, stitch):
        smooth(ob.data)

    # versión ligera: simplificada, normales suaves y UV de patronaje (ver pattern_uvs)
    low = tela.copy()
    low.data = tela.data.copy()
    low.name = low.data.name = "Vaquero PBR"
    c_low.objects.link(low)
    ratio = LOW_TRIS / max(1, tri_count(tela))
    dec = low.modifiers.new("Simplificar", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = min(1.0, ratio)
    bake_modifiers(low)
    only_select([low])
    try:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    except Exception as e:  # noqa: BLE001
        log("normales personalizadas:", e)
    smooth(low.data, sharp_deg=55)
    t = time.time()
    pattern_uvs(low, ej)
    log(f"versión ligera: {tri_count(low)} tri., UV en {time.time() - t:.0f}s, estiramiento:", uv_stretch(low))
    c_low.hide_render = True
    save()


def pattern_uvs(ob, ej):
    """UV como un patrón de costura: cada pernera se abre por el costado (como se corta el denim)
    y se separa del revés; luego Blender desdobla cada pieza con estiramiento mínimo (SLIM) y
    las empaqueta por su forma real. Así salen pocas islas grandes y sin estiramientos."""
    me = ob.data
    nP = len(me.polygons)
    co, _ = mesh_arrays(me)
    lv = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("vertex_index", lv)
    tot = np.empty(nP, np.int32)
    me.polygons.foreach_get("loop_total", tot)
    face_of_loop = np.repeat(np.arange(nP), tot)
    c = np.empty(nP * 3, np.float32)
    me.polygons.foreach_get("center", c)
    c = c.reshape(-1, 3)
    fn = np.empty(nP * 3, np.float32)
    me.polygons.foreach_get("normal", fn)
    fn = fn.reshape(-1, 3)
    fside, fdx, fdy = leg_frame(ej, c)
    hip = c[:, 2] > 0.80
    rx = np.where(hip, c[:, 0], fdx)
    ry = np.where(hip, c[:, 1], fdy)
    finterior = (fn[:, 0] * rx + fn[:, 1] * ry) / (np.hypot(rx, ry) + 1e-6) < 0.0
    # en el fondo de los pliegues la normal gira: se limpia por mayoría de vecinas (sin islas sueltas)
    le = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("edge_index", le)
    face_l = np.repeat(np.arange(nP), 3)          # la versión ligera es toda de triángulos
    order = np.argsort(le, kind="stable")
    e_sorted = le[order]
    same = e_sorted[1:] == e_sorted[:-1]
    fa = face_l[order][:-1][same]
    fb = face_l[order][1:][same]
    for _ in range(8):
        votes = np.zeros(nP, np.float32)
        cnt = np.zeros(nP, np.float32)
        np.add.at(votes, fa, finterior[fb]); np.add.at(cnt, fa, 1)
        np.add.at(votes, fb, finterior[fa]); np.add.at(cnt, fb, 1)
        maj = votes / np.maximum(cnt, 1)
        finterior = np.where(maj > 0.5, True, np.where(maj < 0.5, False, finterior))
    if "reves" in me.attributes:
        me.attributes.remove(me.attributes["reves"])
    me.attributes.new("reves", "BOOLEAN", "FACE").data.foreach_set("value", finterior)
    p = co[lv]
    side = fside[face_of_loop]
    cx = np.empty(len(p), np.float32)
    cy = np.empty(len(p), np.float32)
    for sd in (1, -1):
        m = side == sd
        a = ej[str(sd)]
        cx[m] = np.interp(p[m, 2], a["z"], a["cx"])
        cy[m] = np.interp(p[m, 2], a["z"], a["cy"])
    ang = np.mod(np.arctan2(p[:, 0] - cx, p[:, 1] - cy) - side * np.pi / 2, 2 * np.pi)
    # caras que cruzan el corte del costado: sus esquinas se pasan al mismo lado
    starts = np.concatenate([[0], np.cumsum(tot)[:-1]])
    amax = np.maximum.reduceat(ang, starts)
    amin = np.minimum.reduceat(ang, starts)
    wrap = (amax - amin) > np.pi
    ang = np.where(wrap[face_of_loop] & (ang < np.pi), ang + 2 * np.pi, ang)
    r = np.clip(np.hypot(p[:, 0] - cx, p[:, 1] - cy), 0.05, 0.30)
    u = ang * r + np.where(side > 0, 0.0, 3.0) + np.where(finterior[face_of_loop], 6.0, 0.0)
    v = p[:, 2]
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers[0]
    uv.name = "UVMap"
    uv.data.foreach_set("uv", np.stack([u, v], 1).astype(np.float32).ravel())
    me.update()
    only_select([ob])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.seams_from_islands(mark_seams=True)
    done = False
    for method in ("MINIMUM_STRETCH", "ANGLE_BASED"):
        try:
            bpy.ops.uv.unwrap(method=method, margin=0.002)
            log("desdoblado UV:", method)
            done = True
            break
        except Exception as e:  # noqa: BLE001
            log("desdoblado", method, "no disponible:", e)
    if not done:
        log("se quedan las UV de patrón sin desdoblar")
    # el revés de la tela se ve poco: sus piezas van a media escala (más resolución para el derecho)
    bpy.ops.object.mode_set(mode="OBJECT")
    uvd = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers[0].data.foreach_get("uv", uvd)
    uvd = uvd.reshape(-1, 2)
    inn = finterior[face_of_loop]
    if inn.any():
        cen = uvd[inn].mean(0)
        uvd[inn] = cen + (uvd[inn] - cen) * 0.5
    me.uv_layers[0].data.foreach_set("uv", uvd.ravel())
    me.update()
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    try:   # empaquetado por la forma real de las islas
        bpy.ops.uv.pack_islands(shape_method="CONCAVE", rotate=True, rotate_method="ANY", margin_method="FRACTION", margin=0.003)
    except Exception as e:  # noqa: BLE001
        log("empaquetado UV (forma):", e)
        bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
    bpy.ops.object.mode_set(mode="OBJECT")
    n_isl = count_islands(ob)
    log(f"UV: {n_isl} islas (perneras por dentro y por fuera, trabillas)")
    uv_layout_png(ob, os.path.join(TEX, f"{NAME}_UV.png"))


def uv_layout_png(ob, path, size=2048):
    """Plantilla de las UV (bordes de los triángulos sobre fondo gris), para pintar o revisar."""
    me = ob.data
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers[0].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 3, 2)
    img = np.zeros((size, size, 4), np.float32)
    img[..., :3] = 0.10
    img[..., 3] = 1
    for i, j in ((0, 1), (1, 2), (2, 0)):
        a, b = uv[:, i], uv[:, j]
        for t in np.linspace(0, 1, 6):
            p = np.clip(((a + (b - a) * t) * (size - 1)).astype(np.int32), 0, size - 1)
            img[p[:, 1], p[:, 0], :3] = (0.75, 0.80, 0.88)
    im = bpy.data.images.new("UV_layout", size, size, alpha=False)
    im.pixels.foreach_set(img.ravel())
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()
    bpy.data.images.remove(im)


def count_islands(ob):
    try:
        import bmesh
        from bpy_extras import bmesh_utils
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        n = len(bmesh_utils.bmesh_linked_uv_islands(bm, bm.loops.layers.uv.active))
        bm.free()
        return n
    except Exception:  # noqa: BLE001
        return "?"


def uv_stretch(ob):
    """Relación área UV / área 3D por cara: desviación (0 = sin estiramiento)."""
    me = ob.data
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    vi = np.empty(n * 3, np.int32)
    me.loop_triangles.foreach_get("vertices", vi)
    li = np.empty(n * 3, np.int32)
    me.loop_triangles.foreach_get("loops", li)
    co, _ = mesh_arrays(me)
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers[0].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    P = co[vi].reshape(-1, 3, 3)
    U = uv[li].reshape(-1, 3, 2)
    a3 = 0.5 * np.linalg.norm(np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]), axis=1)
    e1, e2 = U[:, 1] - U[:, 0], U[:, 2] - U[:, 0]
    a2 = 0.5 * np.abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0])
    ok = a3 > 1e-12
    if "reves" in me.attributes:      # solo el derecho de la tela (el revés va a media escala a propósito)
        rv = np.zeros(len(me.polygons), bool)
        me.attributes["reves"].data.foreach_get("value", rv)
        tri_face = np.empty(n, np.int32)
        me.loop_triangles.foreach_get("polygon_index", tri_face)
        ok &= ~rv[tri_face]
    ratio = a2[ok] / a3[ok]
    med = np.median(ratio)
    dev = np.abs(np.log(np.maximum(ratio, 1e-9) / med))
    cover = float(a2.sum())
    return f"mediana de la desviación de área {np.median(dev):.3f}, 95% < {np.percentile(dev, 95):.3f}, ocupación UV {cover:.0%}"


# ============================================================================ fase: hornear
def new_image(name, colorspace):
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, TEX_RES, TEX_RES, alpha=False)
    img.colorspace_settings.name = colorspace
    return img


MAPS = [  # (nombre, tipo de horneado, espacio de color)
    ("BaseColor", "DIFFUSE", "sRGB"),
    ("Roughness", "ROUGHNESS", "Non-Color"),
    ("Normal", "NORMAL", "Non-Color"),
    ("AO", "AO", "Non-Color"),
    ("Height", "EMIT", "Non-Color"),
]


def pbr_material(images):
    mat = bpy.data.materials.get("Denim PBR (texturas)") or bpy.data.materials.new("Denim PBR (texturas)")
    N = Nodes(mat)
    tex = {}
    for name, _, _ in MAPS:
        n = N.new("ShaderNodeTexImage", image=images[name])
        n.name = n.label = name
        tex[name] = n
    p = N.principled()
    N.link(tex["BaseColor"].outputs["Color"], p.inputs["Base Color"])
    N.link(tex["Roughness"].outputs["Color"], p.inputs["Roughness"])
    nm = N.new("ShaderNodeNormalMap", space="TANGENT")
    N.link(tex["Normal"].outputs["Color"], nm.inputs["Color"])
    N.link(nm.outputs["Normal"], p.inputs["Normal"])
    p.inputs["Metallic"].default_value = 0.0
    set_in(p, "Sheen Weight", 0.3)
    set_in(p, "Specular IOR Level", 0.35)
    # oclusión para el glTF (grupo «glTF Material Output», lo reconoce el exportador)
    grp = bpy.data.node_groups.get("glTF Material Output")
    if grp is None:
        grp = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        grp.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g = N.new("ShaderNodeGroup")
    g.node_tree = grp
    N.link(tex["AO"].outputs["Color"], g.inputs["Occlusion"])
    disp = N.new("ShaderNodeDisplacement")
    N.link(tex["Height"].outputs["Color"], disp.inputs["Height"])
    disp.inputs["Midlevel"].default_value = 0.5
    disp.inputs["Scale"].default_value = 0.0006
    out = N.output()
    N.link(p.outputs["BSDF"], out.inputs["Surface"])
    N.link(disp.outputs["Displacement"], out.inputs["Displacement"])
    mat["role"] = "body"
    return mat, tex


def phase_bake():
    scene = bpy.context.scene
    setup_gpu(scene)
    tela = bpy.data.objects["Tela"]
    stitch = bpy.data.objects["Pespuntes"]
    low = bpy.data.objects["Vaquero PBR"]
    images = {name: new_image("Vaquero_" + name, cs) for name, _, cs in MAPS}
    c_low = low.users_collection[0]
    c_low.hide_render = False
    mat, tex = pbr_material(images)
    assign(low, mat)
    denim = tela.data.materials[0]
    dn = denim.node_tree
    # para hornear la altura, la superficie pasa a ser emisión (se restaura después)
    out = [n for n in dn.nodes if n.type == "OUTPUT_MATERIAL"][0]
    bsdf_link_from = out.inputs["Surface"].links[0].from_socket
    rb = scene.render.bake
    rb.use_selected_to_active = True
    rb.cage_extrusion = 0.002
    rb.max_ray_distance = 0.005
    rb.margin = 12
    try:
        rb.margin_type = "EXTEND"
    except Exception:  # noqa: BLE001
        pass
    rb.normal_space = "TANGENT"
    # los pespuntes también aportan color, normal y altura (un hilo encima de la tela)
    sn = stitch.data.materials[0].node_tree
    s_out = [n for n in sn.nodes if n.type == "OUTPUT_MATERIAL"][0]
    s_bsdf = s_out.inputs["Surface"].links[0].from_socket
    for name, kind, _ in MAPS:
        t = time.time()
        for n in mat.node_tree.nodes:
            n.select = False
        tex[name].select = True
        mat.node_tree.nodes.active = tex[name]
        scene.cycles.samples = 48 if kind == "AO" else 8
        em = em2 = None
        if kind == "EMIT":
            em = dn.nodes.new("ShaderNodeEmission")
            dn.links.new(height_socket(dn), em.inputs["Color"])
            dn.links.new(em.outputs["Emission"], out.inputs["Surface"])
            em2 = sn.nodes.new("ShaderNodeEmission")
            em2.inputs["Color"].default_value = (0.85, 0.85, 0.85, 1)
            sn.links.new(em2.outputs["Emission"], s_out.inputs["Surface"])
        only_select([tela, stitch, low], active=low)
        kw = dict(type=kind, use_selected_to_active=True, cage_extrusion=0.002, max_ray_distance=0.005, margin=12)
        if kind == "DIFFUSE":
            kw["pass_filter"] = {"COLOR"}
        bpy.ops.object.bake(**kw)
        if em:
            dn.links.new(bsdf_link_from, out.inputs["Surface"])
            dn.nodes.remove(em)
            sn.links.new(s_bsdf, s_out.inputs["Surface"])
            sn.nodes.remove(em2)
        img = images[name]
        os.makedirs(TEX, exist_ok=True)
        img.filepath_raw = os.path.join(TEX, f"{NAME}_{name}.png")
        img.file_format = "PNG"
        img.save()
        log(f"horneado {name} ({TEX_RES} px) en {time.time() - t:.0f}s")
    c_low.hide_render = True
    save()


def height_socket(nt):
    """El enchufe de altura del denim: la suma limitada que no va a ningún Bump (la del horneado)."""
    for n in nt.nodes:
        if n.type == "MATH" and n.label == "Altura":
            return n.outputs[0]
    raise RuntimeError("no encuentro el nodo «Altura» del material denim")


# ============================================================================ fase: exportar
def phase_export():
    low = bpy.data.objects["Vaquero PBR"]
    metal = bpy.data.objects["Botón y remaches"]
    piel = bpy.data.objects["Etiqueta de piel"]
    mat = low.data.materials[0]
    swaps = []
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            small = n.image.copy()
            small.name = n.image.name + "_glb"
            small.scale(GLB_TEX, GLB_TEX)
            swaps.append((n, n.image, small))
            n.image = small
    only_select([low, metal, piel], active=low)
    kw = dict(filepath=GLB_PBR, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
              export_texcoords=True, export_normals=True, export_materials="EXPORT")
    try:
        bpy.ops.export_scene.gltf(**kw, export_image_format="JPEG", export_jpeg_quality=90, export_extras=True)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    for n, big, small in swaps:
        n.image = big
        bpy.data.images.remove(small)
    log(f"exportado {os.path.basename(GLB_PBR)}: {os.path.getsize(GLB_PBR) / 1e6:.1f} MB")
    split_pieces()
    save()


def split_pieces():
    """Ordena la tela de alta en piezas de confección (objetos aparte en la colección Tela):
    cinturilla, trabillas, delanteros y traseros izquierdo/derecho, bolsillos traseros y monedero."""
    if bpy.data.objects.get("Cinturilla"):
        return
    ej = load_axes()
    tela = bpy.data.objects["Tela"]
    coll = tela.users_collection[0]
    # 1) las trabillas son piezas sueltas: se separan por partes desconectadas
    only_select([tela])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    parts = sorted([o for o in coll.objects if o.name.startswith("Tela")], key=lambda o: -len(o.data.polygons))
    shell = parts[0]
    shell.name = "Tela"
    loops = [o for o in parts[1:] if len(o.data.polygons) > 200]
    crumbs = [o for o in parts[1:] if len(o.data.polygons) <= 200]
    if crumbs:
        only_select([shell] + crumbs, active=shell)
        bpy.ops.object.join()
    if loops:
        only_select(loops, active=loops[0])
        bpy.ops.object.join()
        loops[0].name = loops[0].data.name = "Trabillas"
    # 2) piezas por zonas (por el centro de cada cara)
    me = shell.data
    n = len(me.polygons)
    c = np.empty(n * 3, np.float32)
    me.polygons.foreach_get("center", c)
    c = c.reshape(-1, 3)
    nr = np.empty(n * 3, np.float32)
    me.polygons.foreach_get("normal", nr)
    nr = nr.reshape(-1, 3)
    theta = np.arctan2(c[:, 1], c[:, 0])
    side, dx, dy = leg_frame(ej, c)
    front = np.where(c[:, 2] > 0.80, c[:, 1] < 0, dy < 0)
    region = np.where(front, np.where(side > 0, 1, 2), np.where(side > 0, 3, 4))   # delanteros/traseros
    band = c[:, 2] > waist_z(ej, theta) - ej["band_w"] - 0.0015
    region[band] = 0
    outward = (nr[:, 0] * c[:, 0] + nr[:, 1] * c[:, 1]) > 0
    for sx in ("1", "-1"):
        poly = np.array(ej["back_pockets"][sx], np.float32)
        inside = points_in_poly(c[:, [0, 2]], poly, grow=0.003)
        region[inside & (c[:, 1] > 0.02) & outward & ~band] = 5
    cx, cz, w, h = ej["coin"]
    coin = (np.abs(c[:, 0] - cx) < w / 2 + 0.003) & (np.abs(c[:, 2] - cz) < h / 2 + 0.003) & (c[:, 1] < 0) & outward & ~band
    region[coin] = 6
    names = ["Cinturilla", "Delantero izquierdo", "Delantero derecho", "Trasero izquierdo", "Trasero derecho",
             "Bolsillos traseros", "Bolsillo monedero"]
    mat = me.materials[0]
    while len(me.materials) < len(names):
        me.materials.append(mat)
    me.polygons.foreach_set("material_index", region.astype(np.int32))
    if "pieza" in me.attributes:
        me.attributes.remove(me.attributes["pieza"])
    me.attributes.new("pieza", "INT", "FACE").data.foreach_set("value", region.astype(np.int32))
    me.update()
    only_select([shell])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")
    for ob in [o for o in coll.objects if o.name.startswith("Tela")]:
        idx = ob.data.attributes["pieza"].data[0].value if len(ob.data.polygons) else 0
        ob.name = ob.data.name = names[idx]
        with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
            bpy.ops.object.material_slot_remove_unused()
    log("piezas:", ", ".join(o.name for o in coll.objects))


def points_in_poly(p, poly, grow=0.0):
    cen = poly.mean(0)
    poly = cen + (poly - cen) * (1 + grow / max(1e-6, float(np.linalg.norm(poly - cen, axis=1).mean())))
    x, y = p[:, 0], p[:, 1]
    inside = np.zeros(len(p), bool)
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        cross = ((yi > y) != (yj > y)) & (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi)
        inside ^= cross
        j = i
    return inside


# ============================================================================ fase: render
def fabric_objects():
    names = ["Tela", "Cinturilla", "Trabillas", "Delantero izquierdo", "Delantero derecho", "Trasero izquierdo",
             "Trasero derecho", "Bolsillos traseros", "Bolsillo monedero"]
    return [bpy.data.objects[n] for n in names if n in bpy.data.objects]


def build_studio(zmin):
    st = collection("Estudio")
    for o in list(st.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    rig = bpy.data.objects.new("Estudio (gira con la cámara)", None)
    st.objects.link(rig)
    # ciclorama: suelo que sube en curva hasta la pared del fondo
    prof = [(-6.0, 0.0), (1.0, 0.0)]
    for k in range(1, 13):
        a = -math.pi / 2 + (math.pi / 2) * k / 12
        prof.append((1.0 + 1.2 * math.cos(a) * 1.0, 1.2 + 1.2 * math.sin(a)))
    prof.append((2.2, 5.0))
    xs = np.linspace(-7, 7, 15)
    verts = [(x, y, z) for x in xs for (y, z) in prof]
    m = len(prof)
    faces = [(i * m + j, i * m + j + 1, (i + 1) * m + j + 1, (i + 1) * m + j) for i in range(len(xs) - 1) for j in range(m - 1)]
    me = bpy.data.meshes.new("Ciclorama")
    me.from_pydata(verts, [], faces)
    smooth(me)
    cyc = bpy.data.objects.new("Ciclorama", me)
    st.objects.link(cyc)
    cyc.parent = rig
    cyc.location.z = zmin
    assign(cyc, simple_material("Fondo gris", (0.20, 0.20, 0.205, 1), 0.9))
    lights = [  # nombre, posición, tamaño, potencia (W)
        ("Luz principal", (-1.5, -1.9, 2.0), 1.4, 190),
        ("Relleno", (1.9, -1.3, 1.1), 2.2, 60),
        ("Contraluz", (1.3, 1.7, 1.9), 1.0, 120),
        ("Cenital", (0.0, -0.2, 2.8), 1.6, 45),
    ]
    target = Vector((0, 0, 0.5))
    for name, pos, size, power in lights:
        ld = bpy.data.lights.new(name, "AREA")
        ld.shape = "DISK" if name == "Cenital" else "RECTANGLE"
        ld.size = size
        if ld.shape == "RECTANGLE":
            ld.size_y = size * 1.3
        ld.energy = power
        lo = bpy.data.objects.new(name, ld)
        st.objects.link(lo)
        lo.parent = rig
        lo.location = pos
        lo.rotation_euler = (target - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
    w = bpy.context.scene.world or bpy.data.worlds.new("Mundo")
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.045, 0.045, 0.05, 1)
        bg.inputs["Strength"].default_value = 1.0
    return rig


SHOTS = [  # id, nombre, objetivo, azimut, elevación, alto visible (m), resolución, focal, f/
    ("01", "frontal", (0, 0, 0.535), 0, 4, 1.16, (1200, 1600), 85, None),
    ("02", "trasera", (0, 0, 0.535), 180, 4, 1.16, (1200, 1600), 85, None),
    ("03", "lateral_izquierda", (0, 0, 0.535), 90, 4, 1.16, (1200, 1600), 85, None),
    ("04", "lateral_derecha", (0, 0, 0.535), -90, 4, 1.16, (1200, 1600), 85, None),
    ("05", "detalle_cintura", (-0.03, -0.14, 0.905), -14, 8, 0.23, (1600, 1200), 100, 8.0),
    ("06", "detalle_bolsillos", (0, 0.13, 0.84), 186, 8, 0.29, (1600, 1200), 100, 9.0),
    ("07", "detalle_tejido", None, -10, 6, 0.065, (1600, 1200), 100, 11.0),
    ("08", "detalle_bajos", (0.0, -0.03, 0.115), -28, 12, 0.34, (1600, 1200), 85, 9.0),
]


SHOTS_360 = [  # como la lámina de referencia: frente, derecha, atrás, izquierda
    ("1", "frente", (0, 0, 0.53), 0, 3, 1.18, (900, 1200), 85, None),
    ("2", "derecha", (0, 0, 0.53), -90, 3, 1.18, (900, 1200), 85, None),
    ("3", "atras", (0, 0, 0.53), 180, 3, 1.18, (900, 1200), 85, None),
    ("4", "izquierda", (0, 0, 0.53), 90, 3, 1.18, (900, 1200), 85, None),
]


def sheet_360(paths, out):
    """Une las 4 vistas en una lámina horizontal (frente, derecha, atrás, izquierda)."""
    imgs = [bpy.data.images.load(p, check_existing=False) for p in paths]
    w, h = imgs[0].size
    arr = []
    for im in imgs:
        a = np.empty(w * h * 4, np.float32)
        im.pixels.foreach_get(a)
        arr.append(a.reshape(h, w, 4))
    sheet = np.concatenate(arr, axis=1)
    out_im = bpy.data.images.new("Lamina_360", w * len(imgs), h, alpha=False)
    out_im.pixels.foreach_set(sheet.ravel())
    out_im.filepath_raw = out
    out_im.file_format = "PNG"
    out_im.save()
    for im in imgs + [out_im]:
        bpy.data.images.remove(im)


def make_camera(shot, depsgraph):
    sid, name, target, az, el, frame_h, res, focal, fstop = shot
    cam_d = bpy.data.cameras.new("Cam " + name)
    cam_d.lens = focal
    cam_d.sensor_fit = "VERTICAL"       # frame_h = alto visible, en vertical y en apaisado
    cam_d.sensor_height = 24.0
    a, e = math.radians(az), math.radians(el)
    direc = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    if target is None:   # tejido: punto real del muslo izquierdo, buscado con un rayo
        hit, loc, *_ = bpy.context.scene.ray_cast(depsgraph, Vector((0.13, -1.5, 0.60)), Vector((0, 1, 0)))
        target = tuple(loc) if hit else (0.13, -0.15, 0.60)
    target = Vector(target)
    fov = 2 * math.atan(12.0 / focal)
    dist = (frame_h / 2) / math.tan(fov / 2)
    cam = bpy.data.objects.new("Cámara " + sid + " " + name, cam_d)
    collection("Cámaras").objects.link(cam)
    cam.location = target + direc * dist
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    if fstop:
        cam_d.dof.use_dof = True
        cam_d.dof.focus_distance = dist
        cam_d.dof.aperture_fstop = fstop
    cam["azimut"] = az
    return cam


def phase_render():
    scene = bpy.context.scene
    setup_gpu(scene)
    scene.cycles.samples = RENDER_SAMPLES
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.015
    scene.cycles.use_denoising = True
    try:
        scene.cycles.denoiser = "OPENIMAGEDENOISE"
    except Exception:  # noqa: BLE001
        pass
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = -1.2     # el gris del fondo (albedo 0,2) queda gris medio
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.render.image_settings.file_format = "PNG"
    for c in bpy.data.collections:
        if c.name.startswith("Versión ligera"):
            c.hide_render = True
    obs = fabric_objects() + [bpy.data.objects[n] for n in ("Botón y remaches", "Etiqueta de piel", "Pespuntes")]
    zmin = min((o.matrix_world @ Vector(v)).z for o in obs for v in o.bound_box)
    rig = build_studio(zmin)
    shots = SHOTS_360 if VISTAS == "360" else SHOTS
    names = {f"Cámara {sh[0]} {sh[1]}" for sh in shots}      # se rehacen solo las cámaras de estas vistas
    for c in list(bpy.data.collections):
        if c.name == "Cámaras":
            for o in list(c.objects):
                if o.name.split(".")[0] in names:
                    bpy.data.objects.remove(o, do_unlink=True)
    dg = bpy.context.evaluated_depsgraph_get()
    os.makedirs(REN, exist_ok=True)
    done = []
    for shot in shots:
        cam = make_camera(shot, dg)
        if ONLY_SHOTS and shot[0] not in ONLY_SHOTS:
            continue
        t = time.time()
        scene.camera = cam
        rig.rotation_euler = (0, 0, math.radians(shot[3]))
        scene.render.resolution_x, scene.render.resolution_y = shot[6]
        scene.render.resolution_percentage = 100
        name = f"360_{shot[0]}_{shot[1]}.png" if VISTAS == "360" else f"{shot[0]}_{shot[1]}.png"
        scene.render.filepath = os.path.join(REN, name)
        bpy.ops.render.render(write_still=True)
        done.append(scene.render.filepath)
        log(f"render {shot[0]} {shot[1]} en {time.time() - t:.0f}s")
    if VISTAS == "360" and len(done) == 4:
        sheet_360(done, os.path.join(OUT, f"{NAME}_360.png"))
        log("lámina 360 guardada")
    scene.camera = bpy.data.objects.get(f"Cámara {shots[0][0]} {shots[0][1]}")
    rig.rotation_euler = (0, 0, 0)
    save()


def save():
    os.makedirs(OUT, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0     # sin copias .blend1
    bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
    log("guardado", BLEND)


def main_all():
    """Una prenda tras otra (VAQUERO_IDS); si una falla, se apunta y se sigue con la siguiente."""
    for gid in IDS:
        set_garment(gid)
        t = time.time()
        ok = True
        try:
            main()
        except Exception as e:  # noqa: BLE001
            ok = False
            msg = f"{gid}: ERROR {e}"
        with open(LOTE_LOG, "a", encoding="utf-8") as f:
            f.write((f"{gid}: listo en {time.time() - t:.0f}s" if ok else msg) + "\n")


def main():
    log("=== fases:", ", ".join(PHASES), "| vistas", VISTAS, "|", GID, "| Blender", bpy.app.version_string)
    if "preparar" not in PHASES:
        bpy.ops.wm.open_mainfile(filepath=BLEND)
    steps = {"preparar": phase_prepare, "hornear": phase_bake, "exportar": phase_export, "render": phase_render}
    for p in PHASES:
        t = time.time()
        try:
            steps[p]()
        except Exception as e:  # noqa: BLE001
            import traceback
            log("ERROR en", p, ":", e)
            log(traceback.format_exc())
            raise
        log(f"fase {p} terminada en {time.time() - t:.0f}s")
    log("=== listo")


def launch_background():
    """Desde la ventana: otro Blender sin interfaz hace el trabajo (la ventana sigue libre)."""
    os.makedirs(OUT, exist_ok=True)
    out = open(os.path.join(OUT if len(IDS) == 1 else ROOT, "salida_blender.txt" if len(IDS) == 1 else "salida_blender_lote.txt"),
               "w", encoding="utf-8")
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    p = subprocess.Popen([bpy.app.binary_path, "-b", "--factory-startup", "--python", SCRIPT],
                         stdout=out, stderr=subprocess.STDOUT, env=dict(os.environ), creationflags=flags)
    print("Vaquero: Blender en segundo plano, proceso", p.pid, "- avance en", LOG if len(IDS) == 1 else LOTE_LOG)
    return p


if bpy.app.background:
    main_all()
else:
    VAQUERO_PROCESO = launch_background()
