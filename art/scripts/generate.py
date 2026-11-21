"""Style test 2: bright 16-bit handheld RPG look. Chibi characters on one template (PixelLab),
top-down 3/4 cabin room (Retro Diffusion). Keys are injected by the session proxy."""
import base64, json, sys, time, uuid, urllib.request
from concurrent.futures import ThreadPoolExecutor

OUT = sys.argv[1]
PL = "https://api.pixellab.ai/v2"
PLH = {"Authorization": "Bearer proxy-injected"}
RD = "https://api.retrodiffusion.ai/v2/inferences"

def req(url, body=None, headers=None, raw=False):
    r = urllib.request.Request(url, json.dumps(body).encode() if body is not None else None,
                               {"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(r, timeout=300) as f:
        return f.read() if raw else json.load(f)

LOOK = "bright cheerful 16-bit handheld RPG sprite, clean dark outline, saturated colors, cute chibi"
FAMILY = {
    "mom": ("a woman with long curly brown hair, blue knit sweater, jeans", None),
    "dad": ("a man with short black hair, short beard and round glasses, red sweater, brown pants", None),
    "kid": ("a small child with a short dark bob haircut, yellow raincoat-style jacket, blue pants", None),
    "dog": ("a small orange and white corgi dog with a blue scarf", "dog"),
}

def character(name, desc, template):
    body = {"description": f"{desc}, {LOOK}", "image_size": {"width": 32, "height": 32},
            "view": "low top-down", "outline": "single color black outline", "shading": "basic shading",
            "detail": "medium detail", "seed": 1225}
    if template:
        body["template_id"] = template
    else:
        body["proportions"] = {"type": "preset", "name": "chibi"}
    r = req(f"{PL}/create-character-with-4-directions", body, PLH)
    job, cid = r["background_job_id"], r["character_id"]
    while True:
        j = req(f"{PL}/background-jobs/{job}", headers=PLH)
        if j["status"] == "completed": break
        if j["status"] == "failed": raise RuntimeError(json.dumps(j)[:400])
        time.sleep(4)
    open(f"{OUT}/{name}_sheet.png", "wb").write(req(f"{PL}/characters/{cid}/spritesheet", headers=PLH, raw=True))
    return name, cid

ROOM = ("cozy wooden cabin living room interior, bright and warm golden afternoon light, glowing fireplace, a lit menorah on the window sill, "
        "snowy pine trees outside the window, stone fireplace, round rug with dreidels, wooden table with "
        "latkes and mugs of cocoa, blue and white bunting, plants, bookshelf, large empty open floor in the middle, a wooden front door in the middle of the bottom wall")

def room(style, w, h, n):
    hd = {"X-RD-Token": "proxy-injected", "Idempotency-Key": str(uuid.uuid4())}
    t = req(RD, {"prompt": ROOM, "prompt_style": style, "width": w, "height": h, "num_images": n, "seed": 2512}, hd)
    while True:
        task = req(f"{RD}/tasks/{t['task_id']}", headers={"X-RD-Token": "proxy-injected"})
        if task["status"] == "succeeded" or "result" in task and task["result"]: break
        if task["status"] == "failed": raise RuntimeError(task.get("error"))
        time.sleep(3)
    res = task["result"]
    for i, b in enumerate(res["base64_images"]):
        open(f"{OUT}/room_{style}_{i}.png", "wb").write(base64.b64decode(b))
    return style, res.get("balance_cost"), res.get("remaining_balance")

jobs = [(character, (n, d, t)) for n, (d, t) in FAMILY.items()]
jobs += [(room, ("rd_pro__topdown", 256, 192, 2))]
with ThreadPoolExecutor(5) as ex:
    for f in [ex.submit(fn, *a) for fn, a in jobs]:
        try: print(*f.result())
        except Exception as e: print("ERROR", e, getattr(e, "read", lambda: b"")()[:400])
