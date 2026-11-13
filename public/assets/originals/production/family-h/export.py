from pathlib import Path
from PIL import Image, ImageDraw, ImageOps
import json,subprocess,shutil,hashlib
from io import BytesIO
import cairosvg
b=Path('public/assets');d=b/'originals/production/family-h'
r=json.loads((d/'requests.json').read_text());out=[]
extra=d/'requests-additional.json'
if extra.exists():r['attempts'].extend(json.loads(extra.read_text())['attempts'])
for item in r['attempts']:
 if not item['selected_id']:continue
 aid=item['selected_id'];native=b/'originals'/f'{aid}.generated.png';png=b/'originals'/f'{aid}.png';web=b/'achievement_stamp'/f'{aid}.webp'
 subprocess.run(['magick','-size','512x512','canvas:none','(',str(native),'-resize','448x448',')','-geometry','+32+32','-composite','-strip','-depth','8','png32:'+str(png)],check=True)
 subprocess.run(['magick',str(png),'-define','webp:lossless=true','-define','webp:alpha-quality=100',str(web)],check=True)
 im=Image.open(web).convert('RGBA');a=im.getchannel('A');p=Image.open(png).convert('RGBA');box=a.getbbox()
 assert im.size==(512,512) and box[0]>=32 and box[1]>=32 and box[2]<=480 and box[3]<=480
 assert p.getchannel('A').tobytes()==a.tobytes()
 bg=Image.new('RGBA',im.size,'#F5F1E7');assert Image.alpha_composite(bg,p).tobytes()==Image.alpha_composite(bg,im).tobytes()
 row={'id':aid,'native_size':list(Image.open(native).size),'output':[512,512],'anchor':[256,256],'resize':[448,448],'translate':[32,32],'alpha_bbox':box,'outside_safe_alpha_max':0,'bytes':web.stat().st_size,'png_webp_alpha_and_visible_equal':True}
 for k,f in [('native',native),('png',png),('runtime',web)]:row[k+'_sha256']=hashlib.sha256(f.read_bytes()).hexdigest()
 out.append(row)
out.sort(key=lambda x:x['id']);(d/'measurements.json').write_text(json.dumps(out,indent=2)+'\n')
preview=d/'preview';preview.mkdir(exist_ok=True)
frame=Image.open(BytesIO(cairosvg.svg2png(url=str(b/'shared_frame/stamp_frame.svg')))).convert('RGBA')
sheet=Image.new('RGB',(len(out)*185+20,380),'#F5F1E7');draw=ImageDraw.Draw(sheet)
for i,row in enumerate(out):
 aid=row['id'];im=Image.open(b/'achievement_stamp'/f'{aid}.webp').convert('RGBA');f=Image.new('RGBA',(640,640));f.alpha_composite(im,(64,64));f.alpha_composite(frame)
 x=10+i*185;draw.text((x,8),aid,fill='#24594F')
 for y,size in [(30,160),(225,90)]:
  thumb=f.resize((size,size),Image.Resampling.LANCZOS);sheet.paste(thumb,(x,y),thumb)
draw.text((10,355),'160/90 frame: 128/72 art. QA only.',fill='#24594F')
sheet.save(preview/'min-size.png');ImageOps.grayscale(sheet).save(preview/'min-size-gray.png')
for row in out:print(row['id'],row['alpha_bbox'],row['bytes'])

