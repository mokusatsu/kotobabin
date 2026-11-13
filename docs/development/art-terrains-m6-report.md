# Seaside and highland terrain art candidates

Two missing landscape assets were actually generated with imagegen: `terrain_seaside` and `terrain_highland`. The riverside terrain, all shared coordinate data, registries, ledger and UI are unchanged. These are artwork/export candidates with explicitly unresolved exact shoreline acceptance.

Read and inspected: AGENTS.md; initial README; terrain manifest profile and both briefs; design tokens; rendering rules; resource implementation shared coordinates, shoreline, harbor and route contracts; city catalog map layout; all five representative visual references; canonical riverside PNG; and its prior geometry report/conditioning guide.

## Art and provenance

The seaside terrain has small rounded coastal trees and grasses at the exterior left/top edge and broad restrained turquoise bay tones. The highland terrain has soft low mountains and conifers at the upper-left perimeter and cool blue lake tones. District grounds, center and route spaces remain pale flat quiet land. No buildings, baked roads/rails, piers, ships, labels, UI or variable text were observed. The center is opaque cream land, not a transparent reservation.

Both unchanged native PNGs are **1586×992 RGB**, not 3200×2000 native drawings. They are preserved under `public/assets/originals/production/terrains-m6/native/`. Exact prompts, image-reference paths, transparency flags and attempt dispositions are in `requests.json`. Each asset required one actual generation; there are no rejected imagegen variants in this terrain batch. The coordinate SVG/PNG is a conditioning and diagnostic diagram, never a runtime substitute. It was used with the existing riverside artwork as the visual reference. Source/reference/review SHA-256 values are in `source-and-review-sha256.json`.

The entire native frame was resized to **3200×2000 RGB**, PNG master plus lossless WebP. The native aspect differs from exact 8:5 by −0.07560484%; horizontal scale is 3200/1586 and vertical scale is 2000/992. This tiny full-frame aspect normalization is disclosed rather than described as native 8:5 perfection. No crop, masking, alpha threshold, color segmentation editing, polygon fitting, biome shader or shoreline repaint was applied after imagegen. `export.py` reproduces exports and diagnostics. Pixel-identical PNG/WebP RGB round trips passed. Nominal source anchor is (1600,1000), safe rectangle (0,0,3200,2000), mapped to logical 1600×1000.

## Geometric evidence and unresolved acceptance

The canonical shoreline is the twelve-point sequence in `city_catalog.json` and `resource_implementation.md`, including harbor contact (1246.203125,737.578125). Measurements use the same approximate water-color criterion as the prior riverside report: three consecutive pixels satisfying `B>1.06R && G>1.03R`; the first such source x divided by two is reported in map pixels. The final y=1000 endpoint samples the last raster row. This is an observable raster diagnostic, **not exact geometric identity proof or a newly invented tolerance**. It never changes artwork pixels.

| Canonical (x,y) | Seaside observed x / delta | Highland observed x / delta |
|---|---|---|
| 1370,0 | 1370 / 0 | 1370.5 / +0.5 |
| 1365,200 | 1364 / −1 | 1365 / 0 |
| 1360,400 | 1359.5 / −0.5 | 1359.5 / −0.5 |
| 1340,550 | 1339 / −1 | 1339.5 / −0.5 |
| 1310,640 | 1308.5 / −1.5 | 1309 / −1 |
| 1280,695 | 1278 / −2 | 1279 / −1 |
| 1246.203125,737.578125 | 1246.5 / +0.296875 | 1245.5 / −0.703125 |
| 1240,770 | 1240 / 0 | 1239.5 / −0.5 |
| 1240,820 | 1238 / −2 | 1239 / −1 |
| 1195,875 | 1194.5 / −0.5 | 1194.5 / −0.5 |
| 1150,940 | 1150 / 0 | 1149 / −1 |
| 1130,1000 | 1128 / −2 | 1128.5 / −1.5 |

At every integer logical y, color-derived shoreline minus canonical piecewise boundary ranges from −2.6667 to +0.15 map pixels for seaside and −2.1667 to +0.65 for highland. Thus exact shared coastline identity across the three landscapes is **unproven and not claimed**.

The harbor unloading rectangle x1158≤x<1222, y760≤y<808 contains **0 water-classified pixels out of 12,288 source pixels in each terrain**. However, the minimum color-derived distance from x1222 to first water over y760..808 is **16.5 map pixels seaside and 17.5 highland**, versus the canonical minimum 18. This is a remaining geometry limitation, despite the unloading rectangle itself remaining dry. The specified exact 18-pixel separation and precise fractional pier-contact match are not accepted as passed.

All six route polylines, expanded by the canonical 24-map-pixel radius including circular vertex/end caps, contain **0 water-classified pixels out of 551,579 source pixels** in each terrain. This confirms dry routing under the diagnostic color rule; absence of trees/rocks is supported by visual inspection of the coordinate overlays, not claimed from water-color testing alone. The route corridor bitmap is diagnostic only and is never applied to terrain artwork.

## Visual review and delivery scope

Inspected both terrains at their canonical minimum **800×500** in color and grayscale. Inspected separate coordinate-overlay previews with six district rectangles, route lines, shoreline control line and harbor unloading rectangle. The central grounds are clear; biome-specific details stay at the exterior perimeter. Harbor district rectangle overlaps water intentionally for its separate pier art; the unloading rectangle remains on land. No live screenshot is represented by these annotated diagnostics.

Master/runtime/native hashes, dimensions, scales, exact sampled values, all-row diagnostic bounds and dry-region counts are in `measurements.json`. Final live composition with district/pier artwork, landscape selection and iPad browser E2E belong to integration. These two files complete generated art candidates; exact shoreline/clearance and runtime acceptance remain unresolved as detailed above. Nothing was pushed or published.
