# Vehicle production M6

Scope: van, box van, truck and train front/rear pairs. Canonical references read: initial README, manifest briefs/profiles, rendering_rules route orientation, resource_implementation, design_tokens and all five representative screens; existing cart native front and runtime rear inspected for watercolor consistency. Runtime skill read and environment readiness checked.

## First pair

Van front/rear are new image_gen originals, not mirrors. The rear was generated with the front as a design reference. Cream high integrated roof, forest-green lower body, ochre trim and parcel window are coherent across views. Both have transparent native backgrounds with no drawn ground or shadow. No variable text is present.

Native originals, exact prompts/reference chain, SHA-256 hashes, normalization source and measurements are retained in `public/assets/originals/production/vehicles-m6/`. Canonical PNG masters are in `public/assets/originals/`; lossless WebP exports are in `public/assets/vehicle/`.

The exporter uniformly resizes the complete native canvas and translates it onto 256×192; no crop, mask, threshold, recoloring, alpha editing or procedural artwork is used. Native files remain byte-for-byte preserved. Lossless decoded WebP RGBA equals PNG RGBA. Export alpha bounds fit manifest safe rectangle [16,16,240,176]; declared route anchor is [128,160]. Full measurements include exact transforms and hashes.

Color/grayscale review sheet includes 48×36 and 24×18 actual-size sprites. The compact high-roof silhouette and front/rear end difference remain visible; small parcel contents and tiny details merge at 24×18. This is a visual production review, not root integration E2E.

Geometry limitation: the requested axis is front (+2,+1), rear (+2,-1); the generated views visibly point toward those quadrants. Painted perspective is approximate and is not certified as an exact mathematical 2:1 projection. Native low-alpha stray pixels broaden the raw native alpha bounding boxes; they are preserved, with ordinary resampling only. Painted wheel contact is close to the runtime anchor but is not a measured exact model joint. Further route-overlay E2E remains with integration.

## Completed set

All eight requested natives and exports are present. Exact additional requests and reference paths are in `requests-remaining.json`. There were eight generation calls total; every output is retained and used, with no rejected generation or concealed retouch. The six remaining natives are also 1448×1086 and use the same full-canvas normalization method.

| Pair | Main visible distinction | Minimum-size review |
|---|---|---|
| van | Integrated high roof and parcel window | Short rounded outline; front and rear readable |
| box van | Independent tall square cargo body over short cab | Tall square outline survives grayscale |
| truck | Long cargo room and tandem rear axles | Length survives; individual wheel separation merges at 24×18 |
| train | Short locomotive + exactly one open wagon and coupling | Two-part outline survives; steel-wheel detail merges at 24×18 |

All eight decoded lossless WebPs match their PNG masters exactly, all have alpha range 0–255, canonical dimensions 256×192, and alpha bounds inside manifest safe rectangle. The shared verification sheet shows color and grayscale at actual minimum 24×18 and standard 48×36, alongside 96×72 inspection views. No color-only distinction is relied on. Train and truck remain longer than compact van, while box van reads taller.

Pair fidelity limitation: these are painted directional views, not renders from a shared 3D mesh. Rear truck perspective appears more elongated than its front view; panel edges and minor hardware differ across pairs. Broad identity, colors, axle count and cargo type are coherent. Runtime map integration and exact route/anchor alignment are not verified by this asset-only work.

Reproduce export checks with `python public/assets/originals/production/vehicles-m6/export.py`. Only these assets, their provenance/check artifacts, and this report were changed; no shared ledger, registry, UI, specification, publishing or pushing was performed.
