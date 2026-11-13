# M6 safe-rectangle export normalization

This bounded correction changes only eight authorized canonical PNG/runtime WebP pairs. It retains existing painting and all native originals; it does not generate replacement art, claim corrected painted foot/roof coordinates, change UI/renderers/registries, or publish anything. No harbor city-stage file is included.

The prior masters/runtime and unchanged available generated native files are preserved under `public/assets/originals/production/safe-inset-m6/` as `.previous.png`, `.previous.webp`, and `.native.generated.png`. All eight natives were available and copied byte-for-byte. `measurements.json` records their SHA256 alongside the new outputs. Canonical `.generated.png` files were not edited.

## Transform and verification

`export.py` transforms the **entire old canonical canvas** uniformly about its declared anchor, preserving original output dimensions. Forward mapping is `x'=s*x+(1-s)*anchor_x`, `y'=s*y+(1-s)*anchor_y`. Exact forward/inverse matrices and transformed full-canvas corners are recorded per ID. Every transformed source-canvas corner remains inside the output canvas; no source region is deliberately discarded. Anchors map exactly to themselves: district(512,640), shop(256,448).

Pillow performs a BICUBIC inverse affine on premultiplied RGBa followed by ordinary8bit RGBA quantization. This is standard interpolation, not an alpha threshold, mask, background erasure or per-pixel cleanup. Very small alpha1 samples can quantize to zero during resampling; the method does not promise one-to-one preservation of every subpixel sample. It retains the complete source canvas and painted subject, rather than clipping offending pixels.

A factor near0.995 works for only three IDs. The other five have remote alpha1 samples sufficiently far outside the safe rectangle to require roughly7–11% whole-canvas shrink about the prescribed anchor. These larger factors are disclosed below; they cause a visible size reduction. A tiny inset cannot retain those full alpha bounds and satisfy the safe rectangle simultaneously.

| ID | Uniform factor | Old alpha bbox | New alpha bbox |
|---|---:|---|---|
| city_plot_empty | .898 | [98,276,1008,702] | [141,313,954,680] |
| city_residential_s4 | .993 | [365,226,961,720] | [366,229,958,605] |
| city_market_s2 | .899 | [404,260,973,746] | [416,327,926,735] |
| city_market_s5 | .993 | [292,193,961,736] | [294,198,957,735] |
| city_workshop_s3 | .907 | [427,300,916,745] | [435,332,877,735] |
| city_workshop_s4 | .890 | [359,300,950,747] | [377,338,902,734] |
| city_park_s4 | .993 | [355,85,961,622] | [357,89,958,622] |
| shop_harbor | .928 | [16,29,440,452] | [90,59,427,451] |

Bounds use right/bottom exclusive convention. All outputs retain mandatory1024×768 district or512×512 shop dimensions, RGBA transparency, and have **zero alpha outside** their prescribed safe rectangle. PNG/lossless-WebP alpha and opaque-paper-composited pixels match exactly. Lossless is the selected export encoding here; the base specification itself only mandates dimensions/alpha parity, not lossless RGB for all historical assets.

`before-after-paper.png` and `minimum-before-after.png` show color/grayscale before/after, using actual alpha over opaque paper. The latter uses96×72 district and24×24 shop minimums. Static visual inspection confirms the original stake/rope, public-house silhouette, roofed market walkway, market roof and pavilion, stepped workshop silhouettes, arched greenhouse and harbor shop remain identifiable. Larger shrink factors are visible, without removal or replacement of scene elements. The dramatic bbox-bottom change on residential_s4 reflects a remote low-alpha sample disappearing under ordinary interpolation; its visible house remains semantically unchanged.

This fixes only safe-rectangle export compliance. It does not resolve the stage0 shop-reservation interpretation, certify exact painted ground contact, enforce approximate artistic roof targets as mandatory coordinates, or accept the entire product. Root integration/browser E2E and independent final visual acceptance remain separate work.
