"""Generate 6-stage cargo wagon sprites (0..5 parcels) via gpt-image-2.6-flare.

Outputs:
- public/assets/sprites/cargo_wagon_stage0..5.png (260x240, bottom-aligned, transparent)
"""

import base64
from collections import deque
from pathlib import Path

from openai import OpenAI
from PIL import Image

SPRITES_DIR = Path("public/assets/sprites")
SHEET_DIR = Path(".tmp_sheets/play_assets")

STYLE_BASE = (
    "Warm hand-painted Japanese watercolor & ink storybook illustration style, "
    "gentle fine brown-ink outlines, cozy postal town aesthetic (craft paper tan, "
    "terracotta red, forest green, cream). "
)

WAGON_PROMPT = (
    "A clean 3-column by 2-row grid (6 equal cells, 1536x1024 pure solid white #FFFFFF background, "
    "no grid lines, no borders, no text, no numbers). "
    "Each cell shows the EXACT SAME charming open flatbed postal cargo wagon / wooden trailer cart "
    "in side-view facing RIGHT, with 4 sturdy spoked wheels, low wooden slatted sides painted forest-green and warm oak, "
    "and a short metal tow-hitch coupler extending to the right (so a locomotive or delivery truck in front can pull it). "
    "Craft-paper wrapped postal parcels tied with red-and-white baker's twine pile up inside the wagon bed stage by stage: "
    "Row 1 Col 1 (Stage 0): Empty open cargo wagon only (no parcels). "
    "Row 1 Col 2 (Stage 1): 1 craft-paper parcel sitting neatly inside the wagon bed. "
    "Row 1 Col 3 (Stage 2): 2 craft-paper parcels side by side inside the wagon bed. "
    "Row 2 Col 1 (Stage 3): 3 parcels stacked in a pyramid (2 on bottom, 1 on top) on the wagon. "
    "Row 2 Col 2 (Stage 4): 4 parcels stacked tall and slightly precarious on the wagon. "
    "Row 2 Col 3 (Stage 5): 5 parcels stacked into a full festive mound on the wagon, tied with a red postal ribbon and tiny golden stars glowing at the top. "
    + STYLE_BASE
    + "Keep the wagon position, wheel placement, and scale identical across all 6 cells."
)


def load_api_key() -> str:
    env_path = Path(".env")
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("OPENAI_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("OPENAI_KEY not found in .env")


def flood_fill_transparent(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    visited = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def is_bg(r: int, g: int, b: int) -> bool:
        return r >= 232 and g >= 232 and b >= 232

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
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                idx = ny * w + nx
                if not visited[idx]:
                    r, g, b, _ = px[nx, ny]
                    if is_bg(r, g, b):
                        visited[idx] = 1
                        q.append((nx, ny))

    # Feather 1px semi-bright edge
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r >= 220 and g >= 220 and b >= 220:
                if (
                    px[x - 1, y][3] == 0
                    or px[x + 1, y][3] == 0
                    or px[x, y - 1][3] == 0
                    or px[x, y + 1][3] == 0
                ):
                    px[x, y] = (r, g, b, 96)
    return rgba


def main() -> None:
    import sys

    repack_only = "--repack" in sys.argv
    SHEET_DIR.mkdir(parents=True, exist_ok=True)
    SPRITES_DIR.mkdir(parents=True, exist_ok=True)

    sheet_path = SHEET_DIR / "sheet_3x2_cargo_wagon.png"
    if not repack_only or not sheet_path.exists():
        client = OpenAI(api_key=load_api_key())
        print("[cargo_wagon] Generating 3x2 cargo wagon sheet via gpt-image-2.6-flare...")
        resp = client.images.generate(
            model="gpt-image-2.6-flare",
            prompt=WAGON_PROMPT,
            size="1536x1024",
            n=1,
        )
        b64 = resp.data[0].b64_json
        if not b64:
            raise RuntimeError("No b64_json returned from gpt-image-2.6-flare")
        sheet_path.write_bytes(base64.b64decode(b64))
        print(f"[cargo_wagon] Saved sheet: {sheet_path}")

    img = Image.open(sheet_path)
    if img.size != (1536, 1024):
        img = img.convert("RGB").resize((1536, 1024), Image.Resampling.LANCZOS)
    else:
        img = img.convert("RGB")

    cols, rows = 3, 2
    cell_w, cell_h = 1536 / cols, 1024 / rows
    cells: list[Image.Image] = []
    bboxes: list[tuple[int, int, int, int]] = []

    for r in range(rows):
        for c in range(cols):
            cell = img.crop(
                (round(c * cell_w), round(r * cell_h), round((c + 1) * cell_w), round((r + 1) * cell_h))
            )
            rgba = flood_fill_transparent(cell)
            # Clear tiny stray semi-transparent specks below the wheels using solid alpha mask
            alpha = rgba.getchannel("A")
            solid_mask = alpha.point(lambda a: 255 if a >= 180 else 0)
            bbox = solid_mask.getbbox() or rgba.getbbox() or (0, 0, rgba.width, rgba.height)
            # Remove any stray isolated island below the main wagon wheels (e.g. Stage 2 bottom speck)
            px = rgba.load()
            x0, y0, x1, y1 = bbox
            row_counts = [
                sum(1 for x in range(x0, x1) if px[x, y][3] >= 180)
                for y in range(rgba.height)
            ]
            # Find the lowest row belonging to the main body (contiguous block from middle down,
            # ignoring small islands separated by >= 3 empty rows near the bottom)
            body_y1 = y1
            y = y1 - 1
            while y > y0 + 20:
                if row_counts[y] == 0:
                    gap_end = y
                    while y > y0 + 20 and row_counts[y] == 0:
                        y -= 1
                    gap_len = gap_end - y
                    if gap_len >= 3 and y < y1 - 3:
                        # Everything below gap_end was an isolated island below the wheels
                        body_y1 = y + 1
                        break
                else:
                    y -= 1
            y1 = body_y1
            clean_bbox = (x0, y0, x1, y1)
            # Erase anything below clean_bbox so stray specks never affect output
            for yy in range(y1, rgba.height):
                for xx in range(rgba.width):
                    px[xx, yy] = (0, 0, 0, 0)
            cells.append(rgba)
            bboxes.append(clean_bbox)

    max_w = max(b[2] - b[0] for b in bboxes)
    max_h = max(b[3] - b[1] for b in bboxes)
    canvas_w, canvas_h = 260, 240
    scale = min((canvas_w - 12) / max(1, max_w), (canvas_h - 12) / max(1, max_h))

    for idx, (rgba, bbox) in enumerate(zip(cells, bboxes)):
        cropped = rgba.crop(bbox)
        cw, ch = cropped.size
        nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))
        resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
        out = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        ox = (canvas_w - nw) // 2
        oy = canvas_h - nh - 4
        out.paste(resized, (ox, oy), resized)
        out_path = SPRITES_DIR / f"cargo_wagon_stage{idx}.png"
        out.save(out_path, format="PNG")
    print("[cargo_wagon] Saved cargo_wagon_stage0..5.png (260x240, wheel-bottom aligned)")


if __name__ == "__main__":
    main()
