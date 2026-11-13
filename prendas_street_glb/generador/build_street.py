"""Prendas de la colección street (items5.py): mismo proceso que build5.py.

Uso (desde esta carpeta):
    python3 build_street.py <ids|all> <rejilla en m> <triángulos> <carpeta npz/png> <carpeta GLB>
    python3 build_street.py all 0.003 120000 /tmp/street_npz ..
"""
import os, sys, runpy
os.environ['ITEMS'] = 'items5'
here = os.path.dirname(os.path.abspath(__file__))
sys.argv[0] = os.path.join(here, 'build5.py')
runpy.run_path(sys.argv[0], run_name='__main__')
