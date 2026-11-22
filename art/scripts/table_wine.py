"""Red wine on the dining table, drawn by hand pixel by pixel.

Usage (from the repo root): python3 art/scripts/table_wine.py
Paints a bottle and two tall glasses, seen from the side, on public/assets/room.png.
Each prop sits on bare table top, so a second run gives the same image.
Run art/scripts/og.py after a change, so the link preview shows it.
"""
import os
from PIL import Image

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ROOM = f"{REPO}/public/assets/room.png"
TABLE = (160, 118, 88)

# The room palette, plus three wine reds. "." is clear.
# A bake-off also tried glasses seen from above and a cheese board. Git history has them (commit 166a89c).
INK = {
    "o": (9, 1, 0),        # outline
    "O": (27, 8, 4),       # soft outline
    "s": (139, 102, 79),   # shadow on the table top
    "g": (22, 54, 26),     # bottle glass, dark
    "G": (32, 63, 39),     # bottle glass
    "H": (70, 108, 69),    # bottle glass, lit from the left
    "L": (237, 215, 182),  # label, cracker
    "l": (212, 194, 176),  # label, shade side
    "r": (74, 16, 28),     # wine, dark
    "R": (122, 26, 40),    # wine
    "W": (168, 52, 58),    # wine, lit
    "x": (184, 192, 198),  # clear glass edge
    "c": (196, 147, 107),  # table seen through clear glass
    "i": (248, 245, 241),  # glass glint
    "k": (82, 81, 79),     # slate board
    "E": (44, 34, 33),     # slate board, front edge
    "Y": (245, 207, 111),  # cheese
    "y": (190, 129, 80),   # cheese, shade side
}

BOTTLE = [
    ".ooo..",
    ".oRo..",
    ".oro..",
    ".oHo..",
    "oHGgo.",
    "oHGgo.",
    "oLLlo.",
    "oLLlo.",
    "oHGgo.",
    "oHGgo.",
    ".ooos.",
    "..sss.",
]

# A tulip glass from the side. Clear glass on top, wine below.
SIDE_GLASS = [
    "xccx.",
    "xicx.",
    "oWRo.",
    "oRro.",
    ".oo..",
    ".x...",
    ".x...",
    "xxxs.",
    ".sss.",
]

# (sprite, left x, top y) in room pixels
PROPS = [(BOTTLE, 238, 109), (SIDE_GLASS, 228, 112), (SIDE_GLASS, 233, 113)]


def paint(room, sprite, x0, y0):
    """Draw a sprite on bare table top; fail if anything else is under it. "." stays as it is."""
    box = [(x0 + dx, y0 + dy, INK[ch]) for dy, row in enumerate(sprite) for dx, ch in enumerate(row) if ch != "."]
    for x, y, ink in box:
        here = room.getpixel((x, y))[:3]
        if here not in (TABLE, ink):
            raise SystemExit(f"({x}, {y}) is not bare table top: {here}")
    for x, y, ink in box:
        room.putpixel((x, y), (*ink, 255))


if __name__ == "__main__":
    room = Image.open(ROOM).convert("RGBA")
    for sprite, x0, y0 in PROPS:
        paint(room, sprite, x0, y0)
    room.save(ROOM)
    print("wrote room.png")
