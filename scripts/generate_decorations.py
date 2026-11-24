"""Draw ground-up sprite slices for the three towns' landscape furnishings."""
from pathlib import Path
from generate_riverside_stacks import Stack, WOOD, OAK, HONEY, STONE, LIGHT, LEAF, GRASS, SUN, CREAM

OUT = Path(__file__).resolve().parents[1] / "public/assets/decorations"
TEAL, MINT, BRICK, RED, PINK = "#37747a", "#95c7ae", "#9e5746", "#db7357", "#f6b6ac"
GOLD, WHITE, IRON, BARK = "#f4be67", "#fff1d2", "#545e58", "#806047"


def legs(s, x, y, w, d, h):
    for xx in (x, x+w-2):
        for yy in (y, y+d-2):
            s.box(xx, yy, 2, 2, 0, h, WOOD)


def slats(s, x, y, w, count, z):
    for i in range(count):
        s.box(x, y + i*3, w, 2, z, 2, (HONEY, OAK)[i % 2])


def basket(s, x, y, w, d):
    s.box(x,y,w,d,0,5,OAK)
    for i in range(x+1,x+w-1,3):
        s.box(i,y,1,d,0,5,HONEY)
    for z in (1,4):
        s.box(x,y,w,d,z,1,WOOD)
    s.box(x+2,y+2,w-4,d-4,5,1,BARK)


def model(name):
    s = Stack(24,24)
    if name == "flowerbed":
        s.box(1,5,22,14,0,3,BRICK)
        s.box(2,6,20,12,3,1,HONEY)
        s.box(3,7,18,10,3,2,LEAF)
        for i,(x,y) in enumerate([(5,9),(11,9),(17,9),(7,14),(14,14),(19,14)]):
            s.disc(x,y,2,2,5,GRASS)
            s.disc(x,y,2,2,6+i%2,(PINK,RED,GOLD)[i%3])
            s.disc(x,y,1,1,7+i%2,WHITE)
    elif name in ("bench","picnic"):
        legs(s,3,7,18,10,9 if name == "picnic" else 6)
        if name == "bench":
            slats(s,2,8,20,3,5)
            s.box(3,6,2,2,5,7,WOOD)
            s.box(19,6,2,2,5,7,WOOD)
            for z in (8,11):
                s.box(2,6,20,2,z,2,HONEY)
        else:
            slats(s,2,7,20,4,9)
            for y in (2,20):
                s.box(3,y,18,3,4,2,HONEY)
                for x in (5,17):
                    s.box(x,min(y,9),2,abs(y-9)+2,3,2,WOOD)
            s.box(8,8,5,9,11,1,RED)
    elif name == "lantern":
        s.box(8,8,8,8,0,2,STONE)
        s.box(10,10,4,4,2,12,IRON)
        s.box(8,8,8,8,14,2,IRON)
        s.box(9,9,6,6,16,6,GOLD)
        s.box(10,9,2,2,16,6,WHITE)
        for x in (8,14):
            for y in (8,14):
                s.box(x,y,2,2,16,6,IRON)
        for z in range(4):
            s.box(7+z,7+z,10-2*z,10-2*z,22+z,1,TEAL)
    elif name == "sign":
        s.box(10,10,4,4,0,18,WOOD)
        for z,x,dx in [(10,4,-1),(16,5,1)]:
            s.box(x,8,15,3,z,4,HONEY)
            s.box(x if dx<0 else x+15,8,3,3,z+1,2,OAK)
            s.box(x+4,8,7,1,z+2,1,CREAM)
    elif name == "lilies":
        for x,y,r in [(7,9,5),(16,15,5),(16,5,3),(5,18,3)]:
            s.draw(0).pieslice((x-r,y-r,x+r,y+r),25,330,LEAF)
            s.draw(1).pieslice((x-r,y-r,x+r,y+r),25,330,GRASS)
        for x,y in [(7,9),(16,15)]:
            for dx,dy in [(-2,0),(2,0),(0,-2),(0,2)]:
                s.disc(x+dx,y+dy,2,1,2,PINK)
            s.disc(x,y,1,1,3,GOLD)
    elif name == "duckhouse":
        slats(s,2,3,20,6,0)
        s.box(6,6,12,11,2,8,HONEY)
        s.box(10,15,4,2,3,5,WOOD)
        for z in range(6):
            s.box(4,4+z,16,15-2*z,10+z,1,(TEAL,MINT)[z==5])
    elif name in ("fishtrap","creel"):
        if name == "fishtrap":
            for z,rx in enumerate([4,6,8,8,8,7,5,3]):
                s.disc(12,12,rx,max(2,rx-2),z,WOOD if z in (1,5) else HONEY)
            s.disc(12,12,2,1,7,WOOD)
        else:
            basket(s,2,8,12,11)
            basket(s,14,4,8,10)
            for x,y in [(5,11),(9,14),(17,7)]:
                s.disc(x,y,3,1,6,MINT)
    elif name in ("willow","reeds","pine"):
        if name=="pine":
            s.box(10,10,4,4,0,6,BARK)
            for z in range(16):
                r=max(1,(15-z)//2 + (1 if z%5==0 else 0))
                s.disc(12,12,r,r,5+z,LEAF if z%5<2 else GRASS)
        elif name=="willow":
            s.box(10,10,4,4,0,14,BARK)
            for x,y,h in [(7,12,11),(14,9,14),(13,16,10),(8,8,12),(16,14,11)]:
                for z in range(h-4,h+7):
                    r=min(5,z-h+5,h+8-z)
                    s.disc(x,y,r,r,z,LEAF if z<h else GRASS if z<h+4 else SUN)
        else:
            for x,y,h in [(5,11,8),(9,16,11),(12,8,9),(15,13,13),(19,10,7)]:
                s.box(x,y,2,2,0,h,LEAF)
                s.box(x,y,2,2,h,4,BARK)
                for z in range(5):
                    s.box(x-z//2,y+1,2,2,z,1,GRASS)
    elif name == "mooring":
        for x,y,h in [(7,10,8),(15,12,11)]:
            for z in range(h):
                s.disc(x,y,3,3,z,CREAM if z in (4,5) else HONEY if z==h-1 else WOOD)
        s.box(7,11,9,2,4,2,HONEY)
    elif name == "cairn":
        for x,y,r,z,h,c in [(12,12,9,0,3,STONE),(10,12,7,3,4,LIGHT),(12,12,5,7,3,STONE),(11,12,3,10,3,HONEY)]:
            for k in range(h):
                s.disc(x,y,r-(k==h-1),max(2,r-2),z+k,c)
    elif name == "trough":
        s.box(2,6,20,12,0,5,STONE)
        s.box(3,7,18,10,5,1,LIGHT)
        s.box(5,9,14,6,5,1,TEAL)
        s.box(4,9,3,3,6,6,WOOD)
        s.box(4,9,7,3,11,2,HONEY)
        s.box(9,10,2,2,6,5,MINT)
    elif name in ("pennant","bunting"):
        for x in ([6] if name=="pennant" else [2,20]):
            s.box(x,11,2,2,0,18,OAK)
        if name=="pennant":
            for z in range(7):
                s.box(8,11,5+z,2,11+z,1,RED if z<5 else GOLD)
        else:
            for x in range(4,20):
                z=16- min(x-4,19-x)//3
                s.box(x,11,1,2,z,1,WOOD)
                s.box(x,11,1,2,z-2-x%3,2+x%3,(TEAL,RED,GOLD)[(x//4)%3])
    elif name == "logs":
        for y,z in [(6,0),(14,0),(10,5)]:
            for h,depth in enumerate((3,5,7,7,5,3)):
                s.box(3,y-depth//2,18,depth,z+h,1,OAK)
                s.box(2,y-depth//2,2,depth,z+h,1,HONEY)
    elif name == "parasol":
        s.box(11,11,2,2,0,14,WOOD)
        for z,r in enumerate((11,10,8,6,4,2)):
            for sector in range(8):
                s.draw(14+z).pieslice((12-r,12-r,12+r,12+r),45*sector,45*(sector+1), RED if sector%2 else WHITE)
    elif name == "lifering":
        s.box(9,9,5,5,0,16,OAK)
        for z in range(15):
            for x in range(15):
                radius=(x-7)**2+(z-7)**2
                if 12<=radius<=53:
                    s.box(5+x,13,1,3,2+z,1,WHITE if abs(x-7)<3 or abs(z-7)<3 else RED)
    elif name == "deckchair":
        legs(s,6,3,12,17,4)
        for x in (6,16):
            s.box(x,3,2,2,4,7,WOOD)
        for y in range(3,21):
            h=4+max(0,10-y)
            s.box(5,y,14,1,h,2,OAK)
            for x in range(7,17):
                s.box(x,y,1,1,h+1,1,TEAL if x%5<3 else WHITE)
    elif name == "buoy":
        for z,r in enumerate((4,6,7,7,6,5,4,3,2,2,2,2)):
            s.disc(12,12,r,r,z,WHITE if 3<=z<=5 else RED)
        s.disc(12,12,2,2,12,GOLD)
    else:
        raise ValueError(name)
    return s


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name in ("flowerbed bench lantern sign lilies duckhouse fishtrap reeds willow mooring "
                 "cairn trough pine pennant logs picnic parasol lifering deckchair buoy creel bunting").split():
        model(name).save(name, OUT)
