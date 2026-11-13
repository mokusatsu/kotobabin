from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
import hashlib,json,subprocess,cairosvg
root=Path(__file__).resolve().parents[5]
production=Path(__file__).resolve().parent
requests=json.loads((production/'requests.json').read_text())
records=[]
for request in requests:
 aid=request['id'];size=tuple(request['size']);transparent=request['transparent_background']
 native=root/f'public/assets/originals/{aid}.generated.png'
 png=root/f'public/assets/originals/{aid}.normalized.png'
 master=root/f'public/assets/originals/{aid}.png'
 webp=root/f'public/assets/milestone_raster/{aid}.webp';webp.parent.mkdir(exist_ok=True)
 original=Image.open(native)
 if transparent:
  inner=(448,448);offset=(32,32);out=Image.new('RGBA',size,(0,0,0,0));resized=ImageOps.contain(original.convert('RGBA'),inner,Image.Resampling.LANCZOS);out.alpha_composite(resized,offset)
 else:
  inner=(1440,900) if 'postcard' in aid else (1200,400)
  resized=ImageOps.contain(original.convert('RGB'),inner,Image.Resampling.LANCZOS);offset=((size[0]-resized.width)//2,(size[1]-resized.height)//2)
  out=Image.new('RGB',size,'#F5F1E7');out.paste(resized,offset)
 out.save(png);master.write_bytes(png.read_bytes())
 subprocess.run(['magick',str(png),'-define','webp:lossless=true','-define','webp:alpha-quality=100',str(webp)],check=True)
 decoded=Image.open(webp).convert('RGBA');rgba=out.convert('RGBA');assert decoded.size==size
 assert decoded.getchannel('A').tobytes()==rgba.getchannel('A').tobytes()
 paper=Image.new('RGBA',size,'#F5F1E7');assert Image.alpha_composite(paper,decoded).tobytes()==Image.alpha_composite(paper,rgba).tobytes()
 bbox=rgba.getchannel('A').getbbox()
 if transparent:assert bbox[0]>=32 and bbox[1]>=32 and bbox[2]<=480 and bbox[3]<=480
 else:assert decoded.getchannel('A').getextrema()==(255,255)
 records.append({'id':aid,'native_size':list(original.size),'native_mode':original.mode,'normalized_size':list(size),'normalized_mode':out.mode,'alpha_bbox':list(bbox),'anchor':[256,256] if transparent else ([800,500] if 'postcard' in aid else [800,200]),'transform':{'method':'full-canvas aspect-preserving contain; no crop, mask, threshold or paint edits','source_canvas':list(original.size),'resized_canvas':list(resized.size),'translate':list(offset),'scale_x':resized.width/original.width,'scale_y':resized.height/original.height,'padding':'transparent' if transparent else '#F5F1E7'},'png_webp_alpha_and_paper_composite_equal':True,'runtime_bytes':webp.stat().st_size,'sha256':{x.name:hashlib.sha256(x.read_bytes()).hexdigest() for x in [native,png,webp]}})
(production/'measurements.json').write_text(json.dumps(records,indent=2)+'\n')
(production/'native-file-hashes.json').write_text(json.dumps({x.name:hashlib.sha256(x.read_bytes()).hexdigest() for x in production.glob('*.attempt-*.png')},indent=2)+'\n')
# Authoritative opaque-paper inspection, color/grayscale minimum size and canonical memorial frame.
cairosvg.svg2png(url=str(root/'public/assets/shared_frame/memorial_frame.svg'),write_to=str(production/'memorial-frame-render.png'))
board=Image.new('RGB',(900,600),'#F5F1E7');draw=ImageDraw.Draw(board)
for row,r in enumerate(records):
 aid=r['id'];art=Image.open(root/f'public/assets/milestone_raster/{aid}.webp').convert('RGBA')
 paper=Image.new('RGBA',art.size,'#F5F1E7');paper.alpha_composite(art);paper.convert('RGB').save(production/(aid+'.paper-inspection.png'))
 target=(160,100) if 'postcard' in aid else ((320,80) if 'evening' in aid else (72,72))
 small=paper.resize(target,Image.Resampling.LANCZOS).convert('RGB')
 board.paste(small,(250,row*145+25));board.paste(ImageOps.grayscale(small).convert('RGB'),(580,row*145+25));draw.text((6,row*145+10),aid,fill='#263D35')
board.save(production/'minimum-size-verification.png')
frames=Image.new('RGB',(800,470),'#F5F1E7');draw=ImageDraw.Draw(frames)
for col,r in enumerate([x for x in records if x['normalized_mode']=='RGBA']):
 art=Image.open(root/f"public/assets/milestone_raster/{r['id']}.webp").convert('RGBA')
 composite=Image.new('RGBA',(640,640),'#F5F1E7');composite.alpha_composite(art,(64,64));composite.alpha_composite(Image.open(production/'memorial-frame-render.png').convert('RGBA'))
 composite.convert('RGB').save(production/(r['id']+'.canonical-frame.png'))
 frames.paste(composite.resize((320,320),Image.Resampling.LANCZOS).convert('RGB'),(col*400+30,30))
 frames.paste(composite.resize((90,90),Image.Resampling.LANCZOS).convert('RGB'),(col*400+145,365))
frames.save(production/'canonical-frame-verification.png')
print(json.dumps(records,indent=2))
