"""Build the highland terraces and seaside harbour as horizontal sprite strips."""
import json
import math
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageColor
from generate_riverside_stacks import Stack, building, house, WOOD, HONEY, STONE, LIGHT, CREAM, RED, TEAL

ROOT = Path(__file__).resolve().parents[1]
SITES = json.loads((ROOT / "src/ui/components/stackedTownSites.json").read_text())
W, H = 256, 216


def point(x, y):
    return x + W // 2, y + H // 2


def stream(y):
    return -41 + .62*y + 10*math.sin((y+15)/20)


def coast(y):
    return 46 + .1*y + 17*math.cos((y+51)/23)


def terrain(town):
    high = town == "highland"
    rng = random.Random(890 if high else 435)
    outline = Image.new("1", (W,H))
    ImageDraw.Draw(outline).polygon([(1,62),(12,27),(42,9),(86,3),(178,4),(216,13),
        (240,29),(253,51),(254,132),(239,170),(206,193),(145,210),(63,205),(19,178),(2,132)], fill=1)
    # One height per art pixel. Level ground under a building includes its eaves.
    heights = Image.new("L", (W,H))
    surface = Image.new("RGBA", (W,H))
    palette = {}
    for j in range(H):
        for i in range(W):
            if not outline.getpixel((i,j)):
                continue
            x,y = i-W//2,j-H//2
            if high:
                bank = abs(x-stream(y))
                lake = math.hypot((x-87)*.82, (y-87)*1.6)
                if bank < 6 or lake < 23:
                    z, color = 4, ("#68aeb0" if bank<4 or lake<18 else "#a1c9ad")
                else:
                    altitude = 18 + 6*math.sin(x/34) + 4*math.cos(y/31) - y*.075
                    z = max(8, min(round(altitude/3)*3, int(5+bank*1.9), int(6+(lake-23)*1.3)))
                    color = ("#a7be70","#91ad69","#acc47c","#84a269")[(z//3)%4]
            else:
                shore = coast(y)-x
                if shore < -6:
                    z=4
                    color="#63bbc2" if shore < -12 else "#97d6ca"
                elif shore < 10:
                    z=max(5, min(8, round(6+shore*.19)))
                    color=("#ebd7a0","#f1dfa9","#dfc68c")[int((y+130)/9)%3]
                else:
                    z=min(19,9+int((shore-10)/13)*2)
                    color="#b4c97c" if z>12 else "#cbd190"
                # A stone quay carries the port out into the sheltered bay.
                if (44<=y<=77 and 32<=x<=94) or (74<=y<=84 and 78<=x<=111):
                    z,color=9,("#c9c6a5" if (i//5+j//3)%3 else "#b9b59c")
                reef = ((x-87)/10)**2 + ((y+21)/8)**2
                if reef <= 1:
                    z,color=round(10-4*reef),"#bcb8a1" if reef<0.7 else "#969d94"
            heights.putpixel((i,j),z)
            if color not in palette:
                palette[color] = ImageColor.getcolor(color, 'RGBA')
            surface.putpixel((i,j), palette[color])
    # Flatten the foundation around the surveyed building anchors.
    draw = ImageDraw.Draw(heights)
    for key,(x,y) in SITES[town].items():
        i,j=point(x,y)
        z=heights.getpixel((i,j))
        draw.rounded_rectangle((i-14,j-12,i+14,j+12),5,fill=max(z,9))
        if z<8:
            ImageDraw.Draw(surface).rounded_rectangle((i-14,j-12,i+14,j+12),5,fill="#c8c391")
    art=ImageDraw.Draw(surface)
    for _ in range(1300):
        i,j=rng.randrange(W),rng.randrange(H)
        z=heights.getpixel((i,j))
        if z==4:
            if rng.random()<.38:
                art.line((i,j,i+rng.randint(2,5),j),fill="#b6e3d1")
        elif z>=10:
            art.line((i,j,i+1,j),fill=rng.choice(("#a1b674","#bbca87","#90ab6c")))
    def path(points, dark, light, width):
        pts=[point(*p) for p in points]
        art.line(pts,fill=dark,width=width)
        art.line(pts,fill=light,width=max(1,width-2))
    if high:
        path([(-82,-47),(-51,-31),(-28,-33),(12,-48),(24,-66)],"#a99570","#e6d29f",5)
        path([(-67,1),(-46,8),(-38,22),(-69,44),(-83,59)],"#a99570","#e3cc97",5)
        path([(15,-57),(26,-32),(79,-33),(88,-27)],"#a99570","#e3cb94",5)
        path([(11,-10),(43,-6),(73,14),(88,30),(78,52)],"#a99570","#ecd8a4",5)
        path([(-95,67),(-61,62),(-9,71),(29,67),(65,50),(80,49)],"#776d56","#c0ab81",4)
    else:
        path([(-94,60),(-79,26),(-75,-2),(-59,-26),(-64,-48)],"#b09c6c","#ebd7a1",6)
        path([(-105,-37),(-73,-24),(-23,-24),(12,-36),(37,-42)],"#b09c6c","#ead4a0",5)
        path([(-80,6),(-46,11),(-11,4),(15,18),(27,34),(52,50),(82,61)],"#b09c6c","#ebd7a4",6)
        path([(-91,77),(-56,75),(-26,69),(5,57),(41,57),(75,65)],"#846d56","#c4a77b",4)
        for y in range(-78,39,5):
            x=round(coast(y))+6
            i,j=point(x,y)
            art.line((i,j,i+2,j+1),fill="#edf4cf",width=2)
    result=Stack(W,H)
    for z in range(heights.getextrema()[1]+1):
        layer=Image.new('RGBA',(W,H))
        px,top=layer.load(),surface.load()
        for j in range(H):
            for i in range(W):
                h=heights.getpixel((i,j))
                if not h or h<z: continue
                if h==z: px[i,j]=top[i,j]
                elif h<=4: px[i,j]=(61,143+z*6,160+z*4,255)
                else: px[i,j]=((115,111,86,255),(149,142,103,255),(165,155,117,255),(184,171,129,255))[z//2%4]
        result.layers.append(layer)
    return result


def town_building(town, key, level):
    high=town=="highland"
    if key=="residential" and level<=2:
        s=Stack()
        house(s,12,12,21,17,10,RED,timber=high)
        if level==2:
            house(s,29,23,12,12,7,TEAL,timber=high)
    else:
        s=building(key,level)
    # Local roof tiles, masonry and carpentry share one town-wide palette.
    replacements=dict(zip(RED+TEAL+(CREAM,HONEY),(
        ("#484954","#647180","#a6b0a3","#66493e","#975f47","#cb9264","#d4c49e","#ae8057") if high else
        ("#337375","#56a198","#aad6ba","#465c81","#688db1","#aac8d0","#fbebcc","#dfae77"))))
    colors={ImageColor.getcolor(a,'RGBA'):ImageColor.getcolor(b,'RGBA') for a,b in replacements.items()}
    for layer in s.layers:
        data = layer.get_flattened_data() if hasattr(layer, 'get_flattened_data') else layer.getdata()
        layer.putdata([colors.get(pixel,pixel) for pixel in data])
    if key!="park":
        if high:
            s.box(28,17,3,4,7+level,12+level,STONE)
            s.box(27,16,5,6,18+2*level,2,LIGHT)
        else:
            for x in (11,29):
                s.box(x,33,2,2,0,7,WOOD)
            for x in range(22):
                s.box(10+x,28,1,7,7,2,("#437b83","#fff1ce")[(x//3)%2])
    return s


def granite_peak():
    s=Stack(40,40)
    for z in range(26):
        r=19-z*.62
        x,y=20+z*.12,20-z*.15
        rim=[(x-r,y+2),(x-r*.75,y-r*.72),(x-1,y-r),(x+r*.8,y-r*.53),
             (x+r,y+2),(x+r*.52,y+r*.75),(x-r*.48,y+r*.77)]
        d=s.draw(z)
        d.polygon(rim,fill="#758375" if z<14 else "#a6aaa0")
        d.polygon([rim[0],rim[1],rim[2],(x-1,y+1),rim[-1]],fill="#8e9982" if z<15 else "#c4c6ae")
        if z>20: d.polygon(rim,fill="#d8dbbe" if z<24 else "#ece9ce")
    return s


def harbour_beacon():
    s=Stack(24,24)
    for z in range(27):
        r=7 if z<3 else 5 if z<9 else 4
        s.disc(12,12,r,r,z,STONE if z<3 else "#bb5946" if 10<=z<15 or z>23 else "#f3e4bb")
    for z,r,color in [(27,6,WOOD),(28,5,"#e5ac58"),(29,5,"#f6d590"),(30,5,"#e5ac58"),
                      (31,6,"#496264"),(32,4,"#496264"),(33,2,"#709491")]:
        s.disc(12,12,r,r,z,color)
    return s


if __name__=="__main__":
    for town,sites in SITES.items():
        output=ROOT/"public/assets"/town
        output.mkdir(exist_ok=True)
        terrain(town).save("terrain",output)
        if town=="highland": granite_peak().save("granite-peak",output)
        else: harbour_beacon().save("harbour-beacon",output)
        for key in sites:
            for level in range(1,6):
                town_building(town,key,level).save(f"{key}-{level}",output)
