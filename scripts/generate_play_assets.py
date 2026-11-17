"""Generate play-screen diorama and animation assets via gpt-image-2.6-flare,
and crop standalone diorama building sprites from public/assets/sprites/buildings/.

Outputs:
- public/assets/sprites/diorama/*.png (cropped standalone buildings)
- public/assets/sprites/cargo_stack_stage0..5.png (aligned 6-stage cargo stack)
- public/assets/sprites/anim_cargo_collapse.png (8-frame 1280x160 strip)
- public/assets/sprites/anim_delivery_arrive.png (8-frame 1280x160 strip)
- public/assets/sprites/anim_courier_{cart,van,box_van,truck,train}.png (8-frame 1280x160 strip, facing RIGHT)
- public/assets/raster/play_backdrop_{riverside,seaside,highland}.jpg (1536x1024)
"""

import argparse
import base64
import concurrent.futures
import time
import urllib.request
from collections import deque
from pathlib import Path

from openai import OpenAI
from PIL import Image

SPRITES_DIR = Path("public/assets/sprites")
BUILDINGS_DIR = SPRITES_DIR / "buildings"
DIORAMA_DIR = SPRITES_DIR / "diorama"
RASTER_DIR = Path("public/assets/raster")
DEFAULT_SHEET_DIR = Path(".tmp_sheets/play_assets")

FRAME_SIZE = 160

STYLE_BASE = (
    "Warm hand-painted Japanese watercolor & ink storybook illustration style, "
    "gentle fine brown-ink outlines, cozy postal town aesthetic (craft paper tan, "
    "terracotta red, forest green, cream). "
)

CARGO_STACK_PROMPT = (
    "A clean 3-column by 2-row grid (6 equal cells, 1536x1024 pure solid white #FFFFFF background, "
    "no grid lines, no borders, no text, no numbers). "
    "Each cell shows the EXACT SAME wooden shipping pallet in isometric 3-quarter view at the bottom center, "
    "with craft-paper wrapped postal parcels tied with red-and-white baker's twine stacking higher stage by stage: "
    "Row 1 Col 1 (Stage 0): Empty wooden shipping pallet only. "
    "Row 1 Col 2 (Stage 1): 1 craft-paper parcel placed neatly on the pallet. "
    "Row 1 Col 3 (Stage 2): 2 craft-paper parcels side by side on the pallet. "
    "Row 2 Col 1 (Stage 3): 3 parcels stacked in a pyramid (2 on bottom, 1 on top). "
    "Row 2 Col 2 (Stage 4): 4 parcels stacked tall and slightly precarious. "
    "Row 2 Col 3 (Stage 5): 5 parcels stacked into a full festive mound, tied with a red postal ribbon and tiny golden stars glowing at the top. "
    + STYLE_BASE
    + "Keep the pallet position and scale identical across all 6 cells."
)

COURIER_SPECS: dict[str, str] = {
    "cart": (
        "a charming wooden postal handcart / horse-drawn delivery cart with green canvas canopy, "
        "loaded with craft-paper parcels, rolling smoothly with spinning wooden wheels and gentle canopy bounce"
    ),
    "van": (
        "a cute retro Japanese cream-and-terracotta mini postal delivery van loaded with parcels visible in the back, "
        "driving smoothly with spinning wheels, slight cheerful suspension bounce, and tiny white exhaust puffs behind"
    ),
    "box_van": (
        "a cozy olive-green and cream postal box van with parcel boxes, "
        "driving steadily with spinning wheels and tiny white exhaust puffs behind"
    ),
    "truck": (
        "a sturdy terracotta-red and cream postal cargo truck packed with parcels, "
        "driving steadily with spinning wheels and tiny exhaust puffs behind"
    ),
    "train": (
        "a charming green-and-cream miniature postal locomotive engine on a short track segment, "
        "chugging steadily with moving wheel rods and soft white steam puffs rising from its chimney"
    ),
}

OTHER_ANIM_SPECS: dict[str, str] = {
    "cargo_collapse": (
        "A wooden shipping pallet stacked with 4 craft-paper postal parcels tumbling and scattering apart "
        "with tiny dust puffs and flying twine ribbons as the stack collapses. "
        "Frame 1: tall leaning stack, Frames 2-5: parcels tipping and falling outward, Frames 6-8: scattered parcels on ground with settling dust."
    ),
    "delivery_arrive": (
        "A cheerful burst of postal delivery celebration: a red postal wax-seal stamp emblem, "
        "a small craft-paper parcel popping open with golden sparkles and tiny warm confetti stars radiating outward and fading cleanly."
    ),
}

BACKDROP_SPECS: dict[str, str] = {
    "riverside": (
        "A wide horizontal panoramic scenic backdrop for a cozy Japanese postal town along a gentle river valley. "
        "TOP 55% of image: bright, airy, softly washed cream-blue morning sky and distant pale rolling hills with ample clean negative space so UI text cards can sit comfortably on top. "
        "BOTTOM 45% of image: a clear horizontal dirt-and-cobblestone country road running straight from left to right across the lower foreground, "
        "bordered by a gentle sparkling river, a small stone bridge in the midground, cherry and green trees, and cozy grassy banks."
    ),
    "seaside": (
        "A wide horizontal panoramic scenic backdrop for a cozy Japanese coastal postal town by a calm harbor. "
        "TOP 55% of image: bright, airy, softly washed cream-sky and pale distant horizon over the sea with ample clean negative space so UI text cards can sit comfortably on top. "
        "BOTTOM 45% of image: a clear horizontal cobblestone harbor promenade road running straight from left to right across the lower foreground, "
        "bordered by calm teal ocean waves, wooden pier posts, coastal pines, and warm sunlit stonework."
    ),
    "highland": (
        "A wide horizontal panoramic scenic backdrop for a cozy Japanese highland plateau postal town. "
        "TOP 55% of image: bright, airy, softly washed cream sky and pale distant misty mountain peaks with ample clean negative space so UI text cards can sit comfortably on top. "
        "BOTTOM 45% of image: a clear horizontal country gravel-and-stone road running straight from left to right across the lower foreground, "
        "bordered by terraced green meadows, wooden fences, wildflowers, and warm sunlit highland trees."
    ),
}


def load_openai_key() -> str:
    env_path = Path(".env")
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith("OPENAI_KEY="):
            key = stripped.split("=", 1)[1].strip().strip('"').strip("'")
            if key:
                return key
    raise RuntimeError("OPENAI_KEY not found in .env")


def flood_fill_transparent(cell: Image.Image, threshold: int = 238) -> Image.Image:
    rgba = cell.convert("RGBA")
    w, h = rgba.size
    pixels = rgba.load()
    visited = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def is_bg(r: int, g: int, b: int) -> bool:
        return r >= threshold and g >= threshold and b >= threshold and max(r, g, b) - min(r, g, b) <= 18

    for x in range(w):
        for y in (0, h - 1):
            r, g, b, _ = pixels[x, y]
            if is_bg(r, g, b):
                idx = y * w + x
                if not visited[idx]:
                    visited[idx] = 1
                    q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            r, g, b, _ = pixels[x, y]
            if is_bg(r, g, b):
                idx = y * w + x
                if not visited[idx]:
                    visited[idx] = 1
                    q.append((x, y))

    while q:
        cx, cy = q.popleft()
        pixels[cx, cy] = (255, 255, 255, 0)
        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                idx = ny * w + nx
                if not visited[idx]:
                    r, g, b, _ = pixels[nx, ny]
                    if is_bg(r, g, b):
                        visited[idx] = 1
                        q.append((nx, ny))

    return rgba


def crop_diorama_buildings() -> int:
    DIORAMA_DIR.mkdir(parents=True, exist_ok=True)
    count = 0
    for src_path in sorted(BUILDINGS_DIR.glob("*.png")):
        img = Image.open(src_path).convert("RGBA")
        bbox = img.getbbox()
        if bbox:
            cropped = img.crop(bbox)
        else:
            cropped = img
        cropped.thumbnail((360, 360), Image.Resampling.LANCZOS)
        out_path = DIORAMA_DIR / src_path.name
        cropped.save(out_path, format="PNG")
        count += 1
    print(f"[diorama] Cropped {count} building sprites into {DIORAMA_DIR}")
    return count


def generate_image(client: OpenAI, prompt: str, out_path: Path, size: str = "1536x1024") -> None:
    last_err: Exception | None = None
    for attempt in range(1, 4):
        try:
            resp = client.images.generate(
                model="gpt-image-2.6-flare",
                prompt=prompt,
                size=size,
                n=1,
            )
            item = resp.data[0]
            if getattr(item, "b64_json", None):
                out_path.write_bytes(base64.b64decode(item.b64_json))
            elif getattr(item, "url", None):
                urllib.request.urlretrieve(item.url, out_path)
            else:
                raise RuntimeError("No image data returned")
            return
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            time.sleep(2 * attempt)
    raise RuntimeError(f"Failed generating {out_path.name}: {last_err}")


def process_cargo_stacks(client: OpenAI, sheet_dir: Path, force: bool) -> None:
    targets = [SPRITES_DIR / f"cargo_stack_stage{i}.png" for i in range(6)]
    if not force and all(t.exists() for t in targets):
        print("[cargo_stack] Already exists, skipping.")
        return

    sheet_path = sheet_dir / "sheet_3x2_cargo_stack.png"
    if force or not sheet_path.exists():
        generate_image(client, CARGO_STACK_PROMPT, sheet_path)

    img = Image.open(sheet_path)
    if img.size != (1536, 1024):
        img = img.convert("RGB").resize((1536, 1024), Image.Resampling.LANCZOS)
    else:
        img = img.convert("RGB")

    cols, rows = 3, 2
    cell_w, cell_h = 1536 / cols, 1024 / rows
    cells: list[Image.Image] = []
    union_bbox: tuple[int, int, int, int] | None = None

    for r in range(rows):
        for c in range(cols):
            cell = img.crop((round(c * cell_w), round(r * cell_h), round((c + 1) * cell_w), round((r + 1) * cell_h)))
            rgba = flood_fill_transparent(cell)
            cells.append(rgba)
            bbox = rgba.getbbox()
            if bbox:
                if union_bbox is None:
                    union_bbox = bbox
                else:
                    union_bbox = (
                        min(union_bbox[0], bbox[0]),
                        min(union_bbox[1], bbox[1]),
                        max(union_bbox[2], bbox[2]),
                        max(union_bbox[3], bbox[3]),
                    )

    # Normalize all 6 stages to the same canvas size so the pallet stays anchored at the bottom
    canvas_w, canvas_h = 260, 240
    for idx, rgba in enumerate(cells):
        cropped = rgba.crop(union_bbox) if union_bbox else rgba
        cw, ch = cropped.size
        scale = min((canvas_w - 16) / max(1, cw), (canvas_h - 16) / max(1, ch))
        nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))
        resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
        out = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        ox = (canvas_w - nw) // 2
        oy = canvas_h - nh - 4
        out.paste(resized, (ox, oy), resized)
        out.save(targets[idx], format="PNG")
    print("[cargo_stack] Saved cargo_stack_stage0..5.png (260x240, bottom-aligned)")


def sheet_4x2_to_strip(sheet_path: Path, out_path: Path, bottom_align: bool = False) -> None:
    img = Image.open(sheet_path)
    if img.size != (1536, 1024):
        img = img.convert("RGB").resize((1536, 1024), Image.Resampling.LANCZOS)
    else:
        img = img.convert("RGB")

    cols, rows = 4, 2
    cell_w, cell_h = 1536 / cols, 1024 / rows
    frames: list[Image.Image] = []
    union_bbox: tuple[int, int, int, int] | None = None

    for r in range(rows):
        for c in range(cols):
            cell = img.crop((round(c * cell_w), round(r * cell_h), round((c + 1) * cell_w), round((r + 1) * cell_h)))
            rgba = flood_fill_transparent(cell)
            frames.append(rgba)
            bbox = rgba.getbbox()
            if bbox:
                if union_bbox is None:
                    union_bbox = bbox
                else:
                    union_bbox = (
                        min(union_bbox[0], bbox[0]),
                        min(union_bbox[1], bbox[1]),
                        max(union_bbox[2], bbox[2]),
                        max(union_bbox[3], bbox[3]),
                    )

    strip = Image.new("RGBA", (FRAME_SIZE * cols * rows, FRAME_SIZE), (0, 0, 0, 0))
    for idx, frame in enumerate(frames):
        cropped = frame.crop(union_bbox) if union_bbox else frame
        cw, ch = cropped.size
        scale = min((FRAME_SIZE - 8) / max(1, cw), (FRAME_SIZE - 8) / max(1, ch))
        nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))
        resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
        ox = idx * FRAME_SIZE + (FRAME_SIZE - nw) // 2
        oy = (FRAME_SIZE - nh - 4) if bottom_align else (FRAME_SIZE - nh) // 2
        strip.paste(resized, (ox, oy), resized)

    strip.save(out_path, format="PNG")


def build_4x2_anim_prompt(desc: str, right_facing: bool) -> str:
    dir_note = (
        "CRITICAL ORIENTATION: The vehicle MUST face strictly to the RIGHT (front/headlights/locomotive nose pointing toward the right edge of each cell, moving left-to-right). "
        if right_facing
        else ""
    )
    return (
        "A clean 4-column by 2-row sprite-sheet grid (8 animation frames in strict left-to-right, top-to-bottom order "
        "on a 1536x1024 pure flat solid white #FFFFFF background, no grid lines, no borders, no text, no numbers). "
        "CRITICAL BACKGROUND RULE: Every single frame MUST be an isolated cut-out sprite floating directly on pure flat solid white #FFFFFF. "
        "Do NOT draw dark background boxes, brown tiles, vignettes, gradients, or square backdrops behind the subject. "
        f"Subject: {desc}. "
        f"{dir_note}"
        + STYLE_BASE
        + "Maintain identical character scale and baseline across all 8 frames for a smooth seamless loop."
    )


def process_4x2_anim(
    client: OpenAI,
    out_name: str,
    desc: str,
    right_facing: bool,
    sheet_dir: Path,
    force: bool,
) -> str:
    out_path = SPRITES_DIR / f"{out_name}.png"
    if not force and out_path.exists():
        return out_name

    sheet_path = sheet_dir / f"sheet_4x2_{out_name}.png"
    if force or not sheet_path.exists():
        generate_image(client, build_4x2_anim_prompt(desc, right_facing), sheet_path)

    sheet_4x2_to_strip(sheet_path, out_path, bottom_align=right_facing)
    return out_name


def process_backdrop(client: OpenAI, landscape: str, desc: str, sheet_dir: Path, force: bool) -> str:
    out_path = RASTER_DIR / f"play_backdrop_{landscape}.jpg"
    if not force and out_path.exists():
        return landscape

    raw_path = sheet_dir / f"raw_backdrop_{landscape}.png"
    if force or not raw_path.exists():
        prompt = f"{desc} {STYLE_BASE} No text, no labels, no UI elements."
        generate_image(client, prompt, raw_path)

    img = Image.open(raw_path).convert("RGB")
    img.save(out_path, format="JPEG", quality=88)
    return landscape


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--crop-only", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--only", type=str, default="")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--sheet-dir", type=Path, default=DEFAULT_SHEET_DIR)
    args = parser.parse_args()

    only_set = {k.strip() for k in args.only.split(",") if k.strip()} if args.only else set()

    crop_diorama_buildings()
    if args.crop_only:
        return 0

    SPRITES_DIR.mkdir(parents=True, exist_ok=True)
    RASTER_DIR.mkdir(parents=True, exist_ok=True)
    args.sheet_dir.mkdir(parents=True, exist_ok=True)

    client = OpenAI(api_key=load_openai_key())

    # 1. Cargo stack stages (1 call)
    if not only_set or "cargo_stack" in only_set:
        process_cargo_stacks(client, args.sheet_dir, args.force)

    # 2. Parallel generation of courier animations, effect animations, and backdrops
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures: list[concurrent.futures.Future] = []
        for vehicle_key, desc in COURIER_SPECS.items():
            out_name = f"anim_courier_{vehicle_key}"
            if only_set and out_name not in only_set:
                continue
            futures.append(
                pool.submit(
                    process_4x2_anim,
                    client,
                    out_name,
                    desc,
                    True,
                    args.sheet_dir,
                    args.force,
                )
            )
        for anim_key, desc in OTHER_ANIM_SPECS.items():
            out_name = f"anim_{anim_key}"
            if only_set and out_name not in only_set:
                continue
            futures.append(
                pool.submit(
                    process_4x2_anim,
                    client,
                    out_name,
                    desc,
                    False,
                    args.sheet_dir,
                    args.force,
                )
            )
        for landscape, desc in BACKDROP_SPECS.items():
            if only_set and landscape not in only_set:
                continue
            futures.append(
                pool.submit(
                    process_backdrop,
                    client,
                    landscape,
                    desc,
                    args.sheet_dir,
                    args.force,
                )
            )

        for fut in concurrent.futures.as_completed(futures):
            name = fut.result()
            print(f"[play_assets] Done: {name}", flush=True)

    print("All play-screen assets generated successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
