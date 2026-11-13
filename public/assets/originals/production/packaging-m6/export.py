from pathlib import Path
from PIL import Image, ImageOps
import hashlib, json

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT.parents[2]
TRANSFORMS = {1: ((1075, 717), (62, 41)), 2: ((998, 666), (101, 50)), 3: ((1044, 696), (78, 49)), 4: ((1060, 707), (70, 41))}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

rows = []
for tier, (size, offset) in TRANSFORMS.items():
    asset = f'equipment_packaging_{tier}'
    native = ROOT / 'native' / f'{asset}.png'
    source = Image.open(native).convert('RGBA')
    normalized = Image.new('RGBA', (1200, 800), (0, 0, 0, 0))
    # Whole native canvas only: no crop, threshold, masking or alpha editing.
    normalized.paste(source.resize(size, Image.Resampling.LANCZOS), offset)
    png = ASSETS / 'originals' / f'{asset}.png'
    webp = ASSETS / 'equipment_scene' / f'{asset}.webp'
    normalized.save(png)
    normalized.save(webp, lossless=True, exact=True)
    decoded = Image.open(webp).convert('RGBA')
    assert decoded.getchannel('A').tobytes() == normalized.getchannel('A').tobytes()
    paper = Image.new('RGBA', normalized.size, '#fffdf7')
    paper.alpha_composite(normalized)
    paper_webp = Image.new('RGBA', normalized.size, '#fffdf7')
    paper_webp.alpha_composite(decoded)
    assert paper.tobytes() == paper_webp.tobytes()
    preview = paper.convert('RGB').resize((240, 160), Image.Resampling.LANCZOS)
    preview.save(ROOT / f'{asset}.minimum-color.png')
    ImageOps.grayscale(preview).save(ROOT / f'{asset}.minimum-gray.png')
    paper.convert('RGB').save(ROOT / f'{asset}.paper.png')
    dark = Image.new('RGBA', normalized.size, '#203d36')
    dark.alpha_composite(normalized)
    dark.convert('RGB').resize((240,160), Image.Resampling.LANCZOS).save(ROOT / f'{asset}.minimum-dark.png')
    alpha = normalized.getchannel('A')
    bbox = alpha.getbbox()
    assert bbox[0] >= 60 and bbox[1] >= 40 and bbox[2] <= 1140 and bbox[3] <= 760, bbox
    rows.append(dict(id=asset,native_size=source.size,canvas=[1200,800],mode='RGBA',anchor=[600,680],safe_rect=[60,40,1140,760],resize=list(size),offset=list(offset),alpha_bbox=bbox,opaque_bbox=alpha.point(lambda a:255 if a>=128 else 0).getbbox(),alpha_extrema=alpha.getextrema(),sha256={str(p.relative_to(ASSETS)):sha(p) for p in [native,png,webp]},lossless_alpha_and_paper_equal=True))
(ROOT/'measurements.json').write_text(json.dumps(rows,indent=2)+'\n')
