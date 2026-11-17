import json
import math
import os
import struct
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / "spec" / "initial" / "data" / "visual_resource_manifest.json"
PUBLIC_DIR = ROOT / "public"

COLORS = {
    "text": "#203D36",
    "primary": "#24594F",
    "accent": "#B34E39",
    "reward": "#B58A3C",
    "surface": "#FFFDF7",
    "page": "#F5F1E7",
    "border": "#C9D0C3",
}


def make_svg(asset: dict) -> str:
    aid = asset["id"]
    cat = asset["category"]
    title = asset["name"]

    if cat == "shared_frame":
        if "stamp" in aid:
            return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-label="{title}">
  <rect x="6" y="6" width="228" height="228" rx="4" fill="none" stroke="{COLORS["border"]}" stroke-width="4" stroke-dasharray="8 6"/>
  <rect x="14" y="14" width="212" height="212" rx="2" fill="none" stroke="{COLORS["primary"]}" stroke-width="1.5" opacity="0.6"/>
</svg>'''
        return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-label="{title}">
  <rect x="8" y="8" width="224" height="224" rx="10" fill="none" stroke="{COLORS["reward"]}" stroke-width="4"/>
  <rect x="16" y="16" width="208" height="208" rx="6" fill="none" stroke="{COLORS["primary"]}" stroke-width="1.5" stroke-dasharray="6 4"/>
</svg>'''

    if cat == "brand":
        return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="{title}">
  <rect x="4" y="12" width="56" height="40" rx="4" fill="{COLORS["accent"]}"/>
  <path d="M8 16 L32 34 L56 16" fill="none" stroke="{COLORS["surface"]}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="8" y="16" width="48" height="32" rx="2" fill="none" stroke="{COLORS["surface"]}" stroke-width="1.5" stroke-dasharray="3 3"/>
</svg>'''

    if cat == "shop_overlay":
        if "awning" in aid:
            return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32" role="img" aria-label="{title}">
  <path d="M4 8 H60 L56 24 H8 Z" fill="{COLORS["accent"]}" stroke="{COLORS["text"]}" stroke-width="2"/>
  <path d="M16 8 V24 M28 8 V24 M40 8 V24 M52 8 V24" stroke="{COLORS["surface"]}" stroke-width="3"/>
</svg>'''
        if "banner" in aid:
            return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 64" role="img" aria-label="{title}">
  <line x1="8" y1="4" x2="8" y2="60" stroke="{COLORS["text"]}" stroke-width="2.5"/>
  <rect x="10" y="8" width="16" height="34" rx="2" fill="{COLORS["primary"]}" stroke="{COLORS["text"]}" stroke-width="1.5"/>
  <circle cx="18" cy="25" r="4" fill="{COLORS["reward"]}"/>
</svg>'''
        return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48" role="img" aria-label="{title}">
  <rect x="8" y="10" width="48" height="24" rx="4" fill="{COLORS["reward"]}" stroke="{COLORS["text"]}" stroke-width="2"/>
  <rect x="12" y="14" width="40" height="16" rx="2" fill="{COLORS["surface"]}"/>
  <line x1="20" y1="34" x2="20" y2="44" stroke="{COLORS["text"]}" stroke-width="3"/>
  <line x1="44" y1="34" x2="44" y2="44" stroke="{COLORS["text"]}" stroke-width="3"/>
</svg>'''

    # Pick distinctive motif by id/category
    accent = COLORS["primary"]
    if "pin" in aid or "mistake" in aid or "accent" in aid:
        accent = COLORS["accent"]
    elif "gold" in aid or "foil" in aid or "crown" in aid or "coin" in aid or "milestone" in cat:
        accent = COLORS["reward"]

    if "check" in aid:
        inner = f'<path d="M16 33 L27 44 L48 20" fill="none" stroke="{accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
    elif "pin" in aid:
        inner = f'<circle cx="32" cy="22" r="10" fill="{COLORS["accent"]}"/><path d="M32 32 L32 54" stroke="{COLORS["text"]}" stroke-width="4" stroke-linecap="round"/>'
    elif "lock" in aid:
        inner = f'<rect x="18" y="28" width="28" height="22" rx="4" fill="none" stroke="{COLORS["text"]}" stroke-width="3.5"/><path d="M23 28 V20 A9 9 0 0 1 41 20 V28" fill="none" stroke="{COLORS["text"]}" stroke-width="3.5"/>'
    elif "unread" in aid or "mail" in aid or "envelope" in aid:
        inner = f'<rect x="12" y="18" width="40" height="28" rx="3" fill="{COLORS["surface"]}" stroke="{accent}" stroke-width="3"/><path d="M12 20 L32 35 L52 20" fill="none" stroke="{accent}" stroke-width="3"/>'
    elif "question" in aid:
        inner = f'<path d="M24 24 A8 8 0 1 1 36 31 C32 34 32 36 32 40" fill="none" stroke="{COLORS["text"]}" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="48" r="2.5" fill="{COLORS["text"]}"/>'
    elif "coin" in aid:
        inner = f'<circle cx="32" cy="32" r="18" fill="{COLORS["reward"]}" stroke="{COLORS["text"]}" stroke-width="2.5"/><circle cx="32" cy="32" r="11" fill="none" stroke="{COLORS["surface"]}" stroke-width="2"/>'
    elif "material" in aid:
        inner = f'<rect x="16" y="20" width="32" height="26" rx="3" fill="{COLORS["reward"]}" opacity="0.3" stroke="{COLORS["text"]}" stroke-width="2.5"/><path d="M16 32 H48 M32 20 V46" stroke="{COLORS["accent"]}" stroke-width="2.5"/>'
    elif "blueprint" in aid:
        inner = f'<rect x="14" y="16" width="36" height="32" rx="3" fill="{COLORS["primary"]}" stroke="{COLORS["text"]}" stroke-width="2"/><path d="M20 26 H44 M20 34 H38 M20 42 H32" stroke="{COLORS["surface"]}" stroke-width="2.5" stroke-linecap="round"/>'
    else:
        # Clean emblem/icon geometry deterministic by id hash
        h = sum(ord(c) for c in aid)
        sides = 3 + (h % 4)
        pts = []
        for i in range(sides):
            ang = -math.pi / 2 + 2 * math.pi * i / sides
            pts.append(f"{32 + 16 * math.cos(ang):.1f},{32 + 16 * math.sin(ang):.1f}")
        inner = f'<circle cx="32" cy="32" r="22" fill="{COLORS["page"]}" stroke="{accent}" stroke-width="2.5"/><polygon points="{" ".join(pts)}" fill="{accent}" opacity="0.85"/>'

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="{title}">
  {inner}
</svg>'''


def write_wav(path: Path, samples: list[float], sample_rate: int = 22050) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        frames = bytearray()
        for s in samples:
            clamped = max(-1.0, min(1.0, s))
            frames.extend(struct.pack("<h", int(clamped * 32767)))
        wf.writeframes(bytes(frames))


def synth_tone(freq: float, dur: float, amp: float = 0.25, sr: int = 22050, decay: float = 12.0) -> list[float]:
    n = int(sr * dur)
    out = []
    for i in range(n):
        t = i / sr
        env = math.exp(-decay * t) * min(1.0, t / 0.004)
        val = math.sin(2 * math.pi * freq * t) + 0.25 * math.sin(4 * math.pi * freq * t)
        out.append(amp * env * val)
    return out


def synth_chord(freqs: list[float], dur: float, amp: float = 0.2, sr: int = 22050) -> list[float]:
    n = int(sr * dur)
    out = [0.0] * n
    for idx, f in enumerate(freqs):
        offset = int(idx * 0.045 * sr)
        tone = synth_tone(f, max(0.05, dur - idx * 0.045), amp / len(freqs) * 1.4, sr=sr, decay=6.5)
        for j, s in enumerate(tone):
            if offset + j < n:
                out[offset + j] += s
    return out


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    svg_count = 0
    for asset in manifest["assets"]:
        if asset["kind"] == "svg":
            for rel in asset["runtime_exports"]:
                out_path = PUBLIC_DIR / rel
                out_path.parent.mkdir(parents=True, exist_ok=True)
                out_path.write_text(make_svg(asset), encoding="utf-8")
                svg_count += 1

    # Generate 6 WAV sound effects
    se_dir = PUBLIC_DIR / "assets" / "sound_effect"
    write_wav(se_dir / "audio_key.wav", synth_tone(660.0, 0.045, amp=0.18, decay=35.0))
    write_wav(se_dir / "audio_word.wav", synth_chord([523.25, 659.25], 0.18, amp=0.25))
    write_wav(se_dir / "audio_dispatch_small.wav", synth_chord([523.25, 659.25, 783.99], 0.24, amp=0.26))
    write_wav(se_dir / "audio_dispatch_medium.wav", synth_chord([587.33, 739.99, 880.0], 0.28, amp=0.28))
    write_wav(se_dir / "audio_dispatch_full.wav", synth_chord([523.25, 659.25, 783.99, 1046.5], 0.36, amp=0.3))
    write_wav(se_dir / "audio_mistake.wav", synth_tone(196.0, 0.14, amp=0.22, decay=18.0))

    print(f"Generated {svg_count} SVGs and 6 WAV sound effects.")


if __name__ == "__main__":
    main()
