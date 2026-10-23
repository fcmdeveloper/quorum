#!/usr/bin/env python3
"""
Íconos alternativos para Android (assets/icons/android/).

Android usa íconos adaptables: el lanzador recorta el centro (72 de 108 dp) y le aplica su
forma (círculo, cuadrado redondeado…). Si se usa el ícono de iOS tal cual, el dibujo queda
pegado a los bordes. Aquí se reduce cada ícono de iOS para que entre completo en esa zona
visible, con el mismo aire que en iPhone.

  python3 scripts/android-icons.py      (requiere Pillow)
"""
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'icons')
NAMES = ['light', 'gallery', 'ember', 'ocean', 'violet', 'solar', 'rose', 'ice',
         'xrp-midnight', 'xrp-aurora', 'xrp-sunset', 'xrp-gold', 'xrp-electric', 'xrp-crimson']
S = 512
INNER = round(S * 72 / 108)

os.makedirs(os.path.join(ROOT, 'android'), exist_ok=True)
for n in NAMES:
    art = Image.open(os.path.join(ROOT, f'{n}.png')).convert('RGBA').resize((INNER, INNER), Image.LANCZOS)
    fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    o = (S - INNER) // 2
    fg.paste(art, (o, o), art)
    fg.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(os.path.join(ROOT, 'android', f'{n}.png'), optimize=True)
    print('ok', n)
