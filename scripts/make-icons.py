"""Draws the atom logo into the Android launcher icons and splash screens.

Run from the repo root after `npx cap add android`:  python3 scripts/make-icons.py
Needs Pillow (pip install pillow).
"""
import math
import os
from PIL import Image, ImageDraw

RES = 'android/app/src/main/res'
INK = (58, 58, 58, 255)
PAPER = (242, 242, 241, 255)
ACCENT = (143, 179, 204, 255)
SS = 4  # supersampling factor for smooth edges


def atom(draw, cx, cy, size, stroke, nucleus):
    """Three orbits rotated 0/60/120 degrees and a nucleus, fitting a box of `size`."""
    rx, ry = size * 0.5, size * 0.21
    width = max(1, round(size * 0.055))
    for rot in (0, 60, 120):
        a = math.radians(rot)
        pts = []
        for i in range(186):  # overlap the start so the seam is hidden
            t = 2 * math.pi * i / 180
            x, y = rx * math.cos(t), ry * math.sin(t)
            pts.append((cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a)))
        draw.line(pts, fill=stroke, width=width, joint='curve')
    r = size * 0.12
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=nucleus)


def render(w, h, bg, logo_frac, stroke, nucleus, shape=None):
    img = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if shape == 'round':
        d.ellipse((0, 0, w * SS - 1, h * SS - 1), fill=bg)
    elif shape == 'square':
        d.rounded_rectangle((0, 0, w * SS - 1, h * SS - 1), radius=w * SS * 0.18, fill=bg)
    elif bg:
        d.rectangle((0, 0, w * SS, h * SS), fill=bg)
    atom(d, w * SS / 2, h * SS / 2, min(w, h) * SS * logo_frac, stroke, nucleus)
    return img.resize((w, h), Image.LANCZOS)


DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

for name, k in DENSITIES.items():
    folder = f'{RES}/mipmap-{name}'
    legacy = round(48 * k)
    render(legacy, legacy, INK, 0.62, PAPER, ACCENT, 'square').save(f'{folder}/ic_launcher.png')
    render(legacy, legacy, INK, 0.58, PAPER, ACCENT, 'round').save(f'{folder}/ic_launcher_round.png')
    # Adaptive foreground: 108dp canvas, logo inside the 66dp safe zone.
    fg = round(108 * k)
    render(fg, fg, None, 0.5, PAPER, ACCENT).save(f'{folder}/ic_launcher_foreground.png')

for root, _, files in os.walk(RES):
    if 'splash.png' in files:
        path = os.path.join(root, 'splash.png')
        w, h = Image.open(path).size
        render(w, h, PAPER, 0.28, INK, (74, 111, 138, 255)).save(path)

print('icons and splash screens written')
