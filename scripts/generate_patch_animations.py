"""Generate 15-frame (5fps x 3s) animated patch sprite strips from existing
public/assets/patches/<stage_dir>/<facility>.png using gpt-image-2.6-flare's
native animated GIF generation (output_format='gif', frame_count=15, frame_duration_ms=200).

Letterboxes each source patch onto a 512x512 white canvas so the aspect ratio is
preserved, extracts all 15 frames from the returned GIF, crops back to the exact
patch region, applies the original feathered alpha mask, and writes a 15-frame
horizontal WebP strip under public/assets/patches_anim/<stage_dir>/<facility>.webp.
"""

import argparse
import base64
import concurrent.futures
import time
import urllib.request
from io import BytesIO
from pathlib import Path

from openai import OpenAI
from PIL import Image, ImageSequence

PATCHES_ROOT = Path("public/assets/patches")
OUT_ROOT = Path("public/assets/patches_anim")
DEFAULT_GIF_DIR = Path(".tmp_sheets/patch_gif")
WORK_SIZE = 512

STAGE_DIRS = [
    "riverside_stage1",
    "riverside_stage3",
    "highland_stage1",
    "highland_stage3",
    "seaside_stage1",
    "seaside_stage3",
]

FACILITY_ANIM_PROMPTS: dict[str, str] = {
    "central_hub": "2 tiny postal workers or bicycles arriving/departing on the path and carrier pigeons fluttering near the post office roof",
    "residential": "soft white cooking smoke rising gently from the house chimneys/roofs and a tiny resident strolling along the path",
    "market": "2-3 tiny shoppers browsing along the market street and colorful shop awnings/flags swaying gently in the breeze",
    "workshop": "soft white steam/smoke puffing from the workshop chimney and craftsmen moving around the workyard",
    "park": "2-3 tiny citizens strolling gently along the garden path and tiny flower/leaf petals drifting softly in the breeze",
    "station": "soft white train steam puffing gently near the tracks/platform and 1-2 tiny passengers walking by the station",
    "harbor": "gentle shimmering water ripples around the dock/boats and a tiny dockworker or seabird moving near the pier",
    "packaging": "a tiny worker carrying a wrapped parcel outside the packaging depot and a small flag fluttering gently",
    "research": "warm lantern/window light pulsing softly in the study and a tiny scholar walking along the garden path",
    "synergy": "warm lantern glow twinkling gently and a tiny messenger walking between the connected buildings",
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


def prepare_letterboxed_input(orig_path: Path) -> tuple[BytesIO, tuple[int, int, int, int]]:
    """Place orig_path on a 512x512 white square preserving aspect ratio."""
    with Image.open(orig_path) as im:
        rgba = im.convert("RGBA")
        ow, oh = rgba.size
        scale = min(WORK_SIZE / ow, WORK_SIZE / oh)
        sw = max(1, round(ow * scale))
        sh = max(1, round(oh * scale))
        resized = rgba.resize((sw, sh), Image.Resampling.LANCZOS)
        px = (WORK_SIZE - sw) // 2
        py = (WORK_SIZE - sh) // 2

        canvas = Image.new("RGBA", (WORK_SIZE, WORK_SIZE), (255, 255, 255, 255))
        canvas.paste(resized, (px, py), resized)

        buf = BytesIO()
        canvas.convert("RGB").save(buf, format="PNG")
        buf.seek(0)
        buf.name = orig_path.name
        return buf, (px, py, px + sw, py + sh)


def gif_to_patch_strip(
    gif_path: Path,
    orig_patch_path: Path,
    crop_box: tuple[int, int, int, int],
    out_path: Path,
) -> None:
    with Image.open(orig_patch_path) as orig_im:
        orig_rgba = orig_im.convert("RGBA")
        orig_w, orig_h = orig_rgba.size
        orig_alpha = orig_rgba.split()[3]

    with Image.open(gif_path) as gif_im:
        gw, gh = gif_im.size
        sx = gw / WORK_SIZE
        sy = gh / WORK_SIZE
        scaled_box = (
            round(crop_box[0] * sx),
            round(crop_box[1] * sy),
            round(crop_box[2] * sx),
            round(crop_box[3] * sy),
        )
        raw_frames = [f.convert("RGB") for f in ImageSequence.Iterator(gif_im)]

    if len(raw_frames) < 15:
        # Pad if fewer than 15
        while len(raw_frames) < 15:
            raw_frames.append(raw_frames[-1])
    frames = raw_frames[:15]

    strip = Image.new("RGBA", (orig_w * 15, orig_h), (0, 0, 0, 0))
    for idx, frame in enumerate(frames):
        cropped = frame.crop(scaled_box)
        resized = cropped.resize((orig_w, orig_h), Image.Resampling.LANCZOS).convert("RGBA")
        resized.putalpha(orig_alpha)
        strip.paste(resized, (idx * orig_w, 0), resized)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    strip.save(out_path, format="WEBP", quality=88, method=6)


def process_patch(
    client: OpenAI,
    stage_dir: str,
    facility: str,
    gif_dir: Path,
    force: bool,
) -> str:
    orig_path = PATCHES_ROOT / stage_dir / f"{facility}.png"
    out_path = OUT_ROOT / stage_dir / f"{facility}.webp"
    if not orig_path.exists():
        return f"SKIP (missing orig): {stage_dir}/{facility}"
    if not force and out_path.exists():
        return f"CACHED: {stage_dir}/{facility}"

    buf, crop_box = prepare_letterboxed_input(orig_path)
    gif_path = gif_dir / f"{stage_dir}__{facility}.gif"

    if not force and gif_path.exists():
        gif_to_patch_strip(gif_path, orig_path, crop_box, out_path)
        return f"RESLICED: {stage_dir}/{facility}"

    anim_detail = FACILITY_ANIM_PROMPTS[facility]
    prompt = (
        "Animate this exact illustration as a smooth seamless 3-second loop. "
        "Keep the camera completely static and keep all buildings, roofs, terrain, paths, trees, "
        "and soft faded white edges 100% locked in place with ZERO shaking, shifting, or warping. "
        f"Only animate subtle living details inside the scene: {anim_detail}."
    )

    last_err: Exception | None = None
    for attempt in range(1, 4):
        try:
            buf.seek(0)
            resp = client.images.edit(
                model="gpt-image-2.6-flare",
                image=buf,
                prompt=prompt,
                output_format="gif",
                size="auto",
                extra_body={"frame_count": 15, "frame_duration_ms": 200},
            )
            item = resp.data[0]
            if getattr(item, "b64_json", None):
                gif_path.write_bytes(base64.b64decode(item.b64_json))
            elif getattr(item, "url", None):
                urllib.request.urlretrieve(item.url, gif_path)
            else:
                raise RuntimeError("No image data returned")
            break
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            time.sleep(2 * attempt)
    else:
        raise RuntimeError(f"Failed {stage_dir}/{facility}: {last_err}")

    gif_to_patch_strip(gif_path, orig_path, crop_box, out_path)
    return f"DONE: {stage_dir}/{facility}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--gif-dir", type=Path, default=DEFAULT_GIF_DIR)
    args = parser.parse_args()

    args.gif_dir.mkdir(parents=True, exist_ok=True)
    client = OpenAI(api_key=load_openai_key())

    tasks = [(sd, fac) for sd in STAGE_DIRS for fac in FACILITY_ANIM_PROMPTS]
    print(f"Generating {len(tasks)} native GIF patch animations (workers={args.workers})...")

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [
            pool.submit(process_patch, client, sd, fac, args.gif_dir, args.force)
            for sd, fac in tasks
        ]
        done_count = 0
        for fut in concurrent.futures.as_completed(futures):
            done_count += 1
            msg = fut.result()
            print(f"[{done_count}/{len(tasks)}] {msg}", flush=True)

    print("All native GIF patch animations generated successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
