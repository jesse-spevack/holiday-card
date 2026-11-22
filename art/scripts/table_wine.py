"""Red wine on the dining table, drawn by hand pixel by pixel.

Usage (from the repo root): python3 art/scripts/table_wine.py [A|B|C]
  A: a bottle and two tall glasses, seen from the side
  B: a bottle and two glasses, seen from slightly above
  C: a bottle and a cheese board
Paints public/assets/room.png and copies it to art/assets/rooms/living-room.png.
Each prop sits on bare table top, so a second run gives the same image.
"""
import os
import shutil
import sys
from PIL import Image

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ROOM = f"{REPO}/public/assets/room.png"
ROOM_ART = f"{REPO}/art/assets/rooms/living-room.png"
TABLE = (160, 118, 88)

# The room palette, plus three wine reds. "." is clear.
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

# A: a tulip glass from the side. Clear glass on top, wine below.
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

# B: a glass from slightly above. The rim ellipse shows the wine surface.
TOP_GLASS = [
    ".xix..",
    "xWWRx.",
    "oRRro.",
    ".oro..",
    "..x...",
    "..x...",
    ".xxxs.",
    "..sss.",
]

# C: a small slate board with crackers, a cheese wedge, and grapes.
CHEESE_BOARD = [
    ".oooooooooo..",
    "okLLkkYkkWRo.",
    "okLLkYYykRro.",
    "okkkYYYyykko.",
    "oEEEEEEEEEEos",
    ".ooooooooooss",
    "..sssssssssss",
]

# (sprite, left x, top y) in room pixels
OPTIONS = {
    "A": [(BOTTLE, 238, 109), (SIDE_GLASS, 228, 112), (SIDE_GLASS, 233, 113)],
    "B": [(BOTTLE, 238, 109), (TOP_GLASS, 226, 113), (TOP_GLASS, 232, 114)],
    "C": [(BOTTLE, 238, 109), (CHEESE_BOARD, 224, 113)],
}
SHIPPED = "A"


def paint(room, sprite, x0, y0):
    """Draw a sprite on bare table top; fail if anything else is under it. "." stays as it is."""
    box = [(x0 + dx, y0 + dy, INK[ch]) for dy, row in enumerate(sprite) for dx, ch in enumerate(row) if ch != "."]
    for x, y, ink in box:
        here = room.getpixel((x, y))[:3]
        if here not in (TABLE, ink):
            raise SystemExit(f"({x}, {y}) is not bare table top: {here}")
    for x, y, ink in box:
        room.putpixel((x, y), (*ink, 255))


def paint_option(room, name):
    for sprite, x0, y0 in OPTIONS[name]:
        paint(room, sprite, x0, y0)
    return room


if __name__ == "__main__":
    room = paint_option(Image.open(ROOM).convert("RGBA"), sys.argv[1] if len(sys.argv) > 1 else SHIPPED)
    room.save(ROOM)
    shutil.copyfile(ROOM, ROOM_ART)
    print("wrote room.png and living-room.png")
