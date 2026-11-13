from pathlib import Path
from PIL import Image
import subprocess,json
jobs=[('city_market_s2','acf01b7c-5136-4991-bfa3-0c0a9e0e3083',(1024,768),(1004,753),(0,11),'city_stage'),('city_market_s3','9bc84d37-5560-43ff-aa29-eb58db7c7c87',(1024,768),(956,717),(24,50),'city_stage'),('city_market_s4','5894c50e-6d42-45d8-ac69-adecaae9d15e',(1024,768),(956,717),(24,50),'city_stage'),('city_market_s5','ad32713d-6d81-4d28-814c-9f830577f403',(1024,768),(956,717),(24,50),'city_stage'),('shop_market','51d30f09-2070-4518-b92d-295ad4a91c9d',(512,512),(480,480),(32,12),'shop_scene')]
Path('work/market-growth').mkdir(parents=True,exist_ok=True)
metrics=[]
for aid,gid,canvas,size,offset,category in jobs:
 src=Path(f'public/assets/originals/{aid}.generated.png');png=Path(f'work/market-growth/{aid}.png');out=Path(f'work/market-growth/{aid}.webp')
 subprocess.run(['magick','-size',f'{canvas[0]}x{canvas[1]}','canvas:none','(',str(src),'-resize',f'{size[0]}x{size[1]}',')','-geometry',f'+{offset[0]}+{offset[1]}','-composite','-depth','8','png32:'+str(png)],check=True)
 subprocess.run(['magick',str(png),'-define','webp:lossless=true','-define','webp:alpha-quality=100',str(out)],check=True)
 im=Image.open(out).convert('RGBA');a=im.getchannel('A');opaque=a.point(lambda v:255 if v>=128 else 0).getbbox();safe=(64,48,960,736) if canvas[0]==1024 else (32,32,480,480)
 outside=[a.crop((0,0,safe[0],canvas[1])),a.crop((safe[2],0,canvas[0],canvas[1])),a.crop((safe[0],0,safe[2],safe[1])),a.crop((safe[0],safe[3],safe[2],canvas[1]))]
 r={'id':aid,'native':list(Image.open(src).size),'output':list(im.size),'resize':size,'translate':offset,'alpha_bbox':a.getbbox(),'opaque_bbox':opaque,'outside_safe_alpha_max':max(b.getextrema()[1] for b in outside),'reserved_shop_alpha_max':a.crop((64,440,352,736)).getextrema()[1] if canvas[0]==1024 else None,'bytes':out.stat().st_size}
 old=Image.open(png).convert('RGBA');assert old.getchannel('A').tobytes()==a.tobytes();bg=Image.new('RGBA',im.size,'#F5F1E7');assert Image.alpha_composite(bg,old).tobytes()==Image.alpha_composite(bg,im).tobytes();r['png_webp_alpha_and_visible_equal']=True;metrics.append(r);print(json.dumps(r))
Path('work/market-growth/measurements.json').write_text(json.dumps(metrics,indent=2)+'\n')
