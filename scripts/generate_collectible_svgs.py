"""Generate 24 collectible SVG illustrations (12 family foil boards, 11 milestone frames/
ornaments/albums/emblems, and shared board_foil) as 3x2 watercolor & gold-foil contact
sheets via gpt-image-2.6-flare, crop & remove white backgrounds, and embed high-res WebP
artwork inside SVG wrappers under public/assets/.
"""

import argparse
import base64
import concurrent.futures
import json
import sys
import time
import urllib.request
from collections import deque
from io import BytesIO
from pathlib import Path

from openai import OpenAI
from PIL import Image

MANIFEST_PATH = Path("spec/initial/data/visual_resource_manifest.json")
PUBLIC_DIR = Path("public")
DEFAULT_SHEET_DIR = Path(".tmp_sheets/collectible_svgs")

CELL_POSITIONS = [
    ("Top-Left (Row 1, Col 1)", (0, 0, 512, 512)),
    ("Top-Center (Row 1, Col 2)", (512, 0, 1024, 512)),
    ("Top-Right (Row 1, Col 3)", (1024, 0, 1536, 512)),
    ("Bottom-Left (Row 2, Col 1)", (0, 512, 512, 1024)),
    ("Bottom-Center (Row 2, Col 2)", (512, 512, 1024, 1024)),
    ("Bottom-Right (Row 2, Col 3)", (1024, 512, 1536, 1024)),
]

SHEETS: list[tuple[str, list[str]]] = [
    ("foil_boards_1", ["family_a", "family_b", "family_c", "family_d", "family_e", "family_f"]),
    ("foil_boards_2", ["family_g", "family_h", "family_i", "family_j", "family_k", "family_l"]),
    (
        "milestone_items_1",
        [
            "reward_frame_leaf",
            "reward_tree_ornament",
            "reward_frame_plaza",
            "reward_fountain_ornament",
            "reward_album_24_emblem",
            "reward_frame_sunset",
        ],
    ),
    (
        "milestone_items_2",
        [
            "reward_board_48_emblem",
            "reward_first_collection_emblem",
            "reward_frame_journey",
            "reward_expanded_album_emblem",
            "reward_complete_72_emblem",
            "board_foil",
        ],
    ),
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


def flood_fill_transparent(cell: Image.Image, threshold: int = 240) -> Image.Image:
    """Make contiguous pure/near-white background connected to cell borders transparent."""
    rgba = cell.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    visited = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def is_bg(r: int, g: int, b: int) -> bool:
        return r >= threshold and g >= threshold and b >= threshold and (max(r, g, b) - min(r, g, b)) <= 14

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

    for y in range(1, h - 1):
        for x in range(1, w - 1):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r >= 224 and g >= 224 and b >= 224 and (max(r, g, b) - min(r, g, b)) <= 16:
                if (
                    px[x - 1, y][3] == 0
                    or px[x + 1, y][3] == 0
                    or px[x, y - 1][3] == 0
                    or px[x, y + 1][3] == 0
                ):
                    px[x, y] = (r, g, b, 96)

    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    # Add small 8px transparent padding so borders/glows never kiss SVG viewport edges
    pad = 8
    padded = Image.new("RGBA", (rgba.width + pad * 2, rgba.height + pad * 2), (0, 0, 0, 0))
    padded.paste(rgba, (pad, pad), rgba)
    return padded


def build_prompt(sheet_name: str, assets: list[dict]) -> str:
    if sheet_name.startswith("foil_boards"):
        lines = [
            "A clean 3-column by 2-row contact sheet (6 ornate collectible gold-foil stamp board cards arranged in a strict 3x2 grid on a 1536x1024 pure solid white #FFFFFF canvas).",
            "Art style: Warm hand-painted watercolor, fine ink-line storybook illustration, and embossed metallic gold-foil stamping on cream cotton paper. Cozy Japanese postal town aesthetic.",
            "Each item is a handsome small commemorative cream-and-gold-foil collector stamp board card featuring its own rich watercolor & gold-foil central illustration motif.",
            "STRICT LAYOUT & CONTENT RULES:",
            "- Pure solid #FFFFFF white background everywhere outside each individual collector card.",
            "- NO grid lines, NO dividing lines, NO outer frame around the whole sheet, NO drop shadows on the white background.",
            "- NO text, NO letters, NO numbers, NO kanji/kana, NO labels anywhere.",
            "- Each card MUST sit cleanly inside its own 512x512 cell with at least 36px pure #FFFFFF white margin on all 4 sides so NO artwork touches cell boundaries.",
            "",
            "Foil board cards for the 6 cells:",
        ]
    else:
        lines = [
            "A clean 3-column by 2-row contact sheet (6 collectible postal keepsake illustrations — picture frames, ornamental garden borders, cloth-bound stamp albums, and gold-foil memorial boards — arranged in a strict 3x2 grid on a 1536x1024 pure solid white #FFFFFF canvas).",
            "Art style: Warm hand-painted watercolor, fine ink-line storybook illustration, and embossed metallic gold-foil detailing on cream paper and rich forest-teal bookcloth. Cozy Japanese postal town aesthetic.",
            "STRICT LAYOUT & CONTENT RULES:",
            "- Pure solid #FFFFFF white background everywhere outside each keepsake object.",
            "- NO grid lines, NO dividing lines, NO outer sheet border, NO drop shadows on the white background.",
            "- NO text, NO letters, NO numbers, NO kanji/kana, NO labels anywhere.",
            "- Each keepsake MUST sit cleanly centered inside its own 512x512 cell with at least 36px pure #FFFFFF white margin on all 4 sides so NO artwork touches cell boundaries.",
            "- For frames (leaf, plaza, sunset, journey): paint the decorative ornate frame border surrounding a warm soft parchment-cream inner mat.",
            "- For albums and memorial boards: paint the richly bound album cover or gold-foil display board with its featured central emblem illustration.",
            "",
            "Collectibles for the 6 cells:",
        ]

    for (pos_label, _), asset in zip(CELL_POSITIONS, assets):
        brief = asset["visual_brief"].strip()
        lines.append(f"- {pos_label} [{asset['id']}]: {asset['name']} — {brief}")
    return "\n".join(lines)


def wrap_rgba_in_svg(rgba: Image.Image, title: str) -> str:
    buf = BytesIO()
    rgba.save(buf, format="WEBP", quality=90, method=6)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    w, h = rgba.size
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
        f'role="img" aria-label="{title}">\n'
        f'  <image width="{w}" height="{h}" href="data:image/webp;base64,{b64}"/>\n'
        f'</svg>\n'
    )


def process_sheet(
    client: OpenAI,
    sheet_idx: int,
    sheet_name: str,
    assets: list[dict],
    sheet_dir: Path,
    force: bool,
) -> tuple[int, list[str]]:
    ids = [a["id"] for a in assets]
    out_paths = [PUBLIC_DIR / a["runtime_exports"][0] for a in assets]
    if not force and all(
        p.exists() and "data:image/webp;base64," in p.read_text(encoding="utf-8")
        for p in out_paths
    ):
        return sheet_idx, ids

    prompt = build_prompt(sheet_name, assets)
    sheet_path = sheet_dir / f"sheet_{sheet_idx:02d}_{sheet_name}.png"

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
        raise RuntimeError(f"Failed sheet {sheet_name}: {last_err}")

    with Image.open(sheet_path) as img:
        if img.size != (1536, 1024):
            img = img.resize((1536, 1024), Image.Resampling.LANCZOS)
        rgb = img.convert("RGB")
        for (_, box), asset, out_path in zip(CELL_POSITIONS, assets, out_paths):
            cell = rgb.crop(box)
            rgba = flood_fill_transparent(cell)
            svg_text = wrap_rgba_in_svg(rgba, asset["name"])
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(svg_text, encoding="utf-8")

    return sheet_idx, ids


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Regenerate existing SVGs")
    parser.add_argument("--workers", type=int, default=4, help="Parallel API workers")
    parser.add_argument("--sheet-dir", type=Path, default=DEFAULT_SHEET_DIR)
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    by_id = {a["id"]: a for a in manifest["assets"]}

    resolved_sheets: list[tuple[str, list[dict]]] = []
    for name, id_list in SHEETS:
        items = []
        for aid in id_list:
            if aid not in by_id:
                print(f"Missing manifest id: {aid}", file=sys.stderr)
                return 1
            items.append(by_id[aid])
        resolved_sheets.append((name, items))

    args.sheet_dir.mkdir(parents=True, exist_ok=True)
    client = OpenAI(api_key=load_openai_key())
    print(f"Generating 24 collectible SVG illustrations in {len(resolved_sheets)} sheets (workers={args.workers})...")

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [
            pool.submit(process_sheet, client, idx, name, items, args.sheet_dir, args.force)
            for idx, (name, items) in enumerate(resolved_sheets, start=1)
        ]
        for fut in concurrent.futures.as_completed(futures):
            idx, ids = fut.result()
            print(f"[sheet {idx:02d}/{len(resolved_sheets)}] Done: {', '.join(ids)}", flush=True)

    print("All 24 collectible SVGs generated successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
