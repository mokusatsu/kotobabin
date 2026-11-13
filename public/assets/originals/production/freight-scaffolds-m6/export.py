"""Preserve native bytes; normalize complete canvases without alpha editing."""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageOps,ImageDraw
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[4]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
measurements=[]
sheet=Image.new('RGB',(1000,650),'#F5F1E7');draw=ImageDraw.Draw(sheet)
for i,p in enumerate(sorted(HERE.glob('*.native.png'))):
 name=p.name.replace('.native.png','');im=Image.open(p).convert('RGBA');b=im.getchannel('A').getbbox()
 if name=='city_freight_terminal':
  size=(512,384);anchor=(256,320);safe=(24,24,488,360);scale=min(440/(b[2]-b[0]),280/(b[3]-b[1]));dx=round(256-(b[0]+b[2])/2*scale);dy=round(330-b[3]*scale);category='city_shared';minimum=(32,24);standard=(64,48)
 else:
  size=(1024,768);anchor=(512,640);safe=(64,48,960,736);scale=580/(b[2]-b[0]);dx=round(364-b[0]*scale);dy=round(680-b[3]*scale);category='construction';minimum=(96,72);standard=(132,99)
 resized=(round(im.width*scale),round(im.height*scale));scaled=im.resize(resized,Image.Resampling.LANCZOS)
 assert dx>=0 and dy>=0 and dx+resized[0]<=size[0] and dy+resized[1]<=size[1], 'full canvas must fit'
 out=Image.new('RGBA',size);out.alpha_composite(scaled,(dx,dy))
 png=ROOT/'public/assets/originals'/f'{name}.png';webp=ROOT/'public/assets'/category/f'{name}.webp';webp.parent.mkdir(parents=True,exist_ok=True)
 out.save(png);out.save(webp,lossless=True,exact=True);assert Image.open(webp).convert('RGBA').tobytes()==out.tobytes()
 bb=out.getchannel('A').getbbox();safe_pass=safe[0]<=bb[0] and safe[1]<=bb[1] and bb[2]<=safe[2] and bb[3]<=safe[3]
 reserved=None
 if name.startswith('scaffold'):
  reserved=out.getchannel('A').crop((64,440,352,736)).getextrema()[1];assert reserved==0
 assert safe_pass
 measurements.append(dict(id=name,native_sha256=sha(p),native_size=im.size,native_alpha_bbox=b,scale=scale,translation=[dx,dy],resized_full_canvas=resized,export_size=size,alpha_bbox=bb,anchor=anchor,safe_rect=safe,safe_rect_pass=safe_pass,reserved_shop_alpha_max=reserved,png_sha256=sha(png),webp_sha256=sha(webp),lossless_decoded_rgba_equal=True,alpha_extrema=out.getchannel('A').getextrema()))
 y=i*210;draw.text((10,y+10),name,fill='#203D36')
 for j,sz in enumerate([standard,minimum]):
  thumb=out.resize(sz,Image.Resampling.LANCZOS);sheet.paste(thumb,(180+j*190,y+30),thumb)
  gray=ImageOps.grayscale(thumb).convert('RGBA');gray.putalpha(thumb.getchannel('A'));sheet.paste(gray,(280+j*190,y+30),gray)
 if name.startswith('scaffold'):
  stage=Image.open(ROOT/'public/assets/city_stage'/('city_residential_s3.webp' if name.endswith('medium') else 'city_residential_s5.webp')).convert('RGBA')
  stage.alpha_composite(out)
  for j,sz in enumerate([(264,198),(96,72)]):
   thumb=stage.resize(sz,Image.Resampling.LANCZOS);sheet.paste(thumb,(620+j*275,y+5),thumb)
  stagebg=Image.new('RGBA',size,'#F5F1E7');stagebg.alpha_composite(stage);stagebg.convert('RGB').save(HERE/(name+'-district-composite.png'))
 paper=Image.new('RGBA',size,'#F5F1E7');paper.alpha_composite(out);paper.convert('RGB').save(HERE/(name+'-paper.png'))
(HERE/'measurements.json').write_text(json.dumps(measurements,indent=2)+'\n')
sheet.save(HERE/'minimum-color-gray-composites.png')
