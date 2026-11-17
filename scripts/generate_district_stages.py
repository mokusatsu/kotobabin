"""Generate the 17 missing district stage sprites (stages 2, 4, 5) as 3x2 contact sheets
via gpt-image-2.6-flare, remove the white background via corner flood-fill, and save
transparent RGBA PNGs under public/assets/sprites/.
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
DEFAULT_SHEET_DIR = Path(".tmp_sheets/district_stages")

CELL_POSITIONS = [
    ("Top-Left (Row 1, Col 1)", (0, 0, 512, 512)),
    ("Top-Center (Row 1, Col 2)", (512, 0, 1024, 512)),
    ("Top-Right (Row 1, Col 3)", (1024, 0, 1536, 512)),
    ("Bottom-Left (Row 2, Col 1)", (0, 512, 512, 1024)),
    ("Bottom-Center (Row 2, Col 2)", (512, 512, 1024, 1024)),
    ("Bottom-Right (Row 2, Col 3)", (1024, 512, 1536, 1024)),
]

MISSING_STAGES = [
    ("city_residential_s2", "residential_stage_2"),
    ("city_residential_s4", "residential_stage_4"),
    ("city_market_s2", "market_stage_2"),
    ("city_market_s4", "market_stage_4"),
    ("city_market_s5", "market_stage_5"),
    ("city_workshop_s2", "workshop_stage_2"),
    ("city_workshop_s4", "workshop_stage_4"),
    ("city_workshop_s5", "workshop_stage_5"),
    ("city_park_s2", "park_stage_2"),
    ("city_park_s4", "park_stage_4"),
    ("city_park_s5", "park_stage_5"),
    ("city_station_s2", "station_stage_2"),
    ("city_station_s4", "station_stage_4"),
    ("city_station_s5", "station_stage_5"),
    ("city_harbor_s2", "harbor_stage_2"),
    ("city_harbor_s4", "harbor_stage_4"),
    ("city_harbor_s5", "harbor_stage_5"),
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
    """Make contiguous near-white background connected to cell borders transparent."""
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
    rgba.thumbnail((400, 320), Image.Resampling.LANCZOS)
    return rgba


def build_prompt(group: list[tuple[str, str, str]]) -> str:
    lines = [
        "A clean 3-column by 2-row contact sheet (6 isometric miniature diorama tiles arranged in a strict 3x2 grid on a 1536x1024 pure solid white #FFFFFF background).",
        "Art style: Warm hand-painted watercolor and fine ink-line isometric miniature town diorama on a grassy diamond-shaped earth plinth, matching a cozy Japanese storybook postal town.",
        "STRICT LAYOUT & CONTENT RULES:",
        "- Pure solid #FFFFFF white background everywhere outside each isometric diamond diorama.",
        "- NO borders, NO frames, NO dividing lines, NO grid lines, NO drop shadows on the white background.",
        "- NO text, NO letters, NO numbers, NO signs with writing anywhere.",
        "- Each diorama MUST sit cleanly inside its own 512x512 cell with generous white margin so NO roofs or trees cross cell boundaries.",
        "",
        "Dioramas for the cells:",
    ]
    for (pos_label, _), (_, out_name, brief) in zip(CELL_POSITIONS, group):
        lines.append(f"- {pos_label} [{out_name}]: {brief}")
    return "\n".join(lines)


def process_group(
    client: OpenAI,
    group_idx: int,
    group: list[tuple[str, str, str]],
    sheet_dir: Path,
    force: bool,
) -> tuple[int, list[str]]:
    out_names = [item[1] for item in group]
    out_paths = [OUT_DIR / f"{name}.png" for name in out_names]
    if not force and all(p.exists() for p in out_paths):
        return group_idx, out_names

    prompt = build_prompt(group)
    sheet_path = sheet_dir / f"sheet_{group_idx:02d}_{out_names[0]}_{out_names[-1]}.png"

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

    return group_idx, out_names


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--sheet-dir", type=Path, default=DEFAULT_SHEET_DIR)
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    by_id = {a["id"]: a for a in manifest["assets"]}

    items: list[tuple[str, str, str]] = []
    for manifest_id, out_name in MISSING_STAGES:
        asset = by_id.get(manifest_id)
        if not asset:
            print(f"Missing manifest id: {manifest_id}", file=sys.stderr)
            return 1
        items.append((manifest_id, out_name, asset["visual_brief"].strip()))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    args.sheet_dir.mkdir(parents=True, exist_ok=True)

    client = OpenAI(api_key=load_openai_key())
    groups = [items[i : i + 6] for i in range(0, len(items), 6)]
    print(f"Generating {len(items)} district stage sprites in {len(groups)} contact sheets...")

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [
            pool.submit(process_group, client, idx, grp, args.sheet_dir, args.force)
            for idx, grp in enumerate(groups, start=1)
        ]
        for fut in concurrent.futures.as_completed(futures):
            idx, names = fut.result()
            print(f"[sheet {idx:02d}/{len(groups)}] Done: {', '.join(names)}", flush=True)

    print("All 17 district stage sprites generated successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
