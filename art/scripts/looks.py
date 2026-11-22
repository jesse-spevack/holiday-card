"""The guest look library and the host family: PixelLab prompts, the variation picks, and the build.

Usage (from the repo root; the key comes from PIXELLAB_KEY or 1Password, see pixellab.py):
  python3 art/scripts/looks.py gen RAW_DIR ID [ID ...]  # one call per look: RAW_DIR/<id>/<i>.png and _sheet.png
  python3 art/scripts/looks.py add RAW_DIR ID [ID ...]  # cleans the picked variation into public/assets
  python3 art/scripts/looks.py sheet OUT_PNG            # a review sheet of every look in looks.json

To add a look: add a row to LOOKS, run gen, look at RAW_DIR/<id>/_sheet.png, set the pick, and run add.
add writes public/assets/looks/<id>.png and puts the entry in public/assets/looks.json (in place, or at the end
of its type). A host id ("host-son") writes public/assets/hosts/son.png. gen costs PixelLab credits, so it takes
only the ids you name.

The raw variations of the shipped looks are gone. The picks record which variation each look uses.
"""
import json, os, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import pixellab  # noqa: E402

REPO = pixellab.REPO
LOOKS_DIR = f"{REPO}/public/assets/looks"
HOSTS_DIR = f"{REPO}/public/assets/hosts"
MANIFEST = f"{REPO}/public/assets/looks.json"

PERSON = "cute cozy RPG villager sprite of "
PERSON_STYLE = ("Big head, about two heads tall, large friendly expressive eyes, soft warm shading, lit by golden firelight, "
                "dark brown outline, standing relaxed, facing the viewer")
PET = "cute cozy RPG pet sprite of "
PET_STYLE = "sitting, big friendly eyes, soft warm shading, lit by golden firelight, dark brown outline, facing the viewer"
SILLY = "a cute friendly costume character, not scary"
# The frame size per type. A frame of 32 gave babies about 30 px tall (kid height), so babies use 26.
FRAME = {"host": 48, "adult": 48, "kid": 40, "baby": 26, "dog": 24, "cat": 24}


def look(lid, subject, desc, pick, age=None, silly=False, frame=None, note=None):
    kind = lid.split("-")[0]
    if silly:
        subject = f"{subject}, {SILLY}"
    return {"id": lid, "kind": kind, "subject": subject, "desc": desc, "pick": pick,
            "age": age or (kind if kind in ("adult", "kid", "baby") else None), "silly": silly,
            "frame": frame or FRAME[kind], "note": note}


LOOKS = [look(*row[:4], **row[4]) if len(row) > 4 else look(*row) for row in [
    # The host family. Their sprites are in public/assets/hosts, not in looks.json.
    ("host-jessica", "a smiling woman with dark brown hair in a low bun with bangs, red and white plaid long shirt dress, tan ankle boots",
     "Jess", None, {"note": "The shipped Jess sprite came from a later prompt that is not in git."}),
    ("host-daughter", "a smiling girl about ten years old with long curly brown hair with a center part, freckles, pink knit cardigan over a navy top, dark pants",
     "daughter", None),
    ("host-son", "a smiling boy about ten years old with messy wavy dark brown hair, light blue blazer, white shirt, navy pants",
     "son", None, {"note": "The shipped sprite has its mug removed by hand."}),
    # The Jesse sprite has no prompt in git.

    # Round 1. adult-11, adult-12, kid-07, and dog-06 are the first sample guests. They used a 48 px frame for
    # every type. Their picks were not recorded. art/assets/characters/guest-*.png keeps the uncropped copies.
    ("adult-01", "a smiling woman with brown skin and long black box braids, mustard yellow knit sweater, dark jeans, brown boots", "woman, box braids, mustard sweater", 0),
    ("adult-02", "a smiling man with light skin, short blond hair and a neat blond beard, forest green zip fleece jacket, gray pants", "man, blond beard, green fleece", 0, {"frame": 52}),
    ("adult-03", "a smiling woman with medium brown skin wearing a lavender hijab, long cream wool coat, dark pants", "woman, lavender hijab, cream coat", 16),
    ("adult-04", "a smiling man with dark brown skin, short black curly hair, rectangular glasses, navy cable knit sweater, khaki pants", "man, glasses, navy sweater", 0),
    ("adult-05", "a smiling East Asian woman with a short black bob haircut, oversized teal cardigan over a white shirt, black pants", "woman, black bob, teal cardigan", 5),
    ("adult-06", "a smiling man with tan skin, black hair in a short ponytail, maroon hoodie, dark jeans", "man, ponytail, maroon hoodie", 5, {"frame": 52}),
    ("adult-07", "a smiling older woman with light skin and short curly white hair, round glasses, lilac cardigan, gray skirt, holding a small mug", "older woman, white curls, lilac cardigan", 6, {"age": "older"}),
    ("adult-08", "a smiling older man with brown skin, short gray hair and a gray mustache, brown tweed vest over a light blue shirt, dark pants", "older man, gray hair, tweed vest", 7, {"age": "older"}),
    ("adult-09", "a smiling woman with freckled pale skin and long straight ginger hair, sage green turtleneck sweater, brown corduroy pants", "woman, ginger hair, sage turtleneck", 0),
    ("adult-10", "a smiling woman with dark skin and a big round natural afro, burnt orange puffer jacket, black pants", "woman, afro, orange puffer", 0),
    ("adult-11", "a smiling woman with long curly auburn hair, blue knit sweater, jeans", "woman, auburn curls, blue sweater", None, {"frame": 48}),
    ("adult-12", "a smiling man with short black hair, short beard and round glasses, red sweater, brown pants", "man, beard, glasses, red sweater", None, {"frame": 48}),
    ("kid-01", "a happy girl about eight years old with brown skin and two puffy pigtails, purple winter coat, gray leggings", "girl, pigtails, purple coat", 23),
    ("kid-02", "a happy boy about nine years old with light skin, red hair and glasses, striped blue and white sweater, jeans", "boy, red hair, glasses", 18),
    ("kid-03", "a happy boy about seven years old with dark brown skin and a short buzz cut, green puffer vest over an orange long sleeve shirt, blue pants", "boy, buzz cut, green vest", 9),
    ("kid-04", "a happy girl about ten years old with tan skin and a long black braid, light blue knit beanie, cream sweater, dark pants", "girl, braid, blue beanie", 14),
    ("kid-05", "a happy girl about six years old with light skin and blond curly hair, pink fuzzy coat, white boots", "girl, blond curls, pink coat", 12),
    ("kid-06", "a happy East Asian boy about eight years old with straight black hair and bangs, mustard yellow hoodie, brown pants", "boy, black bangs, yellow hoodie", 3),
    ("kid-07", "a happy small child with a short dark bob haircut, yellow jacket, blue pants", "child, dark bob, yellow jacket", None, {"frame": 48}),
    ("baby-01", "a happy toddler with light skin and a tuft of brown hair, standing, wearing a fuzzy light blue onesie", "toddler, blue onesie", 17),
    ("baby-02", "a happy toddler girl with brown skin and a tiny top knot, standing, wearing a yellow knit romper", "toddler, top knot, yellow romper", 16),
    ("baby-03", "a happy toddler with tan skin and black hair, standing, wearing a blue knit hat with a pompom and a gray snowsuit", "toddler, pompom hat, snowsuit", 24,
     {"note": "The picked sprite had a red hat. The shipped sprite has a blue hat, painted by hand, so it does not look like Santa."}),
    ("dog-01", "a golden retriever dog", "golden retriever", 1),
    ("dog-02", "a black and white border collie dog", "border collie", 22),
    ("dog-03", "a small brown dachshund dog with a green knit sweater", "dachshund in sweater", 11),
    ("dog-04", "a fluffy white bichon dog", "white bichon", 0),
    ("dog-05", "a chocolate brown labrador dog with a red collar", "chocolate lab", 18),
    ("dog-06", "a small orange and white corgi dog with a blue scarf", "corgi with blue scarf", None, {"frame": 48}),
    ("cat-01", "an orange tabby cat", "orange tabby cat", 12),
    ("cat-02", "a black cat with yellow eyes", "black cat", 20),
    ("cat-03", "a gray and white fluffy cat", "gray and white cat", 11),

    # Round 2: more regular looks and a silly set. The pick is the plainest variation, with no props in hand
    # and no Santa or Halloween items.
    ("adult-13", "a smiling bald man with brown skin and a short gray beard, mustard cardigan over a white shirt, dark pants", "man, bald, gray beard, mustard cardigan", 0, {"age": "older"}),
    ("adult-14", "a smiling older woman with light skin, long straight silver hair and red glasses, burgundy sweater, black pants", "older woman, silver hair, red glasses", 0, {"age": "older"}),
    ("adult-15", "a smiling East Asian man with an undercut, black puffer vest over a white long sleeve shirt, gray jeans", "man, undercut, black puffer vest", 0),
    ("adult-16", "a smiling South Asian woman with a long dark braid, emerald green sweater, cream pants", "woman, long braid, emerald sweater", 1),
    ("adult-17", "a smiling man with pale freckled skin and curly red hair, red and black plaid flannel shirt, jeans", "man, red curls, plaid flannel", 0),
    # The library has no adult-18.
    ("adult-19", "a smiling woman with dark skin wearing a bright yellow patterned head wrap, white sweater, teal pants", "woman, yellow head wrap", 0),
    ("adult-20", "a smiling man with tan skin and long brown hair under a gray beanie, green flannel shirt, dark jeans", "man, long hair, gray beanie", 1),
    ("adult-21", "a smiling grandpa with light skin, a fluffy white beard and suspenders over a blue shirt, brown pants", "grandpa, white beard, suspenders", 0, {"age": "older"}),
    ("adult-22", "a smiling woman with light skin and a high blond ponytail, purple zip running jacket, black leggings", "woman, blond ponytail, purple jacket", 0),
    ("adult-23", "a smiling Sikh man with brown skin, a navy blue turban and a full black beard, gray sweater, dark pants", "man, navy turban, beard", 0),
    ("adult-24", "a smiling woman with brown skin and curly black hair, red sweater with a white snowflake pattern, dark pants", "woman, curly hair, snowflake sweater", 2),
    ("adult-25", "a boxy friendly silver robot with round blue eyes and a small antenna", "robot", 0, {"silly": True}),
    ("adult-26", "a friendly little green alien with big black eyes and two antennae, wearing a cozy orange sweater", "green alien", 0, {"silly": True}),
    ("adult-27", "an astronaut in a white space suit with the helmet visor up showing a smiling face", "astronaut", 1, {"silly": True}),
    ("adult-28", "a wizard with a long white beard, a tall starry purple hat and a purple robe", "wizard", 7, {"silly": True}),
    ("adult-29", "a smiling snowman with a carrot nose, a red scarf and a black top hat", "snowman", 0, {"silly": True}),
    ("adult-30", "a small knight in shiny silver armor with a red plume on the helmet, visor up showing a smiling face", "knight", 0, {"silly": True}),
    ("adult-31", "a person in a green dinosaur costume with the dinosaur hood up and a smiling face showing", "dinosaur costume", 2, {"silly": True}),
    ("adult-32", "a cute white bedsheet ghost with two round black eyes and a happy smile", "ghost", 2, {"silly": True}),
    ("adult-33", "a friendly cartoon vampire with slicked black hair and a black cape with red lining, smiling", "vampire", 0, {"silly": True}),
    ("adult-34", "a fluffy white yeti with a blue face and a big happy smile", "yeti", 4, {"silly": True}),
    ("kid-08", "a happy girl about nine years old with light skin, glasses and a brown ponytail, teal hoodie, jeans", "girl, glasses, teal hoodie", 0),
    ("kid-09", "a happy boy about eight years old with dark skin and a round afro, red hoodie, gray pants", "boy, afro, red hoodie", 0),
    ("kid-10", "a happy girl about nine years old with brown skin wearing a pink hijab, purple coat, dark pants", "girl, pink hijab, purple coat", 0),
    ("kid-11", "a happy boy about seven years old with light skin and blond hair, green sweater, brown corduroy pants", "boy, blond, green sweater", 1),
    ("kid-12", "a happy teenage girl with tan skin and long black hair, big headphones around her neck, orange hoodie, jeans", "teen girl, headphones", 1, {"age": "teen"}),
    ("kid-13", "a happy small child with light skin and brown curly hair in a puffy red snowsuit", "child, red snowsuit", 0),
    ("kid-14", "a happy teenage boy with East Asian features and messy black hair, navy varsity jacket, jeans", "teen boy, varsity jacket", 0, {"age": "teen"}),
    ("kid-15", "a small friendly robot kid with a round silver head, big blue eyes and a red chest light", "robot kid", 0, {"silly": True}),
    ("kid-16", "a tiny friendly purple alien kid with three eyes and a big smile", "purple alien kid", 0, {"silly": True}),
    ("kid-17", "a kid in a green dinosaur costume with the hood up and a smiling face showing", "kid in dinosaur costume", 0, {"silly": True}),
    ("kid-18", "a kid superhero with a red cape, blue suit and a small mask, smiling", "kid superhero", 0, {"silly": True}),
    ("kid-19", "a kid ninja in a black outfit with a red headband, eyes smiling", "kid ninja", 0, {"silly": True}),
    ("kid-20", "a smiling woman with light brown skin and a short pink pixie cut, denim jacket, black jeans", "teen, pink pixie cut, denim jacket", 1,
     {"age": "teen", "frame": 48, "note": "Asked for as an adult, but every variation came out kid height, so it is a teen look."}),
    ("baby-04", "a happy toddler with light skin wearing a brown bear onesie with little round ears on the hood", "toddler, bear onesie", 0),
    ("baby-05", "a happy toddler with dark skin wearing a white onesie with blue snowflakes and a tiny blue hat", "toddler, snowflake onesie", 0),
    ("baby-06", "a happy toddler with tan skin and a big pink bow in her hair, pink striped sleeper", "toddler, pink bow", 0),
    ("dog-07", "a fawn pug dog with a black face", "pug", 8),
    ("dog-08", "a gray and white husky dog with blue eyes", "husky", 0),
    ("dog-09", "a fluffy apricot poodle dog", "poodle", 0),
    ("dog-10", "a tricolor beagle dog", "beagle", 0),
    ("dog-11", "a small silver robot dog with glowing blue eyes", "robot dog", 3, {"silly": True}),
    ("dog-12", "a tiny friendly green dragon with small wings", "baby dragon", 4, {"silly": True}),
    ("cat-04", "a calico cat", "calico cat", 0),
    ("cat-05", "a siamese cat with blue eyes", "siamese cat", 0),
    ("cat-06", "a black and white tuxedo cat", "tuxedo cat", 0),
    ("cat-07", "a little green alien cat with big eyes and antennae", "alien cat", 0, {"silly": True}),
    ("cat-08", "a small penguin with a red scarf", "penguin", 0, {"silly": True}),
]]
BY_ID = {lk["id"]: lk for lk in LOOKS}


def prompt(lk):
    if lk["kind"] in ("dog", "cat"):
        return f"{PET}{lk['subject']}, {PET_STYLE}"
    return f"{PERSON}{lk['subject']}. {PERSON_STYLE}"


def find(ids):
    unknown = [i for i in ids if i not in BY_ID]
    if unknown or not ids:
        sys.exit(f"name one or more ids from LOOKS. Unknown: {', '.join(unknown) or 'none given'}")
    return [BY_ID[i] for i in ids]


def gen(raw, ids):
    style = pixellab.style_image(pixellab.CABIN, pixellab.CABIN_CROP)

    def one(lk):
        images = pixellab.generate(prompt(lk), lk["frame"], style)
        pixellab.save_variations(f"{raw}/{lk['id']}", images)
        return lk["id"], len(images)

    with ThreadPoolExecutor(6) as ex:
        for f in [ex.submit(one, lk) for lk in find(ids)]:
            try:
                print(*f.result(), flush=True)
            except Exception as e:
                print("ERROR", e, getattr(e, "read", lambda: b"")()[:300], flush=True)


def entry(lk, im):
    """A looks.json entry, with the keys in the order the file uses."""
    e = {"id": lk["id"], "src": f"assets/looks/{lk['id']}.png", "w": im.width, "h": im.height, "desc": lk["desc"]}
    if lk["silly"]:
        e["silly"] = True
    if lk["age"]:
        e["age"] = lk["age"]
    return e


def add(raw, ids):
    with open(MANIFEST) as f:
        manifest = json.load(f)
    for lk in find(ids):
        if lk["pick"] is None:
            sys.exit(f"{lk['id']} has no pick. Look at {raw}/{lk['id']}/_sheet.png and set one in LOOKS.")
        if lk["note"]:
            print(f"{lk['id']}: {lk['note']}")
        im = pixellab.clean(Image.open(f"{raw}/{lk['id']}/{lk['pick']}.png"))
        if lk["kind"] == "host":
            im.save(f"{HOSTS_DIR}/{lk['id'].removeprefix('host-')}.png")
            continue
        im.save(f"{LOOKS_DIR}/{lk['id']}.png")
        items = manifest[lk["kind"]]
        at = next((i for i, e in enumerate(items) if e["id"] == lk["id"]), None)
        if at is None:
            items.append(entry(lk, im))
        else:
            items[at] = entry(lk, im)
    with open(MANIFEST, "w") as f:
        json.dump(manifest, f, indent=1)
    print("looks:", {k: len(v) for k, v in manifest.items()})


def sheet(out, scale=3):
    """One row per type, on the room floor color, with each id under its look."""
    with open(MANIFEST) as f:
        manifest = json.load(f)
    rows = [[(e["id"], Image.open(f"{REPO}/public/{e['src']}").convert("RGBA")) for e in items] for items in manifest.values()]
    tall = max(im.height for row in rows for _, im in row) + 2
    cw, ch = 34 * scale, tall * scale + 14
    img = Image.new("RGBA", (max(len(r) for r in rows) * cw + 8, len(rows) * ch + 8), pixellab.FLOOR)
    draw = ImageDraw.Draw(img)
    for ri, row in enumerate(rows):
        for ci, (lid, im) in enumerate(row):
            big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
            x, y = 4 + ci * cw, 4 + ri * ch
            img.alpha_composite(big, (x + (cw - big.width) // 2, y + tall * scale - big.height))
            draw.text((x + 4, y + tall * scale + 1), lid, fill=(50, 25, 10, 255))
    img.save(out)
    print("wrote", out)


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] not in ("gen", "add", "sheet"):
        sys.exit(__doc__)
    cmd, path, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
    if cmd == "gen":
        gen(path, ids)
    elif cmd == "add":
        add(path, ids)
    else:
        sheet(path)
