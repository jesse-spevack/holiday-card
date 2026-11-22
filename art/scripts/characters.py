import base64, io, json, time, urllib.request, os
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
room=Image.open("/home/user/holiday-card/art/assets/rooms/cabin.png").convert("RGB")
buf=io.BytesIO(); room.crop((40,60,208,192)).resize((168,132)).save(buf,"PNG"); REF=base64.b64encode(buf.getvalue()).decode()
PL="https://api.pixellab.ai/v2"; PH={"Authorization":"Bearer proxy-injected"}
def req(url, body=None):
    r=urllib.request.Request(url, json.dumps(body).encode() if body is not None else None, {"Content-Type":"application/json",**PH})
    with urllib.request.urlopen(r, timeout=300) as f: return json.load(f)
STYLE=("Big head, about two heads tall, large friendly expressive eyes, soft warm shading, lit by golden firelight, "
       "dark brown outline, standing relaxed, facing the viewer")
WHO={
 "jessica":"cute cozy RPG villager sprite of a smiling woman with dark brown hair in a low bun with bangs, red and white plaid long shirt dress, tan ankle boots",
 "daughter":"cute cozy RPG villager sprite of a smiling girl about ten years old with long curly brown hair with a center part, freckles, pink knit cardigan over a navy top, dark pants",
 "son":"cute cozy RPG villager sprite of a smiling boy about ten years old with messy wavy dark brown hair, light blue blazer, white shirt, navy pants",
 "g_mom":"cute cozy RPG villager sprite of a smiling woman with long curly auburn hair, blue knit sweater, jeans",
 "g_dad":"cute cozy RPG villager sprite of a smiling man with short black hair, short beard and round glasses, red sweater, brown pants",
 "g_kid":"cute cozy RPG villager sprite of a happy small child with a short dark bob haircut, yellow jacket, blue pants",
 "g_dog":"cute cozy RPG pet sprite of a small orange and white corgi dog with a blue scarf, sitting, big friendly eyes, soft warm shading, lit by golden firelight, dark brown outline, facing the viewer",
}
def go(n,d):
    full=d if n=="g_dog" else f"{d}. {STYLE}"
    r=req(f"{PL}/generate-image-v2",{"description":full,"image_size":{"width":48,"height":48},"seed":7,"no_background":True,
        "style_image":{"image":{"type":"base64","base64":REF},"size":{"width":168,"height":132}}})
    while True:
        j=req(f"{PL}/background-jobs/{r['background_job_id']}")
        if j["status"]=="completed": break
        if j["status"]=="failed": raise RuntimeError(json.dumps(j)[:300])
        time.sleep(4)
    os.makedirs(n,exist_ok=True)
    imgs=j["last_response"]["images"]
    for i,im in enumerate(imgs): open(f"{n}/{i}.png","wb").write(base64.b64decode(im["base64"]))
    return n,len(imgs)
with ThreadPoolExecutor(7) as ex:
    for f in [ex.submit(go,n,d) for n,d in WHO.items()]:
        try: print(*f.result())
        except Exception as e: print("ERROR",e,getattr(e,"read",lambda:b"")()[:300])
