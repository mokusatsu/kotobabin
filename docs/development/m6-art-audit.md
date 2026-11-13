# M6 read-only technical art audit

This is an independent technical asset inspection, not a sakurai review, browser E2E, final visual acceptance, or permission to publish. Read-only target: `/workspace/work/m5-art-integration`, observed integration HEAD `11b538ffecc078be1ba8653b183b1f0d34511971`. Individual runtime SHA256 hashes in the machine report identify the actual inspected bytes if integration advances.

The canonical manifest contains 248 assets: 149 raster, 92 SVG, 7 audio. All manifest runtime paths exist; all 149 canonical PNGs exist. All raster runtime dimensions and all SVG viewBoxes match the per-ID source_size. Audio existence only was checked. All 92 SVGs rendered successfully with CairoSVG. PNG/runtime alpha matches for all 149 rasters. Opaque profiles are fully opaque; transparent profiles have actual transparent pixels. No raw hidden-RGB preview was used as background evidence: alpha and composition over opaque #F5F1E7 are authoritative.

Machine evidence and inspection-only proof images live in the isolated worktree at `/workspace/work/stamps-l-m6/work/m6-art-audit/` (`audit.json`, `districts-paper.png`, `vehicles-paper.png`, `equipment-paper.png`, `scaffolds-paper.png`, `terrain-routes.png`, `harbor-feet-empty.png`, `harbor-terrain-composite.png`). They are not production assets or browser screenshots and are intentionally not included in this report-only commit. `audit.json` contains one record for each of the 248 IDs, runtime hashes, sizes, modes, alpha bounds/counts, PNG comparisons and applicable window checks.

Self-scope exclusion: I produced stamp_l01–stamp_l06 and postcard_h–postcard_l. Their automated dimensions/export measurements are recorded, but this audit does not independently or finally accept those 11 artworks. Another reviewer must own their visual acceptance.

## Findings requiring a decision or correction

1. **All five harbor stages miss the explicitly fixed pier coordinates.** resource_implementation.md section 3 says “港の桟橋は原画内の接点(730,650)、先端(904,716)を固定”. These are fixed coordinates, unlike prose roof positions using “前後” or “基本”. For city_harbor_s1/s2/s3/s4/s5, alpha is zero at both specified points and throughout the 25×25 neighborhood x892..916, y704..728 around the tip. Their alpha-bbox bottom edges are respectively 639, 641, 682, 665, 665 (exclusive), all above y704. This is not a low-alpha rounding ambiguity: no pier painting exists anywhere near the required tip. Preserve every native original; measure the painted pier geometry and correct it deliberately. A whole-canvas similarity transform is permissible only if both fixed endpoints, safe bounds, reserved shop rectangle and non-pier land contact can all remain valid. Otherwise use an imagegen edit preserving the building and correcting pier placement, then normalize the complete canvas. Do not crop or erase content to pass.

2. **Harbor s4/s5 have substantive paint outside the district safe rectangle.** The district profile prescribes [64,48,960,736]. S4 has 281 nonzero-alpha pixels outside, max alpha254, bbox [286,135,968,665]; S5 has 350, max253, bbox [286,132,970,665]. The spill is the rightward outline and not hidden RGB. A small full-canvas scale/reposition can retain all paint, but must be solved together with the fixed pier issue above. The paper/terrain compositing proof also shows right-hand building floor/columns adjoining water beside the intended pier on all three terrains. The brief permits roof overhang and uses approximate building bounds, but explicitly says “桟橋以外の床と柱を水面へ接地させない”. This is a visual compositing concern requiring a deliberate land-contact review; I have not invented a pixel-exact roof box or claimed an automatic semantic segmentation of floor versus roof.

3. **Encoding observation, not a contract failure:** postcard_a and postcard_b differ from canonical PNG in 4,214,354 and 4,239,353 RGB channel samples, max absolute differences70 and73; terrain_riverside differs in13,510,809 channel samples, max14. Alpha matches. All other146 rasters have equal PNG/WebP paper-composited pixels. The mandatory WebP contract is matching dimensions and alpha; it does not require lossless RGB. Direct side-by-side review at postcard minimum160×100 and terrain minimum800×500 found no material subject/readability damage (`encoding-minimum-comparison.png`). Lossy encoding is compatible with the initial3MB budget tradeoff. No automatic re-encode is recommended solely because RGB differs; a false pixel-identity claim would instead need correction in its own provenance.

4. **Small strict-alpha hygiene exceptions remain.** See the table below. Except harbor s4/s5 and city_plot_empty's stage0 shop-area overlap, all are only alpha1 pixels and not material painted silhouettes. They still fail a literal full-transparency/safe-rectangle check. Full-canvas scale/reposition can fix safe-bound spill while retaining painting. Residential s1/s5 have respectively4 and1 alpha1 pixels in the shop rectangle; preserving complete existing paint while moving those out may require a tiny whole-canvas transform. Do not threshold alpha or clip the rectangle. city_plot_empty has4,645 nonzero pixels (max252) inside that rectangle because the left stake/rope crosses it; its own brief explicitly says there are no shops at stage0, so treat this as a general district-profile versus stage0 no-shop exception for owner resolution, not proof of a visible shop collision.

## Exact alpha exceptions

Every count includes all alpha>0 pixels, with no cutoff. Bounds are right/bottom exclusive. For opaque scenes the profile safe rectangle is for critical subjects, not a demand for transparent full-bleed background.

| ID | Outside-safe pixels / maximum alpha | Shop-reserved pixels / maximum alpha |
|---|---:|---:|
| city_plot_empty | 16 / 1 | 4645 / 252 |
| city_residential_s1 | 0 / 0 | 4 / 1 |
| city_residential_s4 | 2 / 1 | 0 / 0 |
| city_residential_s5 | 0 / 0 | 1 / 1 |
| city_market_s2 | 10 / 1 | 0 / 0 |
| city_market_s5 | 8 / 1 | 0 / 0 |
| city_workshop_s3 | 3 / 1 | 0 / 0 |
| city_workshop_s4 | 31 / 1 | 0 / 0 |
| city_park_s4 | 5 / 1 | 0 / 0 |
| shop_harbor | 5 / 1 | — / — |
| city_harbor_s1 | 5 / 1 | 0 / 0 |
| city_harbor_s4 | 281 / 254 | 0 / 0 |
| city_harbor_s5 | 350 / 253 | 0 / 0 |

## Per-ID evidence for the thirty city stages

The nominal anchor [512,640] fixes composition/placement. It does not require an opaque pixel at that coordinate: an empty plaza, a gap between feet, or antialiasing can leave it transparent. The table's anchor alpha is evidence only, not an invented pass/fail rule. Roof positions described as “y170前後”, “y150前後”, or “基本” are artistic placement guidance; I did not turn them into exact mandatory coordinates. Exact canvas, profile safe bounds, transparent reserved rectangle and expressly fixed pier points are separately testable contracts. All thirty PNGs and WebPs have1024×768 dimensions and matching alpha/paper composites.

| ID | Runtime alpha bbox | Outside-safe pixels | Reserved-shop pixels | Alpha at nominal anchor |
|---|---|---:|---:|---:|
| city_residential_s1 | [314, 230, 946, 641] | 0 | 4 | 0 |
| city_residential_s2 | [379, 222, 957, 588] | 0 | 0 | 0 |
| city_residential_s3 | [377, 229, 928, 596] | 0 | 0 | 0 |
| city_residential_s4 | [365, 226, 961, 720] | 2 | 0 | 0 |
| city_residential_s5 | [139, 216, 958, 643] | 0 | 1 | 0 |
| city_market_s1 | [415, 312, 922, 613] | 0 | 0 | 0 |
| city_market_s2 | [404, 260, 973, 746] | 10 | 0 | 0 |
| city_market_s3 | [311, 199, 936, 619] | 0 | 0 | 0 |
| city_market_s4 | [291, 197, 909, 617] | 0 | 0 | 0 |
| city_market_s5 | [292, 193, 961, 736] | 8 | 0 | 0 |
| city_workshop_s1 | [449, 353, 921, 670] | 0 | 0 | 0 |
| city_workshop_s2 | [422, 350, 913, 640] | 0 | 0 | 0 |
| city_workshop_s3 | [427, 300, 916, 745] | 3 | 0 | 0 |
| city_workshop_s4 | [359, 300, 950, 747] | 31 | 0 | 0 |
| city_workshop_s5 | [359, 298, 950, 645] | 0 | 0 | 0 |
| city_park_s1 | [423, 259, 892, 620] | 0 | 0 | 0 |
| city_park_s2 | [393, 307, 943, 622] | 0 | 0 | 0 |
| city_park_s3 | [370, 180, 951, 620] | 0 | 0 | 0 |
| city_park_s4 | [355, 85, 961, 622] | 5 | 0 | 0 |
| city_park_s5 | [352, 170, 958, 700] | 0 | 0 | 70 |
| city_station_s1 | [359, 294, 858, 721] | 0 | 0 | 0 |
| city_station_s2 | [406, 294, 930, 570] | 0 | 0 | 0 |
| city_station_s3 | [364, 99, 932, 575] | 0 | 0 | 0 |
| city_station_s4 | [364, 98, 929, 577] | 0 | 0 | 0 |
| city_station_s5 | [361, 94, 931, 729] | 0 | 0 | 0 |
| city_harbor_s1 | [453, 340, 976, 639] | 5 | 0 | 0 |
| city_harbor_s2 | [369, 282, 924, 641] | 0 | 0 | 0 |
| city_harbor_s3 | [362, 135, 936, 682] | 0 | 0 | 0 |
| city_harbor_s4 | [286, 135, 968, 665] | 281 | 0 | 0 |
| city_harbor_s5 | [286, 132, 970, 665] | 350 | 0 | 0 |

## New vehicles, packaging, scaffolds, terrain, and SVG composition

All10 vehicle sprites are256×192, have genuine transparency, fit [16,16,240,176], and have PNG/WebP alpha and paper-color parity. Opaque-paper review shows front views facing right/down and rear views right/up, consistent with the canonical (+2,+1)/(+2,−1) directions; van views remain distinct from box vans, and truck/train silhouettes are different. I found no obvious drawn ground slab or cast shadow. This is visual evidence, not proof of mechanically exact wheel contact at [128,160]. The anchor is a nominal placement coordinate; opacity at that one pixel is not an acceptance test.

All5 packaging IDs (equipment_packaging_0..4) are1200×800 RGBA and fit [60,40,1140,760]. They retain five distinct silhouettes: mat, horizontal desk, desk+press, L workstation, arch-shaped twine device. The paper proof shows a shared oblique view and scale progression; nominal [600,680] remains the rendering anchor. A production report's50%-alpha foot proxy is not a new specification requirement. All3 scaffolds are1024×768, fit district safe bounds, have fully transparent shop rectangles, and visually progress from low one-sided frame to medium cube to taller enclosing frame. Neither group embeds numbers or states.

All3 terrains are3200×2000 RGB opaque full scenes with clear central land. Inspection overlays place the six canonical route centerlines with a24map_px half-width protection corridor and harbor cargo-land rectangle [1158,760,1222,808]. The terrain proof shows the corridors and cargo box on open land, not over painted trees, rocks or water. The three water boundaries visually agree. This visual inspection does not mathematically classify every textured pixel as land/water or establish browser composition. terrain_riverside's permitted encoding difference is recorded above.

All9 applicable SVG inner windows rendered with zero nonzero-alpha pixels: reward_frame_leaf/plaza/sunset/journey and album_base at [96,96,1104,704]; board_base/board_foil at [32,96,1168,784]; stamp_frame/memorial_frame at [64,64,576,576]. All92 SVGs have matching viewBoxes and fit their applicable safe bounds in the CairoSVG raster check. This is technical composition evidence, not a final motif review of every SVG.

No production asset, renderer, UI, source contract or shared ledger was modified. The bounded fixes above require owner implementation and fresh checks; browser E2E and final acceptance remain separate work.

## Harbor repair recheck (later integration snapshot)

The original findings above are historical evidence, not a claim that the repaired files still fail. Read-only recheck at integration HEAD `e5042a5cc0c0b5425765ab717f5ebca5b7b57b5b` independently confirms all five repaired harbor stages are1024×768, have zero alpha outside district safe bounds and in the reserved shop rectangle, and now contain paint at both mandatory pier coordinates. Exact hashes and alpha measurements are in isolated `harbor-recheck.json`. Alpha at an artwork point need not be255 to count as painted; s3 tip alpha172 is nonzero, not fully opaque. This technical recheck is independent of the producer and does not substitute for land-contact visual/E2E acceptance.

| ID | Connection alpha at730,650 | Tip alpha at904,716 | Safe spill max | Shop max |
|---|---:|---:|---:|---:|
| city_harbor_s1 | 253 | 251 | 0 | 0 |
| city_harbor_s2 | 253 | 252 | 0 | 0 |
| city_harbor_s3 | 253 | 172 | 0 | 0 |
| city_harbor_s4 | 254 | 255 | 0 | 0 |
| city_harbor_s5 | 253 | 251 | 0 | 0 |
