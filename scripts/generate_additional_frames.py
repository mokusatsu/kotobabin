"""Generate all 46 additional stamp frame transparent PNGs (1024x1024 RGBA)
from spec/initial/data/stamp_frame_catalog.json into public/assets/equipped_stamp_frame/
via gpt-image-2.6-flare, normalize each to an exact 1:1 square centered opening (~616x616)
with >=8px outer transparent margin while preserving inner-rim ornament overlaps,
verify geometry & alpha invariants, and build visual audit grids.
"""

import argparse
import base64
import concurrent.futures
import json
import random
import statistics
import sys
import threading
import time
import urllib.request
from collections import deque
from pathlib import Path

from openai import OpenAI
import numpy as np
from PIL import Image, ImageDraw

CATALOG_PATH = Path("spec/initial/data/stamp_frame_catalog.json")
OUT_DIR = Path("public/assets/equipped_stamp_frame")
DEFAULT_SHEET_DIR = Path(".tmp_sheets/additional_frames")
AUDIT_DIR = Path(".codex-temp/frame-audit")
SAMPLE_STAMP_PATH = Path("public/assets/achievement_stamp/stamp_a01.webp")

CANVAS_SIZE = 1024
OUTER_MARGIN = 8
TARGET_INSET = 204
TARGET_INNER_SIZE = CANVAS_SIZE - TARGET_INSET * 2  # 616x616 exact 1:1 square

_TRANSPARENT_LOCK = threading.Lock()
_TRANSPARENT_SUPPORTED: bool | None = None


class FrameGeometryError(RuntimeError):
    """Raised when a generated frame violates square opening or margin constraints."""


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


def load_additional_frames() -> list[dict]:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    out: list[dict] = []
    for grp in catalog["groups"]:
        for entry in grp["frames"]:
            if entry["filename"].endswith(".png"):
                out.append({**entry, "group": grp["name"]})
    return out


def build_prompt(entry: dict, transparent_bg: bool) -> str:
    if transparent_bg:
        bg_rule = (
            "1024x1024 RGBA PNG with a TRUE TRANSPARENT background outside the frame AND "
            "a TRUE TRANSPARENT empty square window in the exact center."
        )
        edge_rule = (
            "- Both the center opening and the outside of the outer frame edge MUST be 100% completely transparent."
        )
    else:
        bg_rule = (
            "1024x1024 isolated square picture frame centered on a PURE FLAT SOLID #FFFFFF WHITE background, "
            "with a PURE FLAT SOLID #FFFFFF WHITE empty square hole in the exact center."
        )
        edge_rule = (
            "- Pure flat solid #FFFFFF white everywhere outside the frame AND inside the square center hole.\n"
            "- Even for white/pale motifs (snow, clouds, white paper birds, white flowers, silver frost, ivory linen, milky glaze), "
            "always enclose outer contours with delicate thin sepia/slate fine ink lines so no motif edge merges into the #FFFFFF background."
        )

    return "\n".join([
        bg_rule,
        f"Theme \"{entry['name']}\" (Category: {entry['group']}): {entry['description']}",
        "Style: Delicate thin ink lines and soft gentle hand-painted watercolor illustration matching a cozy European-Japanese postal picture book.",
        "STRICT GEOMETRY & CONTENT RULES:",
        "- INNER OPENING: At the exact center of the 1024x1024 canvas, form an EXACT 1:1 SQUARE empty opening (~60% of canvas width and ~60% of canvas height, around 616x616px).",
        "- FRAME THICKNESS & MARGIN: Keep each of the four frame borders slim (approx 130px-170px wide per side) around the LARGE ~616x616 open square window, leaving at least 36px of clean empty margin from all four outer canvas edges (top, bottom, left, right) so nothing is clipped.",
        "- STRAIGHT INNER RIM: All four inner edges (top, bottom, left, right) MUST be crisp, continuous, straight closed lines forming a true square hole. Corner/edge decorations (clocks, flowers, leaves, lanterns, benches) may slightly overlap the inner rim naturally, but keep the central 50% viewing core completely clear and transparent.",
        edge_rule,
        "- ZERO text, ZERO letters, ZERO numbers, ZERO kanji/kana anywhere. Any signboard, wooden arrow, luggage tag, or shop banner MUST be completely blank/plain. Clock dials must have hands and tick marks ONLY with zero numerals.",
        "- ZERO humans, ZERO people, ZERO hands, ZERO characters, ZERO animals/mascots.",
    ])


def generate_raw_image(client: OpenAI, prompt_transparent: str, prompt_white: str) -> Image.Image:
    global _TRANSPARENT_SUPPORTED
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


def decode_api_image(item: object) -> Image.Image:
    from io import BytesIO

    b64 = getattr(item, "b64_json", None)
    if b64:
        return Image.open(BytesIO(base64.b64decode(b64))).convert("RGBA")
    url = getattr(item, "url", None)
    if url:
        with urllib.request.urlopen(url) as resp:  # noqa: S310
            return Image.open(BytesIO(resp.read())).convert("RGBA")
    raise RuntimeError("No image data returned from API")


def has_native_transparency(rgba: Image.Image) -> bool:
    w, h = rgba.size
    px = rgba.load()
    pts = [
        (4, 4),
        (w - 5, 4),
        (4, h - 5),
        (w - 5, h - 5),
        (w // 2, h // 2),
        (w // 2 - 40, h // 2 - 40),
        (w // 2 + 40, h // 2 + 40),
    ]
    return all(px[x, y][3] <= 20 for x, y in pts)


def flood_clear(
    rgba: Image.Image,
    seeds: list[tuple[int, int]],
    ref_rgb: tuple[float, float, float],
    max_dist: float,
    min_luma: int,
) -> None:
    """Clear contiguous near-background pixels in-place from seed points and feather 1px border."""
    w, h = rgba.size
    px = rgba.load()
    visited = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()
    rr, rg, rb = ref_rgb

    def matches(r: int, g: int, b: int, a: int) -> bool:
        if a == 0:
            return False
        luma = 0.299 * r + 0.587 * g + 0.114 * b
        if luma < min_luma:
            return False
        if r >= 242 and g >= 242 and b >= 242 and (max(r, g, b) - min(r, g, b)) <= 16:
            return True
        dist = ((r - rr) ** 2 + (g - rg) ** 2 + (b - rb) ** 2) ** 0.5
        return dist <= max_dist and (max(r, g, b) - min(r, g, b)) <= 26

    for sx, sy in seeds:
        if 0 <= sx < w and 0 <= sy < h:
            r, g, b, a = px[sx, sy]
            idx = sy * w + sx
            if not visited[idx] and matches(r, g, b, a):
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
                    if matches(r, g, b, a):
                        visited[idx] = 1
                        q.append((nx, ny))

    for cx, cy in cleared:
        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                r, g, b, a = px[nx, ny]
                if a > 0 and r >= 220 and g >= 220 and b >= 220 and (max(r, g, b) - min(r, g, b)) <= 22:
                    px[nx, ny] = (r, g, b, min(a, 110))


def sample_median_rgb(rgba: Image.Image, cx: int, cy: int, radius: int = 20) -> tuple[float, float, float]:
    w, h = rgba.size
    px = rgba.load()
    rs, gs, bs = [], [], []
    for y in range(max(0, cy - radius), min(h, cy + radius + 1)):
        for x in range(max(0, cx - radius), min(w, cx + radius + 1)):
            r, g, b, a = px[x, y]
            if a > 0:
                rs.append(r)
                gs.append(g)
                bs.append(b)
    if not rs:
        return (255.0, 255.0, 255.0)
    return (statistics.median(rs), statistics.median(gs), statistics.median(bs))


def scan_inner_edges(rgba: Image.Image, band_frac_lo: float = 0.30, band_frac_hi: float = 0.70, alpha_thresh: int = 100) -> tuple[list[int], list[int], list[int], list[int]]:
    w, h = rgba.size
    px = rgba.load()
    cx, cy = w // 2, h // 2

    def scan_dir(start_x: int, start_y: int, dx: int, dy: int, limit: int) -> int | None:
        run = 0
        first_hit = None
        for step in range(limit):
            x = start_x + dx * step
            y = start_y + dy * step
            if not (0 <= x < w and 0 <= y < h):
                return None
            if px[x, y][3] >= alpha_thresh:
                if run == 0:
                    first_hit = x if dx != 0 else y
                run += 1
                if run >= 3:
                    return first_hit
            else:
                run = 0
                first_hit = None
        return None

    lefts = [v for y in range(int(h * band_frac_lo), int(h * band_frac_hi), 4) if (v := scan_dir(cx, y, -1, 0, cx)) is not None]
    rights = [v for y in range(int(h * band_frac_lo), int(h * band_frac_hi), 4) if (v := scan_dir(cx, y, 1, 0, w - cx)) is not None]
    tops = [v for x in range(int(w * band_frac_lo), int(w * band_frac_hi), 4) if (v := scan_dir(x, cy, 0, -1, cy)) is not None]
    bottoms = [v for x in range(int(w * band_frac_lo), int(w * band_frac_hi), 4) if (v := scan_dir(x, cy, 0, 1, h - cy)) is not None]
    return lefts, rights, tops, bottoms


def detect_inner_opening(rgba: Image.Image) -> tuple[int, int, int, int]:
    lefts, rights, tops, bottoms = scan_inner_edges(rgba, 0.30, 0.70, alpha_thresh=100)
    if not (lefts and rights and tops and bottoms):
        raise FrameGeometryError("Could not detect complete 4-sided inner square opening")
    return (
        int(round(statistics.median(lefts))),
        int(round(statistics.median(tops))),
        int(round(statistics.median(rights))),
        int(round(statistics.median(bottoms))),
    )


def prune_disconnected_center_specks(rgba: Image.Image, inset: int, max_speck_area: int = 24) -> None:
    w, h = rgba.size
    px = rgba.load()
    visited = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()
    lim_lo = max(OUTER_MARGIN, inset - 3)
    lim_hi = min(CANVAS_SIZE - OUTER_MARGIN, CANVAS_SIZE - inset + 3)

    for y in range(h):
        for x in range(w):
            if lim_lo <= x < lim_hi and lim_lo <= y < lim_hi:
                continue
            if px[x, y][3] > 0:
                idx = y * w + x
                visited[idx] = 1
                q.append((x, y))

    while q:
        cx, cy = q.popleft()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < w and 0 <= ny < h:
                    idx = ny * w + nx
                    if not visited[idx] and px[nx, ny][3] > 0:
                        visited[idx] = 1
                        q.append((nx, ny))

    for y in range(lim_lo, lim_hi):
        for x in range(lim_lo, lim_hi):
            if px[x, y][3] > 0 and not visited[y * w + x]:
                comp: list[tuple[int, int]] = []
                cq: deque[tuple[int, int]] = deque([(x, y)])
                visited[y * w + x] = 1
                while cq:
                    cx, cy = cq.popleft()
                    comp.append((cx, cy))
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            if dx == 0 and dy == 0:
                                continue
                            nx, ny = cx + dx, cy + dy
                            if lim_lo <= nx < lim_hi and lim_lo <= ny < lim_hi:
                                idx = ny * w + nx
                                if not visited[idx] and px[nx, ny][3] > 0:
                                    visited[idx] = 1
                                    cq.append((nx, ny))
                if len(comp) <= max_speck_area:
                    for sx, sy in comp:
                        px[sx, sy] = (0, 0, 0, 0)


def clear_faint_alpha_dust(rgba: Image.Image, threshold: int = 8) -> None:
    w, h = rgba.size
    px = rgba.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a <= threshold:
                px[x, y] = (0, 0, 0, 0)


def clear_rect_zero(rgba: Image.Image, x0: int, y0: int, x1: int, y1: int) -> None:
    px = rgba.load()
    for y in range(max(0, y0), min(rgba.height, y1)):
        for x in range(max(0, x0), min(rgba.width, x1)):
            px[x, y] = (0, 0, 0, 0)


def validate_final_frame(canvas: Image.Image, filename: str) -> tuple[int, int, int, int]:
    if canvas.size != (CANVAS_SIZE, CANVAS_SIZE) or canvas.mode != "RGBA":
        raise FrameGeometryError(f"{filename}: invalid size/mode {canvas.size} {canvas.mode}")

    arr = np.asarray(canvas)
    alpha = arr[:, :, 3]
    # 1. Outer margin must be 100% transparent
    if (
        np.any(alpha[:OUTER_MARGIN, :] != 0)
        or np.any(alpha[CANVAS_SIZE - OUTER_MARGIN :, :] != 0)
        or np.any(alpha[:, :OUTER_MARGIN] != 0)
        or np.any(alpha[:, CANVAS_SIZE - OUTER_MARGIN :] != 0)
    ):
        raise FrameGeometryError(f"{filename}: non-zero alpha found in {OUTER_MARGIN}px outer margin")

    # 2. Central 40% viewing core [307, 307, 717, 717] must be 100% transparent
    core_lo = 307
    core_hi = 717
    core_nonzero = np.argwhere(alpha[core_lo:core_hi, core_lo:core_hi] != 0)
    if len(core_nonzero) > 0:
        ry, rx = core_nonzero[0]
        raise FrameGeometryError(
            f"{filename}: non-transparent pixel inside [{core_lo}..{core_hi}] at ({core_lo + rx},{core_lo + ry}) "
            f"alpha={int(alpha[core_lo + ry, core_lo + rx])}"
        )

    # 3. Inner transparent opening is centered ~616x616 square
    lefts, rights, tops, bottoms = scan_inner_edges(canvas, 0.25, 0.75, alpha_thresh=100)
    if not (lefts and rights and tops and bottoms):
        raise FrameGeometryError(f"{filename}: incomplete inner rim after scaling")
    ix0 = int(round(statistics.median(lefts)))
    ix1 = int(round(statistics.median(rights)))
    iy0 = int(round(statistics.median(tops)))
    iy1 = int(round(statistics.median(bottoms)))
    iw = ix1 - ix0
    ih = iy1 - iy0
    if not (606 <= iw <= 624 and 606 <= ih <= 624 and abs(iw - ih) <= 6):
        raise FrameGeometryError(f"{filename}: inner opening not ~616x616 square: {iw}x{ih}")

    # 4. Rim continuity check across central 80% of inner edges (just outside detected opening)
    def edge_coverage(coords: list[int], expected_count: int) -> float:
        return len(coords) / max(1, expected_count)

    expected_scans = (int(CANVAS_SIZE * 0.75) - int(CANVAS_SIZE * 0.25) + 3) // 4
    covs = [
        edge_coverage(lefts, expected_scans),
        edge_coverage(rights, expected_scans),
        edge_coverage(tops, expected_scans),
        edge_coverage(bottoms, expected_scans),
    ]
    if min(covs) < 0.85:
        raise FrameGeometryError(f"{filename}: inner rim gap detected (coverage={covs})")

    return (ix0, iy0, ix1, iy1)


def process_frame_rgba(raw_img: Image.Image, filename: str, allow_wide_border: bool = False) -> Image.Image:
    rgba = raw_img.convert("RGBA")
    if rgba.size != (CANVAS_SIZE, CANVAS_SIZE):
        rgba = rgba.resize((CANVAS_SIZE, CANVAS_SIZE), Image.Resampling.LANCZOS)
    w, h = rgba.size

    if has_native_transparency(rgba):
        clear_faint_alpha_dust(rgba, threshold=10)
    else:
        outer_seeds = (
            [(x, 0) for x in range(w)]
            + [(x, h - 1) for x in range(w)]
            + [(0, y) for y in range(h)]
            + [(w - 1, y) for y in range(h)]
        )
        flood_clear(rgba, outer_seeds, (255.0, 255.0, 255.0), max_dist=36.0, min_luma=230)
        center_rgb = sample_median_rgb(rgba, w // 2, h // 2, radius=24)
        center_seeds = [
            (x, y)
            for y in range(h // 2 - 48, h // 2 + 49, 8)
            for x in range(w // 2 - 48, w // 2 + 49, 8)
        ]
        flood_clear(rgba, center_seeds, center_rgb, max_dist=36.0, min_luma=205)
        clear_faint_alpha_dust(rgba, threshold=6)

    bbox = rgba.getbbox()
    if not bbox:
        raise FrameGeometryError(f"{filename}: empty canvas after background clear")
    ox0, oy0, ox1, oy1 = bbox

    ix0, iy0, ix1, iy1 = detect_inner_opening(rgba)
    inner_w = ix1 - (ix0 + 1)
    inner_h = iy1 - (iy0 + 1)
    if inner_w < w * 0.35 or inner_h < h * 0.35:
        raise FrameGeometryError(f"{filename}: inner opening too small: {inner_w}x{inner_h}")
    if max(inner_w / inner_h, inner_h / inner_w) > 1.28:
        raise FrameGeometryError(f"{filename}: inner opening too non-square: {inner_w}x{inner_h}")

    sx = TARGET_INNER_SIZE / inner_w
    sy = TARGET_INNER_SIZE / inner_h
    max_border = TARGET_INSET - OUTER_MARGIN - 2  # 194px when OUTER_MARGIN=8

    l_scaled = (ix0 + 1 - ox0) * sx
    r_scaled = (ox1 - ix1) * sx
    t_scaled = (iy0 + 1 - oy0) * sy
    b_scaled = (oy1 - iy1) * sy
    max_sb = max(l_scaled, r_scaled, t_scaled, b_scaled)
    if not allow_wide_border and max_sb > 245:
        raise FrameGeometryError(
            f"{filename}: raw border too thick to keep round motifs undistorted "
            f"(scaled L={l_scaled:.0f}, R={r_scaled:.0f}, T={t_scaled:.0f}, B={b_scaled:.0f})"
        )

    dst_x0 = TARGET_INSET - min(max_border, int(round(l_scaled)))
    dst_x1 = (TARGET_INSET + TARGET_INNER_SIZE) + min(max_border, int(round(r_scaled)))
    dst_y0 = TARGET_INSET - min(max_border, int(round(t_scaled)))
    dst_y1 = (TARGET_INSET + TARGET_INNER_SIZE) + min(max_border, int(round(b_scaled)))

    # Premultiply RGB by Alpha before MESH transform to avoid dark halos on transparent borders
    arr = np.asarray(rgba, dtype=np.float32)
    alpha_f = arr[:, :, 3:4] / 255.0
    arr_pm = arr.copy()
    arr_pm[:, :, :3] *= alpha_f
    premult_img = Image.fromarray(np.clip(np.round(arr_pm), 0, 255).astype(np.uint8), mode="RGBA")

    src_xs = [ox0, ix0 + 1, ix1, ox1]
    src_ys = [oy0, iy0 + 1, iy1, oy1]
    dst_xs = [dst_x0, TARGET_INSET, CANVAS_SIZE - TARGET_INSET, dst_x1]
    dst_ys = [dst_y0, TARGET_INSET, CANVAS_SIZE - TARGET_INSET, dst_y1]

    meshes: list[tuple[tuple[int, int, int, int], tuple[int, ...]]] = []
    for row in range(3):
        for col in range(3):
            dst_box = (dst_xs[col], dst_ys[row], dst_xs[col + 1], dst_ys[row + 1])
            sx0, sx1 = src_xs[col], src_xs[col + 1]
            sy0, sy1 = src_ys[row], src_ys[row + 1]
            src_quad = (sx0, sy0, sx0, sy1, sx1, sy1, sx1, sy0)
            meshes.append((dst_box, src_quad))

    warped_pm = premult_img.transform((CANVAS_SIZE, CANVAS_SIZE), Image.Transform.MESH, meshes, resample=Image.Resampling.BILINEAR)
    w_arr = np.asarray(warped_pm, dtype=np.float32)
    a_out = w_arr[:, :, 3:4]
    rgb_out = np.where(a_out > 0.5, np.clip(w_arr[:, :, :3] * (255.0 / np.maximum(a_out, 1.0)), 0, 255), 0.0)
    out_arr = np.concatenate([rgb_out, a_out], axis=2)
    out_arr[out_arr[:, :, 3] <= 8] = 0.0
    out_arr[:OUTER_MARGIN, :, :] = 0.0
    out_arr[CANVAS_SIZE - OUTER_MARGIN :, :, :] = 0.0
    out_arr[:, :OUTER_MARGIN, :] = 0.0
    out_arr[:, CANVAS_SIZE - OUTER_MARGIN :, :] = 0.0

    canvas = Image.fromarray(np.clip(np.round(out_arr), 0, 255).astype(np.uint8), mode="RGBA").copy()
    prune_disconnected_center_specks(canvas, inset=TARGET_INSET)
    validate_final_frame(canvas, filename)
    return canvas


def generate_one(
    client: OpenAI,
    entry: dict,
    sheet_dir: Path,
    force: bool,
) -> tuple[str, Image.Image]:
    filename = entry["filename"]
    stem = Path(filename).stem
    raw_path = sheet_dir / f"{stem}.png"
    out_path = OUT_DIR / filename

    if not force and out_path.exists() and raw_path.exists():
        try:
            with Image.open(out_path) as existing:
                rgba = existing.convert("RGBA")
                validate_final_frame(rgba, filename)
                return filename, rgba
        except Exception:  # noqa: BLE001
            pass

    prompt_t = build_prompt(entry, transparent_bg=True)
    prompt_w = build_prompt(entry, transparent_bg=False)

    last_err: Exception | None = None
    for attempt in range(1, 5):
        try:
            if force or attempt > 1 or not raw_path.exists():
                raw = generate_raw_image(client, prompt_t, prompt_w)
                raw.save(raw_path, format="PNG")
            else:
                raw = Image.open(raw_path).convert("RGBA")

            processed = process_frame_rgba(raw, filename, allow_wide_border=(attempt == 4))
            OUT_DIR.mkdir(parents=True, exist_ok=True)
            processed.save(out_path, format="PNG")
            return filename, processed
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            time.sleep(min(20.0, (2 ** attempt) + random.uniform(0.3, 1.2)))

    raise RuntimeError(f"Failed {filename} after retries: {last_err}")


def make_checkerboard(w: int, h: int, cell: int = 16) -> Image.Image:
    bg = Image.new("RGBA", (w, h), (236, 234, 228, 255))
    draw = ImageDraw.Draw(bg)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if ((x // cell) + (y // cell)) % 2 == 1:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=(212, 209, 202, 255))
    return bg


def write_audit_sheets(frames: list[tuple[dict, Image.Image]]) -> list[Path]:
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    tile = 256
    checker = make_checkerboard(tile, tile)
    inner_px = int(round(tile * 616 / CANVAS_SIZE))
    pad_px = (tile - inner_px) // 2

    stamp_tile = None
    if SAMPLE_STAMP_PATH.exists():
        with Image.open(SAMPLE_STAMP_PATH) as st:
            stamp_tile = st.convert("RGBA").resize((inner_px, inner_px), Image.Resampling.LANCZOS)

    paths: list[Path] = []
    # 12 frames per sheet: 3 columns of (checkerboard, composited) pairs x 4 rows -> 1536x1024
    per_sheet = 12
    for sheet_idx in range(0, len(frames), per_sheet):
        chunk = frames[sheet_idx : sheet_idx + per_sheet]
        sheet = Image.new("RGBA", (tile * 6, tile * 4), (250, 246, 238, 255))
        draw = ImageDraw.Draw(sheet)

        for idx, (entry, rgba) in enumerate(chunk):
            row, pair_col = divmod(idx, 3)
            x_left = pair_col * 2 * tile
            y_top = row * tile
            resized = rgba.resize((tile, tile), Image.Resampling.LANCZOS)

            c_cell = checker.copy()
            c_cell.alpha_composite(resized)
            sheet.paste(c_cell, (x_left, y_top))

            s_cell = Image.new("RGBA", (tile, tile), (255, 253, 247, 255))
            if stamp_tile is not None:
                s_cell.paste(stamp_tile, (pad_px, pad_px), stamp_tile)
            s_cell.alpha_composite(resized)
            sheet.paste(s_cell, (x_left + tile, y_top))

            label = entry["filename"].replace("reward_frame_", "").replace(".png", "")
            draw.rectangle((x_left, y_top, x_left + 190, y_top + 16), fill=(30, 30, 30, 255))
            draw.text((x_left + 5, y_top + 3), f"{sheet_idx + idx + 1:02d} {label}", fill=(255, 255, 255, 255))

        out_path = AUDIT_DIR / f"additional_frames_{(sheet_idx // per_sheet) + 1:02d}.png"
        sheet.convert("RGB").save(out_path)
        paths.append(out_path)
    return paths


def reprocess_one(entry: dict, sheet_dir: Path) -> tuple[str, Image.Image]:
    filename = entry["filename"]
    stem = Path(filename).stem
    raw_path = sheet_dir / f"{stem}.png"
    out_path = OUT_DIR / filename
    if not raw_path.exists():
        raise FileNotFoundError(f"Cached raw frame not found: {raw_path}")
    with Image.open(raw_path) as im:
        raw = im.convert("RGBA")
    processed = process_frame_rgba(raw, filename, allow_wide_border=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    processed.save(out_path, format="PNG")
    return filename, processed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Regenerate frames even if already valid")
    parser.add_argument("--workers", type=int, default=8, help="Parallel API workers")
    parser.add_argument("--frames", type=str, default=None, help="Comma-separated filenames or reward_frame_* stems")
    parser.add_argument("--reprocess", action="store_true", help="Reprocess existing raw PNGs without API calls")
    parser.add_argument("--audit-only", action="store_true", help="Rebuild audit sheets from disk without generating")
    parser.add_argument("--sheet-dir", type=Path, default=DEFAULT_SHEET_DIR)
    args = parser.parse_args()

    all_entries = load_additional_frames()
    if len(all_entries) != 46:
        print(f"Expected 46 PNG frames in catalog, found {len(all_entries)}", file=sys.stderr)
        return 1

    target_entries = all_entries
    if args.frames:
        wanted = {tok.strip().removesuffix(".png") for tok in args.frames.split(",") if tok.strip()}
        target_entries = [e for e in all_entries if Path(e["filename"]).stem in wanted]
        if len(target_entries) != len(wanted):
            found = {Path(e["filename"]).stem for e in target_entries}
            print(f"Unknown frame names: {sorted(wanted - found)}", file=sys.stderr)
            return 1

    args.sheet_dir.mkdir(parents=True, exist_ok=True)

    failures: list[tuple[str, Exception]] = []
    if args.reprocess:
        print(f"Reprocessing {len(target_entries)} frames from {args.sheet_dir}...", flush=True)
        for idx, entry in enumerate(target_entries, start=1):
            fname_expected = entry["filename"]
            try:
                fname, _ = reprocess_one(entry, args.sheet_dir)
                print(f"[{idx:02d}/{len(target_entries)}] Reprocessed: {fname}", flush=True)
            except Exception as exc:  # noqa: BLE001
                failures.append((fname_expected, exc))
                print(f"[FAILED] {fname_expected}: {exc}", file=sys.stderr, flush=True)
        if failures:
            print(f"{len(failures)} frame(s) failed:", file=sys.stderr, flush=True)
            for fname_expected, exc in failures:
                print(f"  - {fname_expected}: {exc}", file=sys.stderr, flush=True)
    elif not args.audit_only:
        client = OpenAI(api_key=load_openai_key())
        pending = sum(1 for e in target_entries if args.force or not (OUT_DIR / e["filename"]).exists())
        print(
            f"Generating {len(target_entries)} additional frames (pending={pending}, workers={args.workers})...",
            flush=True,
        )
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {
                pool.submit(generate_one, client, entry, args.sheet_dir, args.force): entry["filename"]
                for entry in target_entries
            }
            done = 0
            for fut in concurrent.futures.as_completed(futures):
                fname_expected = futures[fut]
                try:
                    fname, _ = fut.result()
                    done += 1
                    print(f"[{done:02d}/{len(target_entries)}] Verified: {fname}", flush=True)
                except Exception as exc:  # noqa: BLE001
                    failures.append((fname_expected, exc))
                    print(f"[FAILED] {fname_expected}: {exc}", file=sys.stderr, flush=True)

        if failures:
            print(f"{len(failures)} frame(s) failed:", file=sys.stderr, flush=True)
            for fname_expected, exc in failures:
                print(f"  - {fname_expected}: {exc}", file=sys.stderr, flush=True)

    loaded_for_audit: list[tuple[dict, Image.Image]] = []
    for entry in all_entries:
        p = OUT_DIR / entry["filename"]
        if p.exists():
            with Image.open(p) as im:
                loaded_for_audit.append((entry, im.convert("RGBA")))

    if len(loaded_for_audit) == len(all_entries):
        audit_paths = write_audit_sheets(loaded_for_audit)
        print(f"Audit sheets written ({len(audit_paths)}): {', '.join(str(p) for p in audit_paths)}", flush=True)
    elif loaded_for_audit:
        audit_paths = write_audit_sheets(loaded_for_audit)
        print(f"Partial audit sheets written ({len(loaded_for_audit)}/{len(all_entries)}): {', '.join(str(p) for p in audit_paths)}", flush=True)

    return 1 if (not args.audit_only and failures) else 0


if __name__ == "__main__":
    raise SystemExit(main())
