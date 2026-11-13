# Harbor fixed-contact artwork repair

Scope: repair existing `city_harbor_s1..s5` candidates. No new asset IDs, shop image, UI, shared ledger, canonical spec or terrain changes. Read the district profile, all five canonical harbor motifs, resource implementation pier/foot/shore contracts and reserved shop geometry. All five initial visual references and existing harbor compositions were inspected. This report distinguishes measured sprite checks from live integration acceptance.

## Preserved originals and diagnosis

All five previous PNG masters, unchanged native generated PNGs and runtime WebPs are preserved under `public/assets/originals/production/harbor-fix/history/`, together with a complete copy of prior harbor production provenance. `history-sha256.json` records exact hashes. Existing prior production files remain untouched. `before.measurements.json` and `before.coordinate-review.png` show that all five old images had alpha0 at (512,640), pier contact (730,650), outer tip (904,716), and throughout the tip's 25×25 neighborhood. Old stages 4/5 also visibly exceeded canonical x960 safe bounds. This is a bounded repair of those defects rather than acceptance by file presence.

Two initial actual imagegen edits are preserved in `rejected/`: the full-canvas guide attempt left all three target points empty, and its position edit filled the shore contact but left foot/tip empty and alpha1 speckles in the reserved shop rectangle. Exact prompts, source references and disposition are in `requests.json`.

## Stage 1 measured candidate

The successful third actual imagegen attempt uses a portrait structural reference containing only the art region. Its unchanged native is **1179×1334 RGBA** in `native/city_harbor_s1.png` and as canonical `originals/city_harbor_s1.generated.png`. The full native canvas is resized to **608×688** and placed at **(352,44)** on transparent **1024×768**. Every native pixel is retained; there is no crop, mask, alpha threshold, painted contact marker or procedural image replacement. The slight independent integer aspect normalization is recorded as explicit x/y scale in `measurements.json`. The full placed canvas fits the output; actual nonzero-alpha paint stays inside the canonical safe area. Moving this complete canvas up four pixels from the original guide's nominal region aligns the physical front step without moving the pier out of its required points.

| Check after final placement | Measured stage 1 |
|---|---|
| Anchor/physical front-step point (512,640) alpha | 223 |
| Shore-contact deck point (730,650) alpha | 253 |
| Outer-tip deck point (904,716) alpha | 251 |
| Last opaque front-step row in x480..539/y600..669 diagnostic region | y640 |
| All-alpha bounds | (381,65,941,732) |
| Outside safe rectangle (64,48,960,736), max alpha | 0 |
| Reserved shop rectangle (64,440,352,736), max alpha | 0 |
| PNG/WebP alpha and opaque paper composites | Pixel-identical |

The required points lie on actual illustrated wooden structure, not guide dots; coordinate marks are placed only on separate diagnostic previews. The low plank hut, front bench/tiny waiting person, one diagonal pier, low bollard and rope are present. No terrain, shoreline, floor island, boat, text or UI is baked in. Main building and front support remain on the landward side; the narrow pier alone extends over the shoreline in the static terrain composite.

Reviewed 264-, 132- and 96-pixel-wide full-frame paper previews in color/grayscale and a static 800×500 riverside composition. The smallest preview retains hut/pier silhouette; fine bench/person details naturally reduce. `city_harbor_s1.riverside-composite.png` shows the fixed shore and tip connection using the existing canonical terrain and placement formula. This is not a browser screenshot or E2E test. The old approximate hut box is substantially corrected; exact conformity of every roof vertex to the illustrative x440..730/y340..640 box is not claimed. The critical fixed-contact, main-step, safe and reservation measurements above are directly verified.

## Completed stages 2–5 and measured limits

All five repaired candidates now pass the same explicit pixel checks. The following table is the final export transform, not a claim that imagegen natively delivered 1024×768 or exact geometry without normalization. Every complete native canvas is preserved. Each placed full canvas fits the 1024×768 output; none is cut at a canvas edge. The actual nonzero-alpha bounds, including tiny generated noise, satisfy the canonical safe area. Alpha thresholding appears only in diagnostic measurements of opaque feet and is never applied to exported artwork.

| Stage | Actual native RGBA | Whole-canvas resize / offset | Alpha at foot / pier contact / tip | Full alpha bounds |
|---|---|---|---|---|
| 1 | 1179×1334 | 608×688 / (352,44) | 223 / 253 / 251 | (381,65,941,732) |
| 2 | 1179×1334 | 608×686 / (352,45) | 165 / 253 / 252 | (359,61,929,731) |
| 3 | 1179×1334 | 608×656 / (352,94) | 199 / 253 / 172 | (352,98,948,736) |
| 4 | 1207×1303 | 608×648 / (352,100) | 223 / 254 / 255 | (352,153,921,736) |
| 5 | 1214×1295 | 608×610 / (352,130) | 178 / 253 / 251 | (352,138,954,736) |

For **all five stages**: outside-safe max alpha is0; shop-reserved max alpha is0; the final opaque front-step row in the recorded x480..539/y600..669 region is y640; required pier segment samples are opaque; and lossless PNG/WebP alpha and paper composites match pixel-for-pixel. Along the straight canonical contact-to-tip segment, 201 rounded pixel samples all have alpha≥128. Minimum segment alpha by stage is 251,252,172,248,251. This checks continuous physical decking between the sockets, not just isolated endpoint coverage.

The stage3 guide retry corrected an initially too-low warehouse. Its full-canvas normalization has vertical/horizontal scale ratio0.95358 (about4.64% vertical compression relative to uniform scaling). Stage5 ratio is0.94054 (about5.95%); stage2 is0.99719, stage4 is0.98727, and stage1 is1.00010. These disclosed geometric transforms preserve all painting and bring actual structural contacts into place; they are not described as uniform scaling. No individual pier or building component was cut, warped or repositioned after generation. The normalized complete stage3 and stage4 canvases were used as conditioning references for the next actual imagegen edit.

Final motifs: stage2 adds the low L-shaped left/back waiting corridor; stage3 adds the larger gable, sliding timber doors and low ventilation cupola; stage4 adds low rear wings, a second roof line and corner lantern fixtures; stage5 adds the large triangular cream architectural canopy and curved shared bench while retaining the warehouse. A stage2 retry repaired a roof cut at the native left edge. A stage4 retry removed a large right corridor whose posts stood over water and replaced it with a compact rear roof whose supports are obscured behind/on the landward main building. Both rejected natives are retained. There is one pier throughout and no freight/boat/shoreline imagery.

Reviewed all five 264-,132- and96-wide paper compositions in color and grayscale, plus individual static 800×500 terrain compositions. The s3→s4 change is subtler at96px than the warehouse/canopy milestones; the added low roof profile remains visible without relying only on orange lamp color. `all-five-264-color-gray.png`, `all-five-132-color-gray.png`, `all-five-96-color-gray.png` and individual coordinate previews are separate QA artifacts, not runtime UI. Floors and columns are visually landward in these composites; roof overhangs may project beyond the shoreline, as the canonical contract permits.

Remaining limits: fixed *sampled physical contacts*, front-step baseline, safe rectangle and shop reservation are verified here. Exact matching of every pier contour pixel across stages, mathematically identical whole-dock geometry, each illustrative building-box/roof vertex, and exact cupola/canopy heights are **not** claimed. Observed warehouse cupola tops vary around y180–205 after normalization, versus the illustrative warehouse guide beginning around170. The five drawings share a coherent camera treatment with natural painterly variation; the reported normalization is a small but real aspect adjustment. These limits are not silently relaxed into final spec acceptance. The two terrain candidates' earlier shoreline/18px-clearance limitations are unchanged by this harbor repair.

Native, master, runtime, reference, history and review SHA-256 records are retained; exact ten imagegen prompts/references and five rejected repair attempts are in `requests.json` and `rejected/`. Runtime integration, live keyboard progression and iPad E2E remain with integration under AGENTS.md. No push or publication was performed.
