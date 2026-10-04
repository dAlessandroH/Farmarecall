#!/usr/bin/env python3
"""Genera los iconos de FarmaRecall (PNG + SVG) solo con la biblioteca estándar de Python.

Uso:  python3 scripts/generate_icons.py

Diseño: tres pasos de una cadena en vertical; el del centro está vacío
(el paso que hay que recordar). Todo cabe en la zona segura de los iconos
"maskable" (círculo de radio 0.4 en el centro).
"""
import math
import struct
import zlib
from pathlib import Path

ICONS_DIR = Path(__file__).resolve().parent.parent / "icons"

BACKGROUND = (0x0B, 0x6E, 0x79)
INK = (0xFF, 0xFF, 0xFF)

# Geometría en coordenadas normalizadas (0–1).
NODES_Y = (0.22, 0.50, 0.78)
NODE_R = 0.085
RING_W = 0.032
LINK_W = 0.036
CORNER_R = 0.225  # esquinas redondeadas de los iconos "any"


def sd_circle(x, y, cy, r):
    return math.hypot(x - 0.5, y - cy) - r


def sd_ring(x, y, cy, r, width):
    return abs(math.hypot(x - 0.5, y - cy) - (r - width / 2)) - width / 2


def sd_vertical_link(x, y, y0, y1, width):
    nearest = min(max(y, y0), y1)
    return math.hypot(x - 0.5, y - nearest) - width / 2


def sd_rounded_square(x, y, radius):
    qx = abs(x - 0.5) - (0.5 - radius)
    qy = abs(y - 0.5) - (0.5 - radius)
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - radius


def sd_motif(x, y):
    top, mid, bottom = NODES_Y
    return min(
        sd_vertical_link(x, y, top, mid - NODE_R, LINK_W),
        sd_vertical_link(x, y, mid + NODE_R, bottom, LINK_W),
        sd_circle(x, y, top, NODE_R),
        sd_ring(x, y, mid, NODE_R, RING_W),
        sd_circle(x, y, bottom, NODE_R),
    )


def coverage(distance, size):
    """Antialiasing: fracción del píxel cubierta según la distancia al borde."""
    return min(1.0, max(0.0, 0.5 - distance * size))


def render(size, rounded):
    rows = bytearray()
    for py in range(size):
        rows.append(0)  # filtro PNG "None"
        y = (py + 0.5) / size
        for px in range(size):
            x = (px + 0.5) / size
            ink = coverage(sd_motif(x, y), size)
            alpha = coverage(sd_rounded_square(x, y, CORNER_R), size) if rounded else 1.0
            rows += bytes(round(b + (i - b) * ink) for b, i in zip(BACKGROUND, INK))
            rows.append(round(255 * alpha))
    return png(size, size, bytes(rows))


def png(width, height, raw_rgba):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # 8 bits, RGBA
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
            + chunk(b"IDAT", zlib.compress(raw_rgba, 9)) + chunk(b"IEND", b""))


def svg():
    top, mid, bottom = (round(v * 100, 2) for v in NODES_Y)
    r, ring, link = round(NODE_R * 100, 2), round(RING_W * 100, 2), round(LINK_W * 100, 2)
    color = "#%02x%02x%02x" % BACKGROUND
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="{CORNER_R * 100:g}" fill="{color}"/>
  <path d="M50 {top}V{mid - r:g}M50 {mid + r:g}V{bottom}" stroke="#fff" stroke-width="{link}" stroke-linecap="round"/>
  <circle cx="50" cy="{mid}" r="{r - ring / 2:g}" fill="none" stroke="#fff" stroke-width="{ring}"/>
  <circle cx="50" cy="{top}" r="{r}" fill="#fff"/>
  <circle cx="50" cy="{bottom}" r="{r}" fill="#fff"/>
</svg>
"""


def main():
    ICONS_DIR.mkdir(exist_ok=True)
    outputs = {
        "icon-192.png": render(192, rounded=True),
        "icon-512.png": render(512, rounded=True),
        "icon-maskable-512.png": render(512, rounded=False),  # Android recorta la forma
        "apple-touch-icon.png": render(180, rounded=False),   # iOS redondea las esquinas
    }
    for name, data in outputs.items():
        (ICONS_DIR / name).write_bytes(data)
        print(f"icons/{name}")
    (ICONS_DIR / "favicon.svg").write_text(svg(), encoding="utf-8")
    print("icons/favicon.svg")


if __name__ == "__main__":
    main()
