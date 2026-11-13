"""Reproduce canonical-size station candidates without clipping/masking any source pixels.

All five district generations share ONE full-canvas scale and translation. Native
images are never trimmed to their alpha box, repositioned per-stage, or cleaned
with alpha thresholds. The native originals remain byte-for-byte unchanged.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[5]
HERE = Path(__file__).resolve().parent
IDS = [f'city_station_s{i}' for i in range(1, 6)] + ['shop_station']

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def maximum_outside(alpha, safe):
    w, h = alpha.size
    parts = [alpha.crop((0,0,safe[0],h)), alpha.crop((safe[2],0,w,h)),
             alpha.crop((safe[0],0,safe[2],safe[1])), alpha.crop((safe[0],safe[3],safe[2],h))]
    return max((p.getextrema()[1] for p in parts if p.width and p.height), default=0)

rows = []
for aid in IDS:
    district = aid.startswith('city_')
    canvas = (1024,768) if district else (512,512)
    scaled = (896,672) if district else (432,432)
    offset = (64,64) if district else (48,63)
    safe = (64,48,960,736) if district else (32,32,480,480)
    source = ROOT / 'public/assets/originals' / f'{aid}.generated.png'
    master = ROOT / 'public/assets/originals' / f'{aid}.png'
    runtime = ROOT / 'public/assets' / ('city_stage' if district else 'shop_scene') / f'{aid}.webp'
    runtime.parent.mkdir(parents=True,exist_ok=True)
    assert offset[0] >= 0 and offset[1] >= 0
    assert offset[0]+scaled[0] <= canvas[0] and offset[1]+scaled[1] <= canvas[1]
    subprocess.run(['magick','-size',f'{canvas[0]}x{canvas[1]}','canvas:none','(',str(source),'-resize',f'{scaled[0]}x{scaled[1]}',')',
                    '-geometry',f'+{offset[0]}+{offset[1]}','-composite','-depth','8','-define','png:exclude-chunks=date,time','png32:'+str(master)],check=True)
    subprocess.run(['magick',str(master),'-define','webp:lossless=true','-define','webp:alpha-quality=100',str(runtime)],check=True)
    original = Image.open(source)
    image = Image.open(master).convert('RGBA')
    decoded = Image.open(runtime).convert('RGBA')
    alpha = image.getchannel('A')
    opaque = alpha.point(lambda value:255 if value >= 128 else 0)
    reserved = alpha.crop((64,440,352,736)) if district else None
    reserved_opaque = opaque.crop((64,440,352,736)) if district else None
    native_alpha = original.convert('RGBA').getchannel('A')
    visible_equal = all(Image.alpha_composite(Image.new('RGBA',canvas,color),image).tobytes()
                        == Image.alpha_composite(Image.new('RGBA',canvas,color),decoded).tobytes()
                        for color in ['#F5F1E7','#203D36','#FFFFFF'])
    row = {'id':aid,'candidateOnly':True,'nativeFile':str(source.relative_to(ROOT)),'nativeSize':list(original.size),
           'nativeMode':original.mode,'nativeBitDepth':source.read_bytes()[24], 'nativeAlphaBBox':native_alpha.getbbox(),
           'masterFile':str(master.relative_to(ROOT)),'runtimeFile':str(runtime.relative_to(ROOT)),
           'outputSize':list(image.size),'outputMode':Image.open(master).mode,'outputBitDepth':master.read_bytes()[24],
           'fullCanvasResize':list(scaled),'translate':list(offset),'aspectRatioPreserved':original.width*scaled[1] == original.height*scaled[0],
           'sourceCanvasEntirelyInsideExport':True,'geometryClipped':False,'alphaMaskOrThresholdAppliedToExport':False,
           'nominalProfileAnchor':[512,640] if district else [256,448],
           'alphaBBox':alpha.getbbox(),'opaqueAlpha128BBox':opaque.getbbox(),
           'opaqueBottomRow':opaque.getbbox()[3]-1 if opaque.getbbox() else None,
           'safeRect':list(safe),'outsideSafeAlphaMax':maximum_outside(alpha,safe),
           'outsideRequested32MarginAlphaMax':maximum_outside(alpha,(32,32,992,736)) if district else maximum_outside(alpha,safe),
           'reservedShopAlphaMax':reserved.getextrema()[1] if reserved else None,
           'reservedShopNonzeroPixels':sum(reserved.histogram()[1:]) if reserved else None,
           'reservedShopOpaquePixels':sum(reserved_opaque.histogram()[1:]) if reserved_opaque else None,
           'pngWebpAlphaByteEqual':alpha.tobytes()==decoded.getchannel('A').tobytes(),
           'pngWebpVisibleCompositeEqual':visible_equal,'runtimeBytes':runtime.stat().st_size,
           'nativeSHA256':sha(source),'masterSHA256':sha(master),'runtimeSHA256':sha(runtime)}
    assert row['pngWebpAlphaByteEqual'] and row['pngWebpVisibleCompositeEqual']
    row['strictStaticAlphaPass'] = row['outsideSafeAlphaMax']==0 and (not district or row['reservedShopAlphaMax']==0)
    rows.append(row)
HERE.joinpath('measurements.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
# Contact sheets are diagnostic renderings, not replacements for any runtime art.
for width in [132,96]:
    cell_w, cell_h = 240, 210
    sheet = Image.new('RGB',(cell_w*6,cell_h*2),'#F5F1E7')
    draw = ImageDraw.Draw(sheet)
    for i,row in enumerate(rows):
        aid=row['id']; source=Image.open(ROOT/row['runtimeFile']).convert('RGBA')
        target=(width,width*3//4) if aid.startswith('city_') else (64 if width==132 else 24,)*2
        thumb=source.resize(target,Image.Resampling.LANCZOS)
        for line,color in enumerate(['#F5F1E7','#203D36']):
            x=i*cell_w+(cell_w-target[0])//2;y=line*cell_h+45
            draw.rectangle((i*cell_w,line*cell_h,(i+1)*cell_w,(line+1)*cell_h),fill=color)
            sheet.paste(thumb,(x,y),thumb)
            draw.text((i*cell_w+8,line*cell_h+10),aid,fill='#203D36' if line==0 else '#FFFFFF')
    sheet.save(HERE/f'review-{width}px.png')
    sheet.convert('L').save(HERE/f'review-{width}px-grayscale.png')
print(json.dumps(rows,ensure_ascii=False,indent=2))
