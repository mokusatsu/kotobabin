#!/usr/bin/env bash
set -euo pipefail
# Run from repository root; requires CairoSVG and ImageMagick, both used only for verification.
python - <<'PY'
import cairosvg
cairosvg.svg2png(url='public/assets/shared_frame/stamp_frame.svg',write_to='public/assets/originals/production/family-f/frame-verification.png')
PY
mkdir -p work/f-family
for n in 01 02 03 04 05 06; do
  magick -size 90x90 canvas:'#F5F1E7' '(' public/assets/originals/stamp_f${n}.png -resize 72x72 ')' -geometry +9+9 -composite '(' public/assets/originals/production/family-f/frame-verification.png -resize 90x90 ')' -geometry +0+0 -composite work/f-family/f${n}-90.png
  magick work/f-family/f${n}-90.png -colorspace Gray work/f-family/f${n}-gray.png
done
magick montage work/f-family/f01-90.png work/f-family/f02-90.png work/f-family/f03-90.png work/f-family/f04-90.png work/f-family/f05-90.png work/f-family/f06-90.png work/f-family/f01-gray.png work/f-family/f02-gray.png work/f-family/f03-gray.png work/f-family/f04-gray.png work/f-family/f05-gray.png work/f-family/f06-gray.png -tile 6x2 -geometry +6+6 -background '#F5F1E7' public/assets/originals/production/family-f/minimum-size-verification.png
