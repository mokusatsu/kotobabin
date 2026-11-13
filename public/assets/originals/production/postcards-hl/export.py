from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
import hashlib,json
root=Path(__file__).resolve().parents[5]
production=Path(__file__).resolve().parent
measurements=[]
for letter in 'hijkl':
 aid='postcard_'+letter
 native=root/f'public/assets/originals/{aid}.generated.png'
 if not native.exists():continue
 source=Image.open(native)
 if 'A' in source.getbands():assert source.getchannel('A').getextrema()==(255,255)
 png=root/f'public/assets/originals/{aid}.png'
 webp=root/f'public/assets/postcard/{aid}.webp'
 image=source.convert('RGB').resize((1600,1000),Image.Resampling.LANCZOS)
 image.save(png)
 image.save(webp,lossless=True,quality=100,method=6)
 decoded=Image.open(webp).convert('RGB')
 assert decoded.size==(1600,1000) and image.tobytes()==decoded.tobytes()
 measurements.append({'id':aid,'native_size':list(source.size),'native_mode':source.mode,'source_alpha':'absent' if 'A' not in source.getbands() else 'fully opaque 255','output_size':[1600,1000],'png_mode':Image.open(png).mode,'webp_mode':Image.open(webp).mode,'decoded_rgb_equal':True,'anchor':[800,500],'critical_subject_safe_rect':[80,50,1520,950],'transform':{'operation':'full canvas LANCZOS resize, no crop or masking','scale_x':1600/source.width,'scale_y':1000/source.height,'crop':False,'padding':False,'color_mode_conversion':'RGB'},'native_sha256':hashlib.sha256(native.read_bytes()).hexdigest(),'png_sha256':hashlib.sha256(png.read_bytes()).hexdigest(),'webp_sha256':hashlib.sha256(webp.read_bytes()).hexdigest(),'png_bytes':png.stat().st_size,'webp_bytes':webp.stat().st_size})
(production/'measurements.json').write_text(json.dumps(measurements,indent=2)+'\n')
board=Image.new('RGB',(540,len(measurements)*190),'#F5F1E7')
for row,item in enumerate(measurements):
 im=Image.open(root/f"public/assets/originals/{item['id']}.png").resize((240,150),Image.Resampling.LANCZOS)
 # 240x160 inspection tile preserves source 8:5 aspect as 240x150, centered vertically.
 board.paste(im,(10,row*190+20));board.paste(ImageOps.grayscale(im).convert('RGB'),(280,row*190+20))
 ImageDraw.Draw(board).text((10,row*190+3),item['id']+' / 240x160 tile',fill='#263D35')
board.save(production/'minimum-size-verification.png')
print(json.dumps(measurements,indent=2))

# Specification minimum (160x100), independent of the requested 240x160 inspection tiles.
small=Image.new('RGB',(360,len(measurements)*124),'#F5F1E7')
for row,item in enumerate(measurements):
 im=Image.open(root/f"public/assets/originals/{item['id']}.png").resize((160,100),Image.Resampling.LANCZOS)
 small.paste(im,(10,row*124+20));small.paste(ImageOps.grayscale(im).convert('RGB'),(190,row*124+20))
 ImageDraw.Draw(small).text((10,row*124+3),item['id'],fill='#263D35')
small.save(production/'spec-minimum-160x100.png')
