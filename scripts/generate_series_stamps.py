"""Generate all 428 series achievement stamp illustrations as 3x2 contact sheets
via gpt-image-2.6-flare and slice them into 512x512 WebP files under
public/assets/achievement_stamp/.

All prompts strictly enforce 100% uninhabited still-life / empty scenic
architecture watercolor compositions with zero human figures, hands, portraits,
or anthropomorphic animals.
"""

import argparse
import base64
import concurrent.futures
import json
import random
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from openai import OpenAI
from PIL import Image

OUT_DIR = Path("public/assets/achievement_stamp")
DEFAULT_SHEET_DIR = Path(".tmp_sheets/series_stamp")

CELL_POSITIONS = [
    ("Top-Left (Row 1, Col 1)", (0, 0, 512, 512)),
    ("Top-Center (Row 1, Col 2)", (512, 0, 1024, 512)),
    ("Top-Right (Row 1, Col 3)", (1024, 0, 1536, 512)),
    ("Bottom-Left (Row 2, Col 1)", (0, 512, 512, 1024)),
    ("Bottom-Center (Row 2, Col 2)", (512, 512, 1024, 1024)),
    ("Bottom-Right (Row 2, Col 3)", (1024, 512, 1536, 1024)),
]

PADDING_MOTIFS = [
    "A single warm terracotta clay flowerpot with a small blooming daisy resting on a sunlit stone sill, soft watercolor vignette on #FAF6EE background.",
    "A coiled hemp twine ball with brass scissors resting beside a blank cream paper tag, soft watercolor vignette on #FAF6EE background.",
    "A vintage brass counter bell with a small green ribbon resting on an oak ledge, soft watercolor vignette on #FAF6EE background.",
    "A folded cream origami paper boat beside two smooth river pebbles on a wooden sill, soft watercolor vignette on #FAF6EE background.",
]

# Ordered from longest/most-specific to shortest so compound terms match first.
JAPANESE_SANITIZE_REPLACEMENTS: list[tuple[str, str]] = [
    ("道ばたの犬が耳をぴんと立てました", "道ばたの花壇が風に揺れました"),
    ("道ばたの犬", "道ばたの花鉢"),
    ("まるで二人でかけっこです", "青い空の下をすいすい飛び交います"),
    ("橋の上の子が見ていました。小さく手をたたいて喜びます", "石橋の欄干の上で、包みのリボンがそよ風に揺れています"),
    ("子どもたちが数えています", "夜の坂道に静かに並んでいます"),
    ("子どもが耳を澄ませて、どちらか当ててみました", "駅舎の時計塔と港の灯台が夕風の中で響き合います"),
    ("子ども", "小さな風車"),
    ("ふたりの運び手が", "二台の木製荷車が"),
    ("運び手が荷台を空にしました", "並んだ木製荷車の荷台がすっきり空きました"),
    ("運び手", "荷車"),
    ("見習いの配達人が「この道も通ったの？」と古い地図を指さしました", "古い町地図が開いたまま卓上に置かれています"),
    ("見習いさんも、そっと手つきをまねしました", "机の上には折り目のない封筒が美しく並んでいます"),
    ("隣で見習いさんも練習します", "作業台に予備の包み紙と麻ひもが用意されています"),
    ("見習いさん", "予備の包み紙"),
    ("郵便屋さんがにっこり。「大事な便を任せられるね」", "郵便局の木机の上で、蝋封の赤い印が温かく光ります"),
    ("郵便屋さんがにっこり。", "郵便局の木机の上で、蝋封の赤い印が温かく光ります。"),
    ("郵便屋さんの棚に", "郵便局の木製仕分け棚に"),
    ("風より速い配達人", "風を運ぶことば便"),
    ("まとめ便の職人", "まとめ便の宝箱"),
    ("お届け名人", "おとどけ五種便"),
    ("小分けの名人", "小分け四個便"),
    ("ひとのことば探し", "街の広場のことば探し"),
    ("ひとのきれいな図鑑", "街の広場のきれいな図鑑"),
    ("荷物を分ける手つきが、ずいぶん落ち着きました", "荷台の上で大きさごとに並んだ包みがとても美しく整いました"),
    ("顔を出しました", "芽吹きました"),
    ("別の仕事場の人が、ノートを借りて何かを書き足しました", "開かれたノートと万年筆、新しい設計図が並んでいます"),
    ("ていねいに", "美しく"),
    ("お礼の手紙を一通のせました", "お礼の絵葉書とリボンが添えられています"),
    ("お向かいさん", "向かいの郵便受け"),
    ("おばあさん", "木の受け取り台"),
    ("お店の人が手をふりました", "店先の木の受け取り台に暖かいランプがともっています"),
    ("お店の人どうしが声をかけ合います", "店先の軒先が朝の光に照らされています"),
    ("お店の人", "店先の飾り棚"),
    ("店の人も「今日はぴったり届いたよ」とにっこり", "店先のカウンターにぴたりと小包が並んでいます"),
    ("大工さんの仕事はここからです", "木組みの小屋組と材木が木箱のそばに整然と並んでいます"),
    ("大工道具", "木工の小箱"),
    ("工房の人が", "工房の棚に"),
    ("公園の人", "公園の木ベンチ"),
    ("駅員さん", "駅の時計台"),
    ("船乗りさん", "波止場の係留柱"),
    ("店主さんは紐をほどく前に、そっと見とれました", "店先のテーブルに、きれいな結び目の小包が並んでいます"),
    ("店主さんがすぐに受け渡し台を空けてくれます", "店先の木製受け渡し台が整えられています"),
    ("店主さん", "店のカウンター棚"),
    ("住人は並んで道をあけてくれました", "静かな石畳の通りに二つの荷かごが並んでいます"),
    ("住人は笑顔で見渡します", "通りの端まであたたかな灯りが続きます"),
    ("住人は笑顔で「次の街からも、手紙を出してね」と言いました", "橋のたもとの木製ポストに新しい便せんが用意されています"),
    ("住人は古い倉庫の横に、新しい休憩所を作りました", "古い倉庫の横に新しい木造の休憩あずまやが建っています"),
    ("住人は大事に棚へ戻しました", "よくお手入れされた木製棚と道具箱が美しく並んでいます"),
    ("住人が手を振って見送ります", "木製郵便受けの横に小さな花鉢が置かれています"),
    ("住人が順番に荷物を待っています", "橋のたもとの受け取り棚が順番に並んでいます"),
    ("手紙を待つ人が顔を上げたときには、もう門をくぐっています", "静かな門柱の郵便受けへ朝光が差し込んでいます"),
    ("手紙を待つ人が笑っています", "石の橋の向こうの郵便受けが朝日を受けています"),
    ("帰りを待つ人が、道からよく見えました", "あたたかい窓辺の灯りが、暗い道からもよく見えます"),
    ("夜の配達から戻る人も、安心して歩けます。", "夜の町並みを優しい街灯が隅々まで照らしています。"),
    ("上の方から「もうすぐだよ」と声がしました", "石段の上の街灯に温かな明かりがともっています"),
    ("上の方からと声がしました", "石段の上の街灯に温かな明かりがともっています"),
    ("と店先から声がしました", "と店先の受け取り台に届きました"),
    ("行き交う人の足音が、今日も聞こえます", "朝の澄んだ風と葉ずれの音が響いています"),
    ("人が、いつもの", "日差しが、いつもの"),
    ("お昼になると、人が", "お昼になると、日が差して"),
    ("あちこちから人が広場に来る", "あちこちの道が明るい広場へつながる"),
    ("人が足を止める時間に合わせて、店先にかごを出しました", "午後の光に合わせて、店先に美しい編みかごが並べられました"),
    ("包み紙を引く人と紐を結ぶ人の手つきが、ぴたりと合いました", "机の上の包み紙と結ばれた麻ひもが美しく整っています"),
    ("戸口で待つ人へ、大事に手渡しました", "静かな戸口の受け渡し台へ、大事に包みを置きました"),
    ("荷物を届けた人たちが、小さなお礼のカードをかごに入れてくれました", "空いた木の受け渡し台には、リボンを結んだ小さなお礼のカードが添えられています"),
    ("今日も向こうで手が振られています", "今日も向こうの窓辺で赤いリボンが風に揺れています"),
    ("厚い封筒を受け取った人が、さっそく日なたに椅子を出しました。長い手紙を、これからゆっくり読むそうです。", "日なたに出された木の椅子の上で、分厚い封筒が暖かい光を浴びています。"),
    ("どのページも、読む人が迷わないように書けました", "どのページも美しい挿絵と丁寧なしおりで整えられています"),
    ("そこで手紙を読む人もいます", "木かげのベンチの上に開かれた手紙と紅茶が置かれています"),
    ("何度めくったか分からない", "長年親しまれた"),
    ("何度か出会った人の話が書いてありました", "通ってきた四季の町の絵日記が丁寧に記されています"),
    ("荷車の列のすきまを、向かいの郵便受けが声をかけて案内します", "荷車の列が静かな道しるべに沿って進みます"),
    ("荷車の列のすきまを、", "並んだ木製荷車のあいだから、"),
    ("声をかけて案内します", "静かに道案内の立て札が立っています"),
    ("最後の満載便を迎えたら、配達路の向こうまで帽子を振ります", "夕暮れの坂道で、赤い小旗と街灯が並んだ荷車を照らします"),
    ("たくさん届いた小さな資材が、いまの街の姿になりました", "積み上がった多くの資材が、立派な木造りの街並みになりました"),
    ("手をふる人が見えました", "線路ぞいの明かりがともる窓が見えました"),
    ("手をふって", "赤い旗が揺れて"),
    ("手を振って", "赤い旗が揺れて"),
    ("手をかざして見守ります", "川向こうの欄干のランタンが静かにともっています"),
    ("もう片方の手をあげて笑いました", "受け取り台の上に色とりどりの封筒が積み上がっています"),
    ("受け取った人が、通りのあちこちでにっこり", "通りのあちこちの窓辺に届いた包みと花瓶が飾られています"),
    ("受け取る手が、そっと伸びてきます", "窓辺の木製受け取り台に朝の日差しが落ちています"),
    ("顔を出しています", "のぞいています"),
    ("買い物かごを持って、ゆっくり歩いてみましょう", "軒先に編みかごが並び、朝の光が石畳を照らしています"),
    ("新しい道を歩くと", "新しい角を曲がると"),
    ("歩いたことのない道", "まだ描かれていない道"),
    ("歩く人", "石畳"),
    ("歩ける道", "つながる道"),
    ("歩いた道", "通ってきた道"),
    ("歩いたら", "見上げると"),
    ("歩きます", "続いています"),
    ("歩いた", "つながる"),
    ("歩き出すと", "風に揺れると"),
    ("歩きやすく", "通りやすく"),
    ("足あとが", "わだちの跡が"),
    ("足あと", "小さな花びら"),
    ("足どり", "風の流れ"),
    ("足もと", "石畳の道"),
    ("靴の音が", "木製荷車の車輪が"),
    ("ひと休み", "朝露の時間"),
    ("ひと便ずつ", "一便ずつ"),
    ("ひとつめ", "一つ目"),
    ("ひとつずつ", "一つずつ"),
    ("ひとつ", "一つ"),
    ("ひとまわり", "一周"),
    ("小さな一歩", "小さな一ページ"),
    ("笑顔と手をふる人", "花飾りのある木製ベンチ"),
    ("笑顔が", "あたたかな灯りが"),
    ("笑顔で", "あたたかな日差しの中で"),
    ("笑顔", "あたたかな光"),
    ("顔なじみが集まる広場", "噴水と赤いポストのある静かな広場"),
    ("顔なじみの", "いつもの角の"),
    ("顔なじみ", "おなじみの風景"),
    ("お友だちと", "午後の光の中で"),
    ("友だちも読んでみたくなりました", "午後の日差しの中にしおりが輝いています"),
    ("お友だち", "木のしおり"),
    ("友だち", "窓辺の紅茶"),
    ("町の人もできる作業が増えました", "町じゅうの仕事場に道具と資材が行き渡りました"),
    ("働く人をやわらかい光が照らします", "夕暮れの仕事場をやわらかな光が照らします"),
    ("声があります", "灯りがともります"),
    ("聞こえてきます", "響いています"),
    ("話しました", "綴られています"),
    ("住人", "静かな通り"),
    ("職人さん", "木の作業台"),
    ("みんな", "街じゅう"),
    ("両手が空きました", "空いた木の受け取り台に朝日が差し込みます"),
    ("両手で持つ包み", "しっかり結んだ大きな箱包み"),
    ("片手にのる包み", "手のひらサイズの小さな箱包み"),
    ("手渡し台", "木製受け渡し台"),
    ("配達人", "郵便かばん"),
    ("誰か", "どこか"),
    ("開く場所を指で探ると", "本を開くと"),
]

CATEGORY_CUES = {
    "typing": "Strict uninhabited still-life or empty scenic path: leather satchel, wax-sealed envelopes, fluttering ribbons, brass lamps, parked empty vintage bicycle, cobblestone alley or bridge.",
    "words": "Strict uninhabited tabletop still-life: open illustrated hardcover lexicon, botanical/architectural pages, silk or metal bookmarks, fountain pen, teacup, flower vase by window.",
    "city": "Strict uninhabited architectural townscape: European-Japanese hillside rooftops, shuttered cottages, striped shop awnings, cobblestone alleys, steam train over stone viaduct, timber crates, harbor pier.",
    "delivery": "Strict uninhabited parcel & cart composition: brown paper parcels tied with red/white striped twine, woven wicker delivery baskets, two-wheeled wooden handcarts, red postbox, shop shelf.",
    "lifetime": "Strict uninhabited heirloom vignette: weathered leather mailbag on stone wall, kotoba tree with envelope-shaped leaves shading a wooden bench, stacked pine crates, bound travel journals, carpentry workbench tools.",
    "secret": "Strict uninhabited whimsical still-life: three stepped parcels on an empty stone bridge, ribboned packages, town rooftops panorama, sunlit harbor dock, parked handcarts with brass bells.",
}

SERIES_VISUAL_CUES = {
    "speed": "Empty sunlit cobblestone hillside or stone bridge, parked empty red postman bicycle with front basket, fluttering red scarf, drifting wind leaves, flying cream envelopes (ZERO people riding or standing).",
    "accuracy": "Top-down sunlit wooden post office desk with geometric rows of wax-sealed cream letters aligned beside an inkwell and ceramic vase (ZERO hands, ZERO people).",
    "speed_accuracy": "Empty bicycle with flower basket parked beside an empty cobblestone bridge, pristine ribboned envelopes stacked on stone ledge (ZERO people).",
    "clean_streak": "Quiet evening town lane lined with glowing wrought-iron streetlamps, warm lit cottage windows, wet cobblestones reflecting lantern glow (ZERO pedestrians).",
    "long_words": "Thick stitched cream folio stationery unrolled across an empty oak desk under a green glass reading lamp (ZERO people).",
    "no_guide": "Sunlit empty winding lane marked by blooming corner hydranges, vintage wooden directional signpost, cobblestone fork (ZERO people).",
    "perfect_rounds": "Open brown leather mailbag filled with crisp aligned wax-sealed envelopes sitting alone on a wooden counter (ZERO people).",
    "speed_pb": "Scenic empty riverside promenade, cobblestone avenue, or hilltop stone overlook with open leather route journal, brass stopwatch, red pennant, and blowing leaves (ZERO people or animals).",
    "course_speed": "Quiet cobblestone town lane with colorful festive bunting flags Overhead, parked empty handcart, swirling autumn leaves (ZERO people or animals).",
    "course_words": "Open brown leather mailbag overflowing with striped airmail letters resting on an empty shop threshold under a brass bell (ZERO people).",
    "mastery": "Open hardcover illustrated lexicon pages gleaming with metallic bronze, silver, gold, or pastel prism ribbon bookmarks on a sunlit wooden desk (ZERO hands, ZERO cats/animals).",
    "every_topic": "Unfolded hand-drawn watercolor town map showing cottages, river bridge, meadow, compass, magnifying glass, and stacked journals (ZERO people).",
    "routes": "Open architectural town road map laid over a wooden drafting table with colored route lines, miniature wooden house blocks, and brass compass (ZERO people).",
    "rails": "Empty country train station platform, parked vintage steam locomotive on steel rails, empty baggage handcart stacked with wooden crates, semaphore signal (ZERO people).",
    "packaging": "Empty carpentry wrapping table neatly arranged with kraft paper rolls, brass scissors, hemp twine spools, and crisp bow-tied parcels of graded sizes (ZERO people).",
    "full_streak": "Row of consecutive overflowing wicker cargo handcarts parked neatly across an arched stone river bridge (ZERO people).",
    "all_sizes": "Five graduated brown paper packages from a tiny palm-sized box up to a brimming wicker basket lined cleanly along an empty cottage doorstep (ZERO people).",
    "perfect_full": "Neat wooden handcart filled with spotlessly ribboned parcels poised atop a quiet sunlit cobblestone slope (ZERO people).",
    "cargo_total": "Wagon wheel tracks on quiet stone lane, stack of illustrated town postcards leaning against a weathered leather mailbag and packed handcart (ZERO people or animals).",
    "score_pb": "Architectural town map, red ink route lines, fountain pen, sketchbook, brass compass, and tied parcels on a wooden sill (ZERO people).",
    "lifetime_words": "Mature shady tree whose green or golden leaves resemble small folded envelopes sheltering an empty wooden bench with a leather satchel and straw hat (ZERO people).",
    "lifetime_rounds": "Close-up still life of a well-worn brown leather postal satchel with brass buckles resting on a mossy stone ledge overlooking quiet hilltown rooftops (ZERO people).",
    "lifetime_materials": "Stacked fragrant pine beams, cut stone blocks, wooden carpenter toolbox, and an open empty timber house frame by sunlit cottages (ZERO people).",
    "purchases": "Uninhabited sunny carpentry workbench filled with gleaming hand planes, brass saws, chisels, wooden mallets, wood shavings, and hung satchels (ZERO people).",
    "restarts": "Open vintage leather suitcase holding old town postcards next to a sunlit sunlit wooden drafting easel facing fresh empty hilltown cottages (ZERO people or animals).",
    "practice_words": "Thick worn blue cloth-bound practice notebooks with rounded corners tied in red twine, cedar pencil, brass sharpener shavings on empty window sill (ZERO people or animals).",
    "research_total": "Three leather-bound botanical and architectural field journals neatly arranged beside a brass armillary sphere and inkwell (ZERO hands, ZERO animals).",
    "orders": "Fresh white blossoms beside a stone wall and unfolded colorful hand-painted route map with tiny watercolor palette on a quiet balcony (ZERO people).",
    "small_steps": "Three brown paper parcels increasing in size like three little steps resting alone on the parapet of an empty sunlit stone bridge (ZERO people).",
    "back_steps": "U-shaped curving cobblestone town turnaround lane around a central sunlit stone archway and lamppost: outbound left curve in fresh morning light with a brimming regular parcel cart paired with a red-pennant extra-delivery cart, return right curve in golden afternoon lantern light with a brimming regular cart paired with a red-pennant extra-delivery cart (ZERO people).",
    "two_baskets": "Two empty woven wicker picnic-cargo baskets (plain blue check cloth and red check cloth — NO legs or eyes!) sitting side-by-side on sunlit cobblestones outside a striped awning bakery (ZERO people).",
    "between_full": "Three brimming wooden regular parcel handcarts spaced one behind another down a quiet sunlit cobblestone avenue, with a nimble crimson-pennant extra-delivery cart rolling side-by-side exclusively beside the second (middle) regular cart (ZERO people).",
    "six_clean_topics": "Open leather postal satchel resting on a stone garden table, stuffed with meadow flowers, baguette, painted teacup, notebook, and fresh leaves (ZERO people or animals).",
    "five_clean_tags": "Five wrapped parcels of varied shapes neatly bound with thin, wide, curled, and braided colorful ribbons next to twine spools (ZERO people).",
    "five_clean_long": "Thick creamy stitched parchment folio envelope sealed in red wax propped on an empty sun-dappled garden wooden chair beside blooming hydrangeas (ZERO people).",
    "first_twenty_by_four": "Procession of exactly four wooden extra-delivery handcarts loaded with ribbon-tied parcels and each flying a crisp red triangular pennant flag rolling along a sunlit winding cobblestone town slope with fluttering window ribbons (ZERO people).",
    "all_stage_two": "Wide panoramic rooftop vista of varied terracotta, slate, blue, and mossy green shingled roofs with brick chimneys across sunlit hills (ZERO people).",
    "station_and_harbor": "Split scenic harbor-railway vista: vintage steam locomotive smoking along stone embankment next to tall-masted sailboats docked at calm blue harbor pier (ZERO people).",
    "all_shops_five": "Empty morning market lane lined with colorful striped awnings, hanging brass shop bells, flower buckets, and bakery window displays before opening hour (ZERO people).",
    "rails_and_research": "Empty railway station freight siding with parked wooden handtruck loaded with timber crates and architectural blueprint rolls beside a steam freight train (ZERO people).",
}

NODE_EXTRACT_SCRIPT = r"""
const esbuild = require('esbuild');
const Module = require('node:module');
const path = require('node:path');

const res = esbuild.buildSync({
  entryPoints: [path.resolve('src/progression/stampSeries.ts')],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  tsconfig: path.resolve('tsconfig.json'),
});

const mod = new Module('stampSeries');
mod.paths = Module._nodeModulePaths(process.cwd());
mod._compile(res.outputFiles[0].text, path.resolve('src/progression/stampSeries.ts'));

const out = [];
for (const series of mod.exports.STAMP_SERIES) {
  const count = series.stamps.length;
  series.stamps.forEach((stamp, idx) => {
    out.push({
      id: stamp.id,
      seriesId: stamp.seriesId,
      target: stamp.target,
      stamp_asset_id: stamp.stamp_asset_id,
      name: stamp.name,
      seriesName: series.name,
      category: series.category,
      tierLabel: stamp.tierLabel,
      condition: stamp.condition,
      flavor_text: stamp.flavor_text,
      tierIndex: idx,
      tierCount: count,
    });
  });
}
process.stdout.write(JSON.stringify(out));
"""


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


def load_series_stamps() -> list[dict]:
    proc = subprocess.run(
        ["node", "-e", NODE_EXTRACT_SCRIPT],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return json.loads(proc.stdout)


def sanitize_uninhabited_text(text: str) -> str:
    cleaned = text
    for old, new in JAPANESE_SANITIZE_REPLACEMENTS:
        cleaned = cleaned.replace(old, new)
    cleaned = re.sub(r"「[^」]*」", "", cleaned)
    return cleaned.strip()


def get_tier_mood(stamp: dict) -> str:
    label = stamp["tierLabel"]
    idx = stamp["tierIndex"]
    count = stamp["tierCount"]
    if label == "銅":
        return "Warm bronze-amber morning light, modest intimate tabletop/roadside scale."
    if label == "銀":
        return "Crisp silver-blue clear daylight, clean architectural lines and sparkle."
    if label == "金":
        return "Rich golden-hour honey sunlight, lush flowers and polished brass gleam."
    if label == "虹":
        return "Luminous pastel iridescent rainbow shimmer across sunlit glass, ribbons, or sky clouds."
    if label == "伝説":
        return "Grand radiant twilight starlight and golden celebratory lantern light across an empty town vista."
    if count <= 1:
        return "Iconic storybook still-life centerpiece bathed in warm golden sunshine."
    ratio = idx / max(1, count - 1)
    if ratio < 0.25:
        return "Fresh early-morning mist and soft pale sunlight, simple clean composition."
    if ratio < 0.55:
        return "Bright cheerful mid-morning sunshine with blooming greenery."
    if ratio < 0.85:
        return "Warm honey late-afternoon glow with rich layered architectural depth."
    return "Golden twilight or warm starlit lantern glow panorama across empty hills."


def get_series_hint(series_id: str) -> str:
    if series_id in SERIES_VISUAL_CUES:
        return SERIES_VISUAL_CUES[series_id]
    for prefix, hint in [
        ("speed_pb_", SERIES_VISUAL_CUES["speed_pb"]),
        ("course_speed_", SERIES_VISUAL_CUES["course_speed"]),
        ("course_words_", SERIES_VISUAL_CUES["course_words"]),
        ("topic_clean_", "Uninhabited spotless botanical/still-life storybook open encyclopedia page with pressed ribbon bookmark on sunny wooden desk."),
        ("topic_words_", "Uninhabited open pocket field journal beside fountain pen, ink bottle, and everyday still-life objects by sunlit window."),
        ("course_clean_", "Uninhabited pristine bound vocabulary ledger resting beside empty sunlit town bridge and teacup."),
        ("course_gold_", "Uninhabited gilded silk ribbon bookmarks peeking from an open sunlit picture-book encyclopedia."),
        ("mastery_", SERIES_VISUAL_CUES["mastery"]),
        ("stage_", "Uninhabited scenic hilltown district vista (cottages, awnings, workshops, stone arches, clocktower, or harbor pier) with ZERO pedestrians or vehicles with drivers."),
        ("shops_", "Uninhabited charming boutique bakery/florist/craft shop counter display with striped awning, pastry dome, brass bell, and wooden shelves — closed and empty."),
        ("crews_", "Uninhabited empty wooden delivery handcarts stacked with tied brown parcels parked neatly along a quiet empty cobblestone street (ZERO couriers/people)."),
        ("cargo_", "Uninhabited stack of twine-tied brown paper parcels neatly left on a sunny shop sill or doorstep waiting next to flowers and a wooden crate (ZERO people)."),
        ("research_", "Uninhabited sunny drafting table with architectural blueprints, wooden scale house models, parcels, and brass compass (ZERO people)."),
        ("manual_", "Uninhabited sunlit cottage doorway or garden gate with tied parcels resting on a clean stone step or wooden sill next to potted flowers (ZERO people)."),
        ("rounds_", "Uninhabited worn travel leather satchel beside an open diary, compass, and scenic empty cobblestone lane through spring/autumn/twilight (ZERO people or animals)."),
    ]:
        if series_id.startswith(prefix):
            return hint
    return "Cozy 100% uninhabited Japanese postal town still-life vignette (ZERO people, ZERO hands, ZERO animals)."


def build_prompt(group: list[dict]) -> str:
    lines = [
        "A clean 3-column by 2-row contact sheet (6 equal 512x512 square panels arranged in a strict 3x2 grid on a 1536x1024 canvas).",
        "Art style: Warm, gentle hand-painted watercolor and fine ink-line storybook illustration fading softly into a uniform warm cream-white paper background (#FAF6EE). Cozy European-Japanese postal town still-life and scenic architecture aesthetic.",
        "ABSOLUTE PROHIBITION — ZERO CHARACTERS OR CREATURES OF ANY KIND:",
        "- Strictly ZERO humans, ZERO people, ZERO children, ZERO couriers, ZERO shopkeepers, ZERO pedestrians, ZERO distant background human figures or silhouettes.",
        "- Strictly ZERO human body parts: NO hands, NO fingers, NO arms, NO faces, NO human portraits drawn inside open book pages or postcards.",
        "- Strictly ZERO anthropomorphic animals or living characters: NO rabbits, foxes, mice, cats, dogs, bears, or squirrels wearing clothes or acting like people; NO baskets or objects with legs, arms, or faces.",
        "- Every panel MUST be a 100% UNINHABITED quiet still-life or empty townscape/landscape showing ONLY inanimate postal props (letters, parcels, satchels, books, handcarts, parked empty bicycles, brass lamps, tools), buildings, and plants.",
        "STRICT LAYOUT & TEXT RULES:",
        "- NO borders, NO frames, NO stamp perforations, NO dividing lines, NO grid lines.",
        "- NO text, NO letters, NO numbers, NO kanji/kana, NO labels anywhere.",
        "- Each of the 6 illustrations MUST be centered inside its own 512x512 square zone with at least 40px of clean empty #FAF6EE cream background padding on all 4 sides so NO artwork crosses cell boundaries.",
        "",
        "Illustrations for the 6 cells:",
    ]
    for i, (pos_label, _) in enumerate(CELL_POSITIONS):
        if i < len(group):
            st = group[i]
            cat_cue = CATEGORY_CUES.get(st["category"], "")
            series_cue = get_series_hint(st["seriesId"])
            tier_mood = get_tier_mood(st)
            safe_name = sanitize_uninhabited_text(st["name"])
            safe_scene = sanitize_uninhabited_text(st["flavor_text"])
            lines.append(
                f"- {pos_label} [{st['stamp_asset_id']}]: "
                f"Uninhabited still-life / empty townscape \"{safe_name}\" — {safe_scene} "
                f"Visual staging: {series_cue} {cat_cue} Atmosphere: {tier_mood} "
                f"Pure objects & architecture only, zero people, zero animals, zero hands, zero text."
            )
        else:
            pad_idx = i - len(group)
            lines.append(f"- {pos_label} [filler_{pad_idx + 1}]: {PADDING_MOTIFS[pad_idx % len(PADDING_MOTIFS)]}")
    return "\n".join(lines)


def process_group(
    client: OpenAI,
    group_idx: int,
    group: list[dict],
    sheet_dir: Path,
    force: bool,
) -> tuple[int, list[str]]:
    asset_ids = [a["stamp_asset_id"] for a in group]
    out_paths = [OUT_DIR / f"{asset_id}.webp" for asset_id in asset_ids]
    if not force and all(p.exists() for p in out_paths):
        return group_idx, asset_ids

    prompt = build_prompt(group)
    sheet_path = sheet_dir / f"sheet_{group_idx:02d}_{asset_ids[0]}.png"

    if force or not sheet_path.exists():
        last_err: Exception | None = None
        for attempt in range(1, 6):
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
                backoff = min(30.0, (2 ** attempt) + random.uniform(0.5, 2.0))
                time.sleep(backoff)
        else:
            raise RuntimeError(f"Failed sheet {group_idx:02d} ({asset_ids[0]}): {last_err}")

    with Image.open(sheet_path) as img:
        if img.size != (1536, 1024):
            img = img.resize((1536, 1024), Image.Resampling.LANCZOS)
        rgb = img.convert("RGB")
        for idx, (_, box) in enumerate(CELL_POSITIONS):
            if idx >= len(out_paths):
                break
            cell = rgb.crop(box)
            cell.save(out_paths[idx], format="WEBP", quality=90, method=6)

    return group_idx, asset_ids


def parse_sheet_selection(raw: str | None, total_groups: int) -> set[int]:
    if not raw:
        return set(range(1, total_groups + 1))
    selected: set[int] = set()
    for part in raw.split(","):
        token = part.strip()
        if not token:
            continue
        if "-" in token:
            start_s, end_s = token.split("-", 1)
            for num in range(int(start_s), int(end_s) + 1):
                if 1 <= num <= total_groups:
                    selected.add(num)
        else:
            num = int(token)
            if 1 <= num <= total_groups:
                selected.add(num)
    return selected


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Regenerate selected series stamps")
    parser.add_argument("--workers", type=int, default=8, help="Parallel API workers")
    parser.add_argument("--sheet-dir", type=Path, default=DEFAULT_SHEET_DIR)
    parser.add_argument("--sheets", type=str, default=None, help="Comma/range list of 1-based sheet numbers (e.g. 1,2,10-12)")
    args = parser.parse_args()

    stamps = load_series_stamps()
    unique_ids = {s["stamp_asset_id"] for s in stamps}
    if len(stamps) != 428 or len(unique_ids) != 428:
        print(
            f"Expected 428 unique series stamp assets, got total={len(stamps)}, unique={len(unique_ids)}",
            file=sys.stderr,
        )
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    args.sheet_dir.mkdir(parents=True, exist_ok=True)

    groups = [stamps[i : i + 6] for i in range(0, len(stamps), 6)]
    selected_indices = parse_sheet_selection(args.sheets, len(groups))
    target_groups = [(idx, groups[idx - 1]) for idx in sorted(selected_indices)]

    client = OpenAI(api_key=load_openai_key())
    pending = sum(
        1
        for _, grp in target_groups
        if args.force or not all((OUT_DIR / f"{a['stamp_asset_id']}.webp").exists() for a in grp)
    )
    print(
        f"Generating {len(stamps)} series stamps ({len(target_groups)} selected sheets, "
        f"pending={pending}, workers={args.workers})...",
        flush=True,
    )

    if pending > 0:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [
                pool.submit(process_group, client, idx, grp, args.sheet_dir, args.force)
                for idx, grp in target_groups
            ]
            done_count = 0
            for fut in concurrent.futures.as_completed(futures):
                idx, ids = fut.result()
                done_count += 1
                print(
                    f"[{done_count:02d}/{len(target_groups)}] sheet {idx:02d}: {', '.join(ids)}",
                    flush=True,
                )

    series_aliases = 0
    for st in stamps:
        if st["tierIndex"] == 0:
            src = OUT_DIR / f"{st['stamp_asset_id']}.webp"
            dst = OUT_DIR / f"stamp_series_{st['seriesId']}.webp"
            if src.exists():
                shutil.copy2(src, dst)
                series_aliases += 1

    missing = [s["stamp_asset_id"] for s in stamps if not (OUT_DIR / f"{s['stamp_asset_id']}.webp").exists()]
    if missing:
        print(f"Missing generated stamps ({len(missing)}): {missing[:10]}", file=sys.stderr)
        return 1

    print(
        f"All {len(stamps)} series stamps verified on disk and {series_aliases} series fallback aliases synced.",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
