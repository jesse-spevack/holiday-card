"""The closed photo album on the sofa, drawn by hand in the room's palette.

Usage (from the repo root): python3 art/scripts/book.py [PREVIEW_PNG]
Writes public/assets/book.png. With PREVIEW_PNG, it also writes the room with the book on it, 8x.
"""
import os, sys
from PIL import Image

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# Where the book sits in the room (its top-left pixel). BOOK in public/js/room.js uses the same numbers.
AT = (43, 99)

COLORS = {
    "O": "#1b0804",  # outline
    "S": "#6e2a2a",  # spine
    "C": "#a8403a",  # cover
    "H": "#c45a4c",  # cover light
    "D": "#8a3330",  # cover shade
    "G": "#f5cf6f",  # gold
    "g": "#be8150",  # gold shade
    "P": "#f8f5f1",  # page edges
    "L": "#d0b399",  # page shade
    "Z": "#141b32",  # shadow on the sofa
}
BOOK = [
    ".OOOOOOOOOO.",
    "OSHHHHHHHHCO",
    "OSCCCCCCCCDO",
    "OSCCGGGGCCDO",
    "OSCCgggg CDO".replace(" ", "C"),
    "OSCCCCCCCCDO",
    "OSCCCCCCCCDO",
    "OSDDDDDDDDDO",
    "OOPPPPPPPPPO",
    "ZOLLLLLLGLLO",
    ".ZOOOOOOGOOZ",
    "..ZZZZZZZZZ.",
]


def draw():
    w, h = len(BOOK[0]), len(BOOK)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y, row in enumerate(BOOK):
        assert len(row) == w, row
        for x, c in enumerate(row):
            if c == ".":
                continue
            hexc = COLORS[c]
            img.putpixel((x, y), tuple(int(hexc[i:i + 2], 16) for i in (1, 3, 5)) + (255,))
    return img


if __name__ == "__main__":
    book = draw()
    book.save(f"{REPO}/public/assets/book.png")
    if len(sys.argv) > 1:
        room = Image.open(f"{REPO}/public/assets/room.png").convert("RGBA")
        room.alpha_composite(book, AT)
        room.crop((20, 70, 84, 134)).resize((512, 512), Image.NEAREST).save(sys.argv[1])
