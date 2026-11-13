"""Native SVG raster QA and minimum-size color/gray diagnostic sheets.
Run using an environment with CairoSVG and Pillow; does not alter artwork.
"""
from pathlib import Path
from math import ceil, floor
import json,hashlib,xml.etree.ElementTree as ET
from io import BytesIO
import cairosvg
from PIL import Image,ImageDraw,ImageOps

BASE=Path('public');OUT=BASE/'assets/originals/production/svg-completion'
ASSETS=json.loads((OUT/'briefs.json').read_text());manifest=json.load(open('spec/initial/data/visual_resource_manifest.json'))
PREVIEW=OUT/'preview';PREVIEW.mkdir(exist_ok=True)
rows=[];small=[];large=[]
for a in ASSETS:
 p=BASE/a['runtime_exports'][0];svg=p.read_bytes();xml=ET.fromstring(svg)
 assert xml.attrib['viewBox']=='0 0 '+' '.join(str(x) for x in a['source_size'])
 assert not any(e.tag.split('}')[-1] in ('text','image','foreignObject','script','animate','animateTransform','set') for e in xml.iter())
 assert b'data:' not in svg and b'http://' not in svg.replace(b'http://www.w3.org/2000/svg',b'')
 w,h=a['source_size'];prof=manifest['profiles'][a['profile_id']]
 safe=prof['safe_rect'];safe=[ceil(w*.08),ceil(h*.08),floor(w*.92),floor(h*.92)] if isinstance(safe,str) else safe
 im=Image.open(BytesIO(cairosvg.svg2png(bytestring=svg))).convert('RGBA');alpha=im.getchannel('A')
 assert im.size==(w,h)
 rects=[(0,0,safe[0],h),(safe[2],0,w,h),(safe[0],0,safe[2],safe[1]),(safe[0],safe[3],safe[2],h)]
 outside=max(alpha.crop(r).getextrema()[1] for r in rects)
 inner=[64,64,576,576] if a['id']=='memorial_frame' else prof.get('inner_window_rect')
 inner_alpha=alpha.crop(tuple(inner)).getextrema()[1] if inner else None
 row={'id':a['id'],'path':a['runtime_exports'][0],'size':[w,h],'alpha_bbox':alpha.getbbox(),'safe_rect':safe,'outside_safe_alpha_max':outside,'inner_window':inner,'inner_window_alpha_max':inner_alpha,'bytes':len(svg),'sha256':hashlib.sha256(svg).hexdigest(),'runtime_acceptance':'pending'}
 rows.append(row)
 if w==h and a['category']!='shop_overlay' and a['id']!='memorial_frame':
  small.append((a,p))
 else:large.append((a,p))
for page in range((len(small)+11)//12):
 sheet=Image.new('RGB',(1200,500),'#F5F1E7');d=ImageDraw.Draw(sheet)
 for k,(a,p) in enumerate(small[page*12:(page+1)*12]):
  x=(k%6)*200;y=(k//6)*250
  d.text((x+8,y+8),a['id'],fill='#24594F')
  for j,size in enumerate([16,24,32,48]):
   img=Image.open(BytesIO(cairosvg.svg2png(url=str(p),output_width=size,output_height=size))).convert('RGBA')
   sheet.paste(img,(x+14+j*46,y+52),img);d.text((x+14+j*46,y+110),str(size),fill='#24594F')
  img=Image.open(BytesIO(cairosvg.svg2png(url=str(p),output_width=112,output_height=112))).convert('RGBA');sheet.paste(img,(x+35,y+132),img)
 sheet.save(PREVIEW/f'motifs-{page+1}.png');ImageOps.grayscale(sheet).save(PREVIEW/f'motifs-{page+1}-gray.png')
for page in range((len(large)+5)//6):
 sheet=Image.new('RGB',(1200,740),'#F5F1E7');d=ImageDraw.Draw(sheet)
 for k,(a,p) in enumerate(large[page*6:(page+1)*6]):
  x=(k%3)*400;y=(k//3)*370;w,h=a['source_size'];tw=360;th=round(h*tw/w)
  if th>280:th=280;tw=round(w*th/h)
  img=Image.open(BytesIO(cairosvg.svg2png(url=str(p),output_width=tw,output_height=th))).convert('RGBA');sheet.paste(img,(x+15,y+35),img);d.text((x+12,y+8),a['id'],fill='#24594F')
 sheet.save(PREVIEW/f'large-{page+1}.png');ImageOps.grayscale(sheet).save(PREVIEW/f'large-{page+1}-gray.png')
(OUT/'measurements.json').write_text(json.dumps(rows,indent=2)+'\n')
assert len({r['sha256'] for r in rows})==52
for r in rows:
 if r['outside_safe_alpha_max'] or r['inner_window_alpha_max']:print('GAP',r['id'],r['alpha_bbox'],r['outside_safe_alpha_max'],r['inner_window_alpha_max'])
print('Inspected',len(rows),'unique SVGs. Candidate-only; runtime/compositing not covered.')
