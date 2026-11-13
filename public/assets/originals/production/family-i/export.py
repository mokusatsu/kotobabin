from pathlib import Path
from PIL import Image
import hashlib, json, subprocess
root=Path(__file__).resolve().parents[5]
production=Path(__file__).resolve().parent
measurements=[]
for native in sorted((root/'public/assets/originals').glob('stamp_i??.generated.png')):
 aid=native.name.split('.')[0]
 native=root/f'public/assets/originals/{aid}.generated.png'
 png=root/f'public/assets/originals/{aid}.png'
 webp=root/f'public/assets/achievement_stamp/{aid}.webp'
 subprocess.run(['magick','-size','512x512','canvas:none','(',str(native),'-resize','448x448',')','-geometry','+32+32','-composite','-depth','8','png32:'+str(png)],check=True)
 subprocess.run(['magick',str(png),'-define','webp:lossless=true','-define','webp:alpha-quality=100',str(webp)],check=True)
 n=Image.open(native).convert('RGBA');p=Image.open(png).convert('RGBA');w=Image.open(webp).convert('RGBA')
 alpha=w.getchannel('A');bbox=alpha.getbbox()
 assert p.size==w.size==(512,512)
 assert p.getchannel('A').tobytes()==alpha.tobytes()
 bg=Image.new('RGBA',p.size,'#F5F1E7')
 assert Image.alpha_composite(bg,p).tobytes()==Image.alpha_composite(bg,w).tobytes()
 assert bbox and bbox[0]>=32 and bbox[1]>=32 and bbox[2]<=480 and bbox[3]<=480
 measurements.append({'id':aid,'native_size':list(n.size),'native_alpha_bbox':list(n.getchannel('A').getbbox()),'output_size':list(w.size),'alpha_bbox':list(bbox),'outside_safe_alpha_max':0,'anchor':[256,256],'bytes':webp.stat().st_size,'native_sha256':hashlib.sha256(native.read_bytes()).hexdigest(),'runtime_sha256':hashlib.sha256(webp.read_bytes()).hexdigest(),'png_webp_alpha_and_paper_composite_equal':True})
(production/'measurements.json').write_text(json.dumps(measurements,indent=2)+'\n')
print(json.dumps(measurements,indent=2))

# Minimum 72px art, color and grayscale; no frame substitute.
from PIL import ImageOps, ImageDraw
board=Image.new('RGB',(600, max(1,len(measurements))*110),'#F5F1E7')
for row,item in enumerate(measurements):
 art=Image.open(root/f"public/assets/achievement_stamp/{item['id']}.webp").convert('RGBA').resize((72,72),Image.Resampling.LANCZOS)
 composite=art
 for col,variant in enumerate([composite,ImageOps.grayscale(composite).convert('RGBA')]):
  if col: variant.putalpha(composite.getchannel('A'))
  board.paste(variant,(140+col*150,row*110+10),variant)
 ImageDraw.Draw(board).text((10,row*110+45),item['id'],fill='#263D35')
board.save(production/'minimum-size-verification.png')
