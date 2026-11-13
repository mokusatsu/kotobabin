# Packaging milestone art

Scope: equipment_packaging_1–4 only; canonical specs, registry, UI and shared ledger remain owned by integration. Tier 0 is unchanged. References read: AGENTS.md, initial README, manifest profiles and briefs, equipment catalog, rendering rules, resource implementation, design tokens, all five initial visual references, existing tier 0 and the prior rejected tier 1.

## Accepted tier 1

Actual imagegen original retained unchanged at `public/assets/originals/production/packaging-m6/native/equipment_packaging_1.png`. Exact prompts and diagnostic attempts are retained in `requests.json` and `rejected/`; that directory name is historical for this production session and does not claim every alternative failed transparency.

The image viewer displayed hidden RGB under fully transparent pixels, which initially looked like an exterior brown halo. Correct alpha compositing over opaque paper demonstrates clean negative space. This false rejection diagnosis was corrected before runtime acceptance. No alpha masking, thresholding, crop or paint modification was used. Tiny low-alpha generated speckles remain honestly in full alpha bounds; all are inside the canonical safe rectangle after whole-canvas normalization.

Tier 1 has one horizontal wooden tabletop, four legs, twine holder, hand stamp, paper roll and one parcel. At 240×160 the leg gaps and individual primary tools remain clear in both color and grayscale. The 1200×800 RGBA PNG and lossless WebP have pixel-identical alpha and paper composites. Whole native canvas was resized to 1075×717 and placed at (62,41), aligning the 50%-alpha feet bound to y680. Full alpha bounds are (75,49,1126,758), within (60,40,1140,760); nominal anchor is (600,680). Exact measurements and SHA-256 values are in `measurements.json`; transformations are reproducible via `export.py`.

This is art/export QA, not browser E2E or final integration acceptance. Remaining tiers are in production.
