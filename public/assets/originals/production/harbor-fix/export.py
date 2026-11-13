from PIL import Image, ImageOps, ImageDraw
from pathlib import Path
import hashlib,json,shutil

ROOT=Path(__file__).resolve().parent
ASSETS=ROOT.parents[2]
SIZE=(608,688)
OFFSETS={1:(352,44)}
POINTS=[(512,640),(730,650),(904,716)]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
rows=[]
for stage,offset in OFFSETS.items():
    asset=f'city_harbor_s{stage}'
    native=ROOT/'native'/f'{asset}.png'
    src=Image.open(native).convert('RGBA')
    out=Image.new('RGBA',(1024,768))
    # Complete native canvas; no crop, alpha edits, masks or thresholding.
    out.paste(src.resize(SIZE,Image.Resampling.LANCZOS),offset)
    png=ASSETS/'originals'/f'{asset}.png';generated=ASSETS/'originals'/f'{asset}.generated.png';webp=ASSETS/'city_stage'/f'{asset}.webp'
    out.save(png);shutil.copyfile(native,generated);out.save(webp,lossless=True,exact=True)
    dec=Image.open(webp).convert('RGBA');assert dec.getchannel('A').tobytes()==out.getchannel('A').tobytes()
    paper=Image.new('RGBA',out.size,'#fffdf7');paper.alpha_composite(out)
    decpaper=Image.new('RGBA',out.size,'#fffdf7');decpaper.alpha_composite(dec);assert decpaper.tobytes()==paper.tobytes()
    a=out.getchannel('A');b=a.getbbox()
    outside=[a.crop(r).getextrema()[1] for r in [(0,0,64,768),(960,0,1024,768),(0,0,1024,48),(0,736,1024,768)]]
    reserved=a.crop((64,440,352,736)).getextrema()[1]
    contacts={f'{x},{y}':a.getpixel((x,y)) for x,y in POINTS}
    assert max(outside)==0 and reserved==0,(asset,outside,reserved)
    assert min(contacts.values())>=128,(asset,contacts)
    paper.convert('RGB').save(ROOT/f'{asset}.paper.png')
    overlay=paper.convert('RGB');d=ImageDraw.Draw(overlay);d.rectangle((64,48,959,735),outline='#b34e39',width=2);d.rectangle((64,440,351,735),outline='#b58a3c',width=2)
    for x,y in POINTS:d.ellipse((x-5,y-5,x+5,y+5),outline='#b34e39',width=2)
    overlay.save(ROOT/f'{asset}.coordinates.png')
    for w in [264,132,96]:
        small=paper.convert('RGB').resize((w,round(w*.75)),Image.Resampling.LANCZOS)
        small.save(ROOT/f'{asset}.{w}-color.png');ImageOps.grayscale(small).save(ROOT/f'{asset}.{w}-gray.png')
    # Static artwork composition proof only, not live browser E2E.
    terrain=Image.open(ASSETS/'originals/terrain_riverside.png').convert('RGBA').resize((1600,1000),Image.Resampling.LANCZOS)
    terrain.alpha_composite(out.resize((264,198),Image.Resampling.LANCZOS),(1058,570))
    terrain.convert('RGB').resize((800,500),Image.Resampling.LANCZOS).save(ROOT/f'{asset}.riverside-composite.png')
    step=a.crop((480,600,540,670)).point(lambda v:255 if v>=128 else 0).getbbox()
    rows.append(dict(id=asset,native_size=src.size,output_size=out.size,output_mode=out.mode,whole_canvas_resize=SIZE,offset=offset,scale=[SIZE[0]/src.width,SIZE[1]/src.height],anchor=[512,640],safe_rect=[64,48,960,736],reserved_shop_rect=[64,440,352,736],all_alpha_bbox=b,opaque_bbox=a.point(lambda v:255 if v>=128 else 0).getbbox(),outside_safe_max_alpha=max(outside),reserved_shop_max_alpha=reserved,contact_alphas=contacts,front_step_region=[480,600,540,670],front_step_opaque_bbox_local=step,tip25x25_max_alpha=a.crop((892,704,917,729)).getextrema()[1],sha256={str(p.relative_to(ASSETS)):sha(p) for p in [native,png,generated,webp]},png_webp_alpha_and_paper_equal=True))
(ROOT/'measurements.json').write_text(json.dumps(rows,indent=2)+'\n')
