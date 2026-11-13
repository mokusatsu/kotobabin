from pathlib import Path
from PIL import Image
import hashlib,json,shutil

ROOT=Path(__file__).resolve().parent
ASSETS=ROOT.parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
measurements={r['id']:r for r in json.loads((ROOT/'measurements.json').read_text())}
selected={'seaside':'seaside-r4','highland':'highland-r1'}
rows=[]
for asset,attempt in selected.items():
    native=ROOT/'native'/f'{attempt}.png'
    png=ROOT/'candidates'/f'{attempt}.png'
    runtime=ROOT/'candidates'/f'{attempt}.q92.webp'
    src=Image.open(native)
    # Verify complete-canvas normalization; no crop/mask/threshold/color fitting.
    expected=src.convert('RGB').resize((3200,2000),Image.Resampling.LANCZOS)
    assert expected.tobytes()==Image.open(png).convert('RGB').tobytes()
    for key,path,baseline in [(attempt,png,f'baseline-{asset}-png'),(attempt+'-q92',runtime,f'baseline-{asset}-webp')]:
        row=measurements[key];d=row['diagnostics'];old=measurements[baseline]['diagnostics']
        assert sha(path)==row['sha256']
        assert d['harbor_min_dry_clearance_map_px']>=18
        assert d['harbor_water_pixels']==0 and d['route_corridor_water_pixels']==0
        assert d['all_source_rows_max_abs_delta_map_px']<=old['all_source_rows_max_abs_delta_map_px']
    assert sha(native)==measurements[attempt]['native_sha256']
    outputs=[]
    for source,dest in [(native,ASSETS/'originals'/f'terrain_{asset}.generated.png'),(png,ASSETS/'originals'/f'terrain_{asset}.png'),(runtime,ASSETS/'terrain'/f'terrain_{asset}.webp')]:
        shutil.copyfile(source,dest)
        im=Image.open(dest)
        outputs.append(dict(path=str(dest.relative_to(ASSETS.parent.parent)),size=im.size,mode=im.mode,bytes=dest.stat().st_size,sha256=sha(dest)))
    rows.append(dict(asset='terrain_'+asset,attempt=attempt,native_size=src.size,whole_canvas_output=[3200,2000],scale=[3200/src.width,2000/src.height],native_aspect_difference_from_8_5_percent=(src.width/src.height/1.6-1)*100,crop=False,geometry_mask=False,runtime_encoding=dict(quality=92,method=6),outputs=outputs,acceptance='Improved art candidate with diagnostic clearance/dry/non-worsening checks; strict geometric identity and E2E are unproven.'))
(ROOT/'selected-export.json').write_text(json.dumps(rows,indent=2)+'\n')
