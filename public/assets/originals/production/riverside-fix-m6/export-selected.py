from pathlib import Path
from PIL import Image
import shutil,hashlib,json

ROOT=Path(__file__).resolve().parent
ASSETS=ROOT.parents[2]
native=ROOT/'native/r4.png'
src=Image.open(native)
# Complete canvas only: no crop, mask, threshold editing or shoreline fitting.
out=src.convert('RGB').resize((3200,2000),Image.Resampling.LANCZOS)
generated=ASSETS/'originals/terrain_riverside.generated.png'
png=ASSETS/'originals/terrain_riverside.png'
webp=ASSETS/'terrain/terrain_riverside.webp'
shutil.copyfile(native,generated);out.save(png);out.save(webp,quality=92,method=6)
lossless=ROOT/'candidates/r4.webp';out.save(lossless,lossless=True,exact=True)
assert Image.open(lossless).convert('RGB').tobytes()==out.tobytes()
rows=[]
for source,dest in [(native,generated),(ROOT/'candidates/r4.png',png),(ROOT/'candidates/r4.q92.webp',webp)]:
    im=Image.open(dest)
    rows.append(dict(source=str(source.relative_to(ROOT)),output=str(dest.relative_to(ASSETS.parent.parent)),size=im.size,mode=im.mode,bytes=dest.stat().st_size,sha256=hashlib.sha256(dest.read_bytes()).hexdigest()))
(ROOT/'selected-export.json').write_text(json.dumps(dict(selected_attempt='r4',source_actual=src.size,whole_canvas_output=out.size,source_to_output_scale=[3200/src.width,2000/src.height],source_aspect_difference_from_8_5_percent=(src.width/src.height/1.6-1)*100,crop=False,post_generation_geometry_edit=False,webp_encoding=dict(quality=92,method=6,reason='Established existing runtime encoding; no quality scan to select a threshold result.'),exports=rows,acceptance='Improved art candidate and raster diagnostics; exact geometric identity and live E2E not claimed.'),indent=2)+'\n')
