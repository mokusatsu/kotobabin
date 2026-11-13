from PIL import Image, ImageDraw, ImageOps
from pathlib import Path
import hashlib, json, math

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT.parents[2]
REPO = ASSETS.parents[1]
layout = json.loads((REPO/'spec/initial/data/city_catalog.json').read_text())['map_layout']
points = [(p['x'],p['y']) for p in layout['shared_water_landward_boundary']]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def water(rgb):
    r,g,b=rgb[:3]
    return b>1.06*r and g>1.03*r
def edge(im,y):
    y=min(im.height-1,round(y*2))
    for x in range(2000,3198):
        if all(water(im.getpixel((x+k,y))) for k in range(3)):return x/2
    return None
def expected(y):
    for (x0,y0),(x1,y1) in zip(points,points[1:]):
        if y0<=y<=y1:return x0+(x1-x0)*(y-y0)/(y1-y0)
    return points[-1][0]
def diagnostics(im):
    rows=[dict(y=y,canonical_x=x,observed_first_three_water_x=edge(im,y),delta_map_px=None if edge(im,y) is None else edge(im,y)-x) for x,y in points]
    dry=[water(im.getpixel((x,y))) for x in range(2316,2444) for y in range(1520,1616)]
    # Diagnostic corridor bitmap only; NEVER applied to any artwork pixel.
    corridor=Image.new('1',im.size);d=ImageDraw.Draw(corridor)
    for route in layout['routes']:
        path=route.get('polyline',route.get('points',route.get('path',[])))
        if path and isinstance(path[0],dict):path=[(p['x'],p['y']) for p in path]
        if path:
            d.line([(p[0]*2,p[1]*2) for p in path],fill=1,width=96)
            for x,y in path:d.ellipse((x*2-48,y*2-48,x*2+48,y*2+48),fill=1)
    blocked=sum(1 for p,v in zip(im.getdata(),corridor.getdata()) if v and water(p))
    observed=[edge(im,y) for y in range(1000)]
    deltas=[x-expected(y) for y,x in enumerate(observed) if x is not None]
    margin=min(edge(im,y)-1222 for y in range(760,809))
    return dict(shoreline_samples=rows,all_integer_rows_delta_range_map_px=[min(deltas),max(deltas)],harbor_unloading_water_pixels=sum(dry),harbor_unloading_pixel_count=len(dry),harbor_right_edge_to_first_water_min_map_px=margin,route_corridor_water_pixels=blocked,route_corridor_pixels=sum(corridor.getdata()))

measurements=[]
for asset in ['terrain_seaside','terrain_highland']:
    native=ROOT/'native'/f'{asset}.png'
    src=Image.open(native)
    # Full-frame normalization only; no crop/mask/threshold/color replacement.
    out=src.convert('RGB').resize((3200,2000),Image.Resampling.LANCZOS)
    png=ASSETS/'originals'/f'{asset}.png'; webp=ASSETS/'terrain'/f'{asset}.webp'
    out.save(png);out.save(webp,lossless=True,exact=True)
    decoded=Image.open(webp).convert('RGB');assert decoded.tobytes()==out.tobytes()
    preview=out.resize((800,500),Image.Resampling.LANCZOS)
    preview.save(ROOT/f'{asset}.minimum.png');ImageOps.grayscale(preview).save(ROOT/f'{asset}.minimum-gray.png')
    measurements.append(dict(id=asset,native_size=src.size,native_mode=src.mode,output_size=out.size,output_mode=out.mode,transparent=False,source_to_output_scale=[3200/src.width,2000/src.height],aspect_ratio_rounding_difference_percent=(src.width/src.height/1.6-1)*100,logical_canvas=[1600,1000],anchor=[1600,1000],safe_rect=[0,0,3200,2000],crop=False,sha256={str(p.relative_to(ASSETS)):sha(p) for p in [native,png,webp]},rgb_lossless_roundtrip_equal=True,diagnostics=diagnostics(out)))
(ROOT/'measurements.json').write_text(json.dumps(measurements,indent=2)+'\n')
