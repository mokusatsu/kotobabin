"""Generate all 12 family postcards as 2x2 contact sheets via gpt-image-2.6-flare
and slice them into 16:10 WebP files under public/assets/postcard/.
"""

import argparse
import base64
import concurrent.futures
import json
import sys
import time
import urllib.request
from pathlib import Path

from openai import OpenAI
from PIL import Image

MANIFEST_PATH = Path("spec/initial/data/visual_resource_manifest.json")
OUT_DIR = Path("public/assets/postcard")
DEFAULT_SHEET_DIR = Path(".tmp_sheets/postcard")

# 1536x1024 split into 2x2 -> each cell is 768x512.
# Crop 16px top and bottom (768x480) for exact 16:10 aspect ratio, then resize to 1600x1000.
CELL_POSITIONS = [
    ("Top-Left (Row 1, Col 1)", (0, 0, 768, 512)),
    ("Top-Right (Row 1, Col 2)", (768, 0, 1536, 512)),
    ("Bottom-Left (Row 2, Col 1)", (0, 512, 768, 1024)),
    ("Bottom-Right (Row 2, Col 2)", (768, 512, 1536, 1024)),
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


def build_prompt(group: list[dict]) -> str:
    lines = [
        "A clean 2-column by 2-row contact sheet (4 landscape 768x512 postcard illustrations arranged in a strict 2x2 grid on a 1536x1024 canvas).",
        "Art style: Warm, nostalgic hand-painted watercolor and fine ink-line storybook illustration. Cozy Japanese postal town aesthetic with rich atmospheric lighting and soft paper texture.",
        "STRICT LAYOUT & CONTENT RULES:",
        "- NO borders, NO white margins, NO postcard frames, NO stamp marks, NO dividing lines, NO grid lines between panels.",
        "- Each of the 4 landscape scenes fills its entire 768x512 quadrant edge-to-edge cleanly.",
        "- NO text, NO letters, NO numbers, NO kanji/kana, NO shop signs with writing anywhere.",
        "",
        "Scenes for the 4 quadrants:",
    ]
    for (pos_label, _), asset in zip(CELL_POSITIONS, group):
        brief = asset["visual_brief"].strip()
        lines.append(f"- {pos_label} [{asset['id']}]: {brief}")
    return "\n".join(lines)


def process_group(
    client: OpenAI,
    group_idx: int,
    group: list[dict],
    sheet_dir: Path,
    force: bool,
) -> tuple[int, list[str]]:
    ids = [a["id"] for a in group]
    out_paths = [OUT_DIR / f"{asset_id}.webp" for asset_id in ids]
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
            # Center-crop 768x512 -> 768x480 (16:10), then resize to 1600x1000
            cell_16_10 = cell.crop((0, 16, 768, 496))
            resized = cell_16_10.resize((1600, 1000), Image.Resampling.LANCZOS)
            resized.save(out_path, format="WEBP", quality=90, method=6)

    return group_idx, ids


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--sheet-dir", type=Path, default=DEFAULT_SHEET_DIR)
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    postcards = [a for a in manifest["assets"] if a["category"] == "postcard"]
    if len(postcards) != 12:
        print(f"Expected 12 postcard assets, found {len(postcards)}", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    args.sheet_dir.mkdir(parents=True, exist_ok=True)

    client = OpenAI(api_key=load_openai_key())
    groups = [postcards[i : i + 4] for i in range(0, len(postcards), 4)]
    print(f"Generating {len(postcards)} postcards in {len(groups)} contact sheets...")

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [
            pool.submit(process_group, client, idx, grp, args.sheet_dir, args.force)
            for idx, grp in enumerate(groups, start=1)
        ]
        for fut in concurrent.futures.as_completed(futures):
            idx, ids = fut.result()
            print(f"[sheet {idx:02d}/{len(groups)}] Done: {', '.join(ids)}", flush=True)

    print("All 12 postcards generated successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
