"""Generate invalidated delivery achievement stamps (6 motifs -> 9 WebP files)
and extra-delivery progress mark icons (empty & lit 128x128 RGBA WebP files)
via gpt-image-2.6-flare, plus build a visual inspection audit sheet.
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
from io import BytesIO
import math
import random
import shutil
import sys
import threading
import time
import urllib.request
from collections import deque
from pathlib import Path

from openai import OpenAI
from PIL import Image, ImageDraw, ImageFilter, ImageFont

STAMP_DIR = Path("public/assets/achievement_stamp")
UI_ICON_DIR = Path("public/assets/ui_icon")
DEFAULT_SHEET_DIR = Path(".tmp_sheets/delivery_revision")
DEFAULT_AUDIT_DIR = Path(".codex-temp/asset-audit")

COMMON_STAMP_STYLE = (
    "Art style: Warm, gentle hand-painted watercolor and fine sepia/brown ink-line storybook illustration "
    "fading softly at its vignette edges into a uniform soft warm cream-white paper background (#FAF6EE). "
    "Cozy European-Japanese postal town aesthetic matching warm storybook picture books.\n"
    "STRICT LAYOUT & CONTENT RULES:\n"
    "- Leave a clean, soft empty #FAF6EE cream margin (around 8-10% padding) on all 4 sides with gentle feathered watercolor edges.\n"
    "- NO borders, NO frames, NO stamp perforations, NO dividing lines, NO solid box edge.\n"
    "- STRICTLY ZERO text, ZERO letters, ZERO numbers/digits, ZERO kanji/kana, ZERO labels, ZERO UI elements anywhere.\n"
    "- STRICTLY 100% UNINHABITED still-life / scenic composition: ZERO humans, ZERO people, ZERO hands, ZERO fingers, ZERO faces, ZERO silhouettes, ZERO animals or mascots."
)

STAMP_SPECS: list[dict[str, str | None]] = [
    {
        "key": "stamp_b01",
        "out": "stamp_b01.webp",
        "alias": None,
        "label": "B01 前半のお届け",
        "prompt": (
            "1024x1024 isolated square watercolor vignette illustration on #FAF6EE warm cream paper.\n"
            "Subject: A cozy postal town morning delivery departure in strong diagonal composition. "
            "In the upper-left background rises a charming small timber-and-stone town clock tower bathed in fresh morning sunlight; "
            "CRITICAL CLOCK RULE: the round cream clock face has two simple dark hands and short plain tick marks ONLY — strictly ZERO numbers, ZERO Arabic digits, ZERO Roman numerals anywhere. "
            "Diagonally in the lower-right foreground, a wooden two-wheeled regular postal delivery handcart packed brimming full with five neatly twine-tied craft-paper parcels rolls briskly forward across sunlit cobblestones, with drifting green leaves and blank paper tags fluttering in the morning breeze.\n"
            + COMMON_STAMP_STYLE
        ),
    },
    {
        "key": "stamp_b05",
        "out": "stamp_b05.webp",
        "alias": None,
        "label": "B05 送り出して、もう一便",
        "prompt": (
            "1024x1024 isolated square watercolor vignette illustration on #FAF6EE warm cream paper.\n"
            "Subject: A gently curving sunlit cobblestone town slope winding upward between low wooden fences, garden greenery, and warm tiled eaves. "
            "TWO wooden two-wheeled postal delivery handcarts of the EXACT SAME cart size and build travel one behind the other in the same uphill direction along the single curving lane: "
            "further ahead around the upper bend rolls the leading brimming regular delivery cart loaded with five tied craft-paper parcels; "
            "following close behind along the lower foreground curve rolls the second extra-delivery handcart (same cart size, placed closer in foreground perspective and distinguished by a bright terracotta-red triangular postal pennant flag flying from a slim wooden mast above its parcels).\n"
            + COMMON_STAMP_STYLE
        ),
    },
    {
        "key": "stamp_b06",
        "out": "stamp_b06.webp",
        "alias": None,
        "label": "B06 出発のあと一問",
        "prompt": (
            "1024x1024 isolated square watercolor vignette illustration on #FAF6EE warm cream paper.\n"
            "Subject: Diagonal foreground-to-background composition seen from inside an open sunny postal workshop doorway/window sill. "
            "In the lower-left foreground resting on a warm oak desk sits a single fresh, blank cream-ivory letter envelope sealed with a terracotta-red wax seal beside a wooden dip pen and twine spool (completely blank envelope, zero writing, zero hands). "
            "Diagonally in the upper-right outside beyond the sunlit open doorway, a brimming wooden two-wheeled postal delivery cart packed with tied craft-paper parcels rolls briskly away down a quiet cobblestone lane.\n"
            + COMMON_STAMP_STYLE
        ),
    },
    {
        "key": "stamp_series_back_steps_1",
        "out": "stamp_series_back_steps_1.webp",
        "alias": "stamp_series_back_steps.webp",
        "label": "折り返しのお届け",
        "prompt": (
            "1024x1024 isolated square watercolor vignette illustration on #FAF6EE warm cream paper.\n"
            "Subject: A scenic U-shaped curving cobblestone town turnaround lane looping gracefully around a central sunlit stone garden archway and brass lamppost (symbolizing outbound first half and inbound return half). "
            "On the left outbound curve bathed in crisp cool morning sunlight rolls a brimming wooden regular parcel cart paired closely with a red-pennant extra-delivery cart heading out. "
            "On the right return curve bathed in warm golden late-afternoon sunlight and glowing warm streetlamp light rolls a brimming wooden regular parcel cart paired closely with a red-pennant extra-delivery cart returning past flower-lined cottage doorsteps.\n"
            + COMMON_STAMP_STYLE
        ),
    },
    {
        "key": "stamp_series_between_full_1",
        "out": "stamp_series_between_full_1.webp",
        "alias": "stamp_series_between_full.webp",
        "label": "真ん中の追加便",
        "prompt": (
            "1024x1024 isolated square watercolor vignette illustration on #FAF6EE warm cream paper.\n"
            "Subject: Along a wide sunlit cobblestone postal avenue receding gently into perspective, THREE brimming wooden regular cargo handcarts loaded with tied craft-paper parcels are clearly spaced in a neat row one behind another: "
            "the 1st regular cart ahead in the upper distance, the 2nd (MIDDLE) regular cart prominently centered in the midground, and the 3rd regular cart trailing in the lower foreground. "
            "Right alongside the 2nd (MIDDLE) cart ONLY in the center of the composition, a nimble wooden extra-delivery parcel cart flying a crisp crimson-red triangular postal pennant flag travels side-by-side in tandem with that middle cart, while the 1st and 3rd carts travel alone.\n"
            + COMMON_STAMP_STYLE
        ),
    },
    {
        "key": "stamp_series_first_twenty_by_four_1",
        "out": "stamp_series_first_twenty_by_four_1.webp",
        "alias": "stamp_series_first_twenty_by_four.webp",
        "label": "二十問のお届け",
        "prompt": (
            "1024x1024 isolated square watercolor vignette illustration on #FAF6EE warm cream paper.\n"
            "Subject: A cheerful, clearly countable procession of EXACTLY FOUR wooden extra-delivery handcarts — each loaded with ribbon-tied craft-paper parcels and each flying a crisp bright crimson-red triangular postal pennant flag on a small mast — "
            "rolling one after another in clear rhythmic spacing down a sunlit winding cobblestone town slope lined with warm stone cottages, terracotta rooftops, flower boxes, and fluttering ribbons from open window sills.\n"
            + COMMON_STAMP_STYLE
        ),
    },
]

_TRANSPARENT_LOCK = threading.Lock()
_TRANSPARENT_SUPPORTED: bool | None = None


def load_openai_key() -> str:
    env_path = Path(".env")
    if not env_path.exists():
        raise RuntimeError(".env file not found")
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith("OPENAI_KEY="):
            key = stripped.split("=", 1)[1].strip().strip('"').strip("'")
            if key:
                return key
    raise RuntimeError("OPENAI_KEY not found in .env")


def decode_api_image(item: object) -> Image.Image:
    b64 = getattr(item, "b64_json", None)
    if b64:
        return Image.open(BytesIO(base64.b64decode(b64))).convert("RGBA")
    url = getattr(item, "url", None)
    if url:
        with urllib.request.urlopen(url) as resp:  # noqa: S310
            return Image.open(BytesIO(resp.read())).convert("RGBA")
    raise RuntimeError("No image data returned from API")


def generate_stamp_image(client: OpenAI, prompt: str) -> Image.Image:
    last_err: Exception | None = None
    for attempt in range(1, 6):
        try:
            resp = client.images.generate(
                model="gpt-image-2.6-flare",
                prompt=prompt,
                size="1024x1024",
                n=1,
            )
            return decode_api_image(resp.data[0])
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            backoff = min(30.0, (2 ** attempt) + random.uniform(0.5, 2.0))
            time.sleep(backoff)
    raise RuntimeError(f"Stamp generation failed after retries: {last_err}")


def generate_envelope_raw(client: OpenAI) -> Image.Image:
    global _TRANSPARENT_SUPPORTED

    prompt_transparent = (
        "1024x1024 icon asset on a 100% TRUE TRANSPARENT background (zero backdrop, zero drop shadow).\n"
        "Subject: ONE single crisp, symmetrical, straight front-facing horizontal rectangular vintage cream-ivory paper envelope "
        "(#F8F1DE warm cream paper fill with gentle paper warmth), centered horizontally and vertically, filling roughly 84% of canvas width and 64% of canvas height.\n"
        "CRITICAL LINE & LEGIBILITY RULES:\n"
        "- Draw a BOLD, thick, closed dark forest-espresso ink outer outline (#203D36) around all 4 sides of the rectangle so it remains sharp and crisp even when scaled down to 17x17px.\n"
        "- Draw clean, bold dark ink V-shaped top envelope flap fold lines meeting neatly above center and crisp diagonal lower seam lines.\n"
        "- The center of the envelope MUST be 100% OPEN and EMPTY cream paper — NO wax seal, NO stamp, NO checkmark, NO heart, NO lines crossing the center.\n"
        "- NO text, NO letters, NO numbers, NO postage marks, NO shadows, NO border frame."
    )
    prompt_white = (
        "1024x1024 icon asset centered on a PURE FLAT SOLID #FFFFFF WHITE background (zero drop shadow, zero gradient).\n"
        "Subject: ONE single crisp, symmetrical, straight front-facing horizontal rectangular vintage cream-ivory paper envelope "
        "(#F6ECD2 warm cream paper fill), centered horizontally and vertically, filling roughly 84% of canvas width and 64% of canvas height.\n"
        "CRITICAL LINE & LEGIBILITY RULES:\n"
        "- Draw a BOLD, thick, completely closed dark forest-espresso ink outer outline (#203D36) around all 4 edges with zero gaps so the cream envelope interior is completely sealed off from the #FFFFFF background.\n"
        "- Draw clean, bold dark ink V-shaped top envelope flap fold lines and crisp diagonal lower seam lines.\n"
        "- The center of the envelope MUST be 100% OPEN and EMPTY cream paper — NO wax seal, NO stamp, NO checkmark, NO text, NO labels, NO drop shadow."
    )

    last_err: Exception | None = None
    for attempt in range(1, 6):
        try:
            with _TRANSPARENT_LOCK:
                try_transparent = _TRANSPARENT_SUPPORTED is not False

            if try_transparent:
                try:
                    resp = client.images.generate(
                        model="gpt-image-2.6-flare",
                        prompt=prompt_transparent,
                        size="1024x1024",
                        background="transparent",
                        output_format="png",
                        n=1,
                    )
                    with _TRANSPARENT_LOCK:
                        _TRANSPARENT_SUPPORTED = True
                    return decode_api_image(resp.data[0])
                except Exception as exc:  # noqa: BLE001
                    msg = str(exc).lower()
                    if any(tok in msg for tok in ("unknown parameter", "background", "output_format", "invalid_value", "unsupported")):
                        with _TRANSPARENT_LOCK:
                            _TRANSPARENT_SUPPORTED = False
                    else:
                        raise

            resp = client.images.generate(
                model="gpt-image-2.6-flare",
                prompt=prompt_white,
                size="1024x1024",
                n=1,
            )
            return decode_api_image(resp.data[0])
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            backoff = min(30.0, (2 ** attempt) + random.uniform(0.5, 2.0))
            time.sleep(backoff)
    raise RuntimeError(f"Envelope icon generation failed after retries: {last_err}")


def has_outer_transparency(rgba: Image.Image) -> bool:
    w, h = rgba.size
    px = rgba.load()
    pts = [
        (4, 4),
        (w - 5, 4),
        (4, h - 5),
        (w - 5, h - 5),
        (w // 2, 4),
        (w // 2, h - 5),
        (4, h // 2),
        (w - 5, h // 2),
    ]
    return all(px[x, y][3] <= 20 for x, y in pts)


def flood_clear_outer_bg(rgba: Image.Image) -> Image.Image:
    """Clear contiguous pure/near-white background from canvas edges, keeping enclosed envelope fill intact."""
    out = rgba.copy()
    w, h = out.size
    px = out.load()
    visited = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    # Sample corners for background reference
    corner_samples = [px[4, 4], px[w - 5, 4], px[4, h - 5], px[w - 5, h - 5]]
    ref_r = sum(c[0] for c in corner_samples) / 4.0
    ref_g = sum(c[1] for c in corner_samples) / 4.0
    ref_b = sum(c[2] for c in corner_samples) / 4.0

    def is_bg(r: int, g: int, b: int, a: int) -> bool:
        if a == 0:
            return False
        luma = 0.299 * r + 0.587 * g + 0.114 * b
        if luma < 220:
            return False
        dist = math.sqrt((r - ref_r) ** 2 + (g - ref_g) ** 2 + (b - ref_b) ** 2)
        return dist <= 34.0 and (max(r, g, b) - min(r, g, b)) <= 24

    seeds: list[tuple[int, int]] = []
    for x in range(w):
        seeds.append((x, 0))
        seeds.append((x, h - 1))
    for y in range(h):
        seeds.append((0, y))
        seeds.append((w - 1, y))

    for sx, sy in seeds:
        r, g, b, a = px[sx, sy]
        idx = sy * w + sx
        if not visited[idx] and is_bg(r, g, b, a):
            visited[idx] = 1
            q.append((sx, sy))

    cleared: list[tuple[int, int]] = []
    while q:
        cx, cy = q.popleft()
        px[cx, cy] = (0, 0, 0, 0)
        cleared.append((cx, cy))
        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                idx = ny * w + nx
                if not visited[idx]:
                    r, g, b, a = px[nx, ny]
                    if is_bg(r, g, b, a):
                        visited[idx] = 1
                        q.append((nx, ny))

    # Soften 1px anti-aliased bright fringe bordering the ink edge
    for cx, cy in cleared:
        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                r, g, b, a = px[nx, ny]
                if a > 0 and r >= 210 and g >= 210 and b >= 210 and (max(r, g, b) - min(r, g, b)) <= 24:
                    px[nx, ny] = (r, g, b, min(a, 96))

    return out


def normalize_envelope_icon(raw: Image.Image, size: int = 128) -> Image.Image:
    rgba = raw.convert("RGBA")
    if not has_outer_transparency(rgba):
        rgba = flood_clear_outer_bg(rgba)

    w, h = rgba.size
    center_alpha = rgba.getpixel((w // 2, h // 2))[3]
    if center_alpha < 200:
        raise RuntimeError(
            f"Envelope center became transparent (alpha={center_alpha}); ink outline likely had a gap."
        )

    # Compute bounding box over meaningfully visible pixels (alpha > 16)
    alpha_band = rgba.getchannel("A")
    mask = alpha_band.point(lambda a: 255 if a > 16 else 0)
    bbox = mask.getbbox()
    if not bbox:
        raise RuntimeError("Empty envelope artwork after background removal")

    cropped = rgba.crop(bbox)
    cw, ch = cropped.size
    max_w = 116  # Leaves 6px transparent padding left & right on 128x128
    max_h = 104  # Keeps safe vertical padding if aspect is taller
    scale = min(max_w / max(1, cw), max_h / max(1, ch))
    nw = max(1, round(cw * scale))
    nh = max(1, round(ch * scale))
    resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - nw) // 2
    oy = (size - nh) // 2
    canvas.paste(resized, (ox, oy), resized)
    return canvas


def add_wax_seal_and_check(empty_icon: Image.Image) -> Image.Image:
    """Composite a 4x supersampled deep-green wax seal & bold white checkmark onto the exact empty icon."""
    size = empty_icon.size[0]
    hi = size * 4  # 512x512 for crisp anti-aliased curves
    cx, cy = hi // 2, hi // 2

    def seal_poly(base_r: float, offset_x: float = 0.0, offset_y: float = 0.0) -> list[tuple[float, float]]:
        pts: list[tuple[float, float]] = []
        steps = 120
        for i in range(steps):
            theta = (2.0 * math.pi * i) / steps
            wobble = (
                1.0
                + 0.022 * math.sin(5.0 * theta + 0.3)
                + 0.016 * math.cos(3.0 * theta + 0.8)
                + 0.010 * math.sin(9.0 * theta - 0.5)
            )
            r = base_r * wobble
            pts.append((cx + offset_x + r * math.cos(theta), cy + offset_y + r * math.sin(theta)))
        return pts

    # 1. Soft shadow beneath seal
    shadow_layer = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow_layer)
    s_draw.polygon(seal_poly(158.0, offset_x=6.0, offset_y=10.0), fill=(24, 38, 34, 110))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=9))

    # 2. Painterly deep-green wax seal body
    seal_layer = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    draw = ImageDraw.Draw(seal_layer)

    # Dark outer rim for crisp contrast against warm cream paper
    draw.polygon(seal_poly(156.0), fill=(20, 52, 45, 255))
    # Main deep forest green wax body (#24594F)
    draw.polygon(seal_poly(144.0), fill=(36, 89, 79, 255))
    # Subtle top-left warm highlight ridge on wax bevel
    draw.arc([cx - 134, cy - 134, cx + 134, cy + 134], start=198, end=288, fill=(58, 128, 113, 185), width=12)
    # Recessed inner ring groove (#1B473E) + inner stamped face (#24594F)
    draw.ellipse([cx - 122, cy - 122, cx + 122, cy + 122], fill=(27, 71, 62, 255))
    draw.ellipse([cx - 112, cy - 112, cx + 112, cy + 112], fill=(36, 89, 79, 255))

    # 3. Bold pure-white rounded checkmark (#FFFFFF)
    # Slightly darker drop halo under the white check for effortless small-size legibility
    p1 = (cx - 64, cy + 4)
    p2 = (cx - 16, cy + 52)
    p3 = (cx + 72, cy - 46)

    def draw_rounded_check(
        target_draw: ImageDraw.ImageDraw,
        pts: tuple[tuple[int, int], tuple[int, int], tuple[int, int]],
        stroke: int,
        color: tuple[int, int, int, int],
        dy: int = 0,
    ) -> None:
        a, b, c = ((px, py + dy) for px, py in pts)
        target_draw.line([a, b], fill=color, width=stroke)
        target_draw.line([b, c], fill=color, width=stroke)
        rad = stroke / 2.0
        for px, py in (a, b, c):
            target_draw.ellipse([px - rad, py - rad, px + rad, py + rad], fill=color)

    draw_rounded_check(draw, (p1, p2, p3), stroke=52, color=(20, 52, 45, 210), dy=5)
    draw_rounded_check(draw, (p1, p2, p3), stroke=46, color=(255, 255, 255, 255), dy=0)

    overlay_hi = Image.alpha_composite(shadow_layer, seal_layer)
    overlay = overlay_hi.resize((size, size), Image.Resampling.LANCZOS)
    return Image.alpha_composite(empty_icon, overlay)


def process_stamp(
    client: OpenAI,
    spec: dict[str, str | None],
    sheet_dir: Path,
    force: bool,
) -> str:
    key = spec["key"]
    assert key is not None
    out_name = spec["out"]
    assert out_name is not None
    prompt = spec["prompt"]
    assert prompt is not None

    out_path = STAMP_DIR / out_name
    alias_name = spec["alias"]
    alias_path = (STAMP_DIR / alias_name) if alias_name else None
    raw_path = sheet_dir / f"{key}.png"

    if force or not raw_path.exists():
        img = generate_stamp_image(client, prompt)
        img.save(raw_path, format="PNG")
    else:
        img = Image.open(raw_path)

    resized = img.convert("RGB").resize((512, 512), Image.Resampling.LANCZOS)
    resized.save(out_path, format="WEBP", quality=90, method=6)
    if alias_path is not None:
        shutil.copy2(out_path, alias_path)
    return key


def process_extra_delivery_marks(client: OpenAI, sheet_dir: Path, force: bool) -> str:
    UI_ICON_DIR.mkdir(parents=True, exist_ok=True)
    raw_path = sheet_dir / "extra_delivery_mark_empty_raw.png"
    empty_path = UI_ICON_DIR / "extra_delivery_mark_empty.webp"
    lit_path = UI_ICON_DIR / "extra_delivery_mark_lit.webp"

    if force or not raw_path.exists():
        raw = generate_envelope_raw(client)
        raw.save(raw_path, format="PNG")
    else:
        raw = Image.open(raw_path).convert("RGBA")

    empty_icon = normalize_envelope_icon(raw, size=128)
    lit_icon = add_wax_seal_and_check(empty_icon)

    empty_icon.save(empty_path, format="WEBP", lossless=True, quality=100, method=6)
    lit_icon.save(lit_path, format="WEBP", lossless=True, quality=100, method=6)
    return "extra_delivery_marks"


def make_checkerboard(w: int, h: int, cell: int = 8) -> Image.Image:
    board = Image.new("RGBA", (w, h), (235, 232, 224, 255))
    draw = ImageDraw.Draw(board)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if ((x // cell) + (y // cell)) % 2 == 1:
                draw.rectangle([x, y, x + cell - 1, y + cell - 1], fill=(208, 204, 194, 255))
    return board


def build_audit_sheet(audit_dir: Path) -> Path:
    audit_dir.mkdir(parents=True, exist_ok=True)
    out_path = audit_dir / "delivery_revision_audit.png"

    tile = 300
    pad = 24
    cols, rows = 3, 2
    stamps_w = cols * tile + (cols + 1) * pad
    stamps_h = rows * (tile + 28) + (rows + 1) * pad
    marks_h = 460
    canvas = Image.new("RGBA", (stamps_w, stamps_h + marks_h), (245, 241, 231, 255))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()

    for idx, spec in enumerate(STAMP_SPECS):
        r, c = divmod(idx, cols)
        x = pad + c * (tile + pad)
        y = pad + r * (tile + 28 + pad)
        stamp_file = STAMP_DIR / str(spec["out"])
        if stamp_file.exists():
            im = Image.open(stamp_file).convert("RGBA").resize((tile, tile), Image.Resampling.LANCZOS)
            canvas.paste(im, (x, y))
        draw.rectangle([x, y, x + tile, y + tile], outline=(180, 175, 165, 255), width=1)
        draw.text((x + 4, y + tile + 6), f"{spec['key']}", fill=(32, 61, 54, 255), font=font)

    # Extra delivery marks audit band
    band_y = stamps_h + 12
    draw.line([(pad, band_y - 6), (stamps_w - pad, band_y - 6)], fill=(201, 208, 195, 255), width=2)
    empty_path = UI_ICON_DIR / "extra_delivery_mark_empty.webp"
    lit_path = UI_ICON_DIR / "extra_delivery_mark_lit.webp"
    if empty_path.exists() and lit_path.exists():
        empty_im = Image.open(empty_path).convert("RGBA")
        lit_im = Image.open(lit_path).convert("RGBA")

        # 128x128 checkerboard comparison
        for idx, (label, icon) in enumerate([("empty 128px", empty_im), ("lit 128px", lit_im)]):
            bx = pad + idx * 160
            by = band_y + 12
            bg = make_checkerboard(128, 128)
            comp = Image.alpha_composite(bg, icon)
            canvas.paste(comp, (bx, by))
            draw.text((bx, by + 134), label, fill=(32, 61, 54, 255), font=font)

        # Progress strips at actual sizes + 2x retina + grayscale
        strip_x = pad + 350
        strip_y = band_y + 12
        cases = [
            ("17px paper 0/5", 17, 0, (255, 253, 247, 255), False),
            ("17px paper 3/5", 17, 3, (255, 253, 247, 255), False),
            ("17px complete 5/5", 17, 5, (249, 236, 201, 255), False),
            ("22px paper 3/5", 22, 3, (255, 253, 247, 255), False),
            ("34px (2x) 3/5", 34, 3, (255, 253, 247, 255), False),
            ("44px (2x) complete", 44, 5, (249, 236, 201, 255), False),
            ("17px GRAYSCALE 3/5", 17, 3, (255, 253, 247, 255), True),
            ("34px GRAYSCALE 3/5", 34, 3, (255, 253, 247, 255), True),
        ]
        cur_y = strip_y
        for label, sz, lit_count, bg_color, gray in cases:
            e_sz = empty_im.resize((sz, sz), Image.Resampling.LANCZOS)
            l_sz = lit_im.resize((sz, sz), Image.Resampling.LANCZOS)
            gap = max(3, round(sz * 0.22))
            box_w = sz * 5 + gap * 4 + 16
            box_h = sz + 10
            strip_bg = Image.new("RGBA", (box_w, box_h), bg_color)
            for slot in range(5):
                icon = l_sz if slot < lit_count else e_sz
                ix = 8 + slot * (sz + gap)
                iy = 5
                strip_bg.alpha_composite(icon, (ix, iy))
            if gray:
                strip_bg = strip_bg.convert("L").convert("RGBA")
            canvas.paste(strip_bg, (strip_x, cur_y))
            draw.rectangle([strip_x, cur_y, strip_x + box_w, cur_y + box_h], outline=(190, 190, 180, 255), width=1)
            draw.text((strip_x + box_w + 12, cur_y + max(0, (box_h - 12) // 2)), label, fill=(32, 61, 54, 255), font=font)
            cur_y += box_h + 10

    canvas.convert("RGB").save(out_path, format="PNG")
    return out_path


def main() -> int:
    valid_keys = {str(s["key"]) for s in STAMP_SPECS} | {"extra_delivery_marks"}
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Regenerate selected assets even if raw cache exists")
    parser.add_argument("--only", type=str, default="", help=f"Comma-separated keys from {sorted(valid_keys)}")
    parser.add_argument("--workers", type=int, default=4, help="Parallel API workers")
    parser.add_argument("--sheet-dir", type=Path, default=DEFAULT_SHEET_DIR)
    parser.add_argument("--audit-dir", type=Path, default=DEFAULT_AUDIT_DIR)
    args = parser.parse_args()

    only_set = {tok.strip() for tok in args.only.split(",") if tok.strip()} if args.only else valid_keys
    unknown = only_set - valid_keys
    if unknown:
        print(f"Unknown --only key(s): {sorted(unknown)}. Valid keys: {sorted(valid_keys)}", file=sys.stderr)
        return 1

    STAMP_DIR.mkdir(parents=True, exist_ok=True)
    UI_ICON_DIR.mkdir(parents=True, exist_ok=True)
    args.sheet_dir.mkdir(parents=True, exist_ok=True)

    client = OpenAI(api_key=load_openai_key())

    selected_stamps = [s for s in STAMP_SPECS if s["key"] in only_set]
    run_marks = "extra_delivery_marks" in only_set
    print(
        f"Generating delivery revision assets (stamps={len(selected_stamps)}, "
        f"marks={run_marks}, force={args.force}, workers={args.workers})...",
        flush=True,
    )

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures: list[concurrent.futures.Future[str]] = []
        for spec in selected_stamps:
            futures.append(pool.submit(process_stamp, client, spec, args.sheet_dir, args.force))
        if run_marks:
            futures.append(pool.submit(process_extra_delivery_marks, client, args.sheet_dir, args.force))

        for fut in concurrent.futures.as_completed(futures):
            done_key = fut.result()
            print(f"[done] {done_key}", flush=True)

    audit_path = build_audit_sheet(args.audit_dir)
    print(f"Audit sheet written to: {audit_path}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
