"""Build native-resolution horizontal slice strips for the riverside diorama."""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "public/assets/riverside"
OUT.mkdir(exist_ok=True)
WOOD, OAK, HONEY = "#654a3c", "#a07248", "#d2a469"
STONE, LIGHT, CREAM = "#8b9081", "#cfccb4", "#f2dfac"
LEAF, GRASS, SUN = "#477856", "#71a05c", "#a2bd68"
GLASS, GLEAM = "#40777c", "#9bd0c4"
RED = ("#884938", "#c36143", "#e68a59")
TEAL = ("#385c5b", "#518780", "#85aba0")
BLUE = ("#4c5965", "#687e90", "#91a4af")
GOLD = ("#9e6941", "#c58e48", "#e9bd72")


class Stack:
    def __init__(self, width=52, height=52):
        self.size = (width, height)
        self.layers = []

    def draw(self, z):
        while len(self.layers) <= z:
            self.layers.append(Image.new("RGBA", self.size))
        return ImageDraw.Draw(self.layers[z])

    def box(self, x, y, w, d, base, height, color):
        for z in range(base, base + height):
            self.draw(z).rectangle((x, y, x+w-1, y+d-1), fill=color)

    def disc(self, x, y, rx, ry, z, color):
        self.draw(z).ellipse((x-rx, y-ry, x+rx, y+ry), fill=color)

    def save(self, name, directory=OUT):
        w, h = self.size
        strip = Image.new("RGBA", (w * len(self.layers), h))
        for z, layer in enumerate(self.layers):
            strip.paste(layer, (w*z, 0))
        strip.save(directory / f"{name}.png", optimize=True)


def tree(s, x, y, radius, base=0, pink=False):
    s.box(x-1, y-1, 3, 3, base, radius+4, WOOD)
    colors = ("#996a72", "#d78f98", "#f1b7b1") if pink else (LEAF, GRASS, SUN)
    for dx, dy, dz, r in [(1, 1, 0, radius), (-radius//2, -1, 2, radius-1), (2, -2, 4, radius-2)]:
        for t in range(-r+1, r):
            a = int(math.sqrt(r*r - t*t))
            s.disc(x+dx, y+dy, a, a, base+radius+4+dz+t, colors[0 if t < -1 else 1 if t < r//2 else 2])


def house(s, x, y, w, d, h, roof, timber=False, hip=False):
    s.box(x, y, w, d, 0, 2, STONE)
    s.box(x, y, w, d, 2, h-2, HONEY if timber else CREAM)
    s.box(x+w-3, y, 3, d, 2, h-2, OAK if timber else "#d4bc8c")
    for yy in (y, y+d-3):
        for xx in range(x+2, x+w-4, 8):
            s.box(xx, yy, 4, 3, 4, max(3,h-6), GLASS)
            s.box(xx, yy, 4, 3, h-4, 2, GLEAM)
            s.box(xx-1, yy, 6, 3, 3, 1, OAK)
        for xx in (x,x+w-2):
            s.box(xx, yy, 2, 3, 2, h-2, WOOD)
    for xx in (x, x+w-3):
        for yy in range(y+4, y+d-4, 7):
            s.box(xx, yy, 3, 4, 4, max(3,h-6), GLASS)
    s.box(x+w//2-2, y+d-3, 5, 3, 2, h-4, WOOD)
    s.box(x-1, y-1, w+2, d+2, h-1, 2, roof[0])
    for t in range((d+3)//2):
        inset = min(t, (w-3)//2) if hip else 0
        x0, x1, y0, y1 = x-1+inset, x+w-inset, y-1+t, y+d-t
        if y0 > y1:
            break
        paint = s.draw(h+1+t)
        paint.rectangle((x0,y0,x1,y1),fill=roof[1])
        # The two roof slopes have different albedos so the ridge reads from either bank.
        paint.rectangle((x0,y0,x1,(y0+y1)//2),fill=roof[0])
        if t >= (d+3)//2-2:
            paint.rectangle((x0,y0,x1,y1),fill=roof[2])
        if t%3 == 2:
            paint.line((x0,y0,x1,y0),fill=roof[2])
        if t < (d+3)//2-2:
            for xx in range(x0+1+(t%2)*3,x1-2,7):
                paint.line((xx,y1,xx+2,y1),fill=roof[2 if t%3 else 0])
                paint.line((xx,y0,xx+2,y0),fill=roof[1])
        if not hip:
            paint.line((x0,y0,x0,y1),fill=roof[2])
    s.box(x+w//2-3,y+d,8,3,0,2,LIGHT)


def posts(s, x, y, w, d, h):
    for xx in (x, x+w-2):
        for yy in (y, y+d-2):
            s.box(xx, yy, 2, 2, 0, h, WOOD)


def canopy(s, x, y, w, d, h, stripe, striped=False):
    posts(s,x,y,w,d,h)
    for i in range(w+2):
        color = CREAM if striped and (i//3)%2 else stripe
        s.box(x-1+i,y-1,1,d+2,h,2,color)
        s.box(x-1+i,y+d,1,1,h-2,2,color)


def clock(s, x, y, base):
    s.box(x,y,8,8,base,12,CREAM)
    for z in range(base+5,base+10):
        d = s.draw(z)
        d.rectangle((x+1,y+5,x+6,y+7),fill=WOOD if z in (base+5,base+9) else "#faf0cc")
        d.rectangle((x+4,y+5,x+4,y+7),fill=WOOD)
    for t in range(5):
        s.box(x-1+t,y-1+t,10-2*t,10-2*t,base+12+t,1,TEAL[1 if t%2 else 0])


def building(kind, lv):
    s = Stack()
    if kind == "residential" and lv <= 2:
        sheet = Image.open(OUT / "cottage.png").convert("RGBA")
        for z in range(sheet.width // 23):
            s.draw(z)
            s.layers[z].paste(sheet.crop((z*23,0,(z+1)*23,30)), (17,9))
        if lv == 2:
            house(s,6,21,12,12,7,RED)
        return s
    wide = lv >= 2
    tall = lv >= 3
    roof = {"residential":RED, "market":GOLD, "workshop":BLUE, "station":TEAL,
            "harbor":BLUE, "central_hub":RED, "packaging":GOLD, "research":TEAL, "synergy":TEAL}
    if kind == "park":
        if lv == 5:
            s.disc(26,35,17,12,0,LIGHT)
            s.disc(26,35,14,9,1,GRASS)
            for i in range(16):
                a = i*math.pi/8
                x, y = 26+round(12*math.cos(a)), 35+round(8*math.sin(a))
                s.disc(x,y,2,2,2,"#dc9c9a" if i%2 else "#f0c174")
            s.disc(26,35,5,4,2,LIGHT)
        if tall:
            s.box(14,9,24,21,0,3,STONE)
            for z in range(3,21):
                r = 11 if z < 10 else max(1,round(math.sqrt(121-(z-10)**2)))
                s.box(26-r,10,r*2,18,z,1,"#b4ded0" if z >= 17 else "#78b7ac")
                for yy in (10,18,26):
                    s.box(26-r,yy,2,2,z,1,CREAM)
                    s.box(24+r,yy,2,2,z,1,CREAM)
                s.box(25,26,2,2,z,1,CREAM)
                if z in (9,15):
                    s.box(26-r,26,r*2,2,z,1,CREAM)
                s.box(26-r,10,2,18,z,1,TEAL[1])
            s.box(22,27,8,2,3,7,GLASS)
        else:
            house(s,19,15,16,12,7,TEAL,True)
            s.box(20,31,11,3,0,2,OAK)
            s.box(20,31,11,3,2,2,"#d5a0a1")
        if wide:
            posts(s,6,15,9,17,8)
            for yy in range(14,33,3):
                s.box(5,yy,12,2,8,2,GRASS if yy%2 else "#aa92a5")
    else:
        w, d, h = (18+2*lv, 12+(2 if tall else 0), 8+lv)
        if kind == "harbor":
            for i in range(9+lv):
                s.box(4+i*3,27,3,14,0,2,HONEY if i%3 else OAK)
            posts(s,5,33,21+lv*2,7,6)
        if kind == "station":
            w,d,h = 24+lv*2,10,8+lv
        elif kind == "synergy":
            w,d,h = 13+lv,14,10+lv
        elif kind == "packaging":
            w,d,h = 14+lv,11,6+lv
        house(s,13,14,w,d,h,roof[kind],timber=kind in ("harbor","workshop","packaging"),hip=kind in ("market","research","synergy"))
        if kind == "market":
            canopy(s,13,29,w,6,h-2,"#bb5b49",True)
            if tall:
                house(s,19,12,15,13,h+6,GOLD,hip=True)
        if kind == "station":
            s.box(7,36,39,6,0,1,STONE)
            for xx in range(8,46,4):
                s.box(xx,36,2,6,1,1,OAK)
            for yy in (37,40):
                s.box(7,yy,39,1,2,1,"#505d63")
            canopy(s,9,29,26+lv,5,7,TEAL[1])
            if tall:
                clock(s,15,14,h+4)
        if kind == "workshop":
            s.box(17,29,14,4,4,2,HONEY)
            if tall:
                for xx in (18,27):
                    s.box(xx,14,7,13,h+4,4,GLASS)
                    for t in range(5):
                        s.box(xx+t,13,8-t,15,h+8+t,1,BLUE[2 if t == 4 else 1])
        if kind == "central_hub":
            clock(s,21,14,h+(7 if tall else 2))
            s.box(36,29,4,4,0,7,RED[1])
            s.box(36,32,4,1,5,1,WOOD)
        if kind == "residential" and tall:
            # Cross gable over the public hall entrance and a round clerestory.
            for z in range(8):
                s.box(20+z,21,16-2*z,11,h+z,1,CREAM)
                for xx in (19+z,35-z):
                    s.box(xx,20,2,13,h+z,2,RED[1])
            for z,r in [(1,1),(2,2),(3,2),(4,1)]:
                s.box(27-r,29,2*r+1,3,h+z,1,GLASS)
        if kind == "packaging":
            canopy(s,13,29,w,7,7,"#bf8441")
            if tall:
                posts(s,14,19,17,9,18)
                s.box(12,20,21,3,17,3,WOOD)
                s.box(19,20,3,4,13,5,HONEY)
            for i in range(lv+1):
                sx, sy = 10+i%3*6, 35+i//3*5
                s.box(sx,sy,5,4,0,4,OAK)
                s.box(sx+2,sy,1,4,0,5,CREAM)
        if kind == "research":
            base = h+(8 if tall else 3)
            s.box(18,15,15,12,h,base-h+1,GLASS)
            for t in range(6+lv):
                r = max(1,round(math.sqrt((6+lv)**2-t*t)))
                s.disc(25,20,r,r,base+t,TEAL[1 if t<5 else 2])
        if kind == "synergy":
            posts(s,10,30,26,5,8+lv)
            s.box(9,31,29,2,8+lv,2,GOLD[1])
            s.box(33,20,3,3,0,14+lv*2,WOOD)
            s.box(35,20,8,2,11+lv*2,4,RED[1])
        if kind == "harbor" and tall:
            for z in range(20+lv):
                r = 4 if z < 13 else 3
                s.disc(37,21,r,r,z,CREAM if (z//5)%2 == 0 else RED[1])
            s.disc(37,21,5,5,20+lv,BLUE[0])
        if wide:
            house(s,6,19,9,12,6,roof[kind],timber=True)
    if lv >= 4:
        if kind == "park":
            tree(s,40,13,5,pink=True)
        else:
            canopy(s,35,19,9,16,7,roof[kind][1])
        s.box(12,36,2,2,0,9,WOOD)
        s.box(11,35,4,4,9,3,"#f1bd68")
    if lv == 5:
        if kind in ("residential","research"):
            tree(s,12,34,7,pink=kind=="park")
            s.box(18,38,10,3,2,2,HONEY)
        elif kind == "park":
            s.box(35,35,9,3,2,2,HONEY)
        elif kind == "market":
            posts(s,13,38,23,4,12)
            s.box(11,36,27,8,12,2,RED[0])
            s.box(12,37,25,6,14,2,RED[1])
            s.box(16,38,3,3,8,4,"#efbb70")
        elif kind == "station":
            s.box(6,9,9,11,0,19,CREAM)
            for z in range(6):
                r = 6-z
                s.disc(10,14,r,r,19+z,TEAL[2 if z == 5 else 1])
            s.box(36,31,10,3,2,2,HONEY)
        elif kind == "central_hub":
            house(s,32,6,13,14,16,RED,hip=True)
        elif kind in ("workshop","synergy"):
            canopy(s,16,37,18,6,9,roof.get(kind,TEAL)[1])
        elif kind == "harbor":
            s.box(36,33,3,3,0,21,OAK)
            s.box(25,33,14,3,19,3,HONEY)
            s.box(25,33,2,2,11,9,WOOD)
        else:
            house(s,30,6,12,10,9,roof[kind])
    return s


# World coordinates share the centre of the terrain strip with the runtime camera.
W, H = 256, 216
def river(y):
    return round(10 + y*.23 + 17*math.sin(y/38) + 6*math.sin((y+12)/16))

def terrain():
    rng = random.Random(422)
    s = Stack(W,H)
    land = Image.new("L",(W,H))
    contour = [(6,52),(30,22),(65,7),(170,5),(224,18),(249,48),(253,117),
               (238,162),(205,192),(152,209),(83,208),(35,189),(8,152),(2,100)]
    ImageDraw.Draw(land).polygon(contour,fill=255)
    for z in range(10):
        paint = s.draw(z)
        for iy in range(H):
            centre = W//2 + river(iy-H//2)
            for ix in range(W):
                if not land.getpixel((ix,iy)):
                    continue
                bank = abs(ix-centre) - (12+int(2*math.cos(iy/18)))
                if bank < z-5 and z > 3:
                    continue
                if z <= 3 and bank < 1:
                    color = ("#438a9a","#55a0ab","#74b8ba","#98cfbd")[min(3,max(0,bank//4+3))]
                    if z == 3 and (ix + 2*iy + int(4*math.sin(iy/3))) % 45 < 5:
                        color = "#a5dfce"
                elif z == 9:
                    color = "#d0c796" if bank < 7 else ("#b7c87e" if math.sin(ix/17)+math.cos(iy/12) > 0.4 else "#a9bf74")
                else:
                    color = ("#726b58","#8f8068","#b69d76","#a99973","#c4ae80","#a69371","#c5b388","#bea878","#8aa062")[z]
                paint.point((ix,iy),fill=color)
    paint = s.draw(9)
    mask = s.layers[9].getchannel("A")
    # Hedged strips of farmland on the high bank.
    for x,y,w,h in [(49,31,22,12),(62,15,31,10),(89,22,20,11),(175,21,27,12),(47,164,23,11)]:
        paint.rounded_rectangle((x-1,y-1,x+w,y+h),radius=2,fill="#9b9663")
        paint.rectangle((x,y,x+w-1,y+h-1),fill="#d5b576")
        for row in range(y+1,y+h,3):
            paint.line((x+1,row,x+w-2,row),fill="#b38f59")
            paint.line((x+2,row+1,x+w-3,row+1),fill="#ebd092")
    for _ in range(1150):
        x,y = rng.randrange(5,W-5),rng.randrange(5,H-5)
        if s.layers[9].getpixel((x,y))[3] and abs(x-W//2-river(y-H//2)) > 20:
            paint.line((x,y,x+rng.randrange(1,4),y), fill=rng.choice(("#a0b56a","#c9d68e","#d5d69b")))
    for cx,cy in [(37,100),(68,168),(103,42),(224,98),(188,169),(81,68),(197,70)]:
        for _ in range(27):
            x,y = cx+rng.randrange(-8,9),cy+rng.randrange(-5,6)
            paint.line((x,y,x,y+1),fill="#779553")
            paint.point((x,y), fill=rng.choice(("#f1de9b","#f6dbb3","#c78d80")))
    paths = [[(-91,-52),(-76,-38),(-44,-28),(-18,-26),(38,-26),(84,-29)],
             [(-68,-42),(-61,-4),(-45,22),(-19,48),(-15,77)],
             [(-83,49),(-56,46),(-19,48),(69,48),(82,50)],
             [(44,-66),(43,-34),(56,-13),(74,8),(76,53)],
             [(-48,-26),(-21,-4),(-8,0),(9,5)]]
    for path in paths:
        pts=[(x+W//2,y+H//2) for x,y in path]
        paint.line(pts,fill="#ad9d76",width=7)
        paint.line(pts,fill="#e6cd9b",width=5)
    s.layers[9].putalpha(mask)
    # Pebbles and reed beds follow the waterline on the inside of each bend.
    water = s.draw(3)
    for y in range(19,H-15,5):
        side = -1 if (y//28)%2 else 1
        x = W//2+river(y-H//2)+side*rng.randrange(8,12)
        water.ellipse((x-2,y,x+1,y+1),fill="#bcc5a9")
        if y%4 == 0:
            for z in range(4,7):
                s.draw(z).line((x,y,x+1,y),fill="#739a68")
    s.save("terrain")


if __name__ == "__main__":
    terrain()
    for name in ("residential","market","workshop","park","station","harbor","central_hub","packaging","research","synergy"):
        for level in range(1,6):
            building(name,level).save(f"{name}-{level}")
    for name,pink in (("alder",False),("cherry",True)):
        model = Stack(28,28)
        tree(model,14,14,7,pink=pink)
        model.save(name)
    bridge = Stack(44,16)
    for i in range(21):
        arch = round(3*math.sin(math.pi*i/20))
        bridge.box(i*2,3,2,10,arch,2,HONEY if i%3 else OAK)
        for y in (2,13):
            bridge.box(i*2,y,2,1,arch+5,2,WOOD)
            if i%4 == 0:
                bridge.box(i*2,y,2,2,arch,8,OAK)
    bridge.save("bridge")
    boat = Stack(14,24)
    for z,w in enumerate([2,4,5,5]):
        boat.disc(7,12,w,9,z,WOOD if z != 2 else HONEY)
    boat.disc(7,12,3,7,3,OAK)
    boat.box(3,10,8,2,4,1,CREAM)
    boat.save("skiff")
    pine = Stack(22,22)
    pine.box(10,10,3,3,0,8,WOOD)
    for z in range(5,25):
        r = max(1, int((25-z)*0.42) + (z%6)//3)
        pine.disc(11,11,r,r,z,LEAF)
        pine.disc(10,10,max(1,r-2),max(1,r-2),z,GRASS)
    pine.save("pine")
    lot = Stack()
    for x,y in ((13,17),(37,17),(13,33),(37,33)):
        lot.box(x,y,2,2,0,4,OAK)
    for y in (17,33):
        lot.box(13,y,25,1,2,1,HONEY)
    lot.save("plot")
