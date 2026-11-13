# Freight terminal and construction overlays

Completed `city_freight_terminal`, `scaffold_medium`, and `scaffold_large` with three actual image_gen calls using transparent background. All outputs were accepted; there are no discarded or concealed generations. Every unchanged native PNG, exact prompt, source path, export script, SHA-256 hash and measurement is retained under `public/assets/originals/production/freight-scaffolds-m6/`.

References inspected: initial README, canonical manifest briefs and freight/district profiles, construction target-stage rules, route/railway orientation and freight placement, resource_implementation, design tokens, all five representative screens, existing city_hub, scaffold_small, residential stages 3 and 5. Style uses matte watercolor/gouache, warm timber, forest green and restrained vermilion. Scaffolds contain no buildings, ground, numeric progress or lettering. Freight is a low parcel-loading deck with a small open shelter; it contains no rails or passenger station.

## Export proof

Native generations are 1448×1086 RGBA. `export.py` uniformly resizes each complete native canvas and translates it onto the canonical canvas. No crop, mask, threshold, color change, alpha editing or procedural artwork is applied. The complete scaled canvas fits within its destination canvas. Native files remain byte-for-byte unchanged. PNG masters and lossless WebP decoded RGBA are identical.

| Asset | Canonical size | Declared anchor | Measured alpha bounds | Safety / reserved shop |
|---|---|---|---|---|
| freight terminal | 512×384 | 256,320 | 65,70–439,327 | Inside 24,24–488,360 |
| medium scaffold | 1024×768 | 512,640 | 377,258–924,664 | Inside 64,48–960,736; reserved alpha maximum 0 |
| large scaffold | 1024×768 | 512,640 | 364,247–922,659 | Inside 64,48–960,736; reserved alpha maximum 0 |

Both scaffold exports have exactly zero alpha across the required shop rectangle x64–352, y440–736. This is achieved by full-canvas composition and placement, with no erased pixels. Their render layer remains the manifest asset-specific `scaffold`, rather than the district profile's default layer. Freight uses its manifest foreground layer and is intended for the district base point +(0,65), at 64×48 map pixels; it does not include route track or alter rail geometry.

## Visual inspection

The retained opaque paper composites were inspected, together with alpha bounds; RGB values beneath alpha zero were not interpreted as visible image defects. Medium shows two working levels and one side cloth; large shows three levels and a taller work enclosure. Open gaps remain transparent, with no opaque paper rectangle. The full district composites show medium over residential stage 3 and large over stage 5 at their shared source canvas and anchor. The separate left shop zone stays free. Existing district buildings remain visible through scaffold openings.

`minimum-color-gray-composites.png` includes actual 132×99 and 96×72 scaffold previews in color/grayscale, freight at 64×48 and 32×24, and district/scaffold composites at 264×198 and 96×72. Frame counts and height differences remain readable at 96×72; cloth and fine joints simplify. At 32×24 the freight roof/deck silhouette remains distinct while separate parcels merge. Full opaque paper and district composites are retained separately.

Geometry limitations: image_gen painted perspective is approximately isometric, not a certified exact 2:1 construction. These are shared overlays and do not geometrically wrap every possible district building; full composites explicitly show the frame in front of the right facade. The declared anchors are preserved canvas coordinates; individual painted feet are not exact anchor-joint matches. Low-alpha native edge/speck pixels are preserved, and can extend beyond the visibly opaque object. No acceptance claim is made for exact physical joints or all-district runtime E2E. Root integration should inspect freight/route endpoints and construction across district stages in the actual map.

Reproduce checks with `python public/assets/originals/production/freight-scaffolds-m6/export.py`. This work changes only the three asset pairs, their production evidence and this report. No shared registry, ledger, UI, specification, publishing or pushing was performed.
