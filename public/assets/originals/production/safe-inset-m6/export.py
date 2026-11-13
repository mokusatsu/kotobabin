from pathlib import Path
from PIL import Image,ImageChops,ImageDraw,ImageOps
import json,hashlib,shutil
root=Path(__file__).resolve().parents[5]
source=Path('/workspace/work/m5-art-integration')
out=Path(__file__).resolve().parent
factors={'city_plot_empty':.898,'city_residential_s4':.993,'city_market_s2':.899,'city_market_s5':.993,'city_workshop_s3':.907,'city_workshop_s4':.890,'city_park_s4':.993,'shop_harbor':.928}
records=[]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=json.loads((source/'spec/initial/data/visual_resource_manifest.json').read_text())
for aid,s in factors.items():
 spec=next(a for a in manifest['assets'] if a['id']==aid)
 old=out/(aid+'.previous.png');oldw=out/(aid+'.previous.webp')
 if not old.exists():shutil.copyfile(source/f'public/assets/originals/{aid}.png',old)
 if not oldw.exists():shutil.copyfile(source/'public'/spec['runtime_exports'][0],oldw)
 native=source/f'public/assets/originals/{aid}.generated.png';historynative=out/(aid+'.native.generated.png')
 if native.exists() and not historynative.exists():shutil.copyfile(native,historynative)
 im=Image.open(old).convert('RGBA');anchor=(256,448) if aid=='shop_harbor' else (512,640);safe=(32,32,480,480) if aid=='shop_harbor' else (64,48,960,736)
 ax,ay=anchor;tx=(1-s)*ax;ty=(1-s)*ay
 # Full canvas affine: forward (sx+tx,sy+ty), inverse supplied to Pillow.
 # Premultiplied interpolation avoids hidden RGB bleeding; no thresholds/masks/crop.
 result=im.convert('RGBa').transform(im.size,Image.Transform.AFFINE,(1/s,0,-tx/s,0,1/s,-ty/s),Image.Resampling.BICUBIC,fillcolor=(0,0,0,0)).convert('RGBA')
 png=root/f'public/assets/originals/{aid}.png';webp=root/'public'/spec['runtime_exports'][0];result.save(png);result.save(webp,lossless=True,quality=100,method=4)
 decoded=Image.open(webp).convert('RGBA');a=result.getchannel('A');mask=Image.new('L',im.size,255);ImageDraw.Draw(mask).rectangle((safe[0],safe[1],safe[2]-1,safe[3]-1),fill=0);spill=ImageChops.multiply(a,mask)
 assert spill.getextrema()[1]==0,(aid,a.getbbox())
 assert a.tobytes()==decoded.getchannel('A').tobytes()
 bg=Image.new('RGBA',im.size,'#F5F1E7');assert Image.alpha_composite(bg,result).tobytes()==Image.alpha_composite(bg,decoded).tobytes()
 corners=[(tx,ty),(s*im.width+tx,ty),(tx,s*im.height+ty),(s*im.width+tx,s*im.height+ty)]
 assert all(0<=x<=im.width and 0<=y<=im.height for x,y in corners)
 assert abs(s*ax+tx-ax)<1e-9 and abs(s*ay+ty-ay)<1e-9
 records.append({'id':aid,'size':im.size,'anchor':anchor,'safe_rect':safe,'scale':s,'forward_matrix':[s,0,tx,0,s,ty],'inverse_matrix':[1/s,0,-tx/s,0,1/s,-ty/s],'transformed_full_canvas_corners':corners,'anchor_maps_to_itself':True,'rounding':'Pillow BICUBIC inverse affine at native output grid, premultiplied RGBa, standard8bit quantization','crop':False,'mask':False,'threshold':False,'before_alpha_bbox':im.getchannel('A').getbbox(),'after_alpha_bbox':a.getbbox(),'outside_safe_alpha_max':spill.getextrema()[1],'previous_png_sha256':sha(old),'previous_webp_sha256':sha(oldw),'native_available':historynative.exists(),'native_sha256':sha(historynative) if historynative.exists() else None,'png_sha256':sha(png),'webp_sha256':sha(webp),'png_webp_alpha_and_paper_equal':True})
(out/'measurements.json').write_text(json.dumps(records,indent=2)+'\n')
board=Image.new('RGB',(800,len(records)*140),'#F5F1E7')
for row,r in enumerate(records):
 for col,p in enumerate([out/(r['id']+'.previous.png'),root/f"public/assets/originals/{r['id']}.png"]):
  image=Image.open(p).convert('RGBA');image.thumbnail((180,110));paper=Image.new('RGBA',image.size,'#F5F1E7');image=Image.alpha_composite(paper,image).convert('RGB');board.paste(image,(col*200+10,row*140+20));board.paste(ImageOps.grayscale(image).convert('RGB'),(col*200+410,row*140+20))
 ImageDraw.Draw(board).text((10,row*140+3),r['id']+' before / after / gray before / after',fill='#263D35')
board.save(out/'before-after-paper.png')
print(json.dumps(records,indent=2))

# Actual contract minimum-size before/after inspection.
minimum=Image.new('RGB',(500,len(records)*105),'#F5F1E7')
for row,r in enumerate(records):
 sz=(24,24) if r['id']=='shop_harbor' else (96,72)
 for col,path in enumerate([out/(r['id']+'.previous.png'),root/f"public/assets/originals/{r['id']}.png"]):
  im=Image.open(path).convert('RGBA');bg=Image.new('RGBA',im.size,'#F5F1E7');im=Image.alpha_composite(bg,im).convert('RGB').resize(sz,Image.Resampling.LANCZOS)
  minimum.paste(im,(10+col*120,row*105+20));minimum.paste(ImageOps.grayscale(im).convert('RGB'),(260+col*120,row*105+20))
 ImageDraw.Draw(minimum).text((5,row*105+3),r['id']+' min before/after, gray before/after',fill='black')
 if r['id'].startswith('city_'):
  alpha=Image.open(root/f"public/assets/originals/{r['id']}.png").getchannel('A').crop((64,440,352,736));r['after_reserved_shop_alpha_max']=alpha.getextrema()[1]
(out/'measurements.json').write_text(json.dumps(records,indent=2)+'\n')
minimum.save(out/'minimum-before-after.png')
