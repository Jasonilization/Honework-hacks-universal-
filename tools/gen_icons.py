#!/usr/bin/env python3
"""Generate Sparxer extension icons (16/32/48/128) with Pillow. No network, no extra deps.

Mark: an amber four-point spark on a deep navy rounded square —
echoes the Sparx Maths look without copying their logo."""
from PIL import Image, ImageDraw

BG = (18, 34, 66, 255)       # deep navy top
BG_ALT = (13, 26, 52, 255)   # navy bottom (flat two-tone, not a gradient)
FG = (255, 199, 44, 255)     # amber spark

def rounded_bg(size):
    s = 512
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = 110
    d.rounded_rectangle([8, 8, s - 8, s - 8], radius=r, fill=BG)
    d.rounded_rectangle([8, 256, s - 8, s - 8], radius=r, fill=BG_ALT)
    d.rounded_rectangle([8, 8, s - 8, 276], radius=r, fill=BG)
    return img

def draw_spark(img):
    """Four-point star: outer tips at r=170, valleys at 45deg r=74."""
    s = img.size[0]
    c = s / 2.0
    tip, valley = 0.332 * s, 0.1445 * s
    pts = []
    for i in range(4):
        tip_angle = i * 90
        v_angle = i * 90 + 45
        import math
        pts.append((c + tip * math.cos(math.radians(tip_angle - 90)),
                    c + tip * math.sin(math.radians(tip_angle - 90))))
        pts.append((c + valley * math.cos(math.radians(v_angle - 90)),
                    c + valley * math.sin(math.radians(v_angle - 90))))
    d = ImageDraw.Draw(img)
    d.polygon(pts, fill=FG)
    # two small "flying" sparks for character (vanish gracefully at 16px)
    r1, r2 = 0.031 * s, 0.0175 * s
    d.ellipse([0.776 * s - r1, 0.188 * s - r1, 0.776 * s + r1, 0.188 * s + r1], fill=FG)
    d.ellipse([0.852 * s - r2, 0.30 * s - r2, 0.852 * s + r2, 0.30 * s + r2], fill=FG)
    return img

def main():
    import os
    out_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out_dir, exist_ok=True)
    for size in (16, 32, 48, 128):
        big = rounded_bg(512)
        draw_spark(big)
        img = big.resize((size, size), Image.LANCZOS)
        path = os.path.join(out_dir, f"icon{size}.png")
        img.save(path)
        print("wrote", path)

if __name__ == "__main__":
    main()
