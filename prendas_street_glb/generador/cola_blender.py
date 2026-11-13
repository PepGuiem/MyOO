"""Cola de lotes de Blender: espera al lote en marcha (CAMISETA_PROCESO) y lanza los siguientes uno detrás de otro,
cada uno en un Blender en segundo plano con blender_camiseta.py (la GPU no se comparte entre lotes).

Uso, en la consola de Python de Blender:
  exec(open(r'C:\\Users\\Usuario\\Documents\\MyOut\\prendas_street_glb\\generador\\cola_blender.py', encoding='utf-8').read())
Edita COLA para cambiar los lotes: (colección, ids).
"""
import os
import subprocess
import threading

import bpy

GEN = r"C:\Users\Usuario\Documents\MyOut\prendas_street_glb\generador"
SCRIPT = os.path.join(GEN, "blender_camiseta.py")
COLA = [("formal", "all"), ("tops", "all"), ("chaquetas", "12_chaleco_acolchado")]


def _cola(prev):
    if prev is not None:
        prev.wait()
    for col, ids in COLA:
        env = dict(os.environ)
        env["PRENDA_COLECCION"] = col
        env["CAMISETA_IDS"] = ids
        env["CAMISETA_VISTAS"] = "360"
        env.pop("CAMISETA_FASES", None)
        root = os.path.normpath(os.path.join(GEN, "..", col))
        with open(os.path.join(root, "salida_blender_camisetas.txt"), "w", encoding="utf-8") as out:
            subprocess.run([bpy.app.binary_path, "-b", "--factory-startup", "--python", SCRIPT], stdout=out,
                           stderr=subprocess.STDOUT, env=env, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))


threading.Thread(target=_cola, args=(globals().get("CAMISETA_PROCESO"),), daemon=True).start()
print("Cola de Blender lanzada:", ", ".join(c for c, _ in COLA))
