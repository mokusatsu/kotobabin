"""Generate the remaining ungenerated raster assets from visual_resource_manifest.json:
1) milestone_raster (4 assets): reward_celebration_postcard, reward_evening_panel,
   reward_first_collection_stamp_art, reward_collection_stamp_art
2) equipment_scene (5 assets): equipment_packaging_0..4
3) construction (3 assets): scaffold_small, scaffold_medium, scaffold_large

Generates 3 contact sheets sequentially via gpt-image-2.6-flare (1536x1024),
crops/processes them to target specs, and exports WebP files under public/assets/.
"""

import argparse
import base64
import json
import sys
import time
import urllib.request
from collections import deque
from pathlib import Path

from openai import OpenAI
from PIL import Image

MANIFEST_PATH = Path("spec/initial/data/visual_resource_manifest.json")
PUBLIC_ASSETS_DIR = Path("public/assets")
DEFAULT_SHEET_DIR = Path(".tmp_sheets/remaining_rasters")

GRID_2X2 = [
    ("Top-Left (Row 1, Col 1)", (0, 0, 768, 512)),
    ("Top-Right (Row 1, Col 2)", (768, 0, 1536, 512)),
    ("Bottom-Left (Row 2, Col 1)", (0, 512, 768, 1024)),
    ("Bottom-Right (Row 2, Col 2)", (768, 512, 1536, 1024)),
]

GRID_3X2 = [
    ("Top-Left (Row 1, Col 1)", (0, 0, 512, 512)),
    ("Top-Center (Row 1, Col 2)", (512, 0, 1024, 512)),
    ("Top-Right (Row 1, Col 3)", (1024, 0, 1536, 512)),
    ("Bottom-Left (Row 2, Col 1)", (0, 512, 512, 1024)),
    ("Bottom-Center (Row 2, Col 2)", (512, 512, 1024, 1024)),
    ("Bottom-Right (Row 2, Col 3)", (1024, 512, 1536, 1024)),
]


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


def generate_sheet(client: OpenAI, prompt: str, sheet_path: Path) -> Image.Image:
    last_err: Exception | None = None
    for attempt in range(1, 4):
        try:
            resp = client.images.generate(
                model="gpt-image-2.6-flare",
                prompt=prompt,
                size="1536x1024",
                n=1,
            )
            item = resp.data[0]
            if getattr(item, "b64_json", None):
                sheet_path.write_bytes(base64.b64decode(item.b64_json))
            elif getattr(item, "url", None):
                urllib.request.urlretrieve(item.url, sheet_path)
            else:
                raise RuntimeError("No image data returned")
            break
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            time.sleep(2 * attempt)
    else:
        raise RuntimeError(f"Failed to generate {sheet_path.name}: {last_err}")

    img = Image.open(sheet_path)
    if img.size != (1536, 1024):
        img = img.resize((1536, 1024), Image.Resampling.LANCZOS)
    return img.convert("RGB")


def flood_fill_transparent(cell: Image.Image, threshold: int = 235) -> Image.Image:
    """Remove contiguous near-white outer background connected to cell borders."""
    rgba = cell.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    visited = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def is_bg(r: int, g: int, b: int) -> bool:
        return r >= threshold and g >= threshold and b >= threshold and (max(r, g, b) - min(r, g, b)) <= 20

    for x in range(w):
        for y in (0, h - 1):
            r, g, b, _ = px[x, y]
            if is_bg(r, g, b):
                idx = y * w + x
                if not visited[idx]:
                    visited[idx] = 1
                    q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            r, g, b, _ = px[x, y]
            if is_bg(r, g, b):
                idx = y * w + x
                if not visited[idx]:
                    visited[idx] = 1
                    q.append((x, y))

    while q:
        cx, cy = q.popleft()
        px[cx, cy] = (0, 0, 0, 0)
        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                idx = ny * w + nx
                if not visited[idx]:
                    r, g, b, _ = px[nx, ny]
                    if is_bg(r, g, b):
                        visited[idx] = 1
                        q.append((nx, ny))

    # Soften 1px anti-aliased light halo adjacent to transparent pixels
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r >= 218 and g >= 218 and b >= 218 and (max(r, g, b) - min(r, g, b)) <= 20:
                if (
                    px[x - 1, y][3] == 0
                    or px[x + 1, y][3] == 0
                    or px[x, y - 1][3] == 0
                    or px[x, y + 1][3] == 0
                ):
                    px[x, y] = (r, g, b, 96)
    return rgba


def process_milestone_rasters(
    client: OpenAI,
    by_id: dict[str, dict],
    sheet_dir: Path,
    force: bool,
) -> None:
    out_dir = PUBLIC_ASSETS_DIR / "milestone_raster"
    postcard_fallback_dir = PUBLIC_ASSETS_DIR / "postcard"
    out_dir.mkdir(parents=True, exist_ok=True)
    postcard_fallback_dir.mkdir(parents=True, exist_ok=True)

    targets = [
        out_dir / "reward_celebration_postcard.webp",
        postcard_fallback_dir / "reward_celebration_postcard.webp",
        out_dir / "reward_evening_panel.webp",
        out_dir / "reward_first_collection_stamp_art.webp",
        out_dir / "reward_collection_stamp_art.webp",
    ]
    if not force and all(p.exists() for p in targets):
        print("[sheet 1/3] milestone_raster already exists, skipping.")
        return

    ids = [
        "reward_celebration_postcard",
        "reward_evening_panel",
        "reward_first_collection_stamp_art",
        "reward_collection_stamp_art",
    ]
    prompt = "\n".join(
        [
            "A clean 2-column by 2-row contact sheet (4 illustrations arranged in a strict 2x2 grid of 768x512 quadrants on a 1536x1024 canvas).",
            "Art style: Warm, nostalgic hand-painted watercolor and fine ink-line storybook illustration. Cozy Japanese postal town aesthetic with rich atmospheric lighting and soft paper texture.",
            "STRICT LAYOUT & CONTENT RULES:",
            "- NO borders, NO white margins, NO postcard frames, NO stamp perforations, NO dividing lines, NO grid lines between quadrants.",
            "- NO text, NO letters, NO numbers, NO kanji/kana, NO labels anywhere.",
            "- Top-Left [reward_celebration_postcard]: Full-bleed edge-to-edge 3:2 landscape postcard illustration: "
            + by_id["reward_celebration_postcard"]["visual_brief"].strip(),
            "- Top-Right [reward_evening_panel]: Horizontal panoramic 4:1 sunset banner centered in the middle vertical band of the 768x512 quadrant (filling the entire width edge-to-edge, sky/roofline kept within the middle horizontal strip): "
            + by_id["reward_evening_panel"]["visual_brief"].strip(),
            "- Bottom-Left [reward_first_collection_stamp_art]: Full-bleed borderless square composition centered inside the middle 512x512 area of the quadrant (keep key subjects within the central square): "
            + by_id["reward_first_collection_stamp_art"]["visual_brief"].strip(),
            "- Bottom-Right [reward_collection_stamp_art]: Full-bleed borderless square composition centered inside the middle 512x512 area of the quadrant (keep key subjects within the central square): "
            + by_id["reward_collection_stamp_art"]["visual_brief"].strip(),
        ]
    )

    sheet_path = sheet_dir / "sheet_01_milestone_raster.png"
    rgb = generate_sheet(client, prompt, sheet_path)

    # 1. reward_celebration_postcard: 768x512 -> (0, 16, 768, 496) -> 1600x1000
    cell_postcard = rgb.crop(GRID_2X2[0][1]).crop((0, 16, 768, 496)).resize((1600, 1000), Image.Resampling.LANCZOS)
    cell_postcard.save(out_dir / "reward_celebration_postcard.webp", format="WEBP", quality=90, method=6)
    cell_postcard.save(postcard_fallback_dir / "reward_celebration_postcard.webp", format="WEBP", quality=90, method=6)

    # 2. reward_evening_panel: 768x512 -> middle 4:1 strip (0, 160, 768, 352) -> 1600x400
    cell_evening = rgb.crop(GRID_2X2[1][1]).crop((0, 160, 768, 352)).resize((1600, 400), Image.Resampling.LANCZOS)
    cell_evening.save(out_dir / "reward_evening_panel.webp", format="WEBP", quality=90, method=6)

    # 3. reward_first_collection_stamp_art: 768x512 -> center square (128, 0, 640, 512) -> 512x512
    cell_first_stamp = rgb.crop(GRID_2X2[2][1]).crop((128, 0, 640, 512))
    cell_first_stamp.save(out_dir / "reward_first_collection_stamp_art.webp", format="WEBP", quality=90, method=6)

    # 4. reward_collection_stamp_art: 768x512 -> center square (128, 0, 640, 512) -> 512x512
    cell_coll_stamp = rgb.crop(GRID_2X2[3][1]).crop((128, 0, 640, 512))
    cell_coll_stamp.save(out_dir / "reward_collection_stamp_art.webp", format="WEBP", quality=90, method=6)

    print(f"[sheet 1/3] Done: {', '.join(ids)}", flush=True)


def process_equipment_scenes(
    client: OpenAI,
    by_id: dict[str, dict],
    sheet_dir: Path,
    force: bool,
) -> None:
    out_dir = PUBLIC_ASSETS_DIR / "equipment_scene"
    out_dir.mkdir(parents=True, exist_ok=True)

    ids = [f"equipment_packaging_{i}" for i in range(5)]
    out_paths = [out_dir / f"{aid}.webp" for aid in ids]
    if not force and all(p.exists() for p in out_paths):
        print("[sheet 2/3] equipment_scene already exists, skipping.")
        return

    lines = [
        "A clean 3-column by 2-row contact sheet (6 equal 512x512 cells in a strict 3x2 grid on a 1536x1024 canvas).",
        "Art style: Warm, nostalgic hand-painted watercolor and fine ink-line storybook illustration of a cozy Japanese postal workshop interior with warm cream wood and soft daylight.",
        "STRICT LAYOUT & CONTENT RULES:",
        "- NO borders, NO frames, NO dividing lines, NO grid lines between cells.",
        "- NO text, NO letters, NO numbers, NO kanji/kana, NO labels anywhere.",
        "- Keep the main packaging bench/tools centered inside the middle 3:2 horizontal band (leaving top/bottom 85px as soft background) so a 3:2 crop keeps every object intact.",
        "- Bottom-Right cell [unused]: Plain soft warm cream paper texture matching the workshop wall.",
        "",
        "Scenes for the first 5 cells:",
    ]
    for (pos_label, _), aid in zip(GRID_3X2[:5], ids):
        lines.append(f"- {pos_label} [{aid}]: {by_id[aid]['visual_brief'].strip()}")

    sheet_path = sheet_dir / "sheet_02_equipment_scene.png"
    rgb = generate_sheet(client, "\n".join(lines), sheet_path)

    for (_, box), out_path in zip(GRID_3X2[:5], out_paths):
        cell = rgb.crop(box)
        # Middle 3:2 region (0, 85, 512, 427) -> resize to 1200x800
        cropped_3_2 = cell.crop((0, 85, 512, 427)).resize((1200, 800), Image.Resampling.LANCZOS)
        cropped_3_2.save(out_path, format="WEBP", quality=90, method=6)

    print(f"[sheet 2/3] Done: {', '.join(ids)}", flush=True)


def process_construction_scaffolds(
    client: OpenAI,
    by_id: dict[str, dict],
    sheet_dir: Path,
    force: bool,
) -> None:
    out_dir = PUBLIC_ASSETS_DIR / "construction"
    out_dir.mkdir(parents=True, exist_ok=True)

    ids = ["scaffold_small", "scaffold_medium", "scaffold_large"]
    out_paths = [out_dir / f"{aid}.webp" for aid in ids]
    if not force and all(p.exists() for p in out_paths):
        print("[sheet 3/3] construction already exists, skipping.")
        return

    lines = [
        "A clean 2-column by 2-row contact sheet (3 isometric construction scaffold overlays in the first 3 quadrants, and pure solid white #FFFFFF in the Bottom-Right quadrant, on a 1536x1024 pure solid white #FFFFFF canvas).",
        "Art style: Warm hand-painted watercolor and fine ink-line isometric wooden scaffolding props, matching a cozy Japanese storybook postal town diorama.",
        "STRICT LAYOUT & CONTENT RULES:",
        "- Pure solid #FFFFFF white background everywhere around each scaffolding prop.",
        "- NO buildings, NO houses, NO ground tiles, NO grass plinth, NO drop shadows on the white background.",
        "- NO borders, NO frames, NO dividing lines, NO grid lines, NO text, NO numbers anywhere.",
        "- Keep the lower-left foreground area of each scaffold composition open/empty.",
        "- Each scaffold MUST sit cleanly inside its own 768x512 quadrant with generous white margin so nothing touches quadrant edges.",
        "",
        "Props for the quadrants:",
    ]
    for (pos_label, _), aid in zip(GRID_2X2[:3], ids):
        lines.append(f"- {pos_label} [{aid}]: {by_id[aid]['visual_brief'].strip()}")
    lines.append("- Bottom-Right (Row 2, Col 2) [empty]: Leave completely pure solid white #FFFFFF.")

    sheet_path = sheet_dir / "sheet_03_construction.png"
    rgb = generate_sheet(client, "\n".join(lines), sheet_path)

    for (_, box), out_path in zip(GRID_2X2[:3], out_paths):
        cell = rgb.crop(box)
        rgba = flood_fill_transparent(cell)
        bbox = rgba.getbbox()
        canvas = Image.new("RGBA", (1024, 768), (0, 0, 0, 0))
        if bbox:
            cropped = rgba.crop(bbox)
            # Fit proportionally within 780x560 and anchor bottom-center at (512, 640)
            cropped.thumbnail((780, 560), Image.Resampling.LANCZOS)
            cw, ch = cropped.size
            paste_x = 512 - cw // 2
            paste_y = max(0, 640 - ch)
            canvas.paste(cropped, (paste_x, paste_y), cropped)
        canvas.save(out_path, format="WEBP", quality=90, method=6)

    print(f"[sheet 3/3] Done: {', '.join(ids)}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Regenerate existing outputs")
    parser.add_argument("--sheet-dir", type=Path, default=DEFAULT_SHEET_DIR)
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    by_id = {a["id"]: a for a in manifest["assets"]}

    args.sheet_dir.mkdir(parents=True, exist_ok=True)
    client = OpenAI(api_key=load_openai_key())

    process_milestone_rasters(client, by_id, args.sheet_dir, args.force)
    process_equipment_scenes(client, by_id, args.sheet_dir, args.force)
    process_construction_scaffolds(client, by_id, args.sheet_dir, args.force)

    print("All remaining rasters generated successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
