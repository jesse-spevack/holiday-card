"""Shared helpers for the PixelLab scripts (looks.py and props.py).

The key comes from the PIXELLAB_KEY environment variable. If it is not set, the scripts read it from
1Password with `op read`, at PIXELLAB_OP_REF (default op://keys/CozyChat/PIXEL_LAB_KEY).
The key stays in memory. No script writes it to a file.
"""
import base64, functools, io, json, os, subprocess, sys, time, urllib.request
from PIL import Image, ImageDraw

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
API = "https://api.pixellab.ai/v2"
SEED = 7
# The style image for figures: a crop of the first cabin room. It gives the warm light and the brown outline.
CABIN = f"{REPO}/art/assets/rooms/cabin.png"
CABIN_CROP = (40, 60, 208, 192)
# The style image for props: a crop of the living room itself.
ROOM = f"{REPO}/public/assets/room.png"
ROOM_CROP = (88, 0, 256, 132)
# Both crops are this size. PixelLab gets the size with the style image.
STYLE_SIZE = (168, 132)
FLOOR = (217, 160, 102, 255)  # the room floor color, behind the review sheets


@functools.cache
def key():
    if os.environ.get("PIXELLAB_KEY"):
        return os.environ["PIXELLAB_KEY"]
    ref = os.environ.get("PIXELLAB_OP_REF", "op://keys/CozyChat/PIXEL_LAB_KEY")
    try:
        return subprocess.run(["op", "read", ref], capture_output=True, check=True, text=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        sys.exit(f"set PIXELLAB_KEY, or save the PixelLab key in 1Password at {ref}")


def request(url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {key()}"}
    with urllib.request.urlopen(urllib.request.Request(url, data, headers), timeout=300) as f:
        return json.load(f)


def style_image(path, crop):
    im = Image.open(path).convert("RGB").crop(crop)
    assert im.size == STYLE_SIZE, im.size
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def generate(description, size, style):
    """One generate-image-v2 call. Returns the variations (usually 25) as PNG bytes."""
    w, h = STYLE_SIZE
    job = request(f"{API}/generate-image-v2", {
        "description": description, "image_size": {"width": size, "height": size}, "seed": SEED,
        "no_background": True, "style_image": {"image": {"type": "base64", "base64": style}, "size": {"width": w, "height": h}},
    })
    while True:
        j = request(f"{API}/background-jobs/{job['background_job_id']}")
        if j["status"] == "completed":
            return [base64.b64decode(im["base64"]) for im in j["last_response"]["images"]]
        if j["status"] == "failed":
            raise RuntimeError(json.dumps(j)[:300])
        time.sleep(4)


def save_variations(folder, images):
    """Writes folder/<i>.png for each variation and a _sheet.png to pick from."""
    os.makedirs(folder, exist_ok=True)
    for i, png in enumerate(images):
        with open(f"{folder}/{i}.png", "wb") as f:
            f.write(png)
    preview(folder, len(images))


def clean(im):
    """Keeps only the largest 8-connected opaque blob, fully opaque, cropped to its bounding box."""
    im = im.convert("RGBA")
    w, h = im.size
    a = im.getchannel("A").load()
    seen, best = set(), []
    for y in range(h):
        for x in range(w):
            if a[x, y] < 128 or (x, y) in seen:
                continue
            blob, stack = [], [(x, y)]
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                blob.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and a[nx, ny] >= 128:
                            seen.add((nx, ny))
                            stack.append((nx, ny))
            if len(blob) > len(best):
                best = blob
    out = Image.new("RGBA", im.size)
    src, dst = im.load(), out.load()
    for x, y in best:
        dst[x, y] = src[x, y][:3] + (255,)
    return out.crop(out.getbbox())


def preview(folder, n, scale=4):
    """A contact sheet of every variation in folder, cleaned, with its index and its size."""
    cell, cols = 52 * scale, 5
    rows = (n + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell, rows * cell), FLOOR)
    draw = ImageDraw.Draw(sheet)
    for i in range(n):
        c = clean(Image.open(f"{folder}/{i}.png"))
        x, y = (i % cols) * cell, (i // cols) * cell
        sheet.alpha_composite(c.resize((c.width * scale, c.height * scale), Image.NEAREST), (x + 4, y + 14))
        draw.text((x + 2, y + 1), f"{i} {c.width}x{c.height}", fill=(40, 20, 10, 255))
    sheet.save(f"{folder}/_sheet.png")
