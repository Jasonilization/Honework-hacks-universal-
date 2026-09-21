#!/usr/bin/env python3
"""Generate extension icons (16/32/48/128) with Pillow. No network, no deps beyond Pillow."""
from PIL import Image, ImageDraw

BG = (61, 88, 220, 255)      # indigo
BG_ALT = (52, 78, 205, 255)  # bottom shade for subtle depth
FG = (255, 255, 255, 255)    # radical glyph

def rounded_bg(size):
    s = 512
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = 110
    d.rounded_rectangle([8, 8, s - 8, s - 8], radius=r, fill=BG)
    # subtle vertical shading (two flat tones, not a gradient gadget)
    d.rounded_rectangle([8, 256, s - 8, s - 8], radius=r, fill=BG_ALT)
    d.rounded_rectangle([8, 8, s - 8, 276], radius=r, fill=BG)
    return img

def draw_radical(img):
    s = img.size[0]
    scale = s / 512.0
    d = ImageDraw.Draw(img)
    w = max(6, int(46 * scale))
    pts = [(0.30, 0.58), (0.44, 0.80), (0.72, 0.22)]
    a = [(int(x * s), int(y * s)) for x, y in pts]
    d.line(a, fill=FG, width=w, joint="curve")
    # vinculum
    x2 = int(0.72 * s)
    y = int(0.22 * s)
    d.line([(x2, y), (int(0.90 * s), y)], fill=FG, width=w)
    return img

def main():
    import os
    out_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out_dir, exist_ok=True)
    for size in (16, 32, 48, 128):
        big = rounded_bg(512)
        draw_radical(big)
        img = big.resize((size, size), Image.LANCZOS)
        path = os.path.join(out_dir, f"icon{size}.png")
        img.save(path)
        print("wrote", path)

if __name__ == "__main__":
    main()
