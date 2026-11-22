"""Two more candles on the menorah, drawn by hand pixel by pixel.

Usage (from the repo root): python3 art/scripts/menorah.py
The menorah on the window sill held six candles and the shamash. A Hanukkah menorah holds eight and the shamash,
so this script paints one more candle at each end of the candle bar on public/assets/room.png.
The candles on the menorah show the night of Hanukkah (public/js/hanukkah.js), so each night needs its own candle.
The script sets exact pixels, so a second run gives the same image.
Run art/scripts/og.py after a change, so the link preview shows it.
"""
import os
from PIL import Image

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ROOM = f"{REPO}/public/assets/room.png"

# The colors of the candles that the room already has. "." keeps the pixel as it is.
INK = {
    "t": (160, 118, 88),   # the warm pixel over a flame
    "F": (254, 240, 159),  # flame. scene.js finds the candles by this color
    "g": (102, 70, 60),    # warm light beside a flame
    "w": (80, 49, 36),     # wick
    "C": (248, 245, 241),  # candle, lit side
    "c": (237, 215, 182),  # candle
    "s": (39, 48, 73),     # dark glass between two candles
    "o": (65, 38, 27),     # candle bar
    "d": (42, 24, 19),     # candle bar, shade side
}

# Each patch is three columns wide, from its left x, and starts at y 41.
# The left candle stands at x 192 and the right candle at x 210, two pixels out from the old end candles.
LEFT = (191, [
    ".t.",
    ".Fg",
    ".w.",
    "oCs",
    "oco",
    "ddd",
])
RIGHT = (209, [
    ".t.",
    "gF.",
    ".w.",
    "sCo",
    "oco",
    "ddd",
])
TOP = 41


def paint(room, x0, rows):
    for dy, row in enumerate(rows):
        for dx, key in enumerate(row):
            if key != ".":
                room.putpixel((x0 + dx, TOP + dy), INK[key] + (255,))


if __name__ == "__main__":
    room = Image.open(ROOM).convert("RGBA")
    for x0, rows in (LEFT, RIGHT):
        paint(room, x0, rows)
    room.save(ROOM)
