"""Generate all 72 achievement stamp illustrations as 3x2 contact sheets via gpt-image-2.6-flare
and slice them into 512x512 WebP files under public/assets/achievement_stamp/.
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
OUT_DIR = Path("public/assets/achievement_stamp")
DEFAULT_SHEET_DIR = Path(".tmp_sheets/achievement_stamp")

CELL_POSITIONS = [
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


def build_prompt(group: list[dict]) -> str:
    lines = [
        "A clean 3-column by 2-row contact sheet (6 equal 512x512 square panels arranged in a strict 3x2 grid on a 1536x1024 canvas).",
        "Art style: Warm, gentle hand-painted watercolor and fine ink-line storybook illustration on a uniform soft warm cream-white paper background (#FAF6EE). Cozy Japanese postal town aesthetic.",
        "STRICT LAYOUT & CONTENT RULES:",
        "- NO borders, NO frames, NO stamp perforations, NO dividing lines, NO grid lines, NO margins around the canvas.",
        "- NO text, NO letters, NO numbers, NO kanji/kana, NO labels anywhere.",
        "- Each of the 6 illustrations MUST be centered inside its own 512x512 cell with at least 40px of clean #FAF6EE cream background padding on all 4 sides so NO artwork touches or crosses cell boundaries.",
        "",
        "Illustrations for the 6 cells:",
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
        raise RuntimeError(f"Failed group {group_idx} ({ids[0]}..{ids[-1]}): {last_err}")

    with Image.open(sheet_path) as img:
        if img.size != (1536, 1024):
            img = img.resize((1536, 1024), Image.Resampling.LANCZOS)
        rgb = img.convert("RGB")
        for (_, box), out_path in zip(CELL_POSITIONS, out_paths):
            cell = rgb.crop(box)
            cell.save(out_path, format="WEBP", quality=90, method=6)

    return group_idx, ids


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Regenerate existing stamps")
    parser.add_argument("--workers", type=int, default=4, help="Parallel API workers")
    parser.add_argument("--sheet-dir", type=Path, default=DEFAULT_SHEET_DIR)
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    stamps = [a for a in manifest["assets"] if a["category"] == "achievement_stamp"]
    if len(stamps) != 72:
        print(f"Expected 72 achievement_stamp assets, found {len(stamps)}", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    args.sheet_dir.mkdir(parents=True, exist_ok=True)

    client = OpenAI(api_key=load_openai_key())
    groups = [stamps[i : i + 6] for i in range(0, len(stamps), 6)]
    print(f"Generating {len(stamps)} achievement stamps in {len(groups)} contact sheets (workers={args.workers})...")

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [
            pool.submit(process_group, client, idx, grp, args.sheet_dir, args.force)
            for idx, grp in enumerate(groups, start=1)
        ]
        for fut in concurrent.futures.as_completed(futures):
            idx, ids = fut.result()
            print(f"[sheet {idx:02d}/{len(groups)}] Done: {', '.join(ids)}", flush=True)

    print("All 72 achievement stamps generated successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
