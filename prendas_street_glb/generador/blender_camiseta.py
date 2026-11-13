"""Camisetas de MyOut en Blender (probado con Blender 5.2): punto jersey, mapas PBR, estudio y 4 vistas 360°.

Parte de lo que genera build_camisetas.py en prendas_street_glb/camisetas/, para cada camiseta <id>
(p. ej. 01_camiseta_clasica):
  <id>.glb            tela (en la raglán, cuerpo y mangas aparte) y botones de la henley
  <id>_costuras.glb   el hilo de la recubridora (bajos, mangas, escote), puntada a puntada
  <id>_campos.npz     por vértice de la tela: pieza de patrón, coordenadas del punto y cara interior
  <id>_ejes.json      medidas del corte y su color

Fases (todas por defecto; variable CAMISETA_FASES="preparar,hornear,exportar,render,rig"):
  preparar  importa, atributos del punto, materiales, piezas de patrón, versión ligera con UV.
  hornear   Base Color, Roughness, Normal, AO y Height (4096 px) de la tela de alta (con los
            pespuntes) sobre la versión ligera -> <nombre>/texturas/*.png
  exportar  <id>_pbr.glb (versión ligera con texturas 2048 en JPEG y botones) y <id>_pbr.fbx.
  render    estudio gris claro, cámara ortográfica y Cycles -> <nombre>/render/360_1..4 (frente,
            derecha, atrás, izquierda) y la lámina <nombre>_360.png; con CAMISETA_VISTAS=todas,
            también primeros planos de cuello, bajo y tejido.
  rig       esqueleto del cuerpo de referencia (cadera, columna, pecho, cuello, clavículas, brazos,
            antebrazos, manos, muslos y piernas) y pesos suaves por cercanía en la versión ligera y sus piezas
            -> <id>_rig.glb y <id>_rig.fbx (malla con skin, lista para el avatar o la simulación de tela).
            Para una colección ya hecha: CAMISETA_FASES=rig (abre el .blend guardado).
Guarda <nombre>/<nombre>.blend al acabar cada fase y escribe <nombre>/registro.txt.
Varias seguidas: CAMISETA_IDS="01_camiseta_clasica,02_camiseta_oversize" (resumen en camisetas_lote.txt).

Uso: en Blender, Scripting -> consola de Python:
  import os; os.environ['CAMISETA_IDS'] = '01_camiseta_clasica'
  exec(open(r'C:\\Users\\Usuario\\Documents\\MyOut\\prendas_street_glb\\generador\\blender_camiseta.py', encoding='utf-8').read())
Lanza un Blender en segundo plano (la ventana queda libre). Sin ventana:
  blender -b --factory-startup --python blender_camiseta.py
Coordenadas: metros, Z arriba, frente = -Y.
"""
import json
import math
import os
import subprocess
import time

import bpy
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

try:
    HERE = os.path.dirname(os.path.abspath(__file__))
except NameError:  # ejecutado con exec(): ruta del proyecto
    HERE = r"C:\Users\Usuario\Documents\MyOut\prendas_street_glb\generador"
SCRIPT = os.path.join(HERE, "blender_camiseta.py")
# Colección: «camisetas» (por defecto) o «sudaderas» (PRENDA_COLECCION), en prendas_street_glb/<colección>/
COLECCION = os.environ.get("PRENDA_COLECCION", "camisetas")
ROOT = os.path.normpath(os.path.join(HERE, "..", COLECCION))
ALL = sorted(f[:-len("_campos.npz")] for f in os.listdir(ROOT) if f.endswith("_campos.npz")) if os.path.isdir(ROOT) else []
_ids = os.environ.get("CAMISETA_IDS", os.environ.get("CAMISETA_ID", ALL[0] if ALL else ""))
IDS = ALL if _ids.strip() == "all" else [i.strip() for i in _ids.split(",") if i.strip()]
VISTAS = os.environ.get("CAMISETA_VISTAS", "360")      # «360» (4 vistas) o «todas» (y primeros planos)
LOTE_LOG = os.path.join(ROOT, f"{COLECCION}_lote.txt")
PIEZAS = ['Delantero', 'Espalda', 'Manga izquierda', 'Manga derecha', 'Cuello', 'Puño izquierdo', 'Puño derecho', 'Tapeta',
          'Capucha', 'Cintura']   # (las del generador; el .npz trae las suyas)
RIB = (4, 5, 6, 9)        # piezas de canalé (cuello, puños, cintura)


def set_garment(gid):
    global GID, NAME, SRC, SRC_ST, EJES, CAMPOS, OUT, TEX, REN, BLEND, LOG, GLB_PBR, FBX_PBR
    GID = gid
    NAME = gid.split("_", 1)[1] if gid[:2].isdigit() else gid
    SRC = os.path.join(ROOT, gid + ".glb")
    SRC_ST = os.path.join(ROOT, gid + "_costuras.glb")
    EJES = os.path.join(ROOT, gid + "_ejes.json")
    CAMPOS = os.path.join(ROOT, gid + "_campos.npz")
    OUT = os.path.join(ROOT, NAME)
    TEX = os.path.join(OUT, "texturas")
    REN = os.path.join(OUT, "render")
    BLEND = os.path.join(OUT, NAME + ".blend")
    LOG = os.path.join(OUT, "registro.txt")
    GLB_PBR = os.path.join(OUT, gid + "_pbr.glb")
    FBX_PBR = os.path.join(OUT, gid + "_pbr.fbx")
    global GLB_RIG, FBX_RIG
    GLB_RIG = os.path.join(OUT, gid + "_rig.glb")
    FBX_RIG = os.path.join(OUT, gid + "_rig.fbx")


set_garment(IDS[0] if IDS else "sin_prendas")

TEX_RES = int(os.environ.get("CAMISETA_TEX", 4096))
GLB_TEX = 2048
LOW_TRIS = 120000
RENDER_SAMPLES = int(os.environ.get("CAMISETA_MUESTRAS", 160))
PHASES = [p.strip() for p in os.environ.get("CAMISETA_FASES", "preparar,hornear,exportar,render,rig").split(",") if p.strip()]
ONLY_SHOTS = [s for s in os.environ.get("CAMISETA_TOMAS", "").split(",") if s]

T0 = time.time()


def log(*a):
    line = f"[{time.time() - T0:7.1f}s] " + " ".join(str(x) for x in a)
    print("[camiseta]", line, flush=True)
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


def face_arrays(me):
    n = len(me.polygons)
    c = np.empty(n * 3, np.float32)
    me.polygons.foreach_get("center", c)
    nr = np.empty(n * 3, np.float32)
    me.polygons.foreach_get("normal", nr)
    return c.reshape(-1, 3), nr.reshape(-1, 3)


def set_point_attr(me, name, values, kind="FLOAT"):
    if name in me.attributes:
        me.attributes.remove(me.attributes[name])
    a = me.attributes.new(name, kind, "POINT")
    key = "value" if kind == "FLOAT" else "vector"
    a.data.foreach_set(key, np.ascontiguousarray(values, np.float32).ravel())


def set_face_attr(me, name, values, kind="INT"):
    if name in me.attributes:
        me.attributes.remove(me.attributes[name])
    me.attributes.new(name, kind, "FACE").data.foreach_set("value", np.ascontiguousarray(values).ravel())


def load_axes():
    with open(EJES, encoding="utf-8") as f:
        return json.load(f)


# ============================================================================ campos del generador
class Campos:
    """Pieza, coordenadas del punto y cara interior de cada vértice de la tela de alta (build_camisetas.py),
    con un árbol para buscar el vértice más cercano a cualquier punto."""
    def __init__(self):
        global PIEZAS
        d = np.load(CAMPOS)
        if "piezas" in d:
            PIEZAS = [str(x) for x in d["piezas"]]
        self.V = d["V"]
        self.pieza = d["pieza"].astype(np.int32)
        self.tej = d["tejido"].astype(np.float32)
        self.inter = d["interior"].astype(np.float32)
        self.canale = d["canale"].astype(np.float32) if "canale" in d else np.isin(self.pieza, RIB).astype(np.float32)
        self.tree = KDTree(len(self.V))
        for i, v in enumerate(self.V):
            self.tree.insert(v, i)
        self.tree.balance()

    def nearest(self, pts):
        return np.array([self.tree.find(Vector(p))[1] for p in pts], np.int64)


def apply_fields(ob, cp):
    """Atributos del punto en un objeto de tela: «tejido» (s, t), «canale» (1 en el canalé) e «interior»."""
    me = ob.data
    co, _ = mesh_arrays(me)
    idx = cp.nearest(co)
    pz = cp.pieza[idx]
    set_point_attr(me, "tejido", np.stack([cp.tej[idx, 0], cp.tej[idx, 1], np.zeros(len(co), np.float32)], 1), "FLOAT_VECTOR")
    set_point_attr(me, "canale", cp.canale[idx])
    set_point_attr(me, "interior", cp.inter[idx])
    return idx


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


def scale_rgb(c, k):
    return tuple(min(1.0, v * k) for v in c[:3]) + (1.0,)


GALGA = {  # punto de lana: paso de columna y de pasada (m), relieve del bump, pelusa
    "media": (0.0040, 0.0031, 0.0011, 0.30),
    "gruesa": (0.0062, 0.0047, 0.0017, 0.40),
}


def knit_material(name, color_hex, felpa=False, galga=None):
    """Punto jersey de algodón (procedural, en metros sobre el atributo «tejido»): columnas de mallas en V
    (unas 30 por pulgada), hilo con irregularidades, pelusa y, en el canalé (atributo «canale»), cordones
    1x1. El revés (atributo «interior») es más mate y algo más claro. Devuelve el material y los enchufes
    de color, rugosidad y altura (se usan al hornear)."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    N = Nodes(mat)
    at = N.new("ShaderNodeAttribute", attribute_name="tejido")
    sep = N.new("ShaderNodeSeparateXYZ")
    N.link(at.outputs["Vector"], sep.inputs[0])
    s, t = sep.outputs[0], sep.outputs[1]
    rib = N.new("ShaderNodeAttribute", attribute_name="canale", attribute_type="GEOMETRY").outputs["Fac"]
    inter = N.new("ShaderNodeAttribute", attribute_name="interior", attribute_type="GEOMETRY").outputs["Fac"]
    tc = N.new("ShaderNodeTexCoord")
    obj = tc.outputs["Object"]
    WS, CS = 0.00085, 0.00068          # paso de columna y de pasada (m)
    bump_d, fuzz_k = 0.00028, 0.15
    if galga in GALGA:                 # jersey de lana: la malla se ve a simple vista
        WS, CS, bump_d, fuzz_k = GALGA[galga]
    # columna: x en [-0.5, 0.5] dentro de cada columna; pasada desplazada con |x| -> mallas en V
    c = N.math("DIVIDE", s, WS)
    jitter = N.math("MULTIPLY", N.noise(N.combine(N.math("MULTIPLY", s, 40.0), N.math("MULTIPLY", t, 8.0)), 6.0, 2.0), 0.18)
    x = N.math("SUBTRACT", N.math("FRACT", N.math("ADD", c, jitter)), 0.5)
    ax = N.math("ABSOLUTE", x)
    r = N.math("DIVIDE", t, CS)
    leg = N.math("FRACT", N.math("ADD", r, N.math("MULTIPLY", ax, 1.3)))
    leg = N.math("SUBTRACT", 1.0, N.math("ABSOLUTE", N.math("SUBTRACT", N.math("MULTIPLY", leg, 2.0), 1.0)))   # triángulo 0..1
    loop = N.math("POWER", leg, 0.7)
    gap = N.math("SUBTRACT", 1.0, N.ramp(ax, [(0.36, 0.0), (0.5, 1.0)]))           # surco entre columnas
    jersey = N.math("MULTIPLY", loop, gap)
    # canalé 1x1: una columna sale y la siguiente se hunde
    rc = N.math("DIVIDE", s, WS * 1.25)
    ribv = N.math("ADD", 0.5, N.math("MULTIPLY", N.math("COSINE", N.math("MULTIPLY", rc, math.pi)), 0.5))
    ribh = N.math("MULTIPLY", ribv, N.math("ADD", 0.55, N.math("MULTIPLY", jersey, 0.45)))
    knit = N.math("ADD", N.math("MULTIPLY", jersey, N.math("SUBTRACT", 1.0, rib)), N.math("MULTIPLY", ribh, rib))
    # hilo: grosor irregular a lo largo de la pasada (slub), pelusa y ondas suaves
    slub = N.noise(N.combine(N.math("MULTIPLY", s, 0.15), N.math("MULTIPLY", t, 1.0)), 900.0, 2.0, 0.6)
    fuzz = N.noise(obj, 3200.0, 0.0)
    wrinkle = N.noise(obj, 26.0, 3.0, 0.45, 0.2)
    # color
    base = rgb(color_hex)
    lum = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2]
    dark_k = 0.80 if lum > 0.5 else 0.70           # fondo de las mallas
    col = N.mix(N.math("SUBTRACT", 1.0, knit), base, scale_rgb(base, dark_k))
    col = N.mix(N.math("MULTIPLY", N.math("SUBTRACT", slub, 0.5), 0.35), col, scale_rgb(base, 1.06 if lum < 0.6 else 0.97))
    geo = N.new("ShaderNodeAmbientOcclusion", samples=8)
    geo.inputs["Distance"].default_value = 0.02
    crease = N.math("SUBTRACT", 1.0, geo.outputs["AO"], clamp=True)
    col = N.mix(N.math("MULTIPLY", crease, 0.35), col, scale_rgb(base, 0.6))
    inside = scale_rgb(base, 0.93 if lum > 0.5 else 1.08)
    if felpa:      # felpa perchada por dentro: más clara y mate
        inside = scale_rgb(base, 1.12 if lum < 0.6 else 0.97)
    color = N.mix(N.math("MULTIPLY", inter, 0.85), col, inside)
    # rugosidad y relieve
    rough = N.math("ADD", 0.86, N.math("MULTIPLY", N.math("SUBTRACT", 1.0, knit), 0.08))
    rough = N.math("ADD", rough, N.math("MULTIPLY", inter, 0.04), clamp=True)
    fine_h = N.math("ADD", N.math("MULTIPLY", knit, 1.0 - fuzz_k), N.math("MULTIPLY", fuzz, fuzz_k))
    height = N.math("ADD", N.math("MULTIPLY", fine_h, 0.6), N.math("MULTIPLY", wrinkle, 0.4), clamp=True)
    height.node.label = "Altura"
    b1 = N.new("ShaderNodeBump")
    b1.inputs["Strength"].default_value = 0.45
    b1.inputs["Distance"].default_value = bump_d
    N.link(fine_h, b1.inputs["Height"])
    b2 = N.new("ShaderNodeBump")
    b2.inputs["Strength"].default_value = 0.10
    b2.inputs["Distance"].default_value = 0.0010
    N.link(wrinkle, b2.inputs["Height"])
    N.link(b1.outputs["Normal"], b2.inputs["Normal"])
    p = N.principled()
    N.link(color, p.inputs["Base Color"])
    N.link(rough, p.inputs["Roughness"])
    N.link(b2.outputs["Normal"], p.inputs["Normal"])
    set_in(p, "Sheen Weight", 0.62 if galga in GALGA else 0.45)       # la lana tiene más pelusa
    set_in(p, "Sheen Roughness", 0.45)
    set_in(p, "Sheen Tint", scale_rgb(base, 1.0))
    set_in(p, "Specular IOR Level", 0.3)
    out = N.output()
    N.link(p.outputs["BSDF"], out.inputs["Surface"])
    mat["role"] = "body"
    return mat


WOVEN = {  # tejido: (nombre, paso del hilo en m, relieve, rugosidad, brillo de lustre)
    "popelin": ("Popelín de algodón", 0.00045, 0.25, 0.62, 0.15),
    "oxford": ("Oxford de algodón", 0.00065, 0.45, 0.78, 0.25),
    "lino": ("Lino", 0.00075, 0.55, 0.82, 0.10),
    "franela": ("Franela de cuadros", 0.00070, 0.30, 0.92, 0.55),
    "denim": ("Denim ligero", 0.00080, 0.50, 0.80, 0.30),
    # chaquetas
    "nailon": ("Nailon", 0.00038, 0.10, 0.42, 0.05),
    "sarga": ("Sarga de algodón", 0.00070, 0.40, 0.82, 0.25),
    "tricot": ("Tricot", 0.00045, 0.10, 0.40, 0.10),
    "lana": ("Paño de lana", 0.00090, 0.10, 0.92, 0.70),
    "polar": ("Forro polar", 0.00100, 0.10, 0.97, 0.90),
    "piel": ("Piel", 0.00100, 0.10, 0.40, 0.0),
    # tops y formal
    "saten": ("Satén", 0.00030, 0.04, 0.24, 0.10),
    "traje": ("Lana fría de traje", 0.00040, 0.30, 0.62, 0.15),
}
BUMP_D = {"lana": 0.00030, "polar": 0.00090, "piel": 0.00012}
GRAIN = {"lana": (1800.0, 2.0, 0.5), "polar": (650.0, 3.0, 0.6), "piel": (2400.0, 1.0, 0.5)}   # sin trama: fieltro, pelo, poro


def woven_material(kind, color_hex, color2_hex=None, forro_hex=None, name=None):
    """Tela plana procedural sobre el atributo «tejido» (s a lo ancho, t a lo largo, en metros):
    tafetán (popelín y lino, con irregularidades del hilo), oxford (urdimbre de color y trama blanca),
    franela (cuadros de dos colores y pelusa) o denim (sarga en diagonal). El revés, más claro."""
    name0, pitch, relief, rough0, sheen = WOVEN[kind]
    name = name or name0
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    N = Nodes(mat)
    at = N.new("ShaderNodeAttribute", attribute_name="tejido")
    sep = N.new("ShaderNodeSeparateXYZ")
    N.link(at.outputs["Vector"], sep.inputs[0])
    s, t = sep.outputs[0], sep.outputs[1]
    inter = N.new("ShaderNodeAttribute", attribute_name="interior", attribute_type="GEOMETRY").outputs["Fac"]
    obj = N.new("ShaderNodeTexCoord").outputs["Object"]
    k = 2 * math.pi / pitch
    if kind in GRAIN:              # paño, polar y piel: sin trama visible
        sc, det, rgh = GRAIN[kind]
        weave = N.noise(obj, sc, det, rgh)
    elif kind in ("denim", "sarga", "traje"):
        tw = N.math("ADD", s, N.math("MULTIPLY", t, -0.45))
        wave = N.math("ADD", 0.5, N.math("MULTIPLY", N.math("SINE", N.math("MULTIPLY", tw, k)), 0.5))
        weave = N.math("POWER", wave, 1.4)
    else:
        ws = N.math("SINE", N.math("MULTIPLY", s, k))
        wt = N.math("SINE", N.math("MULTIPLY", t, k * (0.5 if kind == "oxford" else 1.0)))
        weave = N.math("ADD", 0.5, N.math("MULTIPLY", N.math("MULTIPLY", ws, wt), 0.5))        # por encima / por debajo
    slub = N.noise(N.combine(N.math("MULTIPLY", s, 0.08), N.math("MULTIPLY", t, 1.0)), 380.0 if kind == "lino" else 900.0, 2.0, 0.6)
    fuzz = N.noise(obj, 2600.0, 0.0)
    wrinkle = N.noise(obj, 24.0 if kind == "lino" else (55.0 if kind == "piel" else 30.0), 3.0, 0.5, 0.25)
    base = rgb(color_hex)
    lum = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2]
    if kind == "franela":           # cuadros (buffalo check) con líneas finas
        c2 = rgb(color2_hex or "#1E1E22")
        sq = 0.030
        cs = N.math("MODULO", N.math("FLOOR", N.math("DIVIDE", N.math("ADD", s, 10.0), sq)), 2.0)
        ct = N.math("MODULO", N.math("FLOOR", N.math("DIVIDE", N.math("ADD", t, 10.0), sq)), 2.0)
        both = N.math("MULTIPLY", cs, ct)
        either = N.math("SUBTRACT", N.math("ADD", cs, ct), both)
        col = N.mix(N.math("MULTIPLY", either, 0.55), base, c2)
        col = N.mix(both, col, c2)
        col = N.mix(N.math("MULTIPLY", fuzz, 0.25), col, scale_rgb(base, 1.15))
    elif kind == "oxford":          # trama blanca que asoma
        col = N.mix(N.math("MULTIPLY", N.math("SUBTRACT", 1.0, weave), 0.45), base, rgb("#F4F4F2"))
    elif kind == "denim":
        col = N.mix(N.math("MULTIPLY", N.math("SUBTRACT", 1.0, weave), 0.35), base, rgb("#D9DDE2"))
    else:
        col = N.mix(N.math("MULTIPLY", N.math("SUBTRACT", 1.0, weave), 0.10), base, scale_rgb(base, 0.85 if lum > 0.5 else 1.15))
    col = N.mix(N.math("MULTIPLY", N.math("SUBTRACT", slub, 0.5), 0.5 if kind == "lino" else 0.25), col,
                scale_rgb(base, 0.9 if lum > 0.5 else 1.15))
    ao = N.new("ShaderNodeAmbientOcclusion", samples=8)
    ao.inputs["Distance"].default_value = 0.02
    crease = N.math("SUBTRACT", 1.0, ao.outputs["AO"], clamp=True)
    col = N.mix(N.math("MULTIPLY", crease, 0.3), col, scale_rgb(base, 0.6))
    # canalé de punto (cuello, puños y bajo de las chaquetas): cordones 1x1 mates
    rib = N.new("ShaderNodeAttribute", attribute_name="canale", attribute_type="GEOMETRY").outputs["Fac"]
    ribv = N.math("ADD", 0.5, N.math("MULTIPLY", N.math("COSINE", N.math("MULTIPLY", N.math("DIVIDE", s, 0.0012), math.pi)), 0.5))
    weave = N.math("ADD", N.math("MULTIPLY", weave, N.math("SUBTRACT", 1.0, rib)), N.math("MULTIPLY", ribv, rib))
    inside = scale_rgb(base, 1.08 if lum < 0.6 else 0.95)
    if forro_hex:                   # forro (tafetán satinado) por dentro
        inside = rgb(forro_hex)
    color = N.mix(N.math("MULTIPLY", inter, 0.85 if forro_hex else 0.8), col, inside)
    rough = N.math("ADD", rough0, N.math("MULTIPLY", N.math("SUBTRACT", 1.0, weave), 0.06))
    rough = N.math("ADD", rough, N.math("MULTIPLY", rib, max(0.0, 0.88 - rough0)))
    if forro_hex:
        rough = N.math("SUBTRACT", rough, N.math("MULTIPLY", inter, max(0.0, rough0 - 0.32)), clamp=True)
    else:
        rough = N.math("ADD", rough, N.math("MULTIPLY", inter, 0.05), clamp=True)
    fine_h = N.math("ADD", N.math("MULTIPLY", weave, relief), N.math("MULTIPLY", N.math("ADD", slub, fuzz), 0.12))
    height = N.math("ADD", N.math("MULTIPLY", fine_h, 0.6), N.math("MULTIPLY", wrinkle, 0.4), clamp=True)
    height.node.label = "Altura"
    b1 = N.new("ShaderNodeBump")
    b1.inputs["Strength"].default_value = 0.35
    b1.inputs["Distance"].default_value = BUMP_D.get(kind, 0.00018)
    N.link(fine_h, b1.inputs["Height"])
    b2 = N.new("ShaderNodeBump")
    b2.inputs["Strength"].default_value = 0.10
    b2.inputs["Distance"].default_value = 0.0010
    N.link(wrinkle, b2.inputs["Height"])
    N.link(b1.outputs["Normal"], b2.inputs["Normal"])
    p = N.principled()
    N.link(color, p.inputs["Base Color"])
    N.link(rough, p.inputs["Roughness"])
    N.link(b2.outputs["Normal"], p.inputs["Normal"])
    set_in(p, "Sheen Weight", sheen)
    set_in(p, "Sheen Roughness", 0.4)
    set_in(p, "Specular IOR Level", 0.6 if kind == "saten" else (0.5 if kind in ("piel", "nailon") else 0.35))
    if kind == "piel":
        set_in(p, "Coat Weight", 0.15)
        set_in(p, "Coat Roughness", 0.35)
    out = N.output()
    N.link(p.outputs["BSDF"], out.inputs["Surface"])
    mat["role"] = "body"
    return mat


def simple_material(name, color, rough, metal=0.0, sheen=0.0, role=None):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    N = Nodes(mat)
    p = N.principled()
    p.inputs["Base Color"].default_value = color
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    set_in(p, "Sheen Weight", sheen)
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
    root = collection(ej["nombre"])
    c_tela = collection("Tela", root)
    c_bot = collection("Botones, cordones y cremallera", root)
    c_hilo = collection("Pespuntes", root)
    c_low = collection("Versión ligera (PBR, web)")

    obs = {o.name.split(".")[0]: o for o in import_glb(SRC)}
    stitch = import_glb(SRC_ST)[0]
    tela = obs["body"]
    tela.name = tela.data.name = "Tela"
    move_to(tela, c_tela)
    fabric = [tela]
    color = ej["color"]
    felpa = ej.get("tejido") == "felpa"
    if ej.get("tejido") in WOVEN:
        knit = woven_material(ej["tejido"], color, ej.get("color2") if ej["tejido"] == "franela" else None, ej.get("forro"))
    else:
        nombre = "Felpa de algodón" if felpa else ("Punto de lana" if ej.get("galga") else "Punto jersey")
        knit = knit_material(nombre, color, felpa, ej.get("galga"))
    assign(tela, knit)
    if "secondary" in obs:
        mangas = obs["secondary"]
        mangas.name = mangas.data.name = "Mangas"
        move_to(mangas, c_tela)
        if ej.get("tejido2") in WOVEN or (ej.get("tejido") in WOVEN and ej.get("tejido") != "franela"):
            k2 = ej.get("tejido2") or ej["tejido"]
            assign(mangas, woven_material(k2, ej.get("color2") or color, None, ej.get("forro"), name=WOVEN[k2][0] + " (panel)"))
        else:
            assign(mangas, knit_material("Punto (mangas)", ej.get("color2") or color, felpa))
        fabric.append(mangas)
    extras = {  # papel -> (objeto, material)
        "button": ("Botones", lambda: simple_material("Botón de resina", rgb(ej.get("color_boton") or "#E9E3D6"), 0.28, 0.0, role="button")),
        "trim": ("Cordones y adornos", lambda: simple_material("Cordón y adorno", rgb(ej.get("color_trim") or "#ECEAE4"), 0.8, 0.0, sheen=0.4, role="trim")),
        "hardware": ("Punteras y ojales", lambda: simple_material("Metal pavonado", rgb("#A8A7A3"), 0.32, 1.0, role="hardware")),
        "zipper": ("Cremallera", lambda: simple_material("Cremallera metálica", rgb("#B5B3AE"), 0.3, 1.0, role="zipper")),
    }
    for role, (nm, mk) in extras.items():
        if role in obs:
            o = obs[role]
            o.name = o.data.name = nm
            move_to(o, c_bot)
            assign(o, mk())
            smooth(o.data)
    stitch.name = stitch.data.name = "Pespuntes"
    move_to(stitch, c_hilo)
    assign(stitch, simple_material("Hilo de algodón", scale_rgb(rgb(color), 0.94), 0.75, 0.0, sheen=0.5, role="stitch"))
    smooth(stitch.data)
    log("importado:", ", ".join(f"{o.name} {tri_count(o)} tri." for o in fabric + [stitch]))

    t = time.time()
    cp = Campos()
    for ob in fabric:
        apply_fields(ob, cp)
    log(f"atributos del punto en {time.time() - t:.0f}s")

    # versión ligera: una sola malla (cuerpo y mangas juntos), simplificada, con UV de patrón
    copies = []
    for ob in fabric:
        c = ob.copy()
        c.data = ob.data.copy()
        c_low.objects.link(c)
        copies.append(c)
    only_select(copies, active=copies[0])
    if len(copies) > 1:
        bpy.ops.object.join()
    low = copies[0]
    low.name = low.data.name = "Camiseta PBR"
    ratio = LOW_TRIS / max(1, tri_count(low))
    dec = low.modifiers.new("Simplificar", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = min(1.0, ratio)
    bake_modifiers(low)
    only_select([low])
    try:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    except Exception as e:  # noqa: BLE001
        log("normales personalizadas:", e)
    smooth(low.data, sharp_deg=60)
    t = time.time()
    pattern_uvs(low, cp)
    log(f"versión ligera: {tri_count(low)} tri., UV en {time.time() - t:.0f}s, estiramiento:", uv_stretch(low))
    split_pieces(tela, cp)
    c_low.hide_render = True
    save()


def pattern_uvs(ob, cp):
    """UV como un patrón de costura: cada pieza (delantero, espalda, mangas abiertas por debajo, cuello,
    puños, tapeta) por separado y el revés aparte; Blender las desdobla con estiramiento mínimo y las
    empaqueta por su forma."""
    me = ob.data
    nP = len(me.polygons)
    lv = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("vertex_index", lv)
    tot = np.empty(nP, np.int32)
    me.polygons.foreach_get("loop_total", tot)
    face_of_loop = np.repeat(np.arange(nP), tot)
    c, fn = face_arrays(me)
    idx = cp.nearest(c)
    piece = cp.pieza[idx]
    finterior = cp.inter[idx] > 0.5
    # limpieza por mayoría de vecinas (sin islas sueltas en el fondo de los pliegues)
    le = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("edge_index", le)
    face_l = face_of_loop
    order = np.argsort(le, kind="stable")
    e_sorted = le[order]
    same = e_sorted[1:] == e_sorted[:-1]
    fa = face_l[order][:-1][same]
    fb = face_l[order][1:][same]
    for _ in range(6):
        votes = np.zeros(nP, np.float32)
        cnt = np.zeros(nP, np.float32)
        np.add.at(votes, fa, finterior[fb]); np.add.at(cnt, fa, 1)
        np.add.at(votes, fb, finterior[fa]); np.add.at(cnt, fb, 1)
        maj = votes / np.maximum(cnt, 1)
        finterior = np.where(maj > 0.5, True, np.where(maj < 0.5, False, finterior))
    for _ in range(4):        # piezas: cada cara toma la más votada entre ella y sus vecinas (sin motas sueltas)
        cnt = np.zeros((nP, len(PIEZAS)), np.float32)
        np.add.at(cnt, (np.arange(nP), piece), 1.5)
        np.add.at(cnt, (fa, piece[fb]), 1.0)
        np.add.at(cnt, (fb, piece[fa]), 1.0)
        piece = cnt.argmax(1).astype(piece.dtype)
    set_face_attr(me, "reves", finterior, "BOOLEAN")
    set_face_attr(me, "pieza", piece.astype(np.int32))
    co, _ = mesh_arrays(me)
    # coordenadas de cada esquina: las del vértice de alta más cercano DE LA PIEZA DE SU CARA (así son
    # continuas dentro de cada pieza y no se cuelan las de la pieza vecina en los bordes)
    lp = piece[face_of_loop]
    st = np.zeros((len(lv), 2), np.float32)
    for pc in np.unique(lp):
        sel = np.nonzero(cp.pieza == pc)[0]
        tree = KDTree(len(sel))
        for k, i in enumerate(sel):
            tree.insert(cp.V[i], k)
        tree.balance()
        m = np.nonzero(lp == pc)[0]
        vv = np.unique(lv[m])
        near = {int(v): sel[tree.find(Vector(co[v]))[1]] for v in vv}
        st[m] = cp.tej[[near[int(v)] for v in lv[m]]]
    # caras que cruzan un corte de la pieza (salto de s): sus esquinas se pasan al mismo lado
    starts = np.concatenate([[0], np.cumsum(tot)[:-1]])
    smax = np.maximum.reduceat(st[:, 0], starts)
    smin = np.minimum.reduceat(st[:, 0], starts)
    wrap = (smax - smin) > 0.08
    s = np.where(wrap[face_of_loop] & (st[:, 0] < 0), st[:, 0] + 2 * np.pi * 0.06, st[:, 0])
    off = piece[face_of_loop] * 3.0 + np.where(finterior[face_of_loop], 40.0, 0.0)
    u = s + off
    v = st[:, 1]
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
    for method in ("MINIMUM_STRETCH", "ANGLE_BASED"):
        try:
            bpy.ops.uv.unwrap(method=method, margin=0.002)
            log("desdoblado UV:", method)
            break
        except Exception as e:  # noqa: BLE001
            log("desdoblado", method, "no disponible:", e)
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
    try:
        bpy.ops.uv.pack_islands(shape_method="CONCAVE", rotate=True, rotate_method="ANY", margin_method="FRACTION", margin=0.003)
    except Exception as e:  # noqa: BLE001
        log("empaquetado UV (forma):", e)
        bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
    bpy.ops.object.mode_set(mode="OBJECT")
    log(f"UV: {count_islands(ob)} islas")
    uv_layout_png(ob, os.path.join(TEX, f"{NAME}_UV.png"))


def uv_layout_png(ob, path, size=2048):
    me = ob.data
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    li = np.empty(n * 3, np.int32)
    me.loop_triangles.foreach_get("loops", li)
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers[0].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)[li].reshape(-1, 3, 2)
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
    if "reves" in me.attributes:
        rv = np.zeros(len(me.polygons), bool)
        me.attributes["reves"].data.foreach_get("value", rv)
        tri_face = np.empty(n, np.int32)
        me.loop_triangles.foreach_get("polygon_index", tri_face)
        ok &= ~rv[tri_face]
    ratio = a2[ok] / a3[ok]
    med = np.median(ratio)
    dev = np.abs(np.log(np.maximum(ratio, 1e-9) / med))
    return f"mediana de la desviación de área {np.median(dev):.3f}, 95% < {np.percentile(dev, 95):.3f}, ocupación UV {float(a2.sum()):.0%}"


def split_pieces(tela, cp):
    """Separa la tela de alta en piezas de confección (objetos aparte): delantero, espalda, mangas,
    cuello, puños y tapeta. En la raglán, las mangas ya son su propio objeto."""
    me = tela.data
    c, _ = face_arrays(me)
    region = cp.pieza[cp.nearest(c)].astype(np.int32)
    mat = me.materials[0]
    while len(me.materials) < len(PIEZAS):
        me.materials.append(mat)
    me.polygons.foreach_set("material_index", region)
    set_face_attr(me, "pieza", region)
    me.update()
    coll = tela.users_collection[0]
    only_select([tela])
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")
    for ob in [o for o in coll.objects if o.name.startswith("Tela")]:
        idx = ob.data.attributes["pieza"].data[0].value if len(ob.data.polygons) else 0
        ob.name = ob.data.name = PIEZAS[idx]
        with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
            bpy.ops.object.material_slot_remove_unused()
    log("piezas:", ", ".join(o.name for o in coll.objects))


EXTRA_NAMES = ("Botones", "Cordones", "Cordones y adornos", "Punteras y ojales", "Cremallera")


def fabric_objects():
    names = PIEZAS + ["Mangas", "Tela"]
    return [bpy.data.objects[n] for n in names if n in bpy.data.objects]


# ============================================================================ fase: hornear
def new_image(name, colorspace):
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, TEX_RES, TEX_RES, alpha=False)
    img.colorspace_settings.name = colorspace
    return img


MAPS = [
    ("BaseColor", "DIFFUSE", "sRGB"),
    ("Roughness", "ROUGHNESS", "Non-Color"),
    ("Normal", "NORMAL", "Non-Color"),
    ("AO", "AO", "Non-Color"),
    ("Height", "EMIT", "Non-Color"),
]


def pbr_material(images):
    mat = bpy.data.materials.get("Punto PBR (texturas)") or bpy.data.materials.new("Punto PBR (texturas)")
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
    set_in(p, "Sheen Weight", 0.4)
    set_in(p, "Specular IOR Level", 0.3)
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
    disp.inputs["Scale"].default_value = 0.0005
    out = N.output()
    N.link(p.outputs["BSDF"], out.inputs["Surface"])
    N.link(disp.outputs["Displacement"], out.inputs["Displacement"])
    mat["role"] = "body"
    return mat, tex


def height_socket(nt):
    for n in nt.nodes:
        if n.type == "MATH" and n.label == "Altura":
            return n.outputs[0]
    raise RuntimeError("no encuentro el nodo «Altura» del material de punto")


def phase_bake():
    scene = bpy.context.scene
    setup_gpu(scene)
    fabric = fabric_objects()
    stitch = bpy.data.objects["Pespuntes"]
    low = bpy.data.objects["Camiseta PBR"]
    images = {name: new_image("Camiseta_" + name, cs) for name, _, cs in MAPS}
    c_low = low.users_collection[0]
    c_low.hide_render = False
    mat, tex = pbr_material(images)
    assign(low, mat)
    knit_mats = {m for ob in fabric for m in ob.data.materials if m}
    swaps = []          # (árbol, salida, enlace original)
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
        ems = []
        if kind == "EMIT":
            for km in knit_mats:
                nt = km.node_tree
                out = [n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"][0]
                orig = out.inputs["Surface"].links[0].from_socket
                em = nt.nodes.new("ShaderNodeEmission")
                nt.links.new(height_socket(nt), em.inputs["Color"])
                nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
                ems.append((nt, out, orig, em))
            em2 = sn.nodes.new("ShaderNodeEmission")
            em2.inputs["Color"].default_value = (0.8, 0.8, 0.8, 1)
            sn.links.new(em2.outputs["Emission"], s_out.inputs["Surface"])
        only_select(fabric + [stitch, low], active=low)
        kw = dict(type=kind, use_selected_to_active=True, cage_extrusion=0.002, max_ray_distance=0.005, margin=12)
        if kind == "DIFFUSE":
            kw["pass_filter"] = {"COLOR"}
        bpy.ops.object.bake(**kw)
        if kind == "EMIT":
            for nt, out, orig, em in ems:
                nt.links.new(orig, out.inputs["Surface"])
                nt.nodes.remove(em)
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


# ============================================================================ fase: exportar
def phase_export():
    low = bpy.data.objects["Camiseta PBR"]
    extra = [bpy.data.objects[n] for n in EXTRA_NAMES if n in bpy.data.objects]
    mat = low.data.materials[0]
    swaps = []
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            small = n.image.copy()
            small.name = n.image.name + "_glb"
            small.scale(GLB_TEX, GLB_TEX)
            swaps.append((n, n.image, small))
            n.image = small
    only_select([low] + extra, active=low)
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
    try:
        bpy.ops.export_scene.fbx(filepath=FBX_PBR, use_selection=True, apply_scale_options="FBX_SCALE_UNITS",
                                 path_mode="RELATIVE", mesh_smooth_type="FACE", add_leaf_bones=False)
        log(f"exportado {os.path.basename(FBX_PBR)} (texturas en texturas/)")
    except Exception as e:  # noqa: BLE001
        log("FBX no exportado:", e)
    save()


# ============================================================================ fase: rig (esqueleto y pesos)
def reference_bones():
    """Huesos del cuerpo de referencia (1,78 m, brazos a 32°, el mismo de todas las prendas), en metros, Z arriba."""
    arm_deg = 32.0
    B = {"cadera": ((0, 0.004, 0.90), (0, 0.004, 1.05), None), "columna": ((0, 0.004, 1.05), (0, 0.004, 1.25), "cadera"),
         "pecho": ((0, 0.004, 1.25), (0, 0.006, 1.42), "columna"), "cuello": ((0, 0.008, 1.42), (0, 0.012, 1.56), "pecho")}
    for sd, sfx in ((1, "L"), (-1, "R")):
        S = np.array([0.168 * sd, 0.004, 1.405])
        d1 = np.array([math.sin(math.radians(arm_deg)) * sd, 0.0, -math.cos(math.radians(arm_deg))])
        E = S + d1 * 0.285
        d2 = np.array([math.sin(math.radians(arm_deg - 6)) * sd, -0.12, -math.cos(math.radians(arm_deg - 6))]); d2 /= np.linalg.norm(d2)
        W = E + d2 * 0.255
        H = np.array([0.090 * sd, 0.004, 0.84]); K = np.array([0.098 * sd, -0.004, 0.485]); C = np.array([0.101 * sd, 0.010, 0.33])
        B[f"clavicula.{sfx}"] = ((0.020 * sd, 0.004, 1.42), tuple(S), "pecho")
        B[f"brazo.{sfx}"] = (tuple(S), tuple(E), f"clavicula.{sfx}")
        B[f"antebrazo.{sfx}"] = (tuple(E), tuple(W), f"brazo.{sfx}")
        B[f"mano.{sfx}"] = (tuple(W), tuple(W + d2 * 0.09), f"antebrazo.{sfx}")
        B[f"muslo.{sfx}"] = (tuple(H), tuple(K), "cadera")
        B[f"pierna.{sfx}"] = (tuple(K), tuple(C), f"muslo.{sfx}")
    return B


def _seg_dist(P, a, b):
    a = np.asarray(a); b = np.asarray(b); e = b - a
    t = np.clip(((P - a) @ e) / max(float(e @ e), 1e-9), 0, 1)
    return np.linalg.norm(P - (a + np.outer(t, e)), axis=1)


BONE_R = {"cadera": 0.17, "columna": 0.16, "pecho": 0.17, "cuello": 0.065, "clavicula": 0.06, "brazo": 0.055,
          "antebrazo": 0.045, "mano": 0.04, "muslo": 0.09, "pierna": 0.06}


def proximity_weights(P, bones, sigma=0.035, keep=4):
    """Pesos suaves por cercanía: cada hueso es un volumen (segmento con radio, el del cuerpo de referencia);
    peso = exp(-(distancia a su superficie)² / σ²), se quedan los 4 mayores y se normalizan."""
    names = list(bones)
    D = np.stack([np.maximum(_seg_dist(P, bones[n][0], bones[n][1]) - BONE_R[n.split(".")[0]], 0.0) for n in names], 1)
    W = np.exp(-(D / sigma) ** 2)
    if keep < len(names):
        thr = -np.sort(-W, axis=1)[:, keep - 1:keep]
        W = np.where(W >= thr, W, 0.0)
    W = W / np.maximum(W.sum(1, keepdims=True), 1e-9)
    return W


def phase_rig():
    """Esqueleto común (el del cuerpo de referencia) y pesos suaves por cercanía en la versión ligera y sus
    piezas (los pesos de calor de Blender fallan en una tela de dos caras cerrada). Exporta <id>_rig.glb y
    .fbx (malla con skin), para deformar la prenda con el avatar o pasarla a simulación de tela."""
    low = bpy.data.objects["Camiseta PBR"]
    extra = [bpy.data.objects[n] for n in EXTRA_NAMES if n in bpy.data.objects]
    old = bpy.data.objects.get("Esqueleto")
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    bones = reference_bones()
    arm_data = bpy.data.armatures.new("Esqueleto")
    arm = bpy.data.objects.new("Esqueleto", arm_data)
    low.users_collection[0].objects.link(arm)
    only_select([arm], active=arm)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for name, (h, t, parent) in bones.items():
        b = arm_data.edit_bones.new(name)
        b.head = Vector(h); b.tail = Vector(t)
        eb[name] = b
    for name, (h, t, parent) in bones.items():
        if parent:
            eb[name].parent = eb[parent]
            eb[name].use_connect = (Vector(bones[parent][1]) - Vector(h)).length < 1e-4
    bpy.ops.object.mode_set(mode="OBJECT")
    meshes = [low] + extra
    names = list(bones)
    for ob in meshes:
        for m in [m for m in ob.modifiers if m.type == "ARMATURE"]:
            ob.modifiers.remove(m)
        ob.vertex_groups.clear()
        only_select([ob, arm], active=arm)
        bpy.ops.object.parent_set(type="ARMATURE_NAME")            # modificador y grupos vacíos
        groups = {g.name: g for g in ob.vertex_groups}
        for n in names:
            if n not in groups:
                groups[n] = ob.vertex_groups.new(name=n)
        P = np.array([tuple(ob.matrix_world @ v.co) for v in ob.data.vertices])
        W = proximity_weights(P, bones)
        for k, n in enumerate(names):
            col = W[:, k]
            for lvl in np.unique(np.round(col[col > 0.01], 3)):
                idx = np.nonzero(np.abs(np.round(col, 3) - lvl) < 1e-9)[0].tolist()
                groups[n].add(idx, float(lvl), "REPLACE")
        top = W.argmax(1)
        log(f"pesos {ob.name}: {len(P)} vértices; " + ", ".join(f"{n} {int((top == k).sum())}" for k, n in enumerate(names) if (top == k).any()))
    only_select(meshes + [arm], active=arm)
    kw = dict(filepath=GLB_RIG, export_format="GLB", use_selection=True, export_yup=True, export_texcoords=True,
              export_normals=True, export_materials="EXPORT", export_skins=True)
    try:
        bpy.ops.export_scene.gltf(**kw, export_image_format="JPEG", export_jpeg_quality=90)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    log(f"exportado {os.path.basename(GLB_RIG)}: {os.path.getsize(GLB_RIG) / 1e6:.1f} MB")
    try:
        bpy.ops.export_scene.fbx(filepath=FBX_RIG, use_selection=True, apply_scale_options="FBX_SCALE_UNITS",
                                 path_mode="RELATIVE", mesh_smooth_type="FACE", add_leaf_bones=False,
                                 primary_bone_axis="Y", secondary_bone_axis="X")
        log(f"exportado {os.path.basename(FBX_RIG)}")
    except Exception as e:  # noqa: BLE001
        log("FBX con esqueleto no exportado:", e)
    save()


# ============================================================================ fase: render
def bounds(obs):
    pts = np.array([tuple(o.matrix_world @ Vector(v)) for o in obs for v in o.bound_box])
    return pts.min(0), pts.max(0)


def build_studio(zfloor, zc):
    st = collection("Estudio")
    for o in list(st.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    rig = bpy.data.objects.new("Estudio (gira con la cámara)", None)
    st.objects.link(rig)
    prof = [(-6.0, 0.0), (1.0, 0.0)]
    for k in range(1, 13):
        a = -math.pi / 2 + (math.pi / 2) * k / 12
        prof.append((1.0 + 1.2 * math.cos(a), 1.2 + 1.2 * math.sin(a)))
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
    cyc.location.z = zfloor
    assign(cyc, simple_material("Fondo gris", (0.30, 0.30, 0.31, 1), 0.9))
    lights = [  # nombre, posición (relativa al centro de la prenda), tamaño, potencia (W)
        ("Luz principal", (-2.1, -1.3, 1.2), 0.9, 270),
        ("Relleno", (2.0, -1.4, 0.2), 2.0, 22),
        ("Contraluz", (1.4, 1.7, 1.6), 0.7, 170),
        ("Cenital", (0.0, -0.3, 2.3), 1.0, 22),
    ]
    target = Vector((0, 0, zc))
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
        p = Vector(pos) + Vector((0, 0, zc))
        lo.location = p
        lo.rotation_euler = (target - p).to_track_quat("-Z", "Y").to_euler()
    w = bpy.context.scene.world or bpy.data.worlds.new("Mundo")
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.06, 0.06, 0.065, 1)
        bg.inputs["Strength"].default_value = 1.0
    return rig


def shots(lo, hi):
    zc = float(lo[2] + hi[2]) / 2
    size = float(max(hi[2] - lo[2], 2 * max(abs(lo[0]), abs(hi[0])))) * 1.12
    out = [  # id, nombre, objetivo, azimut, elevación, tamaño (ortográfica) o alto visible, resolución, focal o None (orto), f/
        ("1", "frente", (0, 0, zc), 0, 0, size, (1200, 1200), None, None),
        ("2", "derecha", (0, 0, zc), -90, 0, size, (1200, 1200), None, None),
        ("3", "atras", (0, 0, zc), 180, 0, size, (1200, 1200), None, None),
        ("4", "izquierda", (0, 0, zc), 90, 0, size, (1200, 1200), None, None),
    ]
    if VISTAS == "todas":
        out += [
            ("5", "detalle_cuello", (0, -0.06, 1.42), -18, 14, 0.24, (1600, 1200), 100, 8.0),
            ("6", "detalle_bajo", (0.10, -0.10, float(lo[2]) + 0.03), -24, 8, 0.22, (1600, 1200), 100, 8.0),
            ("7", "detalle_tejido", None, -8, 4, 0.06, (1600, 1200), 100, 11.0),
        ]
    return out


def sheet_360(paths, out):
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
    sid, name, target, az, el, size, res, focal, fstop = shot
    cam_d = bpy.data.cameras.new("Cam " + name)
    a, e = math.radians(az), math.radians(el)
    direc = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    if target is None:   # tejido: punto real del pecho, buscado con un rayo
        hit, loc, *_ = bpy.context.scene.ray_cast(depsgraph, Vector((0.07, -1.5, 1.22)), Vector((0, 1, 0)))
        target = tuple(loc) if hit else (0.07, -0.13, 1.22)
    target = Vector(target)
    if focal is None:
        cam_d.type = "ORTHO"
        cam_d.ortho_scale = size
        dist = 4.0
    else:
        cam_d.lens = focal
        cam_d.sensor_fit = "VERTICAL"
        cam_d.sensor_height = 24.0
        fov = 2 * math.atan(12.0 / focal)
        dist = (size / 2) / math.tan(fov / 2)
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
    scene.view_settings.exposure = -1.2
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.render.image_settings.file_format = "PNG"
    for c in bpy.data.collections:
        if c.name.startswith("Versión ligera"):
            c.hide_render = True
    obs = fabric_objects() + [bpy.data.objects[n] for n in EXTRA_NAMES + ("Pespuntes",) if n in bpy.data.objects]
    lo, hi = bounds(obs)
    zc = float(lo[2] + hi[2]) / 2
    rig = build_studio(float(lo[2]) - 0.30, zc)        # la prenda flota: sombra suave en el suelo
    sh = shots(lo, hi)
    names = {f"Cámara {s[0]} {s[1]}" for s in sh}
    for c in list(bpy.data.collections):
        if c.name == "Cámaras":
            for o in list(c.objects):
                if o.name.split(".")[0] in names:
                    bpy.data.objects.remove(o, do_unlink=True)
    dg = bpy.context.evaluated_depsgraph_get()
    os.makedirs(REN, exist_ok=True)
    done = []
    for shot in sh:
        cam = make_camera(shot, dg)
        if ONLY_SHOTS and shot[0] not in ONLY_SHOTS:
            continue
        t = time.time()
        scene.camera = cam
        rig.rotation_euler = (0, 0, math.radians(shot[3]))
        scene.render.resolution_x, scene.render.resolution_y = shot[6]
        scene.render.resolution_percentage = 100
        scene.render.filepath = os.path.join(REN, f"360_{shot[0]}_{shot[1]}.png" if shot[7] is None else f"{shot[0]}_{shot[1]}.png")
        bpy.ops.render.render(write_still=True)
        if shot[7] is None:
            done.append(scene.render.filepath)
        log(f"render {shot[0]} {shot[1]} en {time.time() - t:.0f}s")
    if len(done) == 4:
        sheet_360(done, os.path.join(OUT, f"{NAME}_360.png"))
        log("lámina 360 guardada")
    scene.camera = bpy.data.objects.get(f"Cámara {sh[0][0]} {sh[0][1]}")
    rig.rotation_euler = (0, 0, 0)
    save()


def save():
    os.makedirs(OUT, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
    log("guardado", BLEND)


def main_all():
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
    steps = {"preparar": phase_prepare, "hornear": phase_bake, "exportar": phase_export, "render": phase_render, "rig": phase_rig}
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
    os.makedirs(ROOT, exist_ok=True)
    out = open(os.path.join(ROOT, "salida_blender_camisetas.txt"), "w", encoding="utf-8")
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    p = subprocess.Popen([bpy.app.binary_path, "-b", "--factory-startup", "--python", SCRIPT],
                         stdout=out, stderr=subprocess.STDOUT, env=dict(os.environ), creationflags=flags)
    print("Camisetas: Blender en segundo plano, proceso", p.pid, "- avance en", LOTE_LOG)
    return p


if bpy.app.background:
    main_all()
else:
    CAMISETA_PROCESO = launch_background()
