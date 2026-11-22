"""Small props for the living room (presents, dreidel), in the room's own style.

Usage (from the repo root, with PIXELLAB_KEY set): python3 art/scripts/props.py RAW_DIR [id ...]
Writes RAW_DIR/<id>/<i>.png and a _sheet.png to pick from.
"""
import base64, io, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from looks import preview  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PL = "https://api.pixellab.ai/v2"
ROOM_LOOK = "cozy pixel art prop, top-down three quarter view, soft warm shading, dark brown outline, matching a warm living room"
PROPS = [
    ("presents", 40, f"a small pile of three wrapped holiday gift boxes with ribbons and bows, navy blue, white and gold wrapping paper, {ROOM_LOOK}"),
    ("dreidel", 16, f"a single small wooden dreidel spinning top standing upright, {ROOM_LOOK}"),
]


def req(url, body=None):
    r = urllib.request.Request(url, json.dumps(body).encode() if body is not None else None,
                               {"Content-Type": "application/json", "Authorization": f"Bearer {os.environ['PIXELLAB_KEY']}"})
    with urllib.request.urlopen(r, timeout=300) as f: return json.load(f)


def style_image():
    room = Image.open(f"{REPO}/public/assets/room.png").convert("RGB")
    buf = io.BytesIO(); room.crop((88, 0, 256, 132)).save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def gen(raw, ids):
    ref = style_image()
    def go(prop):
        pid, size, description = prop
        r = req(f"{PL}/generate-image-v2", {"description": description, "image_size": {"width": size, "height": size}, "seed": 7,
            "no_background": True, "style_image": {"image": {"type": "base64", "base64": ref}, "size": {"width": 168, "height": 132}}})
        while True:
            j = req(f"{PL}/background-jobs/{r['background_job_id']}")
            if j["status"] == "completed": break
            if j["status"] == "failed": raise RuntimeError(json.dumps(j)[:300])
            time.sleep(4)
        d = f"{raw}/{pid}"; os.makedirs(d, exist_ok=True)
        for i, im in enumerate(j["last_response"]["images"]): open(f"{d}/{i}.png", "wb").write(base64.b64decode(im["base64"]))
        preview(d, len(j["last_response"]["images"]))
        return pid
    with ThreadPoolExecutor(2) as ex:
        for f in [ex.submit(go, p) for p in PROPS if not ids or p[0] in ids]: print(f.result(), flush=True)


if __name__ == "__main__":
    gen(sys.argv[1], sys.argv[2:])
