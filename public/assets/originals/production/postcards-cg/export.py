from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
import hashlib, json

root = Path(__file__).resolve().parents[5]
production = Path(__file__).resolve().parent
measurements = []
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for letter in 'cdefg':
    aid = 'postcard_' + letter
    native = root / f'public/assets/originals/{aid}.generated.png'
    if not native.exists():
        continue
    png = root / f'public/assets/originals/{aid}.png'
    webp = root / f'public/assets/postcard/{aid}.webp'
    n = Image.open(native)
    assert n.mode == 'RGB', 'Opaque RGB native required'
    p = n.resize((1600, 1000), Image.Resampling.LANCZOS)
    p.save(png)
    p.save(webp, lossless=True, exact=True, method=6)
    w = Image.open(webp).convert('RGB')
    assert w.size == p.size == (1600, 1000)
    assert w.tobytes() == p.tobytes()
    sx, sy = 1600/n.width, 1000/n.height
    measurements.append({'id':aid, 'native_size':list(n.size), 'output_size':list(p.size), 'native_mode':n.mode, 'png_mode':p.mode, 'runtime_mode':Image.open(webp).mode, 'opaque':True, 'anchor':[800,500], 'safe_rect':[80,50,1520,950], 'transform':{'method':'Pillow LANCZOS entire native canvas to 1600x1000 RGB; no crop, trim, mask, repaint or padding', 'scale_x':sx, 'scale_y':sy, 'aspect_correction_percent':(sx/sy-1)*100}, 'bytes':{'native':native.stat().st_size,'png':png.stat().st_size,'webp':webp.stat().st_size}, 'sha256':{'native':sha(native),'png':sha(png),'webp':sha(webp)}, 'lossless_webp_all_rgb_pixels_equal':True})
(production/'measurements.json').write_text(json.dumps(measurements,indent=2)+'\n')
# 240x160 comparison cells contain 240x150 art without aspect distortion;
# separate specification minimum is 160x100.
for width,height,cell_h,name in [(240,150,160,'minimum-240x160'),(160,100,110,'minimum-spec-160x100')]:
    board=Image.new('RGB',(2*width+130,len(measurements)*(cell_h+20)), '#F5F1E7')
    for row,m in enumerate(measurements):
        art=Image.open(root/f"public/assets/originals/{m['id']}.png").resize((width,height),Image.Resampling.LANCZOS)
        y=row*(cell_h+20)
        ImageDraw.Draw(board).text((5,y+height//2),m['id'],fill='#203D36')
        board.paste(art,(115,y+5))
        board.paste(ImageOps.grayscale(art).convert('RGB'),(120+width,y+5))
    board.save(production/f'{name}-color-gray.png')
print(f'{len(measurements)} RGB postcards exported; geometry and full-pixel lossless checks passed.')
