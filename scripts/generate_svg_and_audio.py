"""Generate all 92 SVG vector assets from spec/initial/data/visual_resource_manifest.json
with bespoke, non-placeholder artwork, plus the 6 core WAV sound effects.
"""

import json
import math
import struct
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / "spec" / "initial" / "data" / "visual_resource_manifest.json"
PUBLIC_DIR = ROOT / "public"

PAL = {
    "ink": "#203D36",
    "primary": "#24594F",
    "primary_dark": "#194038",
    "primary_soft": "#D9E6E1",
    "accent": "#B34E39",
    "accent_light": "#E58B76",
    "gold": "#B58A3C",
    "gold_light": "#E8C97A",
    "gold_pale": "#FBF3DE",
    "surface": "#FFFDF7",
    "page": "#F5F1E7",
    "border": "#C9D0C3",
    "wood": "#A97449",
    "wood_light": "#D7AE82",
    "sky": "#74A8BE",
}


def svg_wrap(viewbox: str, title: str, body: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" '
        f'role="img" aria-label="{title}">\n{body}\n</svg>\n'
    )


def foil_badge_shell(inner: str) -> str:
    """Wrap a 64x64 family emblem in an ornate gold-foil stamp board card."""
    return f"""  <rect x="3" y="3" width="58" height="58" rx="9" fill="{PAL["surface"]}" stroke="{PAL["gold"]}" stroke-width="2.5"/>
  <rect x="7" y="7" width="50" height="50" rx="6" fill="{PAL["gold_pale"]}" stroke="{PAL["gold_light"]}" stroke-width="1.5"/>
  <circle cx="10.5" cy="10.5" r="1.8" fill="{PAL["gold"]}"/>
  <circle cx="53.5" cy="10.5" r="1.8" fill="{PAL["gold"]}"/>
  <circle cx="10.5" cy="53.5" r="1.8" fill="{PAL["gold"]}"/>
  <circle cx="53.5" cy="53.5" r="1.8" fill="{PAL["gold"]}"/>
{inner}"""


def build_family_emblem(aid: str) -> str:
    builders = {
        "family_a": f"""  <g stroke="{PAL["ink"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 30 L31 17 L46 30 Z" fill="{PAL["accent"]}"/>
    <rect x="19" y="30" width="24" height="19" rx="1.5" fill="{PAL["surface"]}"/>
    <rect x="24" y="37" width="8" height="12" rx="1" fill="{PAL["wood_light"]}"/>
    <rect x="25" y="32" width="12" height="4" rx="1" fill="{PAL["primary"]}"/>
    <line x1="45" y1="15" x2="45" y2="29" stroke="{PAL["ink"]}" stroke-width="2"/>
    <path d="M45 15 L53 18.5 L45 22 Z" fill="{PAL["gold"]}"/>
  </g>""",
        "family_b": f"""  <g stroke="{PAL["ink"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M13 24 H51 L48 31 C45 33 41 33 38 31 C35 33 31 33 28 31 C25 33 21 33 18 31 L13 24 Z" fill="{PAL["accent"]}"/>
    <path d="M22 24 L20 31 M32 24 V31 M42 24 L44 31" stroke="{PAL["surface"]}" stroke-width="1.8"/>
    <rect x="16" y="34" width="14" height="14" rx="1.5" fill="{PAL["wood_light"]}"/>
    <path d="M16 41 H30 M23 34 V48" stroke="{PAL["gold"]}" stroke-width="1.5"/>
    <rect x="33" y="39" width="15" height="9" rx="1.5" fill="{PAL["primary_soft"]}"/>
    <rect x="36" y="31" width="9" height="8" rx="1.2" fill="{PAL["gold_light"]}"/>
  </g>""",
        "family_c": f"""  <g stroke="{PAL["ink"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M32 28 V42" stroke="{PAL["primary"]}" stroke-width="2.6"/>
    <path d="M32 37 C25 37 20 33 19 29 C24 29 29 32 32 37 Z" fill="{PAL["primary"]}"/>
    <path d="M32 35 C39 35 44 31 45 27 C40 27 35 30 32 35 Z" fill="{PAL["primary"]}"/>
    <path d="M26 39 H38 L41 49 C41 50.5 39 51 32 51 C25 51 23 50.5 23 49 Z" fill="{PAL["primary_soft"]}"/>
    <circle cx="32" cy="21" r="7.5" fill="{PAL["accent"]}"/>
    <circle cx="32" cy="21" r="3" fill="{PAL["gold_light"]}"/>
  </g>""",
        "family_d": f"""  <g stroke="{PAL["ink"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 21 H42 L38 16 H18 Z" fill="{PAL["primary"]}"/>
    <line x1="18" y1="21" x2="18" y2="41" stroke="{PAL["ink"]}" stroke-width="2.2"/>
    <path d="M23 49 L28 41 M41 49 L36 41 M25 46 H39 M22 49 H42" stroke="{PAL["ink"]}" stroke-width="2"/>
    <rect x="24" y="21" width="16" height="20" rx="5" fill="{PAL["surface"]}"/>
    <rect x="27" y="25" width="10" height="7" rx="1.5" fill="{PAL["sky"]}"/>
    <circle cx="28" cy="36" r="1.6" fill="{PAL["gold"]}"/>
    <circle cx="36" cy="36" r="1.6" fill="{PAL["gold"]}"/>
    <path d="M24 33 H40" stroke="{PAL["accent"]}" stroke-width="2.5"/>
  </g>""",
        "family_e": f"""  <g stroke="{PAL["ink"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M13 24 L32 15 L51 24" fill="none" stroke="{PAL["primary"]}" stroke-width="2.6"/>
    <line x1="16" y1="24" x2="16" y2="48" stroke="{PAL["primary"]}" stroke-width="2.2"/>
    <line x1="48" y1="24" x2="48" y2="48" stroke="{PAL["primary"]}" stroke-width="2.2"/>
    <path d="M18 30 C23 27 28 28 32 32 C36 28 41 27 46 30 V44 C41 41 36 42 32 45 C28 42 23 41 18 44 Z" fill="{PAL["surface"]}"/>
    <line x1="32" y1="32" x2="32" y2="45" stroke="{PAL["accent"]}" stroke-width="2"/>
    <path d="M21 35 H28 M21 39 H27 M36 35 H43 M37 39 H43" stroke="{PAL["border"]}" stroke-width="1.6"/>
  </g>""",
        "family_f": f"""  <g stroke="{PAL["ink"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="14" y="42" width="36" height="5" rx="1.5" fill="{PAL["wood_light"]}"/>
    <line x1="19" y1="47" x2="19" y2="51"/>
    <line x1="45" y1="47" x2="45" y2="51"/>
    <g transform="rotate(-35 32 30)">
      <rect x="29.5" y="24" width="5" height="22" rx="1.5" fill="{PAL["wood"]}"/>
      <rect x="22" y="16" width="20" height="9" rx="3" fill="{PAL["accent"]}"/>
    </g>
    <g transform="rotate(35 32 30)">
      <rect x="29.5" y="28" width="5" height="17" rx="1.5" fill="{PAL["primary"]}"/>
      <path d="M29.5 28 L32 16 L34.5 28 Z" fill="{PAL["surface"]}"/>
    </g>
  </g>""",
        "family_g": f"""  <g stroke="{PAL["ink"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 40 H50 V35 H14 Z" fill="{PAL["wood_light"]}"/>
    <path d="M14 40 V45 H22 A10 10 0 0 1 42 45 H50 V40 Z" fill="{PAL["primary_soft"]}"/>
    <rect x="26" y="25" width="12" height="10" rx="1.5" fill="{PAL["accent"]}"/>
    <path d="M26 30 H38 M32 25 V35" stroke="{PAL["gold_light"]}" stroke-width="1.6"/>
    <path d="M14 48 Q20 45 26 48 T38 48 T50 48" fill="none" stroke="{PAL["sky"]}" stroke-width="2"/>
    <path d="M16 52 Q22 49 28 52 T40 52 T48 52" fill="none" stroke="{PAL["primary"]}" stroke-width="1.6"/>
  </g>""",
        "family_h": f"""  <g stroke="{PAL["ink"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M13 48 L27 25 L41 48 Z" fill="{PAL["primary_soft"]}" stroke="{PAL["primary"]}"/>
    <path d="M31 48 L43 30 L52 48 Z" fill="{PAL["primary_soft"]}" stroke="{PAL["primary"]}"/>
    <line x1="25" y1="28" x2="20" y2="49" stroke="{PAL["wood"]}" stroke-width="2.4"/>
    <line x1="39" y1="28" x2="44" y2="49" stroke="{PAL["wood"]}" stroke-width="2.4"/>
    <line x1="32" y1="28" x2="32" y2="49" stroke="{PAL["wood"]}" stroke-width="2"/>
    <line x1="22" y1="39" x2="42" y2="39" stroke="{PAL["wood"]}" stroke-width="1.8"/>
    <rect x="19" y="22" width="26" height="6" rx="1.5" fill="{PAL["surface"]}"/>
    <path d="M21 22 L32 15 L43 22 Z" fill="{PAL["accent"]}"/>
  </g>""",
        "family_i": f"""  <g stroke="{PAL["ink"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="15" y="20" width="30" height="24" rx="2" fill="{PAL["primary"]}"/>
    <ellipse cx="45" cy="32" rx="4" ry="12" fill="{PAL["primary_soft"]}"/>
    <path d="M19 26 H35 M19 32 H32 M19 38 H28" stroke="{PAL["surface"]}" stroke-width="1.5"/>
    <path d="M21 48 L47 48 L47 22 Z" fill="{PAL["gold_light"]}" opacity="0.95"/>
    <path d="M35 42 L42 42 L42 35 Z" fill="{PAL["surface"]}"/>
  </g>""",
        "family_j": f"""  <g stroke="{PAL["ink"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M32 32 C24 27 20 22 18 17" fill="none" stroke="{PAL["primary"]}" stroke-width="2.4"/>
    <path d="M32 32 C41 29 45 23 48 19" fill="none" stroke="{PAL["primary"]}" stroke-width="2.4"/>
    <path d="M32 32 C34 40 40 44 46 47" fill="none" stroke="{PAL["accent"]}" stroke-width="2.4"/>
    <circle cx="18" cy="17" r="3.5" fill="{PAL["surface"]}"/>
    <circle cx="48" cy="19" r="3.5" fill="{PAL["surface"]}"/>
    <circle cx="46" cy="47" r="3.5" fill="{PAL["gold"]}"/>
    <rect x="25" y="25" width="14" height="14" rx="2" fill="{PAL["wood_light"]}"/>
    <path d="M25 32 H39 M32 25 V39" stroke="{PAL["accent"]}" stroke-width="1.6"/>
  </g>""",
        "family_k": f"""  <g stroke="{PAL["ink"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 43 H50 V49 H14 Z" fill="{PAL["wood_light"]}"/>
    <path d="M18 39 H46 V43 H18 Z" fill="{PAL["wood"]}"/>
    <circle cx="26" cy="27" r="8" fill="{PAL["gold_light"]}"/>
    <circle cx="26" cy="27" r="3" fill="{PAL["surface"]}"/>
    <path d="M26 16 V19 M26 35 V38 M15 27 H18 M34 27 H37 M18.5 19.5 L20.5 21.5 M31.5 32.5 L33.5 34.5 M33.5 19.5 L31.5 21.5 M20.5 32.5 L18.5 34.5" stroke="{PAL["ink"]}" stroke-width="2.2"/>
    <circle cx="39" cy="33" r="4.5" fill="{PAL["accent_light"]}"/>
    <circle cx="39" cy="33" r="1.6" fill="{PAL["surface"]}"/>
    <rect x="44" y="21" width="5" height="18" rx="1.5" fill="{PAL["primary"]}"/>
  </g>""",
        "family_l": f"""  <g stroke="{PAL["ink"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 26 A13 11 0 0 1 42 26 V49 H16 Z" fill="{PAL["wood"]}"/>
    <rect x="19" y="23" width="20" height="23" fill="{PAL["surface"]}"/>
    <line x1="19" y1="31" x2="39" y2="31"/>
    <line x1="19" y1="39" x2="39" y2="39"/>
    <rect x="20" y="24" width="4" height="7" fill="{PAL["accent"]}"/>
    <rect x="25" y="25" width="3.5" height="6" fill="{PAL["primary"]}"/>
    <rect x="30" y="24" width="4" height="7" fill="{PAL["gold"]}"/>
    <rect x="21" y="32" width="4" height="7" fill="{PAL["primary"]}"/>
    <rect x="26" y="33" width="4" height="6" fill="{PAL["accent"]}"/>
    <rect x="32" y="32" width="4" height="7" fill="{PAL["sky"]}"/>
    <line x1="41" y1="22" x2="49" y2="50" stroke="{PAL["ink"]}" stroke-width="2"/>
    <line x1="45" y1="22" x2="53" y2="50" stroke="{PAL["ink"]}" stroke-width="2"/>
    <line x1="42.5" y1="28" x2="46.5" y2="28"/>
    <line x1="44" y1="35" x2="48.5" y2="35"/>
    <line x1="46" y1="42" x2="50.5" y2="42"/>
  </g>""",
    }
    return foil_badge_shell(builders[aid])


def build_milestone_svg(aid: str) -> str:
    if aid == "reward_frame_leaf":
        return f"""  <rect x="6" y="6" width="108" height="68" rx="6" fill="{PAL["surface"]}" stroke="{PAL["border"]}" stroke-width="1.5"/>
  <rect x="18" y="11" width="84" height="54" rx="4" fill="{PAL["page"]}" stroke="{PAL["primary"]}" stroke-width="1.5" stroke-dasharray="4 3"/>
  <g stroke="{PAL["ink"]}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M12 70 C10 52 13 32 19 16" fill="none" stroke="{PAL["primary"]}" stroke-width="2.4"/>
    <path d="M108 70 C110 52 107 32 101 16" fill="none" stroke="{PAL["primary"]}" stroke-width="2.4"/>
    <path d="M13 56 C4 50 4 40 12 37 C17 42 17 50 13 56 Z" fill="{PAL["primary"]}"/>
    <path d="M15 39 C6 33 7 23 15 20 C20 25 20 33 15 39 Z" fill="{PAL["primary_soft"]}"/>
    <path d="M17 24 C10 19 12 11 19 9 C23 14 22 20 17 24 Z" fill="{PAL["gold_light"]}"/>
    <path d="M107 56 C116 50 116 40 108 37 C103 42 103 50 107 56 Z" fill="{PAL["primary"]}"/>
    <path d="M105 39 C114 33 113 23 105 20 C100 25 100 33 105 39 Z" fill="{PAL["primary_soft"]}"/>
    <path d="M103 24 C110 19 108 11 101 9 C97 14 98 20 103 24 Z" fill="{PAL["gold_light"]}"/>
  </g>"""

    if aid == "reward_tree_ornament":
        trees = []
        for x in (16, 40, 64, 88, 112):
            trees.append(f"""    <rect x="{x-2}" y="17" width="4" height="10" fill="{PAL["wood"]}"/>
    <circle cx="{x}" cy="13" r="8" fill="{PAL["primary"]}"/>
    <circle cx="{x-3}" cy="11" r="3" fill="{PAL["primary_soft"]}" opacity="0.55"/>""")
        shrubs = "".join(
            f'<ellipse cx="{x}" cy="26.5" rx="6.5" ry="3.2" fill="{PAL["gold_light"]}"/>'
            for x in (28, 52, 76, 100)
        )
        return f"""  <rect x="2" y="25" width="124" height="5" rx="2" fill="{PAL["wood_light"]}" stroke="{PAL["ink"]}" stroke-width="1.2"/>
  <g stroke="{PAL["ink"]}" stroke-width="1.3" stroke-linejoin="round">
{chr(10).join(trees)}
    {shrubs}
  </g>"""

    if aid == "reward_frame_plaza":
        return f"""  <rect x="5" y="5" width="110" height="70" rx="5" fill="{PAL["surface"]}" stroke="{PAL["ink"]}" stroke-width="1.8"/>
  <rect x="16" y="13" width="88" height="46" rx="2" fill="{PAL["page"]}" stroke="{PAL["gold"]}" stroke-width="1.6"/>
  <g stroke="{PAL["ink"]}" stroke-width="1.4" stroke-linejoin="round">
    <path d="M5 23 A18 18 0 0 0 23 5 H5 Z" fill="{PAL["primary_soft"]}"/>
    <path d="M97 5 A18 18 0 0 0 115 23 V5 Z" fill="{PAL["primary_soft"]}"/>
    <path d="M5 57 A18 18 0 0 1 23 75 H5 Z" fill="{PAL["primary_soft"]}"/>
    <path d="M97 75 A18 18 0 0 1 115 57 V75 Z" fill="{PAL["primary_soft"]}"/>
    <rect x="12" y="64" width="96" height="7" rx="1.5" fill="{PAL["border"]}"/>
    <rect x="22" y="57" width="22" height="5" rx="1" fill="{PAL["wood"]}"/>
    <line x1="25" y1="62" x2="25" y2="66"/>
    <line x1="41" y1="62" x2="41" y2="66"/>
    <rect x="76" y="57" width="22" height="5" rx="1" fill="{PAL["wood"]}"/>
    <line x1="79" y1="62" x2="79" y2="66"/>
    <line x1="95" y1="62" x2="95" y2="66"/>
  </g>"""

    if aid == "reward_fountain_ornament":
        return f"""  <g stroke="{PAL["ink"]}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="64" cy="25" rx="46" ry="5.5" fill="{PAL["primary_soft"]}"/>
    <ellipse cx="64" cy="23.5" rx="38" ry="3.6" fill="{PAL["sky"]}"/>
    <rect x="59" y="16" width="10" height="8" rx="1.5" fill="{PAL["surface"]}"/>
    <path d="M62 16 C57 6 40 5 32 22" fill="none" stroke="{PAL["sky"]}" stroke-width="3.2"/>
    <path d="M66 16 C71 6 88 5 96 22" fill="none" stroke="{PAL["sky"]}" stroke-width="3.2"/>
    <path d="M62 16 C59 10 49 10 44 22" fill="none" stroke="{PAL["surface"]}" stroke-width="1.5"/>
    <path d="M66 16 C69 10 79 10 84 22" fill="none" stroke="{PAL["surface"]}" stroke-width="1.5"/>
    <path d="M64 3 C67 7.5 67 11.5 64 13 C61 11.5 61 7.5 64 3 Z" fill="{PAL["sky"]}"/>
    <circle cx="24" cy="24" r="2.2" fill="{PAL["gold_light"]}"/>
    <circle cx="104" cy="24" r="2.2" fill="{PAL["gold_light"]}"/>
  </g>"""

    if aid == "reward_album_24_emblem":
        return f"""  <rect x="10" y="12" width="108" height="104" rx="14" fill="{PAL["primary"]}" stroke="{PAL["ink"]}" stroke-width="3"/>
  <line x1="22" y1="16" x2="22" y2="112" stroke="{PAL["gold_light"]}" stroke-width="2" stroke-dasharray="6 4"/>
  <rect x="30" y="22" width="76" height="84" rx="8" fill="{PAL["surface"]}" stroke="{PAL["gold"]}" stroke-width="2.5"/>
  <g stroke="{PAL["ink"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M68 62 C52 58 43 44 45 30 C57 32 66 44 68 62 Z" fill="{PAL["primary"]}"/>
    <path d="M68 62 C84 58 93 44 91 30 C79 32 70 44 68 62 Z" fill="{PAL["primary_soft"]}"/>
    <path d="M44 58 L68 74 L92 58 V90 H44 Z" fill="{PAL["gold_pale"]}"/>
    <path d="M44 58 L68 74 L92 58" fill="none"/>
    <path d="M55 69 L68 64 L81 69 L75 74 L68 68 L61 74 Z" fill="{PAL["accent"]}"/>
    <circle cx="68" cy="65" r="4" fill="{PAL["gold_light"]}"/>
  </g>"""

    if aid == "reward_frame_sunset":
        return f"""  <rect x="5" y="5" width="110" height="70" rx="5" fill="{PAL["gold_pale"]}" stroke="{PAL["ink"]}" stroke-width="1.6"/>
  <rect x="16" y="18" width="88" height="46" rx="3" fill="{PAL["surface"]}" stroke="{PAL["gold"]}" stroke-width="1.5"/>
  <g stroke="{PAL["ink"]}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M44 18 A16 16 0 0 1 76 18 Z" fill="{PAL["accent"]}"/>
    <line x1="60" y1="2" x2="60" y2="6" stroke="{PAL["accent"]}" stroke-width="2"/>
    <line x1="41" y1="8" x2="45" y2="11" stroke="{PAL["accent"]}" stroke-width="2"/>
    <line x1="79" y1="8" x2="75" y2="11" stroke="{PAL["accent"]}" stroke-width="2"/>
    <path d="M8 22 H32 C34 22 34 26 30 26 H10 Z" fill="{PAL["accent_light"]}"/>
    <path d="M88 22 H112 V26 H90 C86 26 86 22 88 22 Z" fill="{PAL["accent_light"]}"/>
    <path d="M8 38 H22 C24 38 24 41 21 41 H8 Z" fill="{PAL["gold_light"]}"/>
    <path d="M98 38 H112 V41 H99 C96 41 96 38 98 38 Z" fill="{PAL["gold_light"]}"/>
    <path d="M5 68 Q35 58 60 66 T115 65 V75 H5 Z" fill="{PAL["primary"]}"/>
  </g>"""

    if aid == "reward_board_48_emblem":
        rosette = "".join(
            f'<circle cx="{64 + 34 * math.cos(math.radians(i * 30)):.1f}" '
            f'cy="{64 + 34 * math.sin(math.radians(i * 30)):.1f}" r="9" '
            f'fill="{PAL["gold_light"] if i % 2 == 0 else PAL["accent_light"]}" '
            f'stroke="{PAL["ink"]}" stroke-width="1.8"/>'
            for i in range(12)
        )
        return f"""  <rect x="8" y="8" width="112" height="112" rx="12" fill="{PAL["surface"]}" stroke="{PAL["gold"]}" stroke-width="3.5"/>
  <rect x="16" y="16" width="96" height="96" rx="8" fill="{PAL["gold_pale"]}" stroke="{PAL["gold_light"]}" stroke-width="2"/>
  {rosette}
  <circle cx="64" cy="64" r="30" fill="{PAL["surface"]}" stroke="{PAL["gold"]}" stroke-width="2.5"/>
  <g stroke="{PAL["ink"]}" stroke-width="2" stroke-linejoin="round">
    <g transform="rotate(-18 64 68)">
      <rect x="44" y="49" width="40" height="27" rx="2" fill="{PAL["primary_soft"]}"/>
      <path d="M44 49 L64 63 L84 49" fill="none"/>
    </g>
    <g transform="rotate(18 64 68)">
      <rect x="44" y="49" width="40" height="27" rx="2" fill="{PAL["gold_light"]}"/>
      <path d="M44 49 L64 63 L84 49" fill="none"/>
    </g>
    <rect x="44" y="51" width="40" height="28" rx="2" fill="{PAL["surface"]}"/>
    <path d="M44 51 L64 66 L84 51" fill="none" stroke="{PAL["accent"]}" stroke-width="2.2"/>
  </g>"""

    if aid == "reward_first_collection_emblem":
        return f"""  <rect x="8" y="8" width="112" height="112" rx="12" fill="{PAL["surface"]}" stroke="{PAL["gold"]}" stroke-width="3.5"/>
  <rect x="16" y="16" width="96" height="96" rx="8" fill="{PAL["primary_soft"]}" stroke="{PAL["primary"]}" stroke-width="2"/>
  <g stroke="{PAL["ink"]}" stroke-width="2.2" stroke-linejoin="round">
    <path d="M46 58 C30 48 18 39 14 31 C24 34 36 40 46 49 Z" fill="{PAL["gold_light"]}"/>
    <path d="M46 66 C28 62 19 56 17 48 C27 50 37 54 46 58 Z" fill="{PAL["surface"]}"/>
    <path d="M82 58 C98 48 110 39 114 31 C104 34 92 40 82 49 Z" fill="{PAL["gold_light"]}"/>
    <path d="M82 66 C100 62 109 56 111 48 C101 50 91 54 82 58 Z" fill="{PAL["surface"]}"/>
    <rect x="40" y="46" width="48" height="34" rx="3" fill="{PAL["surface"]}"/>
    <path d="M40 46 L64 66 L88 46" fill="none"/>
    <circle cx="64" cy="66" r="6" fill="{PAL["accent"]}"/>
  </g>"""

    if aid == "reward_frame_journey":
        return f"""  <g stroke="{PAL["ink"]}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M6 16 L16 6 H114 V64 L104 74 H6 Z" fill="{PAL["gold_pale"]}"/>
    <path d="M6 16 H16 V6 Z" fill="{PAL["wood_light"]}"/>
    <path d="M104 74 V64 H114 Z" fill="{PAL["wood_light"]}"/>
    <rect x="20" y="13" width="80" height="54" rx="3" fill="{PAL["surface"]}" stroke="{PAL["gold"]}"/>
    <path d="M13 62 C11 45 14 32 19 25" fill="none" stroke="{PAL["accent"]}" stroke-width="1.8" stroke-dasharray="3 3"/>
    <path d="M101 50 C106 38 107 24 102 15" fill="none" stroke="{PAL["accent"]}" stroke-width="1.8" stroke-dasharray="3 3"/>
    <circle cx="15" cy="18" r="7" fill="{PAL["surface"]}"/>
    <path d="M15 12 L17 18 L15 24 L13 18 Z" fill="{PAL["accent"]}"/>
    <path d="M9 18 L15 16 L21 18 L15 20 Z" fill="{PAL["primary"]}"/>
    <rect x="97" y="55" width="16" height="13" rx="2.5" fill="{PAL["wood"]}"/>
    <path d="M101 55 V51 H109 V55" fill="none" stroke="{PAL["ink"]}" stroke-width="1.6"/>
  </g>"""

    if aid == "reward_expanded_album_emblem":
        return f"""  <rect x="10" y="12" width="108" height="104" rx="14" fill="{PAL["primary_dark"]}" stroke="{PAL["ink"]}" stroke-width="3"/>
  <rect x="18" y="20" width="92" height="88" rx="8" fill="{PAL["gold_pale"]}" stroke="{PAL["gold"]}" stroke-width="2"/>
  <g stroke="{PAL["ink"]}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <rect x="21" y="42" width="18" height="44" rx="2" fill="{PAL["primary_soft"]}"/>
    <rect x="89" y="42" width="18" height="44" rx="2" fill="{PAL["primary_soft"]}"/>
    <rect x="37" y="34" width="27" height="56" rx="2" fill="{PAL["surface"]}"/>
    <rect x="64" y="34" width="27" height="56" rx="2" fill="{PAL["surface"]}"/>
    <line x1="64" y1="34" x2="64" y2="90" stroke="{PAL["gold"]}" stroke-width="2.6"/>
    <path d="M24 72 C36 66 50 68 64 58 C78 48 92 50 105 44" fill="none" stroke="{PAL["accent"]}" stroke-width="2.6" stroke-dasharray="5 3"/>
    <circle cx="105" cy="44" r="3.5" fill="{PAL["accent"]}"/>
  </g>"""

    # reward_complete_72_emblem
    rays = "".join(
        f'<line x1="64" y1="54" x2="{64 + 42 * math.cos(math.radians(a)):.1f}" '
        f'y2="{54 - 42 * math.sin(math.radians(a)):.1f}" stroke="{PAL["gold_light"]}" stroke-width="2.4" stroke-linecap="round"/>'
        for a in (20, 45, 70, 90, 110, 135, 160)
    )
    return f"""  <rect x="8" y="8" width="112" height="112" rx="14" fill="{PAL["primary"]}" stroke="{PAL["gold"]}" stroke-width="3.5"/>
  <rect x="15" y="15" width="98" height="98" rx="9" fill="{PAL["gold_pale"]}" stroke="{PAL["gold_light"]}" stroke-width="1.8"/>
  {rays}
  <g stroke="{PAL["ink"]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M28 74 V56 L36 48 L44 56 V74 Z" fill="{PAL["accent_light"]}"/>
    <rect x="46" y="48" width="14" height="26" fill="{PAL["primary_soft"]}"/>
    <rect x="60" y="36" width="10" height="38" fill="{PAL["surface"]}"/>
    <path d="M58 36 L65 26 L72 36 Z" fill="{PAL["accent"]}"/>
    <circle cx="65" cy="44" r="2.8" fill="{PAL["gold"]}"/>
    <path d="M72 74 V52 L82 44 L92 52 V74 Z" fill="{PAL["wood_light"]}"/>
    <path d="M24 74 C36 69 50 70 64 78 C78 70 92 69 104 74 V95 C92 90 78 91 64 98 C50 91 36 90 24 95 Z" fill="{PAL["surface"]}"/>
    <line x1="64" y1="78" x2="64" y2="98" stroke="{PAL["gold"]}" stroke-width="2.4"/>
  </g>"""


def build_shared_frame(aid: str) -> str:
    if aid == "stamp_frame":
        teeth = []
        for pos in range(40, 601, 40):
            teeth.append(f'<circle cx="{pos}" cy="0" r="10" fill="black"/>')
            teeth.append(f'<circle cx="{pos}" cy="640" r="10" fill="black"/>')
            teeth.append(f'<circle cx="0" cy="{pos}" r="10" fill="black"/>')
            teeth.append(f'<circle cx="640" cy="{pos}" r="10" fill="black"/>')
        return f"""  <defs>
    <mask id="stamp-perf-mask">
      <rect width="640" height="640" fill="white"/>
      {''.join(teeth)}
      <rect x="64" y="64" width="512" height="512" rx="4" fill="black"/>
    </mask>
  </defs>
  <rect width="640" height="640" fill="{PAL["surface"]}" mask="url(#stamp-perf-mask)"/>
  <rect x="44" y="44" width="552" height="552" rx="6" fill="none" stroke="{PAL["gold"]}" stroke-width="4"/>
  <rect x="58" y="58" width="524" height="524" rx="4" fill="none" stroke="{PAL["primary"]}" stroke-width="3" stroke-dasharray="12 8"/>
  <circle cx="44" cy="44" r="6" fill="{PAL["gold"]}"/>
  <circle cx="596" cy="44" r="6" fill="{PAL["gold"]}"/>
  <circle cx="44" cy="596" r="6" fill="{PAL["gold"]}"/>
  <circle cx="596" cy="596" r="6" fill="{PAL["gold"]}"/>"""

    if aid == "memorial_frame":
        teeth = []
        for pos in range(40, 601, 40):
            teeth.append(f'<circle cx="{pos}" cy="0" r="10" fill="black"/>')
            teeth.append(f'<circle cx="{pos}" cy="640" r="10" fill="black"/>')
            teeth.append(f'<circle cx="0" cy="{pos}" r="10" fill="black"/>')
            teeth.append(f'<circle cx="640" cy="{pos}" r="10" fill="black"/>')
        return f"""  <defs>
    <mask id="memorial-perf-mask">
      <rect width="640" height="640" fill="white"/>
      {''.join(teeth)}
      <rect x="64" y="64" width="512" height="512" rx="6" fill="black"/>
    </mask>
  </defs>
  <rect width="640" height="640" fill="{PAL["gold_pale"]}" mask="url(#memorial-perf-mask)"/>
  <rect x="42" y="42" width="556" height="556" rx="8" fill="none" stroke="{PAL["gold"]}" stroke-width="6"/>
  <rect x="58" y="58" width="524" height="524" rx="5" fill="none" stroke="{PAL["ink"]}" stroke-width="2.5"/>
  <path d="M240 58 A80 38 0 0 1 400 58 Z" fill="{PAL["gold_light"]}" stroke="{PAL["gold"]}" stroke-width="4"/>
  <circle cx="320" cy="36" r="9" fill="{PAL["accent"]}" stroke="{PAL["ink"]}" stroke-width="2.5"/>
  <line x1="120" y1="596" x2="520" y2="596" stroke="{PAL["gold"]}" stroke-width="6" stroke-linecap="round"/>
  <line x1="160" y1="608" x2="480" y2="608" stroke="{PAL["primary"]}" stroke-width="3" stroke-linecap="round"/>"""

    if aid == "board_base":
        slots = "".join(
            f'<rect x="{16 + col * 31}" y="{25 + row * 24}" width="26" height="20" rx="2" '
            f'fill="{PAL["surface"]}" stroke="{PAL["border"]}" stroke-width="1.3" stroke-dasharray="3 2"/>'
            for row in range(2)
            for col in range(3)
        )
        return f"""  <rect x="4" y="4" width="112" height="72" rx="6" fill="{PAL["page"]}" stroke="{PAL["ink"]}" stroke-width="1.8"/>
  <rect x="9" y="9" width="102" height="62" rx="4" fill="{PAL["surface"]}" stroke="{PAL["border"]}" stroke-width="1.2"/>
  <rect x="42" y="12" width="36" height="9" rx="4.5" fill="{PAL["gold_pale"]}" stroke="{PAL["gold"]}" stroke-width="1.2"/>
  {slots}"""

    if aid == "board_foil":
        slots = "".join(
            f'<rect x="{16 + col * 31}" y="{25 + row * 24}" width="26" height="20" rx="2" '
            f'fill="{PAL["gold_pale"]}" stroke="{PAL["gold"]}" stroke-width="1.4"/>'
            for row in range(2)
            for col in range(3)
        )
        return f"""  <rect x="4" y="4" width="112" height="72" rx="6" fill="{PAL["surface"]}" stroke="{PAL["gold"]}" stroke-width="2.6"/>
  <rect x="9" y="9" width="102" height="62" rx="4" fill="{PAL["gold_pale"]}" stroke="{PAL["gold_light"]}" stroke-width="1.6"/>
  <path d="M12 20 C12 13 13 12 20 12 M100 12 C107 12 108 13 108 20 M12 60 C12 67 13 68 20 68 M100 68 C107 68 108 67 108 60" fill="none" stroke="{PAL["gold"]}" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M36 12 H84 L80 20 H40 Z" fill="{PAL["gold_light"]}" stroke="{PAL["gold"]}" stroke-width="1.4"/>
  {slots}"""

    # album_base
    return f"""  <rect x="10" y="6" width="102" height="68" rx="8" fill="{PAL["primary_dark"]}" stroke="{PAL["ink"]}" stroke-width="2"/>
  <rect x="14" y="8" width="94" height="64" rx="6" fill="{PAL["primary"]}"/>
  <line x1="25" y1="10" x2="25" y2="70" stroke="{PAL["gold_light"]}" stroke-width="2" stroke-dasharray="4 3"/>
  <path d="M98 8 H108 V18 L104 12 Z M98 72 H108 V62 L104 68 Z" fill="{PAL["gold_light"]}" stroke="{PAL["gold"]}" stroke-width="1.2"/>
  <circle cx="64" cy="34" r="14" fill="{PAL["gold_pale"]}" stroke="{PAL["gold"]}" stroke-width="2.2"/>
  <rect x="42" y="54" width="44" height="10" rx="3" fill="{PAL["surface"]}" stroke="{PAL["gold"]}" stroke-width="1.4"/>"""


def build_brand_and_shop(aid: str) -> str:
    if aid == "brand_mark":
        return f"""  <g stroke="{PAL["ink"]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M32 34 C22 28 20 16 28 9 C38 14 40 24 32 34 Z" fill="{PAL["primary"]}"/>
    <line x1="32" y1="34" x2="29" y2="15" stroke="{PAL["surface"]}" stroke-width="1.6"/>
    <path d="M10 26 L32 41 L54 26 V52 C54 54 52 56 50 56 H14 C12 56 10 54 10 52 Z" fill="{PAL["accent"]}"/>
    <path d="M10 26 L32 41 L54 26" fill="none" stroke="{PAL["surface"]}" stroke-width="2.4"/>
    <path d="M10 52 L24 38 M54 52 L40 38" stroke="{PAL["accent_light"]}" stroke-width="1.8"/>
  </g>"""

    if aid == "shop_canopy":
        return f"""  <g stroke="{PAL["ink"]}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round">
    <path d="M72 132 H440 L468 204 C444 222 412 222 388 204 C364 222 332 222 308 204 C284 222 252 222 228 204 C204 222 172 222 148 204 C124 222 92 222 68 204 Z" fill="{PAL["accent"]}"/>
    <path d="M148 132 L132 206 M228 132 L218 206 M308 132 L314 206 M388 132 L400 206" stroke="{PAL["surface"]}" stroke-width="24"/>
    <path d="M72 132 H440" stroke="{PAL["wood"]}" stroke-width="14"/>
  </g>"""

    if aid == "shop_banner":
        return f"""  <g stroke="{PAL["ink"]}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round">
    <line x1="344" y1="128" x2="452" y2="128" stroke="{PAL["wood"]}" stroke-width="14"/>
    <path d="M364 134 H438 V372 L401 340 L364 372 Z" fill="{PAL["primary"]}"/>
    <path d="M376 146 H426 V346 L401 324 L376 346 Z" fill="none" stroke="{PAL["gold_light"]}" stroke-width="5"/>
    <circle cx="401" cy="228" r="22" fill="{PAL["gold_pale"]}"/>
    <path d="M389 224 L401 234 L413 224 V238 H389 Z" fill="{PAL["accent"]}" stroke-width="4"/>
  </g>"""

    # shop_signboard
    return f"""  <g stroke="{PAL["ink"]}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round">
    <line x1="216" y1="48" x2="216" y2="96" stroke="{PAL["ink"]}" stroke-width="8"/>
    <line x1="296" y1="48" x2="296" y2="96" stroke="{PAL["ink"]}" stroke-width="8"/>
    <circle cx="256" cy="118" r="56" fill="{PAL["gold"]}"/>
    <circle cx="256" cy="118" r="44" fill="{PAL["surface"]}"/>
    <path d="M234 108 L256 125 L278 108 V136 H234 Z" fill="{PAL["accent"]}" stroke-width="5"/>
    <path d="M234 108 L256 125 L278 108" fill="none" stroke="{PAL["surface"]}" stroke-width="4"/>
  </g>"""


def build_district_icon(aid: str) -> str:
    builders = {
        "district_residential": f"""  <g stroke="{PAL["ink"]}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M18 62 L64 24 L110 62 Z" fill="{PAL["accent"]}"/>
    <rect x="28" y="62" width="72" height="44" rx="4" fill="{PAL["surface"]}"/>
    <rect x="42" y="74" width="18" height="18" rx="2" fill="{PAL["sky"]}"/>
    <line x1="51" y1="74" x2="51" y2="92" stroke-width="3.5"/>
    <line x1="42" y1="83" x2="60" y2="83" stroke-width="3.5"/>
    <rect x="70" y="72" width="18" height="34" rx="2" fill="{PAL["wood_light"]}"/>
  </g>""",
        "district_market": f"""  <g stroke="{PAL["ink"]}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <line x1="28" y1="54" x2="28" y2="104" stroke="{PAL["wood"]}" stroke-width="9"/>
    <line x1="100" y1="54" x2="100" y2="104" stroke="{PAL["wood"]}" stroke-width="9"/>
    <line x1="20" y1="104" x2="108" y2="104" stroke="{PAL["ink"]}" stroke-width="6"/>
    <path d="M16 32 H112 L116 56 C104 66 88 66 76 56 C64 66 48 66 36 56 C24 66 16 64 12 56 Z" fill="{PAL["accent"]}"/>
    <path d="M40 32 L36 56 M64 32 V56 M88 32 L92 56" stroke="{PAL["surface"]}" stroke-width="5"/>
  </g>""",
        "district_workshop": f"""  <g stroke="{PAL["ink"]}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M18 62 L64 24 L110 62" fill="none" stroke="{PAL["wood"]}" stroke-width="10"/>
    <line x1="34" y1="50" x2="94" y2="50" stroke="{PAL["wood"]}" stroke-width="8"/>
    <g transform="rotate(-32 64 78)">
      <rect x="59" y="64" width="10" height="44" rx="3" fill="{PAL["wood_light"]}"/>
      <rect x="42" y="48" width="44" height="20" rx="5" fill="{PAL["primary"]}"/>
    </g>
  </g>""",
        "district_park": f"""  <g stroke="{PAL["ink"]}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M24 104 V62 A40 40 0 0 1 104 62 V104" fill="none" stroke="{PAL["gold"]}" stroke-width="10"/>
    <path d="M64 96 C40 84 36 56 64 36 C92 56 88 84 64 96 Z" fill="{PAL["primary"]}"/>
    <line x1="64" y1="46" x2="64" y2="104" stroke="{PAL["surface"]}" stroke-width="4.5"/>
  </g>""",
        "district_station": f"""  <g stroke="{PAL["ink"]}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M16 96 L40 76 H88 L112 96 Z" fill="{PAL["accent"]}"/>
    <rect x="46" y="34" width="36" height="68" rx="3" fill="{PAL["surface"]}"/>
    <path d="M42 34 L64 16 L86 34 Z" fill="{PAL["primary"]}"/>
    <circle cx="64" cy="58" r="12" fill="{PAL["gold_pale"]}"/>
    <path d="M64 51 V58 H70" fill="none" stroke-width="4"/>
  </g>""",
        "district_harbor": f"""  <g stroke="{PAL["ink"]}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M16 92 L78 52 L112 68 L48 108 Z" fill="{PAL["wood_light"]}"/>
    <line x1="36" y1="80" x2="68" y2="96" stroke-width="4"/>
    <line x1="56" y1="67" x2="88" y2="83" stroke-width="4"/>
    <rect x="74" y="34" width="16" height="28" rx="3" fill="{PAL["primary"]}"/>
    <circle cx="82" cy="32" r="11" fill="{PAL["gold"]}"/>
  </g>""",
    }
    return builders[aid]


def build_domain_icon(aid: str) -> str:
    builders = {
        "course_relaxed": f"""  <g stroke="{PAL["ink"]}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 36 C11 21 21 10 37 11 C38 27 28 37 14 36 Z" fill="{PAL["primary"]}"/>
    <path d="M10 39 C18 31 26 22 33 16" fill="none" stroke="{PAL["surface"]}" stroke-width="2.2"/>
  </g>""",
        "course_standard": f"""  <g stroke="{PAL["ink"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M11 40 C13 30 18 26 24 26 C30 26 35 30 37 40" fill="none" stroke="{PAL["wood"]}" stroke-width="4"/>
    <line x1="24" y1="10" x2="24" y2="41" stroke="{PAL["wood"]}" stroke-width="3.2"/>
    <path d="M12 13 H32 L38 18 L32 23 H12 Z" fill="{PAL["primary"]}"/>
  </g>""",
        "course_challenge": f"""  <g stroke="{PAL["ink"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 39 L18 19 L30 39 Z" fill="{PAL["primary_soft"]}"/>
    <path d="M18 39 L31 14 L43 39 Z" fill="{PAL["primary"]}"/>
    <path d="M26.5 22.5 L31 14 L35.5 22.5 L31 20.5 Z" fill="{PAL["surface"]}"/>
    <line x1="31" y1="6" x2="31" y2="15"/>
    <path d="M31 6 L41 9.5 L31 13 Z" fill="{PAL["accent"]}"/>
  </g>""",
        "equipment_packaging_icon": f"""  <g stroke="{PAL["ink"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="20" width="24" height="4" rx="1" fill="{PAL["wood"]}"/>
    <line x1="7" y1="24" x2="7" y2="28"/>
    <line x1="25" y1="24" x2="25" y2="28"/>
    <rect x="9" y="10" width="14" height="10" rx="1.5" fill="{PAL["wood_light"]}"/>
    <path d="M9 15 H23 M16 10 V20" stroke="{PAL["accent"]}" stroke-width="1.6"/>
  </g>""",
        "equipment_crews_icon": f"""  <g stroke="{PAL["ink"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 10 H20 V20 H5 Z" fill="{PAL["primary_soft"]}"/>
    <path d="M20 13 H26 L28 20 H20 Z" fill="{PAL["accent"]}"/>
    <circle cx="10" cy="23" r="4" fill="{PAL["gold_light"]}"/>
    <circle cx="24" cy="24" r="2.8" fill="{PAL["gold_light"]}"/>
  </g>""",
        "equipment_shops_icon": f"""  <g stroke="{PAL["ink"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 9 H28 L26 15 C22 17 18 17 16 15 C14 17 10 17 6 15 Z" fill="{PAL["accent"]}"/>
    <rect x="6" y="15" width="20" height="12" fill="{PAL["surface"]}"/>
    <rect x="13" y="19" width="6" height="8" fill="{PAL["wood_light"]}"/>
  </g>""",
        "equipment_railway_icon": f"""  <g stroke="{PAL["ink"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="4" y1="26" x2="28" y2="26" stroke-width="2.4"/>
    <line x1="4" y1="22" x2="28" y2="22" stroke="{PAL["primary"]}" stroke-width="2"/>
    <circle cx="16" cy="14" r="7.5" fill="{PAL["gold_light"]}"/>
    <circle cx="16" cy="14" r="2.5" fill="{PAL["ink"]}"/>
  </g>""",
        "synergy_joint_delivery": f"""  <g stroke="{PAL["ink"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 20 C14 20 18 28 24 32 M6 44 C14 44 18 36 24 32" fill="none" stroke="{PAL["primary"]}" stroke-width="3.2"/>
    <path d="M58 20 C50 20 46 28 40 32 M58 44 C50 44 46 36 40 32" fill="none" stroke="{PAL["accent"]}" stroke-width="3.2"/>
    <rect x="21" y="21" width="22" height="22" rx="3" fill="{PAL["wood_light"]}"/>
    <path d="M21 32 H43 M32 21 V43" stroke="{PAL["accent"]}" stroke-width="2.4"/>
    <circle cx="32" cy="32" r="4" fill="{PAL["gold_light"]}"/>
  </g>""",
        "synergy_sorting_network": f"""  <g stroke="{PAL["ink"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 32 H32 C38 32 40 18 46 18 M32 32 C38 32 40 46 46 46" fill="none" stroke="{PAL["primary"]}" stroke-width="3"/>
    <rect x="8" y="24" width="14" height="16" rx="2" fill="{PAL["wood_light"]}"/>
    <rect x="42" y="10" width="14" height="14" rx="2" fill="{PAL["gold_light"]}"/>
    <rect x="42" y="40" width="14" height="14" rx="2" fill="{PAL["primary_soft"]}"/>
  </g>""",
        "synergy_tourism_service": f"""  <g stroke="{PAL["ink"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="32" cy="32" r="21" fill="none" stroke="{PAL["primary"]}" stroke-width="2.8" stroke-dasharray="6 4"/>
    <path d="M16 40 V31 M16 19 C10 23 10 31 16 32 C22 31 22 23 16 19 Z" fill="{PAL["primary"]}"/>
    <path d="M40 38 H54 L51 43 H43 Z M47 22 L54 34 H47 Z" fill="{PAL["sky"]}"/>
    <rect x="24" y="10" width="16" height="11" rx="1.5" fill="{PAL["surface"]}"/>
    <path d="M24 10 L32 16 L40 10" fill="none" stroke="{PAL["accent"]}" stroke-width="2"/>
  </g>""",
        "research_materials": f"""  <g stroke="{PAL["ink"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 24 L24 12 H44 V36 L32 48 L12 28 Z" fill="{PAL["gold_pale"]}"/>
    <circle cx="35" cy="21" r="3.5" fill="{PAL["surface"]}"/>
    <path d="M22 28 L32 38 M18 32 L26 40" stroke="{PAL["border"]}" stroke-width="2"/>
    <g transform="rotate(-35 44 42)">
      <rect x="40" y="28" width="8" height="24" rx="1" fill="{PAL["accent"]}"/>
      <path d="M40 28 L44 20 L48 28 Z" fill="{PAL["wood_light"]}"/>
    </g>
  </g>""",
        "research_logistics": f"""  <g stroke="{PAL["ink"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 18 C22 18 24 28 36 28 H54" fill="none" stroke="{PAL["primary"]}" stroke-width="3.6"/>
    <path d="M10 30 C20 30 22 40 34 40 H54" fill="none" stroke="{PAL["accent"]}" stroke-width="3.6"/>
    <rect x="12" y="45" width="40" height="9" rx="1.5" fill="{PAL["gold_light"]}"/>
    <path d="M18 45 V49 M26 45 V49 M34 45 V49 M42 45 V49" stroke-width="1.8"/>
  </g>""",
        "research_commerce": f"""  <g stroke="{PAL["ink"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 12 H54 L51 20 C46 23 40 23 36 20 C32 23 26 23 22 20 C18 23 14 22 10 20 Z" fill="{PAL["accent"]}"/>
    <rect x="12" y="26" width="28" height="24" rx="2" fill="{PAL["surface"]}"/>
    <line x1="26" y1="26" x2="26" y2="50"/>
    <path d="M16 33 H22 M16 39 H22 M30 33 H36 M30 39 H36" stroke="{PAL["border"]}" stroke-width="2"/>
    <circle cx="46" cy="43" r="9" fill="{PAL["gold_light"]}"/>
    <circle cx="46" cy="43" r="5" fill="none" stroke="{PAL["gold"]}" stroke-width="2"/>
  </g>""",
        "resource_material": f"""  <g stroke="{PAL["ink"]}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <g transform="rotate(-12 13 18)">
      <rect x="4" y="13" width="16" height="6" rx="1" fill="{PAL["wood_light"]}"/>
    </g>
    <g transform="rotate(10 14 22)">
      <rect x="5" y="19" width="16" height="6" rx="1" fill="{PAL["wood"]}"/>
    </g>
    <rect x="15" y="9" width="13" height="12" rx="1.5" fill="{PAL["gold_pale"]}"/>
    <path d="M15 15 H28 M21.5 9 V21" stroke="{PAL["accent"]}" stroke-width="1.5"/>
  </g>""",
        "resource_coin": f"""  <g stroke="{PAL["ink"]}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="16" cy="16" r="12" fill="{PAL["gold_light"]}"/>
    <circle cx="16" cy="16" r="8.5" fill="{PAL["gold"]}"/>
    <path d="M16 11 L20 16 L16 21 L12 16 Z" fill="{PAL["gold_pale"]}"/>
  </g>""",
        "resource_blueprint": f"""  <g stroke="{PAL["ink"]}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="5" y="7" width="20" height="18" rx="2" fill="{PAL["primary"]}"/>
    <ellipse cx="25" cy="16" rx="3" ry="9" fill="{PAL["primary_soft"]}"/>
    <path d="M9 12 H19 M9 16 H18 M9 20 H15" stroke="{PAL["surface"]}" stroke-width="1.5"/>
    <rect x="15" y="12" width="5" height="5" fill="none" stroke="{PAL["gold_light"]}" stroke-width="1.2"/>
  </g>""",
        "topic_daily": f"""  <g stroke="{PAL["ink"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 14 C16 11 32 11 38 14 C40 19 40 24 38 28 C32 30 16 30 10 28 C8 24 8 19 10 14 Z" fill="{PAL["surface"]}"/>
    <rect x="11" y="29" width="26" height="9" rx="3" fill="{PAL["primary_soft"]}"/>
    <line x1="11" y1="33.5" x2="37" y2="33.5" stroke="{PAL["primary"]}" stroke-width="2"/>
  </g>""",
        "topic_food": f"""  <g stroke="{PAL["ink"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 22 H35 C35 33 29 38 22 38 C15 38 9 33 9 22 Z" fill="{PAL["surface"]}"/>
    <rect x="17" y="38" width="10" height="3" rx="1" fill="{PAL["primary"]}"/>
    <line x1="13" y1="13" x2="39" y2="10" stroke="{PAL["wood"]}" stroke-width="2.6"/>
    <line x1="14" y1="17" x2="39" y2="16" stroke="{PAL["wood"]}" stroke-width="2.6"/>
  </g>""",
        "topic_living": f"""  <g stroke="{PAL["ink"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M27 33 C25 22 31 15 39 17 C40 26 35 33 27 33 Z" fill="{PAL["primary"]}"/>
    <path d="M9 26 C9 19 15 16 20 19 C23 19 26 22 25 26 C24 31 18 34 12 32 L7 34 Z" fill="{PAL["accent_light"]}"/>
    <path d="M24 20 L28 21 L24 23 Z" fill="{PAL["gold"]}"/>
    <circle cx="21" cy="21" r="1.2" fill="{PAL["ink"]}" stroke="none"/>
  </g>""",
        "topic_town": f"""  <g stroke="{PAL["ink"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 22 L21 11 L34 22 V36 H8 Z" fill="{PAL["surface"]}"/>
    <path d="M6 22 L21 10 L36 22 Z" fill="{PAL["accent"]}"/>
    <rect x="17" y="26" width="8" height="10" fill="{PAL["wood_light"]}"/>
    <g transform="rotate(-25 36 30)">
      <rect x="34" y="25" width="4" height="15" rx="1" fill="{PAL["wood"]}"/>
      <rect x="29" y="20" width="14" height="6" rx="2" fill="{PAL["primary"]}"/>
    </g>
  </g>""",
        "topic_nature": f"""  <g stroke="{PAL["ink"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="30" cy="17" r="8" fill="{PAL["gold_light"]}"/>
    <path d="M30 5 V7 M42 17 H40 M38 9 L36.5 10.5 M22 9 L23.5 10.5" stroke="{PAL["gold"]}" stroke-width="2.2"/>
    <path d="M10 36 C9 23 18 15 32 17 C33 30 24 38 10 36 Z" fill="{PAL["primary"]}"/>
    <path d="M8 38 L25 22" fill="none" stroke="{PAL["surface"]}" stroke-width="2"/>
  </g>""",
        "topic_people": f"""  <g stroke="{PAL["ink"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 12 H27 C29 12 31 14 31 16 V25 C31 27 29 29 27 29 H15 L9 34 V29 H7 C5 29 4 27 4 25 V16 C4 14 5 12 7 12 Z" fill="{PAL["primary_soft"]}"/>
    <path d="M21 20 H41 C43 20 44 22 44 24 V33 C44 35 43 37 41 37 H39 V42 L33 37 H21 C19 37 17 35 17 33 V24 C17 22 19 20 21 20 Z" fill="{PAL["surface"]}"/>
    <line x1="23" y1="26" x2="38" y2="26" stroke="{PAL["primary"]}" stroke-width="2"/>
    <line x1="23" y1="31" x2="34" y2="31" stroke="{PAL["primary"]}" stroke-width="2"/>
  </g>""",
    }
    return builders[aid]


def build_ui_icon(aid: str) -> str:
    builders = {
        "ui_home": f'<path d="M5 15 L16 6 L27 15 V26 H19 V19 H13 V26 H5 Z" fill="{PAL["primary_soft"]}" stroke="{PAL["ink"]}" stroke-width="2.4" stroke-linejoin="round"/>',
        "ui_play": f'<path d="M10 7 L25 16 L10 25 Z" fill="{PAL["primary"]}" stroke="{PAL["ink"]}" stroke-width="2.2" stroke-linejoin="round"/>',
        "ui_practice": f'<rect x="6" y="6" width="16" height="20" rx="2" fill="{PAL["surface"]}" stroke="{PAL["ink"]}" stroke-width="2.2"/><path d="M10 12 H18 M10 17 H15" stroke="{PAL["border"]}" stroke-width="2" stroke-linecap="round"/><path d="M18 25 L26 11 L29 13 L21 27 L17 28 Z" fill="{PAL["gold_light"]}" stroke="{PAL["ink"]}" stroke-width="1.8" stroke-linejoin="round"/>',
        "ui_dictionary": f'<path d="M5 8 C9 6 13 7 16 9 C19 7 23 6 27 8 V24 C23 22 19 23 16 25 C13 23 9 22 5 24 Z" fill="{PAL["surface"]}" stroke="{PAL["ink"]}" stroke-width="2.2" stroke-linejoin="round"/><line x1="16" y1="9" x2="16" y2="25" stroke="{PAL["ink"]}" stroke-width="2"/><path d="M21 7 V17 L23 15 L25 17 V7" fill="{PAL["accent"]}"/>',
        "ui_handbook": f'<rect x="7" y="5" width="18" height="22" rx="2.5" fill="{PAL["primary_soft"]}" stroke="{PAL["ink"]}" stroke-width="2.2"/><line x1="11" y1="5" x2="11" y2="27" stroke="{PAL["ink"]}" stroke-width="2"/><rect x="14" y="10" width="8" height="9" rx="1" fill="{PAL["surface"]}" stroke="{PAL["accent"]}" stroke-width="1.8" stroke-dasharray="2 1.5"/>',
        "ui_settings": f'<g stroke="{PAL["ink"]}" stroke-width="2.2" stroke-linecap="round"><line x1="8" y1="6" x2="8" y2="26"/><line x1="16" y1="6" x2="16" y2="26"/><line x1="24" y1="6" x2="24" y2="26"/><circle cx="8" cy="12" r="2.8" fill="{PAL["gold_light"]}"/><circle cx="16" cy="20" r="2.8" fill="{PAL["primary"]}"/><circle cx="24" cy="11" r="2.8" fill="{PAL["accent"]}"/></g>',
        "ui_lock": f'<path d="M11 14 V10 A5 5 0 0 1 21 10 V14" fill="none" stroke="{PAL["ink"]}" stroke-width="2.6" stroke-linecap="round"/><rect x="8" y="14" width="16" height="13" rx="2.5" fill="{PAL["gold_pale"]}" stroke="{PAL["ink"]}" stroke-width="2.2"/><circle cx="16" cy="20" r="1.8" fill="{PAL["ink"]}"/>',
        "ui_check": f'<circle cx="16" cy="16" r="12" fill="{PAL["primary"]}" stroke="{PAL["ink"]}" stroke-width="2"/><path d="M10.5 16.5 L14.5 20.5 L22 12" fill="none" stroke="{PAL["surface"]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
        "ui_pin": f'<g stroke="{PAL["ink"]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 5 L25 14 L21 18 L22 22 L10 10 L14 11 Z" fill="{PAL["accent"]}"/><line x1="14" y1="18" x2="6" y2="26" stroke-width="2.6"/></g>',
        "ui_unread": f'<rect x="4" y="9" width="22" height="16" rx="2" fill="{PAL["surface"]}" stroke="{PAL["ink"]}" stroke-width="2.2"/><path d="M4 10 L15 18 L26 10" fill="none" stroke="{PAL["primary"]}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="25" cy="9" r="4.2" fill="{PAL["accent"]}" stroke="{PAL["surface"]}" stroke-width="1.5"/>',
        "ui_info": f'<circle cx="16" cy="16" r="12" fill="{PAL["primary_soft"]}" stroke="{PAL["ink"]}" stroke-width="2.2"/><circle cx="16" cy="10.5" r="1.6" fill="{PAL["ink"]}"/><line x1="16" y1="15" x2="16" y2="22" stroke="{PAL["ink"]}" stroke-width="2.8" stroke-linecap="round"/>',
        "ui_warning": f'<path d="M16 5 L28 26 H4 Z" fill="{PAL["gold_light"]}" stroke="{PAL["ink"]}" stroke-width="2.2" stroke-linejoin="round"/><line x1="16" y1="12" x2="16" y2="19" stroke="{PAL["ink"]}" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="22.8" r="1.5" fill="{PAL["ink"]}"/>',
        "ui_search": f'<circle cx="13.5" cy="13.5" r="7.5" fill="{PAL["surface"]}" stroke="{PAL["ink"]}" stroke-width="2.5"/><line x1="19" y1="19" x2="27" y2="27" stroke="{PAL["ink"]}" stroke-width="3" stroke-linecap="round"/>',
        "ui_filter": f'<g stroke="{PAL["ink"]}" stroke-width="2.8" stroke-linecap="round"><line x1="5" y1="9" x2="27" y2="9"/><line x1="9" y1="16" x2="23" y2="16"/><line x1="13" y1="23" x2="19" y2="23"/></g>',
        "ui_sort": f'<g stroke="{PAL["ink"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M11 24 V8 M7 12 L11 8 L15 12"/><path d="M21 8 V24 M17 20 L21 24 L25 20"/></g>',
        "ui_back": f'<path d="M26 16 H7 M14 9 L7 16 L14 23" fill="none" stroke="{PAL["ink"]}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
        "ui_chevron": f'<path d="M12 7 L21 16 L12 25" fill="none" stroke="{PAL["ink"]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
        "ui_close": f'<path d="M8 8 L24 24 M24 8 L8 24" fill="none" stroke="{PAL["ink"]}" stroke-width="3" stroke-linecap="round"/>',
        "ui_retry": f'<path d="M25 14 A9.5 9.5 0 1 0 23 22.5" fill="none" stroke="{PAL["ink"]}" stroke-width="2.8" stroke-linecap="round"/><path d="M21 8 L26.5 14.5 L19 16.5 Z" fill="{PAL["ink"]}"/>',
        "ui_pause": f'<circle cx="16" cy="16" r="13" fill="{PAL["page"]}" stroke="{PAL["primary"]}" stroke-width="2.2"/><rect x="11" y="10" width="3.8" height="12" rx="1.2" fill="{PAL["primary"]}"/><rect x="17.2" y="10" width="3.8" height="12" rx="1.2" fill="{PAL["primary"]}"/>',
        "ui_sound": f'<path d="M5 13 H10 L17 7 V25 L10 19 H5 Z" fill="{PAL["primary"]}" stroke="{PAL["ink"]}" stroke-width="2" stroke-linejoin="round"/><path d="M21 12 A5 5 0 0 1 21 20 M24.5 9 A9 9 0 0 1 24.5 23" fill="none" stroke="{PAL["ink"]}" stroke-width="2.2" stroke-linecap="round"/>',
        "ui_guide": f'<g stroke="{PAL["ink"]}" stroke-width="2" fill="{PAL["surface"]}"><rect x="3" y="10" width="7.5" height="12" rx="2"/><rect x="12.2" y="10" width="7.5" height="12" rx="2" fill="{PAL["gold_pale"]}"/><rect x="21.5" y="10" width="7.5" height="12" rx="2"/></g>',
        "ui_text_size": f'<g stroke="{PAL["ink"]}" stroke-width="2.2" stroke-linejoin="round"><rect x="4" y="6" width="14" height="18" rx="2" fill="{PAL["surface"]}"/><rect x="17" y="14" width="11" height="12" rx="2" fill="{PAL["primary_soft"]}"/></g>',
        "ui_motion": f'<rect x="13" y="9" width="14" height="14" rx="2" fill="{PAL["wood_light"]}" stroke="{PAL["ink"]}" stroke-width="2.2"/><line x1="4" y1="13" x2="10" y2="13" stroke="{PAL["primary"]}" stroke-width="2.4" stroke-linecap="round"/><line x1="6" y1="19" x2="10" y2="19" stroke="{PAL["primary"]}" stroke-width="2.4" stroke-linecap="round"/>',
        "ui_more": f'<circle cx="7" cy="16" r="2.6" fill="{PAL["ink"]}"/><circle cx="16" cy="16" r="2.6" fill="{PAL["ink"]}"/><circle cx="25" cy="16" r="2.6" fill="{PAL["ink"]}"/>',
        "ui_question": f'<rect x="5" y="9" width="22" height="15" rx="2" fill="{PAL["page"]}" stroke="{PAL["ink"]}" stroke-width="2.2"/><path d="M5 10 L16 18 L27 10" fill="none" stroke="{PAL["ink"]}" stroke-width="2"/><path d="M16 14 L17.6 17.5 L21.4 18 L18.5 20.5 L19.2 24 L16 22 L12.8 24 L13.5 20.5 L10.6 18 L14.4 17.5 Z" fill="{PAL["gold"]}" stroke="{PAL["ink"]}" stroke-width="1.2"/>',
        "ui_clock": f'<circle cx="16" cy="16" r="11.5" fill="{PAL["surface"]}" stroke="{PAL["ink"]}" stroke-width="2.2"/><path d="M16 9 V16 L21 19" fill="none" stroke="{PAL["accent"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
        "ui_route": f'<path d="M8 24 C8 14 24 18 24 8" fill="none" stroke="{PAL["primary"]}" stroke-width="2.6" stroke-linecap="round"/><circle cx="8" cy="24" r="3.2" fill="{PAL["gold_light"]}" stroke="{PAL["ink"]}" stroke-width="1.8"/><circle cx="24" cy="8" r="3.2" fill="{PAL["accent"]}" stroke="{PAL["ink"]}" stroke-width="1.8"/>',
        "ui_plan": f'<rect x="5" y="7" width="19" height="19" rx="2" fill="{PAL["primary_soft"]}" stroke="{PAL["ink"]}" stroke-width="2"/><path d="M9 12 H17 M9 17 H15" stroke="{PAL["primary"]}" stroke-width="1.8" stroke-linecap="round"/><rect x="22" y="10" width="4.5" height="15" rx="1" fill="{PAL["gold_light"]}" stroke="{PAL["ink"]}" stroke-width="1.8"/><path d="M22 10 L24.25 5 L26.5 10 Z" fill="{PAL["accent"]}" stroke="{PAL["ink"]}" stroke-width="1.4"/>',
        "ui_new_city": f'<path d="M4 18 L9 13 L14 18 V24 H4 Z" fill="{PAL["primary_soft"]}" stroke="{PAL["ink"]}" stroke-width="1.8" stroke-linejoin="round"/><path d="M18 18 L23 13 L28 18 V24 H18 Z" fill="{PAL["gold_light"]}" stroke="{PAL["ink"]}" stroke-width="1.8" stroke-linejoin="round"/><path d="M11 8 H21 M18 5 L21.5 8 L18 11" fill="none" stroke="{PAL["accent"]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
        "ui_history": f'<path d="M7 16 A9 9 0 1 0 10 9.5" fill="none" stroke="{PAL["ink"]}" stroke-width="2.4" stroke-linecap="round"/><path d="M6 7 L6.5 12.5 L12 11 Z" fill="{PAL["ink"]}"/><path d="M16 11 V16 L20 18" fill="none" stroke="{PAL["primary"]}" stroke-width="2.2" stroke-linecap="round"/>',
        "ui_stop": f'<rect x="7" y="7" width="16" height="16" rx="2.5" fill="{PAL["accent"]}" stroke="{PAL["ink"]}" stroke-width="2.2"/><line x1="26" y1="7" x2="26" y2="23" stroke="{PAL["ink"]}" stroke-width="2.6" stroke-linecap="round"/>',
    }
    return builders[aid]


SVG_VIEWBOXES: dict[str, str] = {
    **{f"family_{c}": "0 0 64 64" for c in "abcdefghijkl"},
    "reward_frame_leaf": "0 0 120 80",
    "reward_tree_ornament": "0 0 128 32",
    "reward_frame_plaza": "0 0 120 80",
    "reward_fountain_ornament": "0 0 128 32",
    "reward_album_24_emblem": "0 0 128 128",
    "reward_frame_sunset": "0 0 120 80",
    "reward_board_48_emblem": "0 0 128 128",
    "reward_first_collection_emblem": "0 0 128 128",
    "reward_frame_journey": "0 0 120 80",
    "reward_expanded_album_emblem": "0 0 128 128",
    "reward_complete_72_emblem": "0 0 128 128",
    "stamp_frame": "0 0 640 640",
    "memorial_frame": "0 0 640 640",
    "board_base": "0 0 120 80",
    "board_foil": "0 0 120 80",
    "album_base": "0 0 120 80",
    "brand_mark": "0 0 64 64",
    "shop_canopy": "0 0 512 512",
    "shop_banner": "0 0 512 512",
    "shop_signboard": "0 0 512 512",
    **{f"district_{d}": "0 0 128 128" for d in ("residential", "market", "workshop", "park", "station", "harbor")},
    **{f"course_{c}": "0 0 48 48" for c in ("relaxed", "standard", "challenge")},
    **{f"equipment_{e}_icon": "0 0 32 32" for e in ("packaging", "crews", "shops", "railway")},
    **{f"synergy_{s}": "0 0 64 64" for s in ("joint_delivery", "sorting_network", "tourism_service")},
    **{f"research_{r}": "0 0 64 64" for r in ("materials", "logistics", "commerce")},
    **{f"resource_{r}": "0 0 32 32" for r in ("material", "coin", "blueprint")},
    **{f"topic_{t}": "0 0 48 48" for t in ("daily", "food", "living", "town", "nature", "people")},
}


def make_svg(asset: dict) -> str:
    aid = asset["id"]
    cat = asset["category"]
    title = asset["name"]

    if cat == "family_emblem":
        body = build_family_emblem(aid)
        viewbox = SVG_VIEWBOXES[aid]
    elif cat == "milestone_svg":
        body = build_milestone_svg(aid)
        viewbox = SVG_VIEWBOXES[aid]
    elif cat == "shared_frame":
        body = build_shared_frame(aid)
        viewbox = SVG_VIEWBOXES[aid]
    elif cat in ("brand", "shop_overlay"):
        body = build_brand_and_shop(aid)
        viewbox = SVG_VIEWBOXES[aid]
    elif cat == "district_icon":
        body = build_district_icon(aid)
        viewbox = SVG_VIEWBOXES[aid]
    elif cat == "ui_icon":
        body = build_ui_icon(aid)
        viewbox = "0 0 32 32"
    elif cat in ("course_icon", "equipment_icon", "synergy_icon", "research_icon", "resource_icon", "topic_icon"):
        body = build_domain_icon(aid)
        viewbox = SVG_VIEWBOXES[aid]
    else:
        raise ValueError(f"Unhandled SVG category/id: {cat}/{aid}")

    return svg_wrap(viewbox, title, body)


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
            svg_text = make_svg(asset)
            for rel in asset["runtime_exports"]:
                out_path = PUBLIC_DIR / rel
                out_path.parent.mkdir(parents=True, exist_ok=True)
                out_path.write_text(svg_text, encoding="utf-8")
                svg_count += 1

    # Generate 6 core WAV sound effects
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
