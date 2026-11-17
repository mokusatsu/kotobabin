"""Generate the 7 missing vehicle sprites as 2x2 contact sheets via gpt-image-2.6-flare,
remove the white background via corner flood-fill, and save transparent RGBA PNGs
under public/assets/sprites/.
"""

import argparse
import base64
import concurrent.futures
import json
import sys
import time
import urllib.request
from collections import deque
from pathlib import Path

from openai import OpenAI
from PIL import Image

MANIFEST_PATH = Path("spec/initial/data/visual_resource_manifest.json")
OUT_DIR = Path("public/assets/sprites")
DEFAULT_SHEET_DIR = Path(".tmp_sheets/vehicles")

CELL_POSITIONS = [
    ("Top-Left (Row 1, Col 1)", (0, 0, 768, 512)),
    ("Top-Right (Row 1, Col 2)", (768, 0, 1536, 512)),
    ("Bottom-Left (Row 2, Col 1)", (0, 512, 768, 1024)),
    ("Bottom-Right (Row 2, Col 2)", (768, 512, 1536, 1024)),
]

MISSING_VEHICLES = [
    "vehicle_cart_rear",
    "vehicle_van_rear",
    "vehicle_box_van_front",
    "vehicle_box_van_rear",
    "vehicle_truck_front",
    "vehicle_truck_rear",
    "vehicle_train_rear",
]


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

    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    rgba.thumbnail((280, 280), Image.Resampling.LANCZOS)
    return rgba


def build_prompt(group: list[dict]) -> str:
    lines = [
        "A clean 2-column by 2-row contact sheet (up to 4 isometric 3-quarter delivery vehicle sprites arranged in a strict 2x2 grid on a 1536x1024 pure solid white #FFFFFF background).",
        "Art style: Warm hand-painted watercolor and fine ink-line isometric postal delivery vehicle illustration, cozy Japanese storybook town aesthetic.",
        "STRICT LAYOUT & CONTENT RULES:",
        "- Pure solid #FFFFFF white background everywhere outside each vehicle.",
        "- NO borders, NO frames, NO dividing lines, NO grid lines, NO ground patches, NO cast shadows on the white background.",
        "- NO text, NO letters, NO numbers, NO license plates with text anywhere.",
        "- Each vehicle MUST sit cleanly centered inside its 768x512 quadrant with generous white margin.",
        "",
        "Vehicles for the quadrants:",
    ]
    for (pos_label, _), asset in zip(CELL_POSITIONS, group):
        lines.append(f"- {pos_label} [{asset['id']}]: {asset['visual_brief'].strip()}")
    return "\n".join(lines)


def process_group(
    client: OpenAI,
    group_idx: int,
    group: list[dict],
    sheet_dir: Path,
    force: bool,
) -> tuple[int, list[str]]:
    ids = [a["id"] for a in group]
    out_paths = [OUT_DIR / f"{asset_id}.png" for asset_id in ids]
    if not force and all(p.exists() for p in out_paths):
        return group_idx, ids

    prompt = build_prompt(group)
    sheet_path = sheet_dir / f"sheet_{group_idx:02d}_{ids[0]}_{ids[-1]}.png"

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
        raise RuntimeError(f"Failed group {group_idx}: {last_err}")

    with Image.open(sheet_path) as img:
        if img.size != (1536, 1024):
            img = img.resize((1536, 1024), Image.Resampling.LANCZOS)
        rgb = img.convert("RGB")
        for (_, box), out_path in zip(CELL_POSITIONS, out_paths):
            cell = rgb.crop(box)
            sprite = flood_fill_transparent(cell)
            sprite.save(out_path, format="PNG")

    return group_idx, ids


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--sheet-dir", type=Path, default=DEFAULT_SHEET_DIR)
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    by_id = {a["id"]: a for a in manifest["assets"]}
    items = [by_id[vid] for vid in MISSING_VEHICLES]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    args.sheet_dir.mkdir(parents=True, exist_ok=True)

    client = OpenAI(api_key=load_openai_key())
    groups = [items[i : i + 4] for i in range(0, len(items), 4)]
    print(f"Generating {len(items)} vehicle sprites in {len(groups)} contact sheets...")

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [
            pool.submit(process_group, client, idx, grp, args.sheet_dir, args.force)
            for idx, grp in enumerate(groups, start=1)
        ]
        for fut in concurrent.futures.as_completed(futures):
            idx, ids = fut.result()
            print(f"[sheet {idx:02d}/{len(groups)}] Done: {', '.join(ids)}", flush=True)

    print("All 7 vehicle sprites generated successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
