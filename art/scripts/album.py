"""Uploads the hidden photo album to Cloudflare Workers KV.

The photos and the captions never go in git: the repo is public, and the originals hold GPS data.
This script reads them from outside the repo, makes small web copies with no metadata, and uploads
the copies plus the page list to the ALBUM namespace. The Worker serves them at /album/.

Usage (from the repo root): python3 art/scripts/album.py [--local] [--dry-run]
  --local    upload to the local dev KV (wrangler dev), not to Cloudflare
  --dry-run  make the web copies and the list, but do not upload

Inputs:
  ~/Pictures/holiday-card-album/originals/   the photos (JPEG), never changed
  ~/Pictures/holiday-card-album/captions.json  {"<file>": "<caption>"} or {"<file>": {"caption": "...", "date": "2026-06-28"}}
A "date" in captions.json is for a photo with no EXIF date. The pages go in date order, then in filename order.
"""
import base64, hashlib, io, json, os, subprocess, sys, tempfile
from datetime import datetime
from PIL import Image, ImageCms, ImageOps

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
HOME = os.path.expanduser("~/Pictures/holiday-card-album")
ORIGINALS = f"{HOME}/originals"
CAPTIONS = f"{HOME}/captions.json"
WEB = f"{HOME}/web"
LONG_EDGE = 1400
QUALITY = 82
EXIF_DATE = 36867  # DateTimeOriginal
EXIF_IFD = 0x8769
# JPEG segments that can carry metadata: APP1 (EXIF, XMP), APP2 (ICC), APP13 (IPTC), COM.
META_MARKERS = {0xE1, 0xE2, 0xED, 0xFE}


def photo_date(img, extra):
    raw = img.getexif().get_ifd(EXIF_IFD).get(EXIF_DATE) or img.getexif().get(306)
    if raw:
        return datetime.strptime(raw.strip("\x00 "), "%Y:%m:%d %H:%M:%S")
    if extra:
        return datetime.fromisoformat(extra)
    return None


def to_srgb(img):
    profile = img.info.get("icc_profile")
    img = img.convert("RGB")
    if not profile:
        return img
    try:
        src = ImageCms.ImageCmsProfile(io.BytesIO(profile))
        return ImageCms.profileToProfile(img, src, ImageCms.createProfile("sRGB"), outputMode="RGB")
    except ImageCms.PyCMSError:
        return img


def web_copy(path):
    with Image.open(path) as img:
        img.seek(0)  # a multi-picture JPEG (MPO) keeps the main photo first
        img = ImageOps.exif_transpose(img)
        img = to_srgb(img)
    img.thumbnail((LONG_EDGE, LONG_EDGE), Image.LANCZOS)
    buf = io.BytesIO()
    # No exif, icc_profile, or comment arguments: Pillow then writes no metadata at all.
    img.save(buf, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    data = buf.getvalue()
    check_clean(data, path)
    return data, img.size


def check_clean(data, name):
    """Walk the JPEG segments up to the image data and fail on any metadata segment."""
    i = 2
    assert data[:2] == b"\xff\xd8", name
    while i < len(data):
        assert data[i] == 0xFF, f"{name}: bad segment at {i}"
        marker = data[i + 1]
        if marker == 0xDA:  # start of scan: only image data follows
            return
        if marker in META_MARKERS:
            raise SystemExit(f"{name}: the web copy still has metadata (marker {marker:#x})")
        i += 2 + int.from_bytes(data[i + 2:i + 4], "big")


def build():
    captions = json.load(open(CAPTIONS))
    files = sorted(f for f in os.listdir(ORIGINALS) if f.lower().endswith((".jpg", ".jpeg")))
    missing = [f for f in files if f not in captions]
    if missing:
        raise SystemExit(f"no caption in {CAPTIONS} for: {', '.join(missing)}")
    os.makedirs(WEB, exist_ok=True)
    pages = []
    for f in files:
        entry = captions[f] if isinstance(captions[f], dict) else {"caption": captions[f]}
        with Image.open(f"{ORIGINALS}/{f}") as img:
            date = photo_date(img, entry.get("date"))
        data, (w, h) = web_copy(f"{ORIGINALS}/{f}")
        name = hashlib.sha256(data).hexdigest()[:16] + ".jpg"
        open(f"{WEB}/{name}", "wb").write(data)
        pages.append({"file": name, "caption": entry["caption"], "w": w, "h": h, "date": date, "original": f, "data": data})
        print(f"{f} -> {name} {w}x{h} {len(data) // 1024} KB {date or 'no date'}", flush=True)
    # Dated photos in date order. A photo with no date keeps its place in filename order at the end.
    pages.sort(key=lambda p: (p["date"] is None, p["date"] or datetime.min, p["original"].lower()))
    return pages


def wrangler(*args, local=False):
    cmd = ["npx", "wrangler", "kv", *args, "--binding", "ALBUM", "--local" if local else "--remote"]
    return subprocess.run(cmd, cwd=REPO, check=True, capture_output=True, text=True).stdout


def upload(pages, local):
    listing = {"photos": [{"src": f"/album/{p['file']}", "caption": p["caption"], "w": p["w"], "h": p["h"]} for p in pages]}
    entries = [{"key": f"photo:{p['file']}", "value": base64.b64encode(p["data"]).decode(), "base64": True} for p in pages]
    # The list goes last, so it never points at a photo that is not there yet.
    with tempfile.TemporaryDirectory() as tmp:
        photos = f"{tmp}/photos.json"
        json.dump(entries, open(photos, "w"))
        wrangler("bulk", "put", photos, local=local)
        listed = f"{tmp}/list.json"
        json.dump([{"key": "list", "value": json.dumps(listing)}], open(listed, "w"))
        wrangler("bulk", "put", listed, local=local)
        # Remove the photos that the list no longer uses.
        keep = {e["key"] for e in entries}
        old = [k["name"] for k in json.loads(wrangler("key", "list", "--prefix", "photo:", local=local)) if k["name"] not in keep]
        if old:
            stale = f"{tmp}/stale.json"
            json.dump(old, open(stale, "w"))
            wrangler("bulk", "delete", stale, "--force", local=local)
    print(f"uploaded {len(pages)} photos, removed {len(old)} old ones", flush=True)


if __name__ == "__main__":
    pages = build()
    for i, p in enumerate(pages, 1):
        print(f"{i:2}. {p['caption']}")
    if "--dry-run" not in sys.argv:
        upload(pages, local="--local" in sys.argv)
