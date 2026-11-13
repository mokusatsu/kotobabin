"""Reproducible full-canvas export; no crop, mask, alpha threshold, or painting."""
from pathlib import Path
from PIL import Image
import hashlib
import json
import subprocess

root = Path('public/assets')
out = root / 'originals/production/harbor'
jobs = [(f'city_harbor_s{i}', (1024, 768), (860, 645), (132, 88), 'city_stage') for i in range(1, 6)]
jobs.append(('shop_harbor', (512, 512), (480, 480), (16, 16), 'shop_scene'))

def region_stats(alpha, rect):
    crop = alpha.crop(rect)
    values = list(crop.getdata())
    return {'alpha_max': max(values, default=0), 'nonzero_pixels': sum(v > 0 for v in values), 'opaque_pixels': sum(v >= 128 for v in values)}

def outside_stats(alpha, safe):
    w, h = alpha.size
    rects = [(0, 0, safe[0], h), (safe[2], 0, w, h), (safe[0], 0, safe[2], safe[1]), (safe[0], safe[3], safe[2], h)]
    parts = [region_stats(alpha, r) for r in rects]
    return {'alpha_max': max(p['alpha_max'] for p in parts), 'nonzero_pixels': sum(p['nonzero_pixels'] for p in parts), 'opaque_pixels': sum(p['opaque_pixels'] for p in parts)}

rows = []
for aid, canvas, size, offset, category in jobs:
    assert offset[0] >= 0 and offset[1] >= 0
    assert offset[0] + size[0] <= canvas[0] and offset[1] + size[1] <= canvas[1]
    native = root / 'originals' / f'{aid}.generated.png'
    png = root / 'originals' / f'{aid}.png'
    web = root / category / f'{aid}.webp'
    subprocess.run(['magick', '-size', f'{canvas[0]}x{canvas[1]}', 'canvas:none', '(', str(native), '-resize', f'{size[0]}x{size[1]}', ')', '-geometry', f'+{offset[0]}+{offset[1]}', '-composite', '-depth', '8', 'png32:' + str(png)], check=True)
    subprocess.run(['magick', str(png), '-define', 'webp:lossless=true', '-define', 'webp:alpha-quality=100', str(web)], check=True)
    im = Image.open(web).convert('RGBA')
    p = Image.open(png).convert('RGBA')
    alpha = im.getchannel('A')
    assert p.getchannel('A').tobytes() == alpha.tobytes()
    bg = Image.new('RGBA', im.size, '#F5F1E7')
    assert Image.alpha_composite(bg, p).tobytes() == Image.alpha_composite(bg, im).tobytes()
    district = aid.startswith('city_')
    parent_safe = (32, 32, 992, 736) if district else (32, 32, 480, 480)
    canonical_safe = (64, 48, 960, 736) if district else parent_safe
    source = Image.open(native).convert('RGBA')
    row = {
        'id': aid, 'status': 'candidate_not_final_accepted', 'native_size': source.size,
        'native_alpha_bbox': source.getchannel('A').getbbox(),
        'native_opaque_bbox': source.getchannel('A').point(lambda v: 255 if v >= 128 else 0).getbbox(),
        'output_size': im.size, 'full_canvas_resize': size, 'translate': offset,
        'no_source_canvas_clipping': True, 'alpha_bbox': alpha.getbbox(),
        'opaque_bbox': alpha.point(lambda v: 255 if v >= 128 else 0).getbbox(),
        'outside_parent_safe': outside_stats(alpha, parent_safe),
        'outside_canonical_safe': outside_stats(alpha, canonical_safe),
        'reserved_shop': region_stats(alpha, (64, 440, 352, 736)) if district else None,
        'png_webp_alpha_and_paper_composite_equal': True, 'webp_bytes': web.stat().st_size,
    }
    for key, file in [('native_png', native), ('normalized_png', png), ('runtime', web)]:
        row[key + '_sha256'] = hashlib.sha256(file.read_bytes()).hexdigest()
    rows.append(row)
    print(aid, 'alpha', row['alpha_bbox'], 'opaque', row['opaque_bbox'], 'safe', row['outside_parent_safe'], 'reserved', row['reserved_shop'])
    Image.alpha_composite(bg, im).convert('RGB').save(out / (aid + '.paper.jpg'), quality=95)

(out / 'measurements.json').write_text(json.dumps(rows, indent=2) + '\n')

# Static contact sheets; these do not establish runtime or E2E acceptance.
for width in (132, 96):
    height = width * 3 // 4
    sheet = Image.new('RGB', (width * 6, height * 2), '#F5F1E7')
    for i, row in enumerate(rows):
        image = Image.open(root / 'originals' / (row['id'] + '.png')).convert('RGBA')
        image.thumbnail((width, height), Image.Resampling.LANCZOS)
        tile = Image.new('RGBA', (width, height), '#F5F1E7')
        tile.alpha_composite(image, ((width - image.width) // 2, (height - image.height) // 2))
        tile = tile.convert('RGB')
        sheet.paste(tile, (i * width, 0))
        sheet.paste(tile.convert('L').convert('RGB'), (i * width, height))
    sheet.save(out / f'contact-{width}-color-gray.png')
