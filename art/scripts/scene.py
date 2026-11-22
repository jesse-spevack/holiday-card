from PIL import Image, ImageDraw
import json, sys
room=Image.open("/home/user/holiday-card/art/assets/rooms/living-room.png").convert("RGBA")
P={n:Image.open(f"pick/{n}.png").convert("RGBA") for n in ["jesse","jessica","daughter","son","g_mom","g_dad","g_kid","g_dog"]}
# feet positions (x center, y feet) in room pixels
SCENES={
 "door":{"jessica":(90,152),"jesse":(106,150),"son":(158,150),"daughter":(174,152),
         "g_dad":(119,177),"g_mom":(137,178),"g_kid":(128,187),"g_dog":(152,186)},
 "party":{"g_mom":(112,112),"g_dad":(130,110),"g_kid":(120,124),"g_dog":(146,124),
          "jessica":(172,132),"jesse":(187,130),"daughter":(98,160),"son":(114,162)},
}
def render(name):
    sc=room.copy(); sh=Image.new("RGBA",sc.size,(0,0,0,0)); d=ImageDraw.Draw(sh)
    items=sorted(SCENES[name].items(), key=lambda kv: kv[1][1])
    for n,(cx,fy) in items:
        w=P[n].size[0]; d.ellipse((cx-w//2+2,fy-2,cx+w//2-2,fy+2),fill=(50,25,10,95))
    sc.alpha_composite(sh)
    for n,(cx,fy) in items:
        im=P[n]; sc.alpha_composite(im,(cx-im.size[0]//2, fy-im.size[1]))
    return sc
for s in SCENES:
    render(s).resize((256*4,192*4),Image.NEAREST).save(f"scene_{s}.png")
json.dump(SCENES,open("scenes.json","w"))
