"""Guest look library (style B, same method as characters.py).

Usage:
  python3 looks.py gen RAW_DIR [id ...]     # one PixelLab generation per look -> RAW_DIR/<id>/<i>.png (+ _sheet.png)
  python3 looks.py build WORK_DIR           # WORK_DIR holds the batch dirs named in PICKS ("raw", "raw2");
                                            # cleans each picked variation, writes site/assets/looks/*.png,
                                            # site/assets/looks.json and art/assets/looks-sheet.png
The style image is the OLD cabin room (commit 16e0ec2), cropped like characters.py.
Auth: the HTTPS proxy injects the PixelLab key ("Bearer proxy-injected").
"""
import base64, io, json, os, shutil, subprocess, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw

REPO = "/home/user/holiday-card"
OUT = f"{REPO}/site/assets/looks"
PL = "https://api.pixellab.ai/v2"; PH = {"Authorization": "Bearer proxy-injected"}

STYLE = ("Big head, about two heads tall, large friendly expressive eyes, soft warm shading, lit by golden firelight, "
         "dark brown outline, standing relaxed, facing the viewer")
PET = "sitting, big friendly eyes, soft warm shading, lit by golden firelight, dark brown outline, facing the viewer"
V = "cute cozy RPG villager sprite of "
P = "cute cozy RPG pet sprite of "
SIZE = {"adult": 48, "kid": 40, "baby": 26, "dog": 24, "cat": 24}  # baby 32 gave ~30px toddlers (kid height)
# Looks whose figure came out short at the default frame.
FRAME = {"adult-02": 52, "adult-06": 52}

# id, type, prompt subject, short description, seed
LOOKS = [
 ("adult-01", "adult", "a smiling woman with brown skin and long black box braids, mustard yellow knit sweater, dark jeans, brown boots", "woman, box braids, mustard sweater", 7),
 ("adult-02", "adult", "a smiling man with light skin, short blond hair and a neat blond beard, forest green zip fleece jacket, gray pants", "man, blond beard, green fleece", 7),
 ("adult-03", "adult", "a smiling woman with medium brown skin wearing a lavender hijab, long cream wool coat, dark pants", "woman, lavender hijab, cream coat", 7),
 ("adult-04", "adult", "a smiling man with dark brown skin, short black curly hair, rectangular glasses, navy cable knit sweater, khaki pants", "man, glasses, navy sweater", 7),
 ("adult-05", "adult", "a smiling East Asian woman with a short black bob haircut, oversized teal cardigan over a white shirt, black pants", "woman, black bob, teal cardigan", 7),
 ("adult-06", "adult", "a smiling man with tan skin, black hair in a short ponytail, maroon hoodie, dark jeans", "man, ponytail, maroon hoodie", 7),
 ("adult-07", "adult", "a smiling older woman with light skin and short curly white hair, round glasses, lilac cardigan, gray skirt, holding a small mug", "older woman, white curls, lilac cardigan", 7),
 ("adult-08", "adult", "a smiling older man with brown skin, short gray hair and a gray mustache, brown tweed vest over a light blue shirt, dark pants", "older man, gray hair, tweed vest", 7),
 ("adult-09", "adult", "a smiling woman with freckled pale skin and long straight ginger hair, sage green turtleneck sweater, brown corduroy pants", "woman, ginger hair, sage turtleneck", 7),
 ("adult-10", "adult", "a smiling woman with dark skin and a big round natural afro, burnt orange puffer jacket, black pants", "woman, afro, orange puffer", 7),
 ("kid-01", "kid", "a happy girl about eight years old with brown skin and two puffy pigtails, purple winter coat, gray leggings", "girl, pigtails, purple coat", 7),
 ("kid-02", "kid", "a happy boy about nine years old with light skin, red hair and glasses, striped blue and white sweater, jeans", "boy, red hair, glasses", 7),
 ("kid-03", "kid", "a happy boy about seven years old with dark brown skin and a short buzz cut, green puffer vest over an orange long sleeve shirt, blue pants", "boy, buzz cut, green vest", 7),
 ("kid-04", "kid", "a happy girl about ten years old with tan skin and a long black braid, light blue knit beanie, cream sweater, dark pants", "girl, braid, blue beanie", 7),
 ("kid-05", "kid", "a happy girl about six years old with light skin and blond curly hair, pink fuzzy coat, white boots", "girl, blond curls, pink coat", 7),
 ("kid-06", "kid", "a happy East Asian boy about eight years old with straight black hair and bangs, mustard yellow hoodie, brown pants", "boy, black bangs, yellow hoodie", 7),
 ("baby-01", "baby", "a happy toddler with light skin and a tuft of brown hair, standing, wearing a fuzzy light blue onesie", "toddler, blue onesie", 7),
 ("baby-02", "baby", "a happy toddler girl with brown skin and a tiny top knot, standing, wearing a yellow knit romper", "toddler, top knot, yellow romper", 7),
 ("baby-03", "baby", "a happy toddler with tan skin and black hair, standing, wearing a blue knit hat with a pompom and a gray snowsuit", "toddler, pompom hat, snowsuit", 7),  # the picked sprite was red; its hat was recolored to blue by hand to avoid a Santa look
 ("dog-01", "dog", "a golden retriever dog", "golden retriever", 7),
 ("dog-02", "dog", "a black and white border collie dog", "border collie", 7),
 ("dog-03", "dog", "a small brown dachshund dog with a green knit sweater", "dachshund in sweater", 7),
 ("dog-04", "dog", "a fluffy white bichon dog", "white bichon", 7),
 ("dog-05", "dog", "a chocolate brown labrador dog with a red collar", "chocolate lab", 7),
 ("cat-01", "cat", "an orange tabby cat", "orange tabby cat", 7),
 ("cat-02", "cat", "a black cat with yellow eyes", "black cat", 7),
 ("cat-03", "cat", "a gray and white fluffy cat", "gray and white cat", 7),
]

# Existing approved guest figures, copied in as extra looks.
EXTRA = [
 ("guest-mom.png", "adult", "woman, auburn curls, blue sweater"),
 ("guest-dad.png", "adult", "man, beard, glasses, red sweater"),
 ("guest-kid.png", "kid", "child, dark bob, yellow jacket"),
 ("guest-dog.png", "dog", "corgi with blue scarf"),
]

# Chosen variation per look: (batch dir under WORK_DIR, index). "raw" = first run at the default
# frames; "raw2" = rerun of adult-02/adult-06 at 52 and babies at 26 (first run was too short/too tall).
PICKS = {
 "adult-01": ("raw", 0), "adult-02": ("raw2", 0), "adult-03": ("raw", 16), "adult-04": ("raw", 0),
 "adult-05": ("raw", 5), "adult-06": ("raw2", 5), "adult-07": ("raw", 6), "adult-08": ("raw", 7),
 "adult-09": ("raw", 0), "adult-10": ("raw", 0),
 "kid-01": ("raw", 23), "kid-02": ("raw", 18), "kid-03": ("raw", 9), "kid-04": ("raw", 14),
 "kid-05": ("raw", 12), "kid-06": ("raw", 3),
 "baby-01": ("raw2", 17), "baby-02": ("raw2", 16), "baby-03": ("raw2", 24),
 "dog-01": ("raw", 1), "dog-02": ("raw", 22), "dog-03": ("raw", 11), "dog-04": ("raw", 0), "dog-05": ("raw", 18),
 "cat-01": ("raw", 12), "cat-02": ("raw", 20), "cat-03": ("raw", 11),
}


def ref_image():
    raw = subprocess.run(["git", "-C", REPO, "show", "16e0ec2:art/assets/rooms/cabin.png"], capture_output=True, check=True).stdout
    room = Image.open(io.BytesIO(raw)).convert("RGB")
    buf = io.BytesIO(); room.crop((40, 60, 208, 192)).resize((168, 132)).save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def req(url, body=None):
    r = urllib.request.Request(url, json.dumps(body).encode() if body is not None else None, {"Content-Type": "application/json", **PH})
    with urllib.request.urlopen(r, timeout=300) as f: return json.load(f)


def prompt(kind, subject):
    return f"{P}{subject}, {PET}" if kind in ("dog", "cat") else f"{V}{subject}. {STYLE}"


def gen(raw, ids):
    REF = ref_image()
    def go(look):
        lid, kind, subject, _, seed = look
        s = FRAME.get(lid, SIZE[kind])
        r = req(f"{PL}/generate-image-v2", {"description": prompt(kind, subject), "image_size": {"width": s, "height": s},
            "seed": seed, "no_background": True, "style_image": {"image": {"type": "base64", "base64": REF}, "size": {"width": 168, "height": 132}}})
        while True:
            j = req(f"{PL}/background-jobs/{r['background_job_id']}")
            if j["status"] == "completed": break
            if j["status"] == "failed": raise RuntimeError(json.dumps(j)[:300])
            time.sleep(4)
        d = f"{raw}/{lid}"; os.makedirs(d, exist_ok=True)
        imgs = j["last_response"]["images"]
        for i, im in enumerate(imgs): open(f"{d}/{i}.png", "wb").write(base64.b64decode(im["base64"]))
        preview(d, len(imgs))
        return lid, len(imgs)
    todo = [l for l in LOOKS if not ids or l[0] in ids]
    with ThreadPoolExecutor(6) as ex:
        for f in [ex.submit(go, l) for l in todo]:
            try: print(*f.result(), flush=True)
            except Exception as e: print("ERROR", e, getattr(e, "read", lambda: b"")()[:300], flush=True)


def clean(im):
    """Keep only the largest 8-connected opaque blob, crop to its bounding box."""
    im = im.convert("RGBA"); w, h = im.size; a = im.getchannel("A").load()
    seen = set(); best = []
    for y in range(h):
        for x in range(w):
            if a[x, y] < 128 or (x, y) in seen: continue
            blob = []; stack = [(x, y)]; seen.add((x, y))
            while stack:
                cx, cy = stack.pop(); blob.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and a[nx, ny] >= 128:
                            seen.add((nx, ny)); stack.append((nx, ny))
            if len(blob) > len(best): best = blob
    keep = set(best); out = Image.new("RGBA", im.size); src = im.load(); dst = out.load()
    for x, y in keep:
        r, g, b, _ = src[x, y]; dst[x, y] = (r, g, b, 255)
    return out.crop(out.getbbox())


def preview(d, n, scale=4):
    """Contact sheet of all variations of one look, with cleaned heights."""
    cell = 52 * scale; cols = 5; rows = (n + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell, rows * cell), (217, 160, 102, 255)); dr = ImageDraw.Draw(sheet)
    for i in range(n):
        c = clean(Image.open(f"{d}/{i}.png")); big = c.resize((c.width * scale, c.height * scale), Image.NEAREST)
        x, y = (i % cols) * cell, (i // cols) * cell
        sheet.alpha_composite(big, (x + 4, y + 14)); dr.text((x + 2, y + 1), f"{i} {c.width}x{c.height}", fill=(40, 20, 10, 255))
    sheet.save(f"{d}/_sheet.png")


def build(work):
    if os.path.isdir(OUT): shutil.rmtree(OUT)
    os.makedirs(OUT)
    man = {k: [] for k in SIZE}
    for lid, kind, _, desc, _ in LOOKS:
        if lid not in PICKS: print("no pick for", lid); continue
        b, i = PICKS[lid]; c = clean(Image.open(f"{work}/{b}/{lid}/{i}.png")); c.save(f"{OUT}/{lid}.png")
        man[kind].append({"id": lid, "src": f"assets/looks/{lid}.png", "w": c.width, "h": c.height, "desc": desc})
    for fn, kind, desc in EXTRA:
        lid = f"{kind}-{len(man[kind]) + 1:02d}"
        c = Image.open(f"{REPO}/art/assets/characters/{fn}").convert("RGBA"); c = c.crop(c.getbbox()); c.save(f"{OUT}/{lid}.png")
        man[kind].append({"id": lid, "src": f"assets/looks/{lid}.png", "w": c.width, "h": c.height, "desc": desc})
    json.dump(man, open(f"{REPO}/site/assets/looks.json", "w"), indent=1)
    # review sheet: one row per type, 3x, on the room floor color
    S = 3; rows = []
    for kind, items in man.items():
        ims = [(e["id"], Image.open(f"{REPO}/site/{e['src']}")) for e in items]
        rows.append(ims)
    H = max(im.height for r in rows for _, im in r) + 2; cw = 34 * S; ch = H * S + 14; W = max(len(r) for r in rows) * cw + 8
    sheet = Image.new("RGBA", (W, len(rows) * ch + 8), (217, 160, 102, 255)); dr = ImageDraw.Draw(sheet)
    for ri, r in enumerate(rows):
        for ci, (lid, im) in enumerate(r):
            big = im.resize((im.width * S, im.height * S), Image.NEAREST)
            x = 4 + ci * cw + (cw - big.width) // 2; y = 4 + ri * ch + H * S - big.height
            sheet.alpha_composite(big, (x, y)); dr.text((4 + ci * cw + 4, 4 + ri * ch + H * S + 1), lid, fill=(50, 25, 10, 255))
    sheet.save(f"{REPO}/art/assets/looks-sheet.png")
    print("wrote", sum(len(v) for v in man.values()), "looks")


if __name__ == "__main__":
    cmd = sys.argv[1]; raw = sys.argv[2]
    if cmd == "gen": gen(raw, sys.argv[3:])
    elif cmd == "build": build(raw)
