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

Stages 2–5 are in production. Do not infer their geometry acceptance from stage 1. Runtime integration, live keyboard progression and iPad E2E remain with integration under AGENTS.md.
