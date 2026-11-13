# Harbor architecture candidate batch

Status: **generated candidates; not final asset acceptance**. This batch changes only harbor artwork, native originals, its own provenance, and this report. It does not register assets in the shared manifest, change runtime code, or establish browser acceptance.

## Sources and generation

Read `spec/initial/data/visual_resource_manifest.json`, `spec/initial/docs/resource_implementation.md`, all five initial visual references, and the current root `AGENTS.md`. Exact harbor briefs and district/shop profiles are copied without reinterpretation in `public/assets/originals/production/harbor/canonical_briefs.json`. Full prompts, generation paths, selected IDs, and two rejected attempts are in `requests.json` beside it.

Eight actual image-generation calls produced six selected candidates and two rejected wide-wing attempts. Native outputs are preserved unchanged as `originals/{id}.generated.png`; rejected native images remain under `originals/rejected/harbor/`. Style references were existing `city_market_s1.png` and `shop_market.png`. Later districts were edited from earlier harbor outputs rather than independently replacing the whole series.

| ID | Visible architecture | Inspection |
| --- | --- | --- |
| city_harbor_s1 | Low plank waiting hut, front bench/person, one short right-down pier, bollard/rope | No water/shore/terrain, boats, fish, birds, freight or navigation symbols observed |
| city_harbor_s2 | Same hut/pier plus short low rear-left covered corridor/bench | First overlong corridor rejected; compact retry selected |
| city_harbor_s3 | Taller broad gabled wooden warehouse, sliding plank doors, low ventilation cupola, waiting porch | First excessive left corridor rejected; actual image edit removed that bay |
| city_harbor_s4 | Warehouse retained with lower rear wings/corridors and corner lamps | Expansion is visible in unlit silhouette; rear wings do not replace the main building |
| city_harbor_s5 | Warehouse retained behind large triangular stretched-cloth canopy and curved wooden communal bench | No boat sail, water, floor island or lighthouse; cloth reads as architectural canopy |
| shop_harbor | Deep gabled daily-goods shop, horizontal planks, basket silhouettes inside windows | No fish branding, awning/banner/sign overlays, writing or numbers |

The architectural floor beams, thin corridor decking and one pier are part of the buildings. No background land or water was painted to fill the scene. There is no terrain clipping or masking used to achieve this result.

## Export and reproducible checks

Run from the repository root:

```sh
python3 public/assets/originals/production/harbor/export.py
```

All five native districts are 1448×1086 and use **one identical full-canvas proportional transform**, 860×645 translated to (132,88) on transparent 1024×768. The shop native is 1254×1254, resized as a complete 480×480 canvas and translated to (16,16) on transparent 512×512. No source canvas is cropped, no alpha threshold/mask is applied, and no pixels are procedurally painted. Resize interpolation and ordinary 8-bit export can round faint native alpha; the raw native files retain the original values.

Normalized originals are 8-bit RGBA PNG; runtime candidates are lossless WebP. `measurements.json` records hashes, native/output dimensions, all-alpha and alpha≥128 bounds, outside-safe and reserved-region pixel counts, and export sizes. PNG/WebP alpha bytes and paper-background composites are asserted equal. All six passed those round-trip assertions. All five districts have alpha **0 throughout** the reserved shop rectangle x64..351,y440..735 and outside the task's x32..991,y32..735 safe rectangle.

The initial manifest has a stricter district safe rectangle x64..959,y48..735. That distinction is reported rather than silently replacing either requirement:

| ID | Outside task safe: max alpha / pixels | Outside manifest safe: max alpha / pixels | Reserved shop: max alpha / pixels |
| --- | --- | --- | --- |
| s1 | 0 / 0 | 1 / 5 | 0 / 0 |
| s2 | 0 / 0 | 0 / 0 | 0 / 0 |
| s3 | 0 / 0 | 0 / 0 | 0 / 0 |
| s4 | 0 / 0 | 254 / 281 | 0 / 0 |
| s5 | 0 / 0 | 253 / 350 | 0 / 0 |
| shop | 1 / 5 | 1 / 5 | Not applicable |

The shop's five outside-safe pixels have alpha1 and none reach alpha128. S4/S5 extend visibly up to x967/x968 and therefore fail the stricter original manifest's right safe boundary. These are acceptance gaps, despite fitting the newer task rectangle.

## Geometry and visual gaps requiring follow-up

The common export preserves actual growth and does not individually shrink later stages to manufacture alignment. It does **not** make the source drawings satisfy all canonical geometry:

- The common nominal metadata anchor is (512,640), but the observed front supporting feet are approximately y586–588 for S1/S2 and y610–613 for S3/S4. S5's new curved bench feet reach approximately y626 while the warehouse remains at the S3/S4 baseline. These are visual estimates, about ±5px, not verified foot-anchor compliance.
- The pier's lowest alpha≥128 pixels are y636–638 for S1/S2 and y661–663 for S3–S5. The canonical target tip is (904,716); the drawn pier remains substantially too high. The pier connection and outer tip also shift roughly 20–30px between the hut and warehouse groups. A common transform alone cannot simultaneously correct these source positions and retain all other bounds.
- The canonical S1 hut box x440..730,y340..640 is not met: the exported main hut extends approximately to x830 and its front feet stop above640. Its roof begins near y342, but that partial match does not establish full geometric compliance.
- The canonical warehouse target begins around y170; S3–S5 cupola tops are y134–137, too high. The warehouse front is also wider than the canonical x430..830 guide. S4/S5 need right-edge clearance under the original stricter safe profile.
- Shop visible support feet reach y447 (alpha≥128 bbox ends at448), close to its448 target. Its gable apex is near y85 rather than the suggested108, and the wall/body footprint is wider than the prescribed front x128..384. Optional overlay positions have not been tested in runtime.

These require source-aware regeneration/editing and a new measured batch; they are not solved by labeling the files with an anchor, masking paint, clipping wings, or moving each stage independently.

`contact-132-color-gray.png` and `contact-96-color-gray.png` show S1–S5 then the shop on paper, with grayscale below. I inspected both and each paper composite. S1→S2 is subtler at96px, but the corridor changes the left outline; S3 is taller, S4 wider, and S5 adds a contrasting triangular cloth silhouette. This is static artwork inspection only, not an independent design review or actual runtime E2E. The enlarged district map, world-map scale, adjacent shop overlay, and specified iPad keyboard journeys still require the root integration's actual browser tests under `AGENTS.md`.

## Remaining acceptance

Do not mark these six assets final accepted until the above coordinate/safe gaps are resolved or explicitly revised by the project owner, the shared asset ledger is updated by its owner, and actual browser E2E verifies the integrated artwork. No server, preview publication, runtime code change, or merge was performed by this batch.
