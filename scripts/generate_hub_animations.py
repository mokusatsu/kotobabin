"""Generate 15-frame (5fps x 3s) sprite-strip animations for all 7 hubs and the
under-construction working icon using 5x3 contact sheets via gpt-image-2.6-flare.

Outputs 2400x160 (15 frames of 160x160) transparent RGBA PNG strips under
public/assets/sprites/anim_<name>.png.
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

OUT_DIR = Path("public/assets/sprites")
DEFAULT_SHEET_DIR = Path(".tmp_sheets/animations")
FRAME_SIZE = 160
COLS = 5
ROWS = 3

ANIM_SPECS: dict[str, str] = {
    "construction": (
        "A cute tiny wooden carpenter/builder in a work cap hammering a small wooden scaffold frame "
        "with a wooden mallet, with tiny sawdust puffs and a cheerful working motion. "
        "Frame 1-5: raise mallet, Frame 6-10: swing down and tap with tiny dust puff, Frame 11-15: lift mallet back to Frame 1."
    ),
    "central_hub": (
        "A cozy miniature postal weathervane & warm glowing brass lantern with a tiny carrier pigeon "
        "perched beside it gently flapping its wings and a small postal pennant waving softly in the breeze. "
        "Seamless 15-frame loop returning smoothly to Frame 1."
    ),
    "residential": (
        "A cute miniature terracotta chimney top puffing soft curling white smoke clouds upward "
        "with a tiny warm glowing dormer window twinkling gently. "
        "Seamless 15-frame loop returning smoothly to Frame 1."
    ),
    "market": (
        "Festive miniature colorful market bunting flags and a warm hanging paper lantern swaying gently "
        "in the breeze with tiny golden sparkles. "
        "Seamless 15-frame loop returning smoothly to Frame 1."
    ),
    "workshop": (
        "Two interlocking warm brass and wooden cogwheels turning steadily beside a tiny copper pipe "
        "releasing gentle rhythmic white steam puffs. "
        "Seamless 15-frame loop returning smoothly to Frame 1."
    ),
    "park": (
        "A charming miniature stone park fountain sparkling with gentle rising water droplets and "
        "two tiny green leaves/petals swaying softly in the breeze. "
        "Seamless 15-frame loop returning smoothly to Frame 1."
    ),
    "station": (
        "A miniature railway semaphore signal arm gently tilting with a small red station flag waving "
        "and soft white steam puffs drifting upward. "
        "Seamless 15-frame loop returning smoothly to Frame 1."
    ),
    "harbor": (
        "A miniature coastal harbor beacon lantern pulsing with warm golden light rays above gentle "
        "blue-teal water ripples and a tiny circling white gull. "
        "Seamless 15-frame loop returning smoothly to Frame 1."
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


def flood_fill_cell(cell: Image.Image, threshold: int = 238) -> Image.Image:
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


def build_prompt(subject_desc: str) -> str:
    return (
        "A clean 5-column by 3-row sprite sheet (15 equal frames arranged in a strict 5x3 grid "
        "on a 1536x1024 pure solid white #FFFFFF background) for a 5fps 3-second seamless looping animation.\n"
        f"Subject: {subject_desc}\n"
        "Art style: Warm hand-painted watercolor and fine ink-line illustration matching a cozy Japanese storybook postal town.\n"
        "STRICT LAYOUT & CONTENT RULES:\n"
        "- Pure solid #FFFFFF white background everywhere.\n"
        "- NO borders, NO frames, NO grid lines, NO numbers, NO text, NO labels.\n"
        "- 5 columns wide by 3 rows tall (15 frames total, reading left-to-right, top-to-bottom).\n"
        "- Each frame MUST keep the stationary parts in the exact same center position and scale within its cell "
        "(~307x341px) with generous white margin so no artwork crosses cell boundaries."
    )


def sheet_to_strip(sheet_path: Path, out_path: Path) -> None:
    with Image.open(sheet_path) as img:
        if img.size != (1536, 1024):
            img = img.resize((1536, 1024), Image.Resampling.LANCZOS)
        rgb = img.convert("RGB")

    cell_w = 1536 / COLS
    cell_h = 1024 / ROWS
    frames: list[Image.Image] = []
    union_bbox: tuple[int, int, int, int] | None = None

    for row in range(ROWS):
        for col in range(COLS):
            left = round(col * cell_w)
            top = round(row * cell_h)
            right = round((col + 1) * cell_w)
            bottom = round((row + 1) * cell_h)
            cell = rgb.crop((left, top, right, bottom))
            rgba = flood_fill_cell(cell)
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

    strip = Image.new("RGBA", (FRAME_SIZE * COLS * ROWS, FRAME_SIZE), (0, 0, 0, 0))
    for idx, frame in enumerate(frames):
        if union_bbox:
            cropped = frame.crop(union_bbox)
        else:
            cropped = frame
        # Fit into FRAME_SIZE x FRAME_SIZE preserving aspect ratio, centered
        cw, ch = cropped.size
        scale = min((FRAME_SIZE - 8) / max(1, cw), (FRAME_SIZE - 8) / max(1, ch))
        nw = max(1, round(cw * scale))
        nh = max(1, round(ch * scale))
        resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
        ox = idx * FRAME_SIZE + (FRAME_SIZE - nw) // 2
        oy = (FRAME_SIZE - nh) // 2
        strip.paste(resized, (ox, oy), resized)

    strip.save(out_path, format="PNG")


def process_anim(
    client: OpenAI,
    name: str,
    subject_desc: str,
    sheet_dir: Path,
    force: bool,
) -> str:
    out_path = OUT_DIR / f"anim_{name}.png"
    if not force and out_path.exists():
        return name

    sheet_path = sheet_dir / f"sheet_5x3_{name}.png"
    if not force and sheet_path.exists():
        sheet_to_strip(sheet_path, out_path)
        return name

    prompt = build_prompt(subject_desc)
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
        raise RuntimeError(f"Failed animation {name}: {last_err}")

    sheet_to_strip(sheet_path, out_path)
    return name


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--sheet-dir", type=Path, default=DEFAULT_SHEET_DIR)
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    args.sheet_dir.mkdir(parents=True, exist_ok=True)

    # Reuse already-tested construction sheet if present in scratch
    scratch_construction = Path(
        r"C:\Users\lain\.gemini\antigravity\brain\8103abed-306f-4d9e-afd0-febdd6392d9e\scratch\test_construction_5x3.png"
    )
    target_construction = args.sheet_dir / "sheet_5x3_construction.png"
    if scratch_construction.exists() and not target_construction.exists():
        target_construction.write_bytes(scratch_construction.read_bytes())

    client = OpenAI(api_key=load_openai_key())
    print(f"Generating {len(ANIM_SPECS)} 15-frame animations (workers={args.workers})...")

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [
            pool.submit(process_anim, client, name, desc, args.sheet_dir, args.force)
            for name, desc in ANIM_SPECS.items()
        ]
        for fut in concurrent.futures.as_completed(futures):
            done_name = fut.result()
            print(f"[anim] Done: anim_{done_name}.png (2400x160, 15 frames)", flush=True)

    print("All 8 animations generated successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
