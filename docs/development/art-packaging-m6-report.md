# Packaging milestone art

Scope: equipment_packaging_1–4 only; canonical specs, registry, UI and shared ledger remain owned by integration. Tier 0 is unchanged. References read: AGENTS.md, initial README, manifest profiles and briefs, equipment catalog, rendering rules, resource implementation, design tokens, all five initial visual references, existing tier 0 and the prior rejected tier 1.

## Accepted tier 1

Actual imagegen original retained unchanged at `public/assets/originals/production/packaging-m6/native/equipment_packaging_1.png`. Exact prompts and diagnostic attempts are retained in `requests.json` and `rejected/`; that directory name is historical for this production session and does not claim every alternative failed transparency.

The image viewer displayed hidden RGB under fully transparent pixels, which initially looked like an exterior brown halo. Correct alpha compositing over opaque paper demonstrates clean negative space. This false rejection diagnosis was corrected before runtime acceptance. No alpha masking, thresholding, crop or paint modification was used. Tiny low-alpha generated speckles remain honestly in full alpha bounds; all are inside the canonical safe rectangle after whole-canvas normalization.

Tier 1 has one horizontal wooden tabletop, four legs, twine holder, hand stamp, paper roll and one parcel. At 240×160 the leg gaps and individual primary tools remain clear in both color and grayscale. The 1200×800 RGBA PNG and lossless WebP have pixel-identical alpha and paper composites. Whole native canvas was resized to 1075×717 and placed at (62,41), aligning the 50%-alpha feet bound to y680. Full alpha bounds are (75,49,1126,758), within (60,40,1140,760); nominal anchor is (600,680). Exact measurements and SHA-256 values are in `measurements.json`; transformations are reproducible via `export.py`.

## Completed milestone set

All four requested assets are generated and exported. Their native files remain unchanged in `native/`; `requests.json` records exact prompts, transparency flags and image references. Diagnostic source and review PNG SHA-256 values are recorded in `native-and-review-sha256.json`, while runtime/master/native accepted hashes are in `measurements.json`.

| Asset | Visible milestone | Whole-canvas resize / offset | Full nonzero-alpha bounds | 50%-alpha bounds |
|---|---|---|---|---|
| equipment_packaging_1 | Single horizontal wooden workbench, twine holder, stamp | 1075×717 / (62,41) | (75,49,1126,758) | (105,163,1093,680) |
| equipment_packaging_2 | Tall right-rear green tag dispenser and straight work surface | 998×666 / (101,50) | (124,56,1086,716) | (138,61,1062,680) |
| equipment_packaging_3 | Two perpendicular surfaces, L-shaped return, shelf and three trays | 1044×696 / (78,49) | (94,60,1121,745) | (109,135,1093,680) |
| equipment_packaging_4 | Low wide bench, large twine arch, aligned tools and trays | 1060×707 / (70,41) | (70,54,1130,733) | (78,85,1122,680) |

Every exported asset uses 1200×800 RGBA with nominal anchor (600,680), and every nonzero-alpha pixel fits the canonical (60,40,1140,760) safe rectangle. Whole-canvas scale is uniform to integer pixel rounding; no trim/crop, mask, alpha threshold, background erasure or generated-image recoloring is used. The 50%-alpha feet bounds align to y680. This is an observed contact-bound proxy for anchor placement, not proof of mechanically exact physical contact at every leg.

`all-five-bands.minimum-review.png` shows unchanged tier 0 alongside tiers 1–4 at 240×160 each, over paper in color, paper in grayscale and a dark green background. This correct opaque compositing is essential: raw image-viewer display can expose colored RGB in alpha-zero regions. The horizontal tabletop, tall tag machine, L-shaped return and large open arch distinguish the five bands in grayscale. Leg openings and the arch opening read cleanly at minimum size; the thin hanging twine remains an intentionally fine detail rather than a critical status indicator. No variable text is baked into art; tags are blank. No automatic text generation imagery is present.

Geometry limitations: these are hand-painted front/elevated views with natural perspective variation; tiers share a coherent camera treatment rather than identical projection matrices. The tall tag machine and arch have different vertical extents by design. Tiny generated/resampling alpha values (for example alpha 1 in one tier-1 interior sample) remain unmodified; they are invisible in inspected paper/dark composites and included honestly in full-alpha bounds. Lossless PNG/WebP alpha and paper composites match pixel-for-pixel for all four exports.

This is art/export QA, not browser E2E or final integration acceptance; integration owns the equipment screen and live milestone transitions. No registry, ledger, UI, spec or tier-0 asset was changed here.
