"""Generate the 4 collectible stamp frames (leaf, plaza, sunset, journey) at 1024x1024
via gpt-image-2.6-flare with an exact 1:1 square transparent inner cutout ([84, 84, 428, 428]
on a 512x512 RGBA canvas, zero opaque center fill, zero SVG <mask>), and export identical
self-contained SVGs to both public/assets/milestone_svg/ and public/assets/equipped_stamp_frame/.
"""

import argparse
import base64
import concurrent.futures
import json
import statistics
import sys
import time
import urllib.request
from collections import deque
from io import BytesIO
from pathlib import Path

from openai import OpenAI
from PIL import Image, ImageDraw

MANIFEST_PATH = Path("spec/initial/data/visual_resource_manifest.json")
MILESTONE_SVG_DIR = Path("public/assets/milestone_svg")
EQUIPPED_FRAME_DIR = Path("public/assets/equipped_stamp_frame")
DEFAULT_SHEET_DIR = Path(".tmp_sheets/reward_frames")
AUDIT_PATH = Path(".codex-temp/frame-audit/frames_preview.png")
SAMPLE_STAMP_PATH = Path("public/assets/achievement_stamp/stamp_a01.webp")

CANVAS_SIZE = 512
TARGET_INSET = 102
TARGET_INNER_SIZE = CANVAS_SIZE - TARGET_INSET * 2  # 308x308 exact 1:1 square

FRAME_CONFIGS: dict[str, dict[str, str]] = {
    "reward_frame_leaf": {
        "name": "若葉の額縁",
        "prompt": (
            "An isolated 1:1 square botanical picture frame on a pure solid flat #FFFFFF white background.\n"
            "INNER WINDOW GEOMETRY: At the exact center of the canvas is a continuous, crisp thin antique-gold rectangular "
            "square inner frame molding forming an EXACT 1:1 square empty window (~67% width and ~67% height of the canvas). "
            "Inside this square gold molding is 100% EMPTY pure flat solid #FFFFFF white void (NO cream parchment paper, NO gradient, NO shading).\n"
            "DECORATION AROUND THE OUTSIDE OF THE SQUARE GOLD MOLDING:\n"
            "- Young fresh spring green beech/laurel branches sprout symmetrically from the bottom-left and bottom-right outer corners.\n"
            "- Vibrant watercolor green leaves climb up along the outside of the left and right vertical bars, with crisp leaf tips "
            "gently fanning outward along the sides.\n"
            "- The top horizontal thin gold molding bar remains open and airy in the center, framed near the top corners by light leaf tips.\n"
            "Keep all leaves and branches outside the gold inner square rim, leaving at least 24px pure #FFFFFF margin from the outer canvas edges."
        ),
    },
    "reward_frame_plaza": {
        "name": "広場の額縁",
        "prompt": (
            "An isolated 1:1 square architectural cobblestone plaza picture frame on a pure solid flat #FFFFFF white background.\n"
            "INNER WINDOW GEOMETRY: At the exact center of the canvas is a continuous, crisp warm sandstone-and-gold square inner rim "
            "forming an EXACT 1:1 square empty window (~67% width and ~67% height of the canvas). "
            "Inside this square inner rim is 100% EMPTY pure flat solid #FFFFFF white void (NO cream parchment, NO scene, NO ground fill).\n"
            "DECORATION AROUND THE OUTSIDE OF THE SQUARE RIM:\n"
            "- Each of the four corners outside the square rim features neat radial fan-shaped warm European cobblestone arch accents.\n"
            "- The bottom border strip forms a low warm cut-stone plaza balustrade ledge with two small empty vintage wood-and-iron park benches "
            "sitting neatly at the bottom-left and bottom-right corners outside the square opening.\n"
            "- Left and right border strips are clean architectural stone-and-gold trim matching the square rim, leaving ~24px pure #FFFFFF margin on all 4 outer sides."
        ),
    },
    "reward_frame_sunset": {
        "name": "夕焼けの額縁",
        "prompt": (
            "An isolated 1:1 square sunset scenic picture frame on a pure solid flat #FFFFFF white background.\n"
            "INNER WINDOW GEOMETRY: At the exact center of the canvas is a continuous, crisp carved antique-gold square inner rim "
            "forming an EXACT 1:1 square empty window (~67% width and ~67% height of the canvas). "
            "Inside this square inner rim is 100% EMPTY pure flat solid #FFFFFF white void (NO sky, NO parchment fill, NO clouds inside).\n"
            "DECORATION AROUND THE OUTSIDE OF THE SQUARE RIM:\n"
            "- Resting centered directly on top of the upper horizontal gold bar is a warm watercolor golden-orange setting semicircle sun "
            "with short golden sunbeams, flanked symmetrically by soft horizontal apricot-pink evening clouds along the top bar.\n"
            "- Along the bottom border outside the lower gold bar are gentle rolling lush green hillside watercolor silhouettes tucked strictly below the inner rim.\n"
            "- Slim gold molded vertical borders frame the left and right sides, keeping >=24px pure #FFFFFF margin on all 4 outer edges."
        ),
    },
    "reward_frame_journey": {
        "name": "旅の額縁",
        "prompt": (
            "An isolated 1:1 square vintage map-and-suitcase picture frame on a pure solid flat #FFFFFF white background.\n"
            "INNER WINDOW GEOMETRY: At the exact center of the canvas is a continuous, crisp sepia-ink and gold square inner border "
            "forming an EXACT 1:1 square empty window (~67% width and ~67% height of the canvas). "
            "Inside this square inner rim is 100% EMPTY pure flat solid #FFFFFF white void (NO map inside the center hole, NO terrain, NO lines).\n"
            "DECORATION AROUND THE OUTSIDE OF THE SQUARE RIM:\n"
            "- The outer border strip is crafted from warm aged parchment map paper with gently curled outer corners.\n"
            "- Tucked cleanly in the top-left border corner is a detailed small vintage brass compass rose.\n"
            "- Tucked cleanly in the bottom-right border corner is a miniature brown leather travel suitcase.\n"
            "- Thin winding dashed map trails and tiny pines adorn ONLY the narrow border strips outside the square inner rim (zero text or place names), leaving >=24px pure #FFFFFF outer margin."
        ),
    },
}


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


def flood_clear(rgba: Image.Image, seeds: list[tuple[int, int]], ref_rgb: tuple[float, float, float], max_dist: float, min_luma: int) -> None:
    """Clear contiguous near-background pixels in-place from seed points and soften 1px boundary."""
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

    # Feather 1px anti-aliased fringe adjacent to cleared pixels
    for cx, cy in cleared:
        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                r, g, b, a = px[nx, ny]
                if a > 0 and r >= 220 and g >= 220 and b >= 220 and (max(r, g, b) - min(r, g, b)) <= 22:
                    px[nx, ny] = (r, g, b, min(a, 110))


def sample_median_rgb(rgba: Image.Image, cx: int, cy: int, radius: int = 16) -> tuple[float, float, float]:
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


def detect_inner_opening(rgba: Image.Image) -> tuple[int, int, int, int]:
    """Scan outward from center across the central 40% bands to find the inner square rim."""
    w, h = rgba.size
    px = rgba.load()
    cx, cy = w // 2, h // 2

    def scan_dir(start_x: int, start_y: int, dx: int, dy: int, limit: int) -> int | None:
        # Require 3 consecutive opaque pixels (>= 140) so a single tiny speck doesn't stop the ray
        run = 0
        first_hit = None
        for step in range(limit):
            x = start_x + dx * step
            y = start_y + dy * step
            if not (0 <= x < w and 0 <= y < h):
                return None
            if px[x, y][3] >= 140:
                if run == 0:
                    first_hit = x if dx != 0 else y
                run += 1
                if run >= 3:
                    return first_hit
            else:
                run = 0
                first_hit = None
        return None

    lefts = [scan_dir(cx, y, -1, 0, cx) for y in range(int(h * 0.30), int(h * 0.70), 4)]
    rights = [scan_dir(cx, y, 1, 0, w - cx) for y in range(int(h * 0.30), int(h * 0.70), 4)]
    tops = [scan_dir(x, cy, 0, -1, cy) for x in range(int(w * 0.30), int(w * 0.70), 4)]
    bottoms = [scan_dir(x, cy, 0, 1, h - cy) for x in range(int(w * 0.30), int(w * 0.70), 4)]

    left_vals = [v for v in lefts if v is not None]
    right_vals = [v for v in rights if v is not None]
    top_vals = [v for v in tops if v is not None]
    bottom_vals = [v for v in bottoms if v is not None]

    if not (left_vals and right_vals and top_vals and bottom_vals):
        raise RuntimeError("Could not detect complete 4-sided inner opening in generated frame")

    ix0 = int(round(statistics.median(left_vals)))
    ix1 = int(round(statistics.median(right_vals)))
    iy0 = int(round(statistics.median(top_vals)))
    iy1 = int(round(statistics.median(bottom_vals)))
    return (ix0, iy0, ix1, iy1)


def prune_disconnected_center_specks(rgba: Image.Image, inset: int = TARGET_INSET) -> None:
    """Keep opaque pixels connected to the frame border outside [inset, 512-inset],
    and remove any isolated floating islands inside the transparent opening."""
    w, h = rgba.size
    px = rgba.load()
    visited = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()
    lim_lo = inset - 2
    lim_hi = w - inset + 2

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
        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                idx = ny * w + nx
                if not visited[idx] and px[nx, ny][3] > 0:
                    visited[idx] = 1
                    q.append((nx, ny))

    for y in range(lim_lo, lim_hi):
        for x in range(lim_lo, lim_hi):
            if px[x, y][3] > 0 and not visited[y * w + x]:
                px[x, y] = (0, 0, 0, 0)


def process_frame_image(raw_img: Image.Image) -> Image.Image:
    rgba = raw_img.convert("RGBA")
    w, h = rgba.size

    # 1. Clear outer pure/near-white background from all perimeter pixels
    outer_seeds = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)]
    outer_seeds += [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    flood_clear(rgba, outer_seeds, (255.0, 255.0, 255.0), max_dist=36.0, min_luma=230)

    # 2. Clear interior center opening using the center patch's median color
    center_rgb = sample_median_rgb(rgba, w // 2, h // 2, radius=24)
    center_seeds = [
        (x, y)
        for y in range(h // 2 - 40, h // 2 + 41, 8)
        for x in range(w // 2 - 40, w // 2 + 41, 8)
    ]
    flood_clear(rgba, center_seeds, center_rgb, max_dist=36.0, min_luma=205)

    # 3. Measure actual inner opening coordinates and normalize to exact square [84, 84, 428, 428] on 512x512
    ix0, iy0, ix1, iy1 = detect_inner_opening(rgba)
    inner_w = ix1 - ix0
    inner_h = iy1 - iy0
    if inner_w < w * 0.35 or inner_h < h * 0.35:
        raise RuntimeError(f"Detected inner opening too small: {(ix0, iy0, ix1, iy1)}")

    scale_x = TARGET_INNER_SIZE / inner_w
    scale_y = TARGET_INNER_SIZE / inner_h
    new_w = max(1, int(round(w * scale_x)))
    new_h = max(1, int(round(h * scale_y)))
    scaled = rgba.resize((new_w, new_h), Image.Resampling.LANCZOS)

    # Align scaled inner opening to exact (TARGET_INSET, TARGET_INSET) on 512x512 canvas
    paste_x = TARGET_INSET - int(round(ix0 * scale_x))
    paste_y = TARGET_INSET - int(round(iy0 * scale_y))

    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    canvas.paste(scaled, (paste_x, paste_y), scaled)

    prune_disconnected_center_specks(canvas, inset=TARGET_INSET)

    # 5. Verify exact transparent center square [92, 92, 420, 420] and inner symmetry
    verify_px = canvas.load()
    opaque_in_core = 0
    for y in range(TARGET_INSET + 12, CANVAS_SIZE - TARGET_INSET - 12):
        for x in range(TARGET_INSET + 12, CANVAS_SIZE - TARGET_INSET - 12):
            if verify_px[x, y][3] != 0:
                opaque_in_core += 1
    if opaque_in_core > 0:
        raise RuntimeError(f"Found {opaque_in_core} non-transparent pixels inside center opening")

    if verify_px[CANVAS_SIZE // 2, CANVAS_SIZE // 2][3] != 0:
        raise RuntimeError("Center pixel is not transparent")

    return canvas


def wrap_rgba_in_svg(rgba: Image.Image, title: str) -> str:
    buf = BytesIO()
    rgba.save(buf, format="WEBP", quality=92, method=6)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    w, h = rgba.size
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
        f'role="img" aria-label="{title}">\n'
        f'  <image width="{w}" height="{h}" href="data:image/webp;base64,{b64}"/>\n'
        f"</svg>\n"
    )


def build_prompt(frame_id: str) -> str:
    cfg = FRAME_CONFIGS[frame_id]
    return "\n".join([
        cfg["prompt"],
        "",
        "Art style: Warm hand-painted watercolor, fine ink-line storybook illustration, and soft metallic gold-foil accents matching vintage airmail picture books.",
        "STRICT RULES:",
        "- Pure flat solid #FFFFFF white everywhere outside the frame AND everywhere inside the empty central square window.",
        "- NO drop shadows on the white canvas, NO inner cream mat paper, NO backdrop scenery inside the square hole.",
        "- The inner frame hole MUST be a clean, symmetrical, true 1:1 SQUARE with straight top/bottom/left/right molding edges.",
        "- ZERO text, ZERO letters, ZERO numbers, ZERO people, ZERO animals.",
    ])


def generate_one(
    client: OpenAI,
    frame_id: str,
    sheet_dir: Path,
    force: bool,
) -> tuple[str, Image.Image]:
    raw_path = sheet_dir / f"{frame_id}.png"
    if force or not raw_path.exists():
        prompt = build_prompt(frame_id)
        last_err: Exception | None = None
        for attempt in range(1, 5):
            try:
                resp = client.images.generate(
                    model="gpt-image-2.6-flare",
                    prompt=prompt,
                    size="1024x1024",
                    n=1,
                )
                item = resp.data[0]
                if getattr(item, "b64_json", None):
                    raw_path.write_bytes(base64.b64decode(item.b64_json))
                elif getattr(item, "url", None):
                    urllib.request.urlretrieve(item.url, raw_path)
                else:
                    raise RuntimeError("No image data returned")
                break
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                time.sleep(2 * attempt)
        else:
            raise RuntimeError(f"Failed to generate {frame_id}: {last_err}")

    with Image.open(raw_path) as raw:
        processed = process_frame_image(raw)

    svg_text = wrap_rgba_in_svg(processed, FRAME_CONFIGS[frame_id]["name"])
    MILESTONE_SVG_DIR.mkdir(parents=True, exist_ok=True)
    EQUIPPED_FRAME_DIR.mkdir(parents=True, exist_ok=True)
    (MILESTONE_SVG_DIR / f"{frame_id}.svg").write_text(svg_text, encoding="utf-8")
    (EQUIPPED_FRAME_DIR / f"{frame_id}.svg").write_text(svg_text, encoding="utf-8")
    return frame_id, processed


def make_checkerboard(w: int, h: int, cell: int = 16) -> Image.Image:
    bg = Image.new("RGBA", (w, h), (236, 234, 228, 255))
    draw = ImageDraw.Draw(bg)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if ((x // cell) + (y // cell)) % 2 == 1:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=(214, 211, 204, 255))
    return bg


def write_audit_sheet(frames: list[tuple[str, Image.Image]]) -> None:
    AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
    tile = 320
    cols = len(frames)
    sheet = Image.new("RGBA", (tile * cols, tile * 2), (250, 246, 238, 255))
    checker = make_checkerboard(tile, tile)
    inner_px = int(round(tile * TARGET_INNER_SIZE / CANVAS_SIZE))
    pad_px = int(round(tile * TARGET_INSET / CANVAS_SIZE))

    stamp_tile = None
    if SAMPLE_STAMP_PATH.exists():
        with Image.open(SAMPLE_STAMP_PATH) as st:
            stamp_tile = st.convert("RGBA").resize((inner_px, inner_px), Image.Resampling.LANCZOS)

    for idx, (frame_id, rgba) in enumerate(frames):
        resized = rgba.resize((tile, tile), Image.Resampling.LANCZOS)
        top_cell = checker.copy()
        top_cell.alpha_composite(resized)
        sheet.paste(top_cell, (idx * tile, 0))

        bot_cell = Image.new("RGBA", (tile, tile), (255, 253, 247, 255))
        if stamp_tile is not None:
            bot_cell.paste(stamp_tile, (pad_px, pad_px), stamp_tile)
        bot_cell.alpha_composite(resized)
        sheet.paste(bot_cell, (idx * tile, tile))

    draw = ImageDraw.Draw(sheet)
    for idx, (frame_id, _) in enumerate(frames):
        draw.rectangle((idx * tile, 0, idx * tile + 190, 18), fill=(30, 30, 30, 255))
        draw.text((idx * tile + 6, 4), frame_id, fill=(255, 255, 255, 255))
    sheet.convert("RGB").save(AUDIT_PATH)
    print(f"Saved audit sheet: {AUDIT_PATH}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Regenerate frame PNGs even if cached")
    parser.add_argument("--frames", type=str, default=None, help="Comma-separated frame IDs to regenerate")
    parser.add_argument("--workers", type=int, default=4, help="Parallel API workers")
    parser.add_argument("--sheet-dir", type=Path, default=DEFAULT_SHEET_DIR)
    args = parser.parse_args()

    selected = list(FRAME_CONFIGS.keys())
    if args.frames:
        requested = [x.strip() for x in args.frames.split(",") if x.strip()]
        invalid = [x for x in requested if x not in FRAME_CONFIGS]
        if invalid:
            print(f"Unknown frame IDs: {invalid}", file=sys.stderr)
            return 1
        selected = requested

    args.sheet_dir.mkdir(parents=True, exist_ok=True)
    client = OpenAI(api_key=load_openai_key())
    print(f"Generating {len(selected)} square transparent-center frames ({', '.join(selected)})...", flush=True)

    results: dict[str, Image.Image] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(generate_one, client, fid, args.sheet_dir, args.force): fid
            for fid in selected
        }
        for fut in concurrent.futures.as_completed(futures):
            fid, processed = fut.result()
            results[fid] = processed
            print(f"Done: {fid} -> 512x512 RGBA transparent center SVG", flush=True)

    # Also ensure audit includes all 4 frames if cached
    all_frames: list[tuple[str, Image.Image]] = []
    for fid in FRAME_CONFIGS:
        if fid in results:
            all_frames.append((fid, results[fid]))
        else:
            raw_path = args.sheet_dir / f"{fid}.png"
            if raw_path.exists():
                with Image.open(raw_path) as raw:
                    all_frames.append((fid, process_frame_image(raw)))

    if all_frames:
        write_audit_sheet(all_frames)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
