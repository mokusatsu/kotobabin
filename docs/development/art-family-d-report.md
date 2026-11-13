# D-family achievement art candidates

Six actual image-generated candidates cover `stamp_d01`–`stamp_d06`. This is an isolated artwork batch, **not final acceptance or publication**. No UI, economy, achievement rules, shared manifest or asset ledger was edited.

## Canonical sources and method

Read `spec/initial/data/visual_resource_manifest.json` (six briefs and stamp profile), the six matching entries in `achievement_catalog.json` (conditions, motifs and visual differentiators), current root `AGENTS.md`, and existing A/B/C/E/F/G artwork. The initial five screen references were already inspected during the preceding harbor batch. `canonical_briefs.json` under `public/assets/originals/production/family-d/` preserves the exact six asset entries, achievement entries, and stamp profile.

Existing A01/B01/C01/E01/F01/G01 were compared as a contact sheet. F01 was directly inspected and supplied as the image-generation style reference: warm watercolor/gouache, honey timber/ochre, cream, sage, muted slate blue, and clear silhouettes. Each D image uses its own canonical subject; no generic reward symbol or color-only variant substitutes for it.

Six image-generation calls produced six selected candidates. No retry/rejected candidate was generated in this batch; `requests.json` explicitly records the empty rejection list, all exact prompts, reference path, tool native paths and output hints. Every `.generated.png` is an unchanged native 1254×1254 RGBA output. Normalized `.png` and runtime `assets/achievement_stamp/{id}.webp` use the same full-canvas proportional resize to448×448 and translation(32,32) on512×512. No cropping, masking, alpha thresholding, procedural painting or fabricated replacement motif is used.

## Specific motif inspection

| ID / name | Required motif present | Static 72px observation |
| --- | --- | --- |
| D01 軽やかな足どり | Two leather delivery shoes, round stepping stones, broad stride/curved foot route, partial satchel at top | Low diagonal shoe/stone silhouette distinct from vehicles and wings; bag remains a cropped close-up fragment |
| D02 軽快な配達 | Delivery bicycle, envelopes in front basket, two separated large wheels, fluttering cloth flag, curved path | Two-wheel side profile remains readable in gray; fine spokes become secondary texture |
| D03 風を切る便 | Pointed spread-wing swallow carrying one envelope, long diagonal wind bands and open sky | Flight silhouette and cream envelope remain distinct; no opaque sky rectangle |
| D04 ひとつ先の記録 | Short staircase in side view, parcel/top flag, old lower marker | Three right-angle levels and top flag distinguish improvement without relying on color |
| D05 流れが速くなった | Train leaving station canopy, deep carriage/platform perspective, thin scarf trailing from side window | Large train front and receding roof are distinct from bicycle; scarf is a small secondary feature at72px |
| D06 速くて丁寧 | Quill firmly supported by one-wheel delivery cart on straight narrow rail, orderly feather barbs, diagonal wheel/feather arrangement | One-wheel support and large feather distinguish it from D02; feather barbs are secondary detail at72px |

No text, numbers, names, common stamp frame, perforation, state mark, rarity or UI badge was observed in these candidates. The generated images illustrate confirmed achievements; they do not define or change unlock rules.

## Export checks and evidence

Reproduce from repository root with:

```sh
python3 public/assets/originals/production/family-d/export.py
```

`measurements.json` records native/normalized/runtime SHA-256 hashes, dimensions, full-canvas transform, alpha/opaque bounds and WebP sizes. The centered full-canvas transform preserves the profile anchor(256,256). All six are8-bit RGBA512×512 with **max alpha0 outside x32..479,y32..479**. No source canvas is clipped. All six pass exact normalized PNG/runtime WebP alpha-byte equality and paper-composite pixel equality assertions.

| ID | All-alpha bounding rectangle (right/bottom exclusive) | Outside-safe max alpha |
| --- | --- | --- |
| stamp_d01 | (44,43)–(471,472) | 0 |
| stamp_d02 | (32,92)–(470,433) | 0 |
| stamp_d03 | (32,46)–(480,480) | 0 |
| stamp_d04 | (55,58)–(460,447) | 0 |
| stamp_d05 | (46,43)–(460,475) | 0 |
| stamp_d06 | (73,81)–(457,451) | 0 |

Inspected generated results, the72px and128px contact sheets in both color and grayscale, and the source/reference style comparison. `contact-72-color-gray.png` shows D01–D06 left to right, color above gray; `contact-128-color-gray.png` provides a larger proof. Paper composites are preserved beside the measurements. These are static asset checks and same-author observations, not an independent sakurai review or actual runtime E2E.

Root integration still must register availability and run the real result-opening/handbook browser journeys, including all six D awards, common-frame compositing, specified iPad screen sizes, keyboard operation and reduced-motion behavior. `AGENTS.md` requires actual browser E2E; these proofs do not replace it. No server, publication or merge was performed by this batch.
