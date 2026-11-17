"""Generate:
1) 8-frame right-moving cargo wagon sprite strips (anim_wagon_stage1..5.png)
   via gpt-image-2.6-flare images.edit using current cargo_wagon_stage1..5.png as start image.
2) Scenic background-extended destination/hub raster images (scenic_*.jpg)
   via gpt-image-2.6-flare images.edit so radial-gradient edge fading blends real scenery.
"""

import argparse
import base64
import concurrent.futures
from collections import deque
from io import BytesIO
from pathlib import Path

from openai import OpenAI
from PIL import Image

SPRITES_DIR = Path("public/assets/sprites")
RASTER_DIR = Path("public/assets/raster")
SHEET_DIR = Path(".tmp_sheets/play_assets")

FRAME_SIZE = 160

STYLE_BASE = (
    "Warm hand-painted Japanese watercolor & ink storybook illustration style, "
    "gentle fine brown-ink outlines, cozy postal town aesthetic. "
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
        mx = max(r, g, b)
        mn = min(r, g, b)
        lum = (r + g + b) / 3
        # White/cream outer background or neutral light card
        return (r >= 230 and g >= 230 and b >= 230) or (lum >= 220 and (mx - mn) <= 18)

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

    for y in range(1, h - 1):
        for x in range(1, w - 1):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r >= 218 and g >= 218 and b >= 218:
                if (
                    px[x - 1, y][3] == 0
                    or px[x + 1, y][3] == 0
                    or px[x, y - 1][3] == 0
                    or px[x, y + 1][3] == 0
                ):
                    px[x, y] = (r, g, b, 96)
    return rgba


FRAME_W = 216
FRAME_H = 160


def sheet_4x2_to_strip(sheet_path: Path, out_path: Path, ref_static_path: Path | None = None) -> None:
    img = Image.open(sheet_path)
    if img.size != (1536, 1024):
        img = img.convert("RGB").resize((1536, 1024), Image.Resampling.LANCZOS)
    else:
        img = img.convert("RGB")

    cols, rows = 4, 2
    cell_w, cell_h = 1536 / cols, 1024 / rows
    frames: list[Image.Image] = []
    bboxes: list[tuple[int, int, int, int]] = []

    for r in range(rows):
        for c in range(cols):
            cell = img.crop(
                (round(c * cell_w), round(r * cell_h), round((c + 1) * cell_w), round((r + 1) * cell_h))
            )
            rgba = flood_fill_transparent(cell)
            alpha = rgba.getchannel("A")
            solid_mask = alpha.point(lambda a: 255 if a >= 180 else 0)
            bbox = solid_mask.getbbox() or rgba.getbbox() or (0, 0, rgba.width, rgba.height)
            px = rgba.load()
            x0, y0, x1, y1 = bbox
            while y1 > y0 + 20:
                row_solid = sum(1 for x in range(x0, x1) if px[x, y1 - 1][3] >= 180)
                if row_solid >= 6:
                    break
                y1 -= 1
            for yy in range(y1, rgba.height):
                for xx in range(rgba.width):
                    px[xx, yy] = (0, 0, 0, 0)
            frames.append(rgba)
            bboxes.append((x0, y0, x1, y1))

    max_w = max(b[2] - b[0] for b in bboxes)
    max_h = max(b[3] - b[1] for b in bboxes)
    scale = min((FRAME_W - 8) / max(1, max_w), (FRAME_H - 8) / max(1, max_h))

    if ref_static_path and ref_static_path.exists():
        ref_im = Image.open(ref_static_path)
        ref_bbox = ref_im.getbbox()
        if ref_bbox:
            ref_h_ratio = (ref_bbox[3] - ref_bbox[1]) / ref_im.height
            target_h = ref_h_ratio * FRAME_H
            ref_scale = target_h / max(1, max_h)
            scale = min(ref_scale, (FRAME_W - 6) / max(1, max_w))

    strip = Image.new("RGBA", (FRAME_W * cols * rows, FRAME_H), (0, 0, 0, 0))
    bottom_pad = round(4 * (FRAME_H / 240))
    right_pad = round(6 * (FRAME_H / 240))
    for idx, (frame, bbox) in enumerate(zip(frames, bboxes)):
        cropped = frame.crop(bbox)
        cw, ch = cropped.size
        nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))
        resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
        # Right-align to match static wagon coupler position; extra width on left holds dust puffs
        ox = idx * FRAME_W + max(2, FRAME_W - nw - right_pad)
        oy = FRAME_H - nh - bottom_pad
        strip.paste(resized, (ox, oy), resized)

    strip.save(out_path, format="PNG")
    print(f"[wagon_anim] Saved {out_path} ({strip.size[0]}x{strip.size[1]})")


def make_white_bg_png_bytes(src_path: Path) -> BytesIO:
    im = Image.open(src_path).convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    buf = BytesIO()
    bg.convert("RGB").save(buf, format="PNG")
    buf.seek(0)
    buf.name = src_path.name
    return buf


def generate_wagon_anim(client: OpenAI, stage: int, force: bool) -> None:
    src_path = SPRITES_DIR / f"cargo_wagon_stage{stage}.png"
    sheet_path = SHEET_DIR / f"sheet_4x2_wagon_stage{stage}.png"
    out_path = SPRITES_DIR / f"anim_wagon_stage{stage}.png"

    if force or not sheet_path.exists():
        prompt = (
            f"Using the exact wooden green-trimmed postal cargo wagon with {stage} craft-paper parcel(s) "
            "from the reference image as Frame 1, generate a clean 4-column by 2-row sprite-sheet grid "
            "(8 animation frames in strict left-to-right, top-to-bottom order on a 1536x1024 pure solid white #FFFFFF background, "
            "no grid lines, no borders, no text, no numbers). "
            "Show the EXACT SAME wagon facing strictly to the RIGHT (tow-hitch coupler on the right), rolling smoothly forward to the right: "
            "across the 8 frames, the spoked wooden wheels rotate clockwise continuously, the wagon body and stacked parcels bounce gently "
            "with cheerful suspension motion, and tiny soft white dust puffs trail behind the rear wheel. "
            f"Keep the exact parcel count ({stage}) and wagon proportions consistent across all 8 frames. "
            + STYLE_BASE
        )
        img_buf = make_white_bg_png_bytes(src_path)
        print(f"[wagon_anim] Editing stage {stage} via gpt-image-2.6-flare...")
        resp = client.images.edit(
            model="gpt-image-2.6-flare",
            image=img_buf,
            prompt=prompt,
            size="1536x1024",
            n=1,
        )
        b64 = resp.data[0].b64_json
        if not b64:
            raise RuntimeError(f"No b64_json for wagon stage {stage}")
        sheet_path.write_bytes(base64.b64decode(b64))

    sheet_4x2_to_strip(sheet_path, out_path, src_path)


SCENIC_SPECS: list[tuple[str, str, str]] = [
    ("hub", "city_hub.jpg", "central postal clock-tower hub surrounded by cobblestone plaza, green trees, warm morning sky, and town rooftops"),
    ("plot", "city_plot.jpg", "cozy fenced grassy town plot beside a cobblestone road, framed by wildflowers, gentle trees, garden hedges, and soft morning sky"),
    ("residential", "residential_stage_1.jpg", "cozy Japanese residential neighborhood houses beside a cobblestone street, with garden trees, hedges, and warm sunlit sky"),
    ("market", "market_stage_1.jpg", "lively Japanese town market stalls beside a cobblestone street, with trees, lanterns, baskets, and soft morning sky"),
    ("workshop", "workshop_stage_1.jpg", "warm artisan craft workshop beside a cobblestone street, with timber stacks, trees, and sunlit sky"),
    ("park", "park_stage_1.jpg", "serene cherry-blossom town park with fountain and gazebo, extended into surrounding lush greenery, stone paths, and soft sky"),
    ("station", "station_stage_1.jpg", "charming wooden postal railway station with tracks, surrounding trees, plaza, and soft morning sky"),
    ("harbor", "harbor_stage_1.jpg", "calm coastal postal harbor pier with boats, sparkling teal water, stone quay, coastal pines, and bright sky"),
]


def generate_scenic_location(client: OpenAI, key: str, src_name: str, desc: str, force: bool) -> None:
    src_path = RASTER_DIR / src_name
    out_path = RASTER_DIR / f"scenic_{key}.jpg"
    if not force and out_path.exists():
        print(f"[scenic] Skipping existing {out_path}")
        return

    prompt = (
        f"Keep the central building/plot illustration from the reference image intact in the middle, "
        f"and seamlessly expand the plain cream margins outward all the way to all four edges into a full-bleed scenic background: {desc}. "
        "No white borders, no vignette frame, no text, no labels—paint the surrounding scenery edge-to-edge. "
        + STYLE_BASE
    )
    with open(src_path, "rb") as f:
        print(f"[scenic] Expanding {src_name} -> scenic_{key}.jpg via gpt-image-2.6-flare...")
        resp = client.images.edit(
            model="gpt-image-2.6-flare",
            image=f,
            prompt=prompt,
            size="1536x1024",
            n=1,
        )
    b64 = resp.data[0].b64_json
    if not b64:
        raise RuntimeError(f"No b64_json for scenic {key}")
    raw = Image.open(BytesIO(base64.b64decode(b64))).convert("RGB")
    raw.save(out_path, format="JPEG", quality=90)
    print(f"[scenic] Saved {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--only", choices=["all", "wagons", "scenic"], default="all")
    args = parser.parse_args()

    SHEET_DIR.mkdir(parents=True, exist_ok=True)
    client = OpenAI(api_key=load_api_key())

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures = []
        if args.only in ("all", "wagons"):
            for stage in range(1, 6):
                futures.append(pool.submit(generate_wagon_anim, client, stage, args.force))
        if args.only in ("all", "scenic"):
            for key, src_name, desc in SCENIC_SPECS:
                futures.append(pool.submit(generate_scenic_location, client, key, src_name, desc, args.force))
        for fut in concurrent.futures.as_completed(futures):
            fut.result()


if __name__ == "__main__":
    main()
