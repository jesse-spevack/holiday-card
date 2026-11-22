"""Small props for the living room (the presents and the dreidel), in the room's own style.

Usage (from the repo root; the key comes from PIXELLAB_KEY or 1Password, see pixellab.py):
  python3 art/scripts/props.py RAW_DIR [ID ...]
Writes RAW_DIR/<id>/<i>.png and a _sheet.png to pick from. The picked prop goes into public/assets/room.png by hand.
"""
import os, sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(__file__))
import pixellab  # noqa: E402

ROOM_LOOK = "cozy pixel art prop, top-down three quarter view, soft warm shading, dark brown outline, matching a warm living room"
# id, frame size, prompt
PROPS = [
    ("presents", 40, f"a small pile of three wrapped holiday gift boxes with ribbons and bows, navy blue, white and gold wrapping paper, {ROOM_LOOK}"),
    ("dreidel", 16, f"a single small wooden dreidel spinning top standing upright, {ROOM_LOOK}"),
]


def gen(raw, ids):
    style = pixellab.style_image(pixellab.ROOM, pixellab.ROOM_CROP)

    def one(prop):
        pid, size, description = prop
        pixellab.save_variations(f"{raw}/{pid}", pixellab.generate(description, size, style))
        return pid

    with ThreadPoolExecutor(2) as ex:
        for f in [ex.submit(one, p) for p in PROPS if not ids or p[0] in ids]:
            print(f.result(), flush=True)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    gen(sys.argv[1], sys.argv[2:])
