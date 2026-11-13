"""Full-canvas uniform normalization only; no cropping or alpha editing."""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageOps,ImageDraw
ROOT=Path(__file__).resolve().parents[5]
HERE=Path(__file__).resolve().parent
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
rows=[]
files=sorted(HERE.glob('*.native.png'))
sheet=Image.new('RGB',(768,len(files)*90),'#F5F1E7')
draw=ImageDraw.Draw(sheet)
for i,p in enumerate(files):
    name=p.name.replace('.native.png','')
    im=Image.open(p).convert('RGBA'); box=im.getbbox()
    # Scale full native canvas, then translate; all native pixels remain represented.
    scale=min(220/(box[2]-box[0]),140/(box[3]-box[1]))
    size=(round(im.width*scale),round(im.height*scale))
    scaled=im.resize(size,Image.Resampling.LANCZOS)
    dx=round(128-(box[0]+box[2])/2*scale)
    dy=round(160-box[3]*scale)
    out=Image.new('RGBA',(256,192));out.alpha_composite(scaled,(dx,dy))
    png=ROOT/'public/assets/originals'/f'{name}.png'; webp=ROOT/'public/assets/vehicle'/f'{name}.webp'
    out.save(png);out.save(webp,lossless=True,exact=True)
    decoded=Image.open(webp).convert('RGBA')
    assert decoded.tobytes()==out.tobytes()
    b=out.getbbox(); safe=16<=b[0] and 16<=b[1] and b[2]<=240 and b[3]<=176
    rows.append(dict(id=name,native_size=im.size,native_bbox=box,native_sha256=sha(p),scale=scale,resized_full_canvas=size,translation=[dx,dy],export_size=out.size,export_bbox=b,safe_rect_pass=safe,anchor=[128,160],png_sha256=sha(png),webp_sha256=sha(webp),lossless_rgba_equal=True,alpha_extrema=out.getchannel('A').getextrema()))
    draw.text((8,i*90+5),name,fill='#203D36')
    for j,(w,h) in enumerate([(256,192),(48,36),(24,18)]):
        thumb=out.resize((w,h),Image.Resampling.LANCZOS)
        if j==0:thumb=out.resize((96,72),Image.Resampling.LANCZOS)
        sheet.paste(thumb,(230+j*160,i*90+8),thumb)
        gray=ImageOps.grayscale(thumb).convert('RGBA');gray.putalpha(thumb.getchannel('A'))
        sheet.paste(gray,(310+j*160,i*90+8),gray)
(HERE/'measurements.json').write_text(json.dumps(rows,indent=2)+'\n')
sheet.save(HERE/'minimum-size-color-gray.png')
