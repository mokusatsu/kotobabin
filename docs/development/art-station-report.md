# Station image-generation candidate batch

This is a bounded candidate batch, not final visual or runtime acceptance. It changes six canonical asset files plus originals/provenance; shared manifests and progress ledgers are untouched.

## Canonical source and generated outputs

Read `spec/initial/data/city_catalog.json`, `spec/initial/data/visual_resource_manifest.json` and `spec/initial/docs/city_development_catalog.md`. Exact source hashes, native generation UUIDs, all actual prompts and selection/rejection reasons are in [requests.json](../../public/assets/originals/production/station/requests.json). Nine actual imagegen outputs produced six selected candidates and three retained rejected natives (unrequested village, opaque white courtyard/left annex, and reserved-area left wing).

Runtime paths are `public/assets/city_stage/city_station_s1.webp` through `city_station_s5.webp` and `public/assets/shop_scene/shop_station.webp`. Every selected native is preserved unchanged as `public/assets/originals/{ID}.generated.png`; normalized RGBA8 masters are `{ID}.png`. Rejected natives are in `public/assets/originals/rejected/station/`.

## Export and measurements

[export.py](../../public/assets/originals/production/station/export.py) reproduces the masters, lossless WebP exports, contact sheets and [measurements.json](../../public/assets/originals/production/station/measurements.json). It requires Python/Pillow and ImageMagick. Run from any directory: `python3 public/assets/originals/production/station/export.py`.

All five entire native 1448×1086 canvases receive the **same** proportional resize to 896×672 and translation (+64,+64) onto 1024×768. The entire 1254×1254 shop canvas receives resize to 432×432 and translation (+48,+63) onto 512×512. There is no content crop, per-stage bounding-box normalization, alpha threshold/mask, painted transparent erasure, or geometry clipping. Sparse near-transparent native speckles can disappear through ordinary downsampling; originals remain untouched.

All six exports pass the strict static alpha checks: RGBA8 dimensions, alpha0 outside canonical safe bounds, district reserved shop rectangle alpha0 including faint pixels, lossless PNG/WebP alpha equality and identical visible compositing on three backgrounds. No output geometry was clipped. Hashes, pixel counts, bboxes and native metadata are recorded in measurements.json.

| Candidate | Canvas | Opaque bottom row (alpha≥128) | Reserved alpha max | Outside safe alpha max |
| --- | --- | --- | --- | --- |
| city_station_s1 | 1024×768 | 566 | 0 | 0 |
| city_station_s2 | 1024×768 | 566 | 0 | 0 |
| city_station_s3 | 1024×768 | 572 | 0 | 0 |
| city_station_s4 | 1024×768 | 574 | 0 | 0 |
| city_station_s5 | 1024×768 | 634 | 0 | 0 |
| shop_station | 512×512 | 447 | — | 0 |

The profiles' nominal anchors remain district (512,640) and shop (256,448). The table reports observed opaque extents; **it does not establish common visible foot registration**. Earlier stages are set back relative to the stage5 foreground canopy. No per-stage rescaling was used to disguise that difference.

## Visual observation and unresolved acceptance

Inspected the 132px color sheet and 96px grayscale sheet, each on light and dark backgrounds. Small waiting room → right covered walkway → tall clocktower/hall → wider lantern wing → large radial fan canopy is discernible. Stage3 versus stage4 remains a subtle width/detail change at minimum size; small lamps and clock hands need independent review. Stage4's left wing is reduced to an upper roof hint to retain the reserved shop area, which may under-deliver the canonical both-wing brief. The shop silhouette remains visible at 24px but booklet detail does not remain legible at that size. Full-size native views were inspected during generation.

Canonical landmark coordinates (including station/clocktower positions), exact forecourt composition, shared foot anchor, attachment overlays and scale within the real map remain pending. The report does not claim these are verified. No baked text, track, vehicle or freight element was intentionally requested; final independent visual review must confirm the generated content.

Four contact sheets are in `public/assets/originals/production/station/`: `review-132px.png`, `review-132px-grayscale.png`, `review-96px.png`, `review-96px-grayscale.png`. Their technical ID labels are diagnostic only and are absent from runtime assets.

Per AGENTS.md, actual browser E2E on the specified iPad target and independent sakurai-skill review are separate required acceptance work. This static asset inspection is supporting evidence, not a replacement. No local server/browser was started for this batch; no publish, merge or final acceptance is claimed.
