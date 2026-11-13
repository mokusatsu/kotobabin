from pathlib import Path
from PIL import Image, ImageDraw, ImageOps
import json,hashlib,csv,sys

ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[4]
layout=json.loads((ROOT/'canonical-layout.json').read_text())
points=[(p['x'],p['y']) for p in layout['shared_water_landward_boundary']]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def water(p):r,g,b=p;return b>1.06*r and g>1.03*r
def expected(y):
    for (x0,y0),(x1,y1) in zip(points,points[1:]):
        if y0<=y<=y1:return x0+(x1-x0)*(y-y0)/(y1-y0)
    return points[-1][0]
def edges(im):
    # Color classification is diagnostic ONLY. No mask is applied to artwork.
    answer=[]
    for y in range(2000):
        row=im.crop((2000,y,3200,y+1)).tobytes();run=0;edge=None
        for i in range(1200):
            r,g,b=row[i*3:i*3+3]
            run=run+1 if b>1.06*r and g>1.03*r else 0
            if run==3:edge=(2000+i-2)/2;break
        answer.append(edge)
    return answer
def measure(im):
    es=edges(im)
    samples=[]
    for x,y in points:
        yy=min(1999,round(y*2));v=es[yy]
        samples.append(dict(canonical=[x,y],observed_x=v,delta_map_px=None if v is None else v-x))
    deltas=[e-expected(y/2) for y,e in enumerate(es) if e is not None]
    dry=im.crop((2316,1520,2444,1616))
    corridor=Image.new('1',im.size);d=ImageDraw.Draw(corridor)
    for route in layout['routes']:
        ps=[(x*2,y*2) for x,y in route['points']];d.line(ps,fill=1,width=96)
        for x,y in ps:d.ellipse((x-48,y-48,x+48,y+48),fill=1)
    return dict(shoreline_samples=samples,all_source_rows_delta_range_map_px=[min(deltas),max(deltas)],all_source_rows_max_abs_delta_map_px=max(abs(v) for v in deltas),harbor_water_pixels=sum(water(p) for p in dry.getdata()),harbor_pixel_count=128*96,harbor_min_dry_clearance_map_px=min(es[y]-1222 for y in range(1520,1617) if es[y] is not None),route_corridor_water_pixels=sum(water(p) for p,m in zip(im.getdata(),corridor.getdata()) if m),route_corridor_pixel_count=sum(corridor.getdata())),es


only=set(sys.argv[1:])
sources=[]
if not only:
 for asset in ['seaside','highland']:
  for suffix in ['png','webp']:
   sources.append((f'baseline-{asset}-{suffix}',ROOT/'history'/f'terrain_{asset}.{suffix}'))
for native in sorted((ROOT/'native').glob('*.png')):
 if only and native.stem not in only:continue
 src=Image.open(native);out=src.convert('RGB').resize((3200,2000),Image.Resampling.LANCZOS)
 png=ROOT/'candidates'/f'{native.stem}.png';lossless=ROOT/'candidates'/f'{native.stem}.lossless.webp';runtime=ROOT/'candidates'/f'{native.stem}.q92.webp'
 out.save(png);out.save(lossless,lossless=True,exact=True);out.save(runtime,quality=92,method=6)
 assert Image.open(lossless).convert('RGB').tobytes()==out.tobytes()
 sources.extend([(native.stem,png),(native.stem+'-q92',runtime)])
replaced={n for n,_ in sources}
rows=[r for r in json.loads((ROOT/'measurements.json').read_text()) if r['id'] not in replaced] if only and (ROOT/'measurements.json').exists() else []
for name,path in sources:
 im=Image.open(path).convert('RGB');assert im.size==(3200,2000)
 stats,es=measure(im)
 small=im.resize((800,500),Image.Resampling.LANCZOS);small.save(ROOT/f'{name}.minimum.png');ImageOps.grayscale(small).save(ROOT/f'{name}.minimum-gray.png')
 overlay=small.copy();d=ImageDraw.Draw(overlay);d.line([(x/2,y/2) for x,y in points],fill='#b34e39',width=2);d.rectangle((579,380,611,404),outline='#b34e39',width=2)
 for route in layout['routes']:d.line([(x/2,y/2) for x,y in route['points']],fill='#b58a3c',width=1)
 overlay.save(ROOT/f'{name}.coordinate-review.png')
 with (ROOT/f'{name}.all-source-rows.csv').open('w') as f:
  w=csv.writer(f);w.writerow(['logical_y','canonical_x','observed_water_x','delta_map_px'])
  for y,e in enumerate(es):w.writerow([y/2,expected(y/2),e,None if e is None else e-expected(y/2)])
 row=dict(id=name,path=str(path.relative_to(ROOT)),size=im.size,mode='RGB',bytes=path.stat().st_size,sha256=sha(path),diagnostics=stats)
 n=ROOT/'native'/f'{name}.png'
 if n.exists():
  raw=Image.open(n);row.update(native_size=raw.size,native_mode=raw.mode,native_sha256=sha(n),whole_canvas_resize=[3200,2000],scale=[3200/raw.width,2000/raw.height],crop=False,lossless_rgb_equal=True)
 rows.append(row)
(ROOT/'measurements.json').write_text(json.dumps(rows,indent=2)+'\n')
