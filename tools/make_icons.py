#!/usr/bin/env python3
"""Erzeugt die App-Icons (180, 192, 512 px) in icons/.

Aufruf (im Projektordner):  python3 tools/make_icons.py
Braucht Pillow:             pip3 install pillow
Farben unten passend zu css/style.css anpassen.
"""
from pathlib import Path
from PIL import Image, ImageDraw

BG = (28, 29, 33)          # --bg (Anthrazit)
ACCENT = (140, 32, 56)     # --accent (Bordeaux)
GLASS = (236, 236, 239)    # --text
SIZES = [180, 192, 512]
SS = 4                     # Supersampling für glatte Kanten

out_dir = Path(__file__).resolve().parent.parent / "icons"
out_dir.mkdir(exist_ok=True)


def draw_icon(size: int) -> Image.Image:
    s = size * SS
    img = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(img)
    u = s / 100  # Koordinaten in Prozent

    # Bordeaux-Kreis als Hintergrundakzent (bleibt auch bei Maskierung im sicheren Bereich)
    d.ellipse([14 * u, 14 * u, 86 * u, 86 * u], fill=ACCENT)

    # Weinglas: Kelch, Stiel, Fuß
    cx = 50 * u
    d.pieslice([33 * u, 20 * u, 67 * u, 62 * u], 0, 180, fill=GLASS)   # Kelch (untere Hälfte)
    d.rectangle([33 * u, 35 * u, 67 * u, 41 * u], fill=GLASS)           # oberer Teil des Kelchs
    d.polygon([(33 * u, 35 * u), (67 * u, 35 * u), (67 * u, 41 * u), (33 * u, 41 * u)], fill=GLASS)
    d.rounded_rectangle([cx - 2 * u, 58 * u, cx + 2 * u, 73 * u], radius=1 * u, fill=GLASS)  # Stiel
    d.rounded_rectangle([38 * u, 72 * u, 62 * u, 76 * u], radius=2 * u, fill=GLASS)          # Fuß

    # "Wein" im Glas
    d.pieslice([36 * u, 30 * u, 64 * u, 62 * u], 0, 180, fill=ACCENT)
    d.rectangle([36 * u, 45 * u, 64 * u, 46 * u], fill=ACCENT)

    return img.resize((size, size), Image.LANCZOS)


for size in SIZES:
    path = out_dir / f"icon-{size}.png"
    draw_icon(size).save(path, optimize=True)
    print("geschrieben:", path)
