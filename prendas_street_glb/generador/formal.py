"""Prendas formales para Blender, sobre el cuerpo de referencia de 1,78 m con los brazos a 32°.

Las tres americanas usan la construcción de abrigos.py (solapas, cruzado, forro, aberturas) con hombros
armados (hombrera y copa de la manga con «roping»), ojal en la solapa, botones de puño que se tocan,
bolsillos con cartera y de pecho, y el largo de americana (cubre el asiento). El chaleco de traje
cruzado está en tops.py (estilo «chaleco_traje», sale como 04 en esta colección).

  01 americana (botonadura sencilla, dos botones)   02 americana cruzada (solapa de pico, 6x2)
  03 chaqueta de traje (bolsillo de cerillas, dos aberturas)   04 chaleco de traje (tops.py)
"""
import abrigos as _a

STYLES = {
    'americana': dict(num=1, file='americana', name='Americana', ease=0.026, drape=0.55, flare=0.012, arm_ease=0.024,
                      arm_drape=0.25, th=0.0062, hem=0.775, L=0.610, at=0.055, front='sb', n_btn=2, zv=1.120, lapel=0.058,
                      collar_w=0.046, structured=True, lapelhole=True, cuffbuttons=True, cuff_du=(0.024, 0.042, 0.060, 0.078),
                      hip_pocket=(0.112, 0.935, 0.150, 0.150, 0.050), pockets=('flaphip', 'chestwelt'), vent=0.22,
                      tejido='lana', color='#1F2A44', forro='#5B1F2B', boton='#B39349', folds=(0.006, 0.006, 0.005)),
    'cruzada': dict(num=2, file='americana_cruzada', name='Americana cruzada', ease=0.030, drape=0.55, flare=0.012,
                    arm_ease=0.024, arm_drape=0.25, th=0.0064, hem=0.765, L=0.610, at=0.055, front='db', zv=1.100,
                    lapel=0.070, peak=True, collar_w=0.050, structured=True, lapelhole=True, cuffbuttons=True,
                    cuff_du=(0.024, 0.042, 0.060, 0.078), hip_pocket=(0.115, 0.930, 0.150, 0.150, 0.050),
                    pockets=('flaphip', 'chestwelt'), sidevents=True, tejido='traje', color='#2E3035', forro='#2B2D3A',
                    boton='#1A1A1C', folds=(0.006, 0.006, 0.005)),
    'traje': dict(num=3, file='chaqueta_traje', name='Chaqueta de traje', ease=0.022, drape=0.5, flare=0.010, arm_ease=0.020,
                  arm_drape=0.2, th=0.0058, hem=0.770, L=0.610, at=0.054, front='sb', n_btn=2, zv=1.115, lapel=0.054,
                  collar_w=0.044, structured=True, lapelhole=True, cuffbuttons=True, cuff_du=(0.024, 0.042, 0.060, 0.078),
                  hip_pocket=(0.112, 0.932, 0.148, 0.150, 0.050), pockets=('flaphip', 'ticket', 'chestwelt'), sidevents=True,
                  tejido='traje', color='#5B5F67', forro='#3D3F4A', boton='#2A2A2C', folds=(0.006, 0.006, 0.005)),
}

_a.STYLES = STYLES
PIEZAS = _a.PIEZAS
UP = _a.UP


def configure(key):
    global ST, KEY, CATALOG
    _a.configure(key)
    ST, KEY, CATALOG = _a.ST, _a.KEY, _a.CATALOG


seam_paths = lambda: _a.seam_paths()
campos = lambda V, N: _a.campos(V, N)
ejes = lambda: _a.ejes()

configure(__import__('os').environ.get('FORMAL_ESTILO', 'americana'))
