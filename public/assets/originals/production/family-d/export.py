"""Full-canvas export and static checks for D-family generated candidates."""
from pathlib import Path
from PIL import Image
import hashlib
import json
import subprocess

root = Path('public/assets')
out = root / 'originals/production/family-d'
(root / 'achievement_stamp').mkdir(exist_ok=True)
rows = []
for number in range(1, 7):
    aid = f'stamp_d{number:02}'
    native = root / 'originals' / (aid + '.generated.png')
    png = root / 'originals' / (aid + '.png')
    web = root / 'achievement_stamp' / (aid + '.webp')
    source = Image.open(native).convert('RGBA')
    assert source.width == source.height
    subprocess.run(['magick', '-size', '512x512', 'canvas:none', '(', str(native), '-resize', '448x448', ')', '-geometry', '+32+32', '-composite', '-depth', '8', 'png32:' + str(png)], check=True)
    subprocess.run(['magick', str(png), '-define', 'webp:lossless=true', '-define', 'webp:alpha-quality=100', str(web)], check=True)
    im = Image.open(web).convert('RGBA')
    original = Image.open(png).convert('RGBA')
    alpha = im.getchannel('A')
    outside = [(0, 0, 32, 512), (480, 0, 512, 512), (32, 0, 480, 32), (32, 480, 480, 512)]
    safe_max = max(alpha.crop(rect).getextrema()[1] for rect in outside)
    assert safe_max == 0
    assert alpha.tobytes() == original.getchannel('A').tobytes()
    background = Image.new('RGBA', im.size, '#F5F1E7')
    paper = Image.alpha_composite(background, im)
    assert paper.tobytes() == Image.alpha_composite(background, original).tobytes()
    row = {'id': aid, 'status': 'candidate_not_final_accepted', 'native_size': source.size,
           'output_size': im.size, 'anchor': [256, 256], 'safe_rect': [32, 32, 480, 480],
           'native_alpha_bbox': source.getchannel('A').getbbox(),
           'full_canvas_resize': [448, 448], 'translate': [32, 32],
           'no_source_canvas_clipping': True, 'alpha_bbox': alpha.getbbox(),
           'opaque_bbox': alpha.point(lambda v: 255 if v >= 128 else 0).getbbox(),
           'outside_safe_alpha_max': safe_max, 'png_webp_alpha_and_paper_equal': True,
           'runtime_bytes': web.stat().st_size}
    for key, file in [('native', native), ('normalized', png), ('runtime', web)]:
        row[key + '_sha256'] = hashlib.sha256(file.read_bytes()).hexdigest()
    rows.append(row)
    paper.convert('RGB').save(out / (aid + '.paper.jpg'), quality=95)
    print(aid, source.size, row['alpha_bbox'], 'outside-safe', safe_max)

(out / 'measurements.json').write_text(json.dumps(rows, indent=2) + '\n')
for size in (72, 128):
    sheet = Image.new('RGB', (size * 6, size * 2), '#F5F1E7')
    for number in range(1, 7):
        image = Image.open(root / 'originals' / f'stamp_d{number:02}.png').convert('RGBA')
        image = image.resize((size, size), Image.Resampling.LANCZOS)
        tile = Image.new('RGBA', (size, size), '#F5F1E7')
        tile.alpha_composite(image)
        tile = tile.convert('RGB')
        sheet.paste(tile, ((number - 1) * size, 0))
        sheet.paste(tile.convert('L').convert('RGB'), ((number - 1) * size, size))
    sheet.save(out / f'contact-{size}-color-gray.png')
