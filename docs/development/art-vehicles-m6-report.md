# Vehicle production M6

Scope: van, box van, truck and train front/rear pairs. Canonical references read: initial README, manifest briefs/profiles, rendering_rules route orientation, resource_implementation, design_tokens and all five representative screens; existing cart native front and runtime rear inspected for watercolor consistency. Runtime skill read and environment readiness checked.

## First pair

Van front/rear are new image_gen originals, not mirrors. The rear was generated with the front as a design reference. Cream high integrated roof, forest-green lower body, ochre trim and parcel window are coherent across views. Both have transparent native backgrounds with no drawn ground or shadow. No variable text is present.

Native originals, exact prompts/reference chain, SHA-256 hashes, normalization source and measurements are retained in `public/assets/originals/production/vehicles-m6/`. Canonical PNG masters are in `public/assets/originals/`; lossless WebP exports are in `public/assets/vehicle/`.

The exporter uniformly resizes the complete native canvas and translates it onto 256×192; no crop, mask, threshold, recoloring, alpha editing or procedural artwork is used. Native files remain byte-for-byte preserved. Lossless decoded WebP RGBA equals PNG RGBA. Export alpha bounds fit manifest safe rectangle [16,16,240,176]; declared route anchor is [128,160]. Full measurements include exact transforms and hashes.

Color/grayscale review sheet includes 48×36 and 24×18 actual-size sprites. The compact high-roof silhouette and front/rear end difference remain visible; small parcel contents and tiny details merge at 24×18. This is a visual production review, not root integration E2E.

Geometry limitation: the requested axis is front (+2,+1), rear (+2,-1); the generated views visibly point toward those quadrants. Painted perspective is approximate and is not certified as an exact mathematical 2:1 projection. Native low-alpha stray pixels broaden the raw native alpha bounding boxes; they are preserved, with ordinary resampling only. Painted wheel contact is close to the runtime anchor but is not a measured exact model joint. Further route-overlay E2E remains with integration.
