#!/usr/bin/env bash
set -euo pipefail
# Run from repository root; requires CairoSVG and ImageMagick, both used only for verification.
python - <<'PY'
import cairosvg
cairosvg.svg2png(url='public/assets/shared_frame/stamp_frame.svg',write_to='public/assets/originals/production/family-g/frame-verification.png')
PY
mkdir -p work/g-family
for n in 01 02 03 04 05 06; do
  magick -size 90x90 canvas:'#F5F1E7' '(' public/assets/originals/stamp_g${n}.png -resize 72x72 ')' -geometry +9+9 -composite '(' public/assets/originals/production/family-g/frame-verification.png -resize 90x90 ')' -geometry +0+0 -composite work/g-family/g${n}-90.png
  magick work/g-family/g${n}-90.png -colorspace Gray work/g-family/g${n}-gray.png
done
magick montage work/g-family/g01-90.png work/g-family/g02-90.png work/g-family/g03-90.png work/g-family/g04-90.png work/g-family/g05-90.png work/g-family/g06-90.png work/g-family/g01-gray.png work/g-family/g02-gray.png work/g-family/g03-gray.png work/g-family/g04-gray.png work/g-family/g05-gray.png work/g-family/g06-gray.png -tile 6x2 -geometry +6+6 -background '#F5F1E7' public/assets/originals/production/family-g/minimum-size-verification.png
