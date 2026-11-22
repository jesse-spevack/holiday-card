"""The link preview image (public/assets/og.png): the party scene with the hosts and four guests.

Usage (from the repo root): python3 art/scripts/og.py
"""
import os
from PIL import Image, ImageDraw

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
A = f"{REPO}/public/assets"
# feet positions (x center, y feet) in room pixels
CAST = {
    "hosts/jessica": (172, 132), "hosts/jesse": (187, 130), "hosts/daughter": (98, 160), "hosts/son": (114, 162),
    "looks/adult-11": (112, 112), "looks/adult-12": (130, 110), "looks/kid-07": (120, 124), "looks/dog-06": (146, 124),
}
# 240 x 126 room pixels at 5x is exactly 1200 x 630, so every pixel stays square and even.
CROP, SCALE = (8, 39, 248, 165), 5

room = Image.open(f"{A}/room.png").convert("RGBA")
shadows = Image.new("RGBA", room.size, (0, 0, 0, 0)); draw = ImageDraw.Draw(shadows)
cast = sorted(((Image.open(f"{A}/{name}.png").convert("RGBA"), xy) for name, xy in CAST.items()), key=lambda c: c[1][1])
for im, (cx, fy) in cast:
    draw.ellipse((cx - im.width // 2 + 2, fy - 2, cx + im.width // 2 - 2, fy + 2), fill=(50, 25, 10, 95))
room.alpha_composite(shadows)
for im, (cx, fy) in cast:
    room.alpha_composite(im, (cx - im.width // 2, fy - im.height))
crop = room.crop(CROP)
crop.resize((crop.width * SCALE, crop.height * SCALE), Image.NEAREST).convert("RGB").save(f"{A}/og.png")
print("wrote og.png")
