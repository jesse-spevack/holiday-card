"""Round 2 of the guest look library: more regular looks and a silly set (robots, aliens, and more).

Same method as looks.py (PixelLab generate-image-v2 with the old cabin as the style image).

Usage (from the repo root, with PIXELLAB_KEY set):
  python3 art/scripts/looks_more.py gen RAW_DIR [id ...]   # 25 variations per look -> RAW_DIR/<id>/<i>.png and _sheet.png
  python3 art/scripts/looks_more.py add RAW_DIR            # cleans each pick in PICKS, adds it to public/assets/looks
"""
import base64, io, json, os, subprocess, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from looks import clean, preview, PET, STYLE, P, V  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = f"{REPO}/public/assets/looks"
MANIFEST = f"{REPO}/public/assets/looks.json"
PL = "https://api.pixellab.ai/v2"
SIZE = {"adult": 48, "kid": 40, "baby": 26, "dog": 24, "cat": 24}
SILLY = "a cute friendly costume character, not scary"

# id, type, prompt subject, short description
LOOKS = [
 # regular adults
 ("adult-13", "adult", "a smiling bald man with brown skin and a short gray beard, mustard cardigan over a white shirt, dark pants", "man, bald, gray beard, mustard cardigan"),
 ("adult-14", "adult", "a smiling older woman with light skin, long straight silver hair and red glasses, burgundy sweater, black pants", "older woman, silver hair, red glasses"),
 ("adult-15", "adult", "a smiling East Asian man with an undercut, black puffer vest over a white long sleeve shirt, gray jeans", "man, undercut, black puffer vest"),
 ("adult-16", "adult", "a smiling South Asian woman with a long dark braid, emerald green sweater, cream pants", "woman, long braid, emerald sweater"),
 ("adult-17", "adult", "a smiling man with pale freckled skin and curly red hair, red and black plaid flannel shirt, jeans", "man, red curls, plaid flannel"),
 ("adult-19", "adult", "a smiling woman with dark skin wearing a bright yellow patterned head wrap, white sweater, teal pants", "woman, yellow head wrap"),
 ("adult-20", "adult", "a smiling man with tan skin and long brown hair under a gray beanie, green flannel shirt, dark jeans", "man, long hair, gray beanie"),
 ("adult-21", "adult", "a smiling grandpa with light skin, a fluffy white beard and suspenders over a blue shirt, brown pants", "grandpa, white beard, suspenders"),
 ("adult-22", "adult", "a smiling woman with light skin and a high blond ponytail, purple zip running jacket, black leggings", "woman, blond ponytail, purple jacket"),
 ("adult-23", "adult", "a smiling Sikh man with brown skin, a navy blue turban and a full black beard, gray sweater, dark pants", "man, navy turban, beard"),
 ("adult-24", "adult", "a smiling woman with brown skin and curly black hair, red sweater with a white snowflake pattern, dark pants", "woman, curly hair, snowflake sweater"),
 # silly adults
 ("adult-25", "adult", f"a boxy friendly silver robot with round blue eyes and a small antenna, {SILLY}", "robot"),
 ("adult-26", "adult", f"a friendly little green alien with big black eyes and two antennae, wearing a cozy orange sweater, {SILLY}", "green alien"),
 ("adult-27", "adult", f"an astronaut in a white space suit with the helmet visor up showing a smiling face, {SILLY}", "astronaut"),
 ("adult-28", "adult", f"a wizard with a long white beard, a tall starry purple hat and a purple robe, {SILLY}", "wizard"),
 ("adult-29", "adult", f"a smiling snowman with a carrot nose, a red scarf and a black top hat, {SILLY}", "snowman"),
 ("adult-30", "adult", f"a small knight in shiny silver armor with a red plume on the helmet, visor up showing a smiling face, {SILLY}", "knight"),
 ("adult-31", "adult", f"a person in a green dinosaur costume with the dinosaur hood up and a smiling face showing, {SILLY}", "dinosaur costume"),
 ("adult-32", "adult", f"a cute white bedsheet ghost with two round black eyes and a happy smile, {SILLY}", "ghost"),
 ("adult-33", "adult", f"a friendly cartoon vampire with slicked black hair and a black cape with red lining, smiling, {SILLY}", "vampire"),
 ("adult-34", "adult", f"a fluffy white yeti with a blue face and a big happy smile, {SILLY}", "yeti"),
 # regular kids
 ("kid-08", "kid", "a happy girl about nine years old with light skin, glasses and a brown ponytail, teal hoodie, jeans", "girl, glasses, teal hoodie"),
 ("kid-09", "kid", "a happy boy about eight years old with dark skin and a round afro, red hoodie, gray pants", "boy, afro, red hoodie"),
 ("kid-10", "kid", "a happy girl about nine years old with brown skin wearing a pink hijab, purple coat, dark pants", "girl, pink hijab, purple coat"),
 ("kid-11", "kid", "a happy boy about seven years old with light skin and blond hair, green sweater, brown corduroy pants", "boy, blond, green sweater"),
 ("kid-12", "kid", "a happy teenage girl with tan skin and long black hair, big headphones around her neck, orange hoodie, jeans", "teen girl, headphones"),
 ("kid-13", "kid", "a happy small child with light skin and brown curly hair in a puffy red snowsuit", "child, red snowsuit"),
 ("kid-14", "kid", "a happy teenage boy with East Asian features and messy black hair, navy varsity jacket, jeans", "teen boy, varsity jacket"),
 # silly kids
 ("kid-15", "kid", f"a small friendly robot kid with a round silver head, big blue eyes and a red chest light, {SILLY}", "robot kid"),
 ("kid-16", "kid", f"a tiny friendly purple alien kid with three eyes and a big smile, {SILLY}", "purple alien kid"),
 ("kid-17", "kid", f"a kid in a green dinosaur costume with the hood up and a smiling face showing, {SILLY}", "kid in dinosaur costume"),
 ("kid-18", "kid", f"a kid superhero with a red cape, blue suit and a small mask, smiling, {SILLY}", "kid superhero"),
 ("kid-19", "kid", f"a kid ninja in a black outfit with a red headband, eyes smiling, {SILLY}", "kid ninja"),
 # Asked for as an adult (48 px frame), but every variation came out kid height, so it is a teen look.
 ("kid-20", "kid", "a smiling woman with light brown skin and a short pink pixie cut, denim jacket, black jeans", "teen, pink pixie cut, denim jacket"),
 # babies
 ("baby-04", "baby", "a happy toddler with light skin wearing a brown bear onesie with little round ears on the hood", "toddler, bear onesie"),
 ("baby-05", "baby", "a happy toddler with dark skin wearing a white onesie with blue snowflakes and a tiny blue hat", "toddler, snowflake onesie"),
 ("baby-06", "baby", "a happy toddler with tan skin and a big pink bow in her hair, pink striped sleeper", "toddler, pink bow"),
 # dogs
 ("dog-07", "dog", "a fawn pug dog with a black face", "pug"),
 ("dog-08", "dog", "a gray and white husky dog with blue eyes", "husky"),
 ("dog-09", "dog", "a fluffy apricot poodle dog", "poodle"),
 ("dog-10", "dog", "a tricolor beagle dog", "beagle"),
 ("dog-11", "dog", f"a small silver robot dog with glowing blue eyes, {SILLY}", "robot dog"),
 ("dog-12", "dog", f"a tiny friendly green dragon with small wings, {SILLY}", "baby dragon"),
 # cats
 ("cat-04", "cat", "a calico cat", "calico cat"),
 ("cat-05", "cat", "a siamese cat with blue eyes", "siamese cat"),
 ("cat-06", "cat", "a black and white tuxedo cat", "tuxedo cat"),
 ("cat-07", "cat", f"a little green alien cat with big eyes and antennae, {SILLY}", "alien cat"),
 ("cat-08", "cat", f"a small penguin with a red scarf, {SILLY}", "penguin"),
]

# Chosen variation per look: the plainest one, with no props in hand and no Santa or Halloween items.
PICKS = {
 "adult-13": 0,
 "adult-14": 0,
 "adult-15": 0,
 "adult-16": 1,
 "adult-17": 0,
 "adult-19": 0,
 "adult-20": 1,
 "adult-21": 0,
 "adult-22": 0,
 "adult-23": 0,
 "adult-24": 2,
 "adult-25": 0,
 "adult-26": 0,
 "adult-27": 1,
 "adult-28": 7,
 "adult-29": 0,
 "adult-30": 0,
 "adult-31": 2,
 "adult-32": 2,
 "adult-33": 0,
 "adult-34": 4,
 "kid-08": 0,
 "kid-09": 0,
 "kid-10": 0,
 "kid-11": 1,
 "kid-12": 1,
 "kid-13": 0,
 "kid-14": 0,
 "kid-15": 0,
 "kid-16": 0,
 "kid-17": 0,
 "kid-18": 0,
 "kid-19": 0,
 "kid-20": 1,
 "baby-04": 0,
 "baby-05": 0,
 "baby-06": 0,
 "dog-07": 8,
 "dog-08": 0,
 "dog-09": 0,
 "dog-10": 0,
 "dog-11": 3,
 "dog-12": 4,
 "cat-04": 0,
 "cat-05": 0,
 "cat-06": 0,
 "cat-07": 0,
 "cat-08": 0,
}


def key():
    k = os.environ.get("PIXELLAB_KEY")
    if not k: sys.exit("set PIXELLAB_KEY")
    return k


def req(url, body=None):
    r = urllib.request.Request(url, json.dumps(body).encode() if body is not None else None,
                               {"Content-Type": "application/json", "Authorization": f"Bearer {key()}"})
    with urllib.request.urlopen(r, timeout=300) as f: return json.load(f)


def ref_image():
    raw = subprocess.run(["git", "-C", REPO, "show", "16e0ec2:art/assets/rooms/cabin.png"], capture_output=True, check=True).stdout
    room = Image.open(io.BytesIO(raw)).convert("RGB")
    buf = io.BytesIO(); room.crop((40, 60, 208, 192)).resize((168, 132)).save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def prompt(kind, subject):
    return f"{P}{subject}, {PET}" if kind in ("dog", "cat") else f"{V}{subject}. {STYLE}"


def gen(raw, ids):
    ref = ref_image()
    def go(look):
        lid, kind, subject, _ = look
        s = SIZE[kind]
        r = req(f"{PL}/generate-image-v2", {"description": prompt(kind, subject), "image_size": {"width": s, "height": s},
            "seed": 7, "no_background": True, "style_image": {"image": {"type": "base64", "base64": ref}, "size": {"width": 168, "height": 132}}})
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


def add(raw):
    manifest = json.load(open(MANIFEST))
    known = {e["id"] for items in manifest.values() for e in items}
    for lid, kind, _, desc in LOOKS:
        if lid not in PICKS or lid in known: continue
        c = clean(Image.open(f"{raw}/{lid}/{PICKS[lid]}.png")); c.save(f"{OUT}/{lid}.png")
        manifest[kind].append({"id": lid, "src": f"assets/looks/{lid}.png", "w": c.width, "h": c.height, "desc": desc})
    json.dump(manifest, open(MANIFEST, "w"), indent=1)
    print("looks:", {k: len(v) for k, v in manifest.items()})


if __name__ == "__main__":
    cmd, raw = sys.argv[1], sys.argv[2]
    if cmd == "gen": gen(raw, sys.argv[3:])
    elif cmd == "add": add(raw)
