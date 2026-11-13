import bpy, bmesh, os
SRC = r"C:\Users\Usuario\Documents\MyOut\prendas_casual_glb\maniqui"
LOG = os.path.join(SRC, "blender", "diag.txt")
out = []
def p(*a):
    out.append(" ".join(str(x) for x in a))
for name in ("cuerpo_tienda", "mano_tienda", "cabeza_tienda"):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, name + ".glb"))
    obs = [o for o in bpy.data.objects if o not in before]
    for o in obs:
        p(name, o.name, o.type, tuple(round(v, 4) for v in o.dimensions), "scale", tuple(o.scale), "parent", o.parent.name if o.parent else None)
    ob = [o for o in obs if o.type == "MESH"][0]
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me)
    nm = sum(1 for e in bm.edges if not e.is_manifold)
    p("  verts", len(me.vertices), "faces", len(me.polygons), "non-manifold edges", nm, "loose", sum(1 for v in bm.verts if not v.link_edges))
    bm.free()
    for vs in (0.004, 0.002, 0.001):
        m = ob.modifiers.new("R", "REMESH"); m.mode = "VOXEL"; m.voxel_size = vs
        dg = bpy.context.evaluated_depsgraph_get()
        ev = ob.evaluated_get(dg)
        p("  remesh", vs, "->", len(ev.data.polygons), "faces, dims", tuple(round(v, 4) for v in ev.dimensions))
        ob.modifiers.remove(m)
    for o in obs:
        bpy.data.objects.remove(o, do_unlink=True)
open(LOG, "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
