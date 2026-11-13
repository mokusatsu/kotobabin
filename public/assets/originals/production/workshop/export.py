from pathlib import Path
from PIL import Image
import subprocess,json,hashlib
root=Path('public/assets')
jobs=[(f'city_workshop_s{i}',(1024,768),(819,614),(140,144 if i==5 else 145),'city_stage') for i in range(1,6)]
jobs.append(('shop_workshop',(512,512),(480,480),(24,28),'shop_scene'))
rows=[]
for aid,canvas,size,offset,category in jobs:
 native=root/'originals'/f'{aid}.generated.png'
 png=root/'originals'/f'{aid}.png'
 web=root/category/f'{aid}.webp'
 subprocess.run(['magick','-size',f'{canvas[0]}x{canvas[1]}','canvas:none','(',str(native),'-resize',f'{size[0]}x{size[1]}',')','-geometry',f'+{offset[0]}+{offset[1]}','-composite','-depth','8','png32:'+str(png)],check=True)
 subprocess.run(['magick',str(png),'-define','webp:lossless=true','-define','webp:alpha-quality=100',str(web)],check=True)
 im=Image.open(web).convert('RGBA');a=im.getchannel('A');p=Image.open(png).convert('RGBA')
 safe=(32,32,480,480) if aid=='shop_workshop' else (64,48,960,736)
 outside=[(0,0,safe[0],canvas[1]),(safe[2],0,canvas[0],canvas[1]),(safe[0],0,safe[2],safe[1]),(safe[0],safe[3],safe[2],canvas[1])]
 assert p.getchannel('A').tobytes()==a.tobytes()
 bg=Image.new('RGBA',im.size,'#F5F1E7')
 assert Image.alpha_composite(bg,p).tobytes()==Image.alpha_composite(bg,im).tobytes()
 row={'id':aid,'native':list(Image.open(native).size),'output':list(im.size),'resize':size,'translate':offset,'alpha_bbox':a.getbbox(),'opaque_bbox':a.point(lambda v:255 if v>=128 else 0).getbbox(),'outside_safe_alpha_max':max(a.crop(q).getextrema()[1] for q in outside),'reserved_shop_alpha_max':None if aid=='shop_workshop' else a.crop((64,440,352,736)).getextrema()[1],'bytes':web.stat().st_size,'png_webp_alpha_and_visible_equal':True}
 for key,f in [('native_png',native),('normalized_png',png),('runtime',web)]:row[key+'_sha256']=hashlib.sha256(f.read_bytes()).hexdigest()
 rows.append(row)
Path('public/assets/originals/production/workshop/measurements.json').write_text(json.dumps(rows,indent=2)+'\n')
for r in rows:print(r['id'],r['alpha_bbox'],r['opaque_bbox'],r['outside_safe_alpha_max'],r['reserved_shop_alpha_max'],r['bytes'])
