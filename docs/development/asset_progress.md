# アセット制作進捗（Asset Progress）

最終更新: 2026-11-21

## 制作済み・統合済み資材

- **SVG資材（92/92点）**: `public/assets/` 配下へ全点生成済み（ブランドロゴ、UIアイコン32、系統紋章12、共通枠5、地区アイコン6、題材アイコン6、設備アイコン4、コースアイコン3、研究アイコン3、資源アイコン3、連携アイコン3、店舗増設パーツ3、節目装飾11）。
- **効果音（6/6点）**: `public/assets/sound_effect/` 配下へWAV形式で生成済み（`audio_key`, `audio_word`, `audio_dispatch_small`, `audio_dispatch_medium`, `audio_dispatch_full`, `audio_mistake`）。
- **ラスター原画・スプライト（全点生成・統合済み）**:
  - `public/assets/raster/`: 基本地形・拠点・店舗・荷物・初期車両25点
  - `public/assets/achievement_stamp/`（72/72点）: `stamp_a01.webp`〜`stamp_l06.webp`（`gpt-image-2.6-flare` による3×2コンタクトシート×12枚から512×512 WebPへ切り出し、`handbookScreen.ts`・`resultScreen.ts` へ統合済み）
  - `public/assets/postcard/`（12/12点）: `postcard_a.webp`〜`postcard_l.webp`（2×2コンタクトシート×3枚から1600×1000 WebPへ切り出し、`handbookScreen.ts` の `getRewardPreviewAsset` 経由で `reward.asset_refs` による正しいパス解決へ修正・統合済み）
  - `public/assets/milestone_raster/`（4/4点）: `reward_celebration_postcard.webp`, `reward_evening_panel.webp`, `reward_first_collection_stamp_art.webp`, `reward_collection_stamp_art.webp`（`scripts/generate_remaining_rasters.py` により生成、`handbookScreen.ts` の報酬一覧40件すべてを実在アセットへ統合済み）
  - `public/assets/equipment_scene/`（5/5点）: `equipment_packaging_0.webp`〜`equipment_packaging_4.webp`（3×2コンタクトシートから1200×800 WebPへ切り出し生成済み）
  - `public/assets/construction/`（3/3点）: `scaffold_small.webp`, `scaffold_medium.webp`, `scaffold_large.webp`（2×2コンタクトシートから透過1024×768 WebPへ生成済み）
  - `public/assets/sprites/`（地区段階・車両スプライト）:
    - 全6地区の Stage 1〜5（30/30点: 透過PNG生成済み、`src/ui/utils/format.ts` の `getDistrictBuildingSprite` で1〜5段階すべてを解決）
    - 車両スプライト（10/10点: 透過PNG生成済み）

## 残りの未生成ラスター

- なし（`visual_resource_manifest.json` の全ラスター資材生成完了）。

## 配送実績の改定に伴う再生成対象（完了）

[通常便・追加便の実績と切手の改定案](../../spec/2026-11-21_delivery_achievements_proposal.md)に対応する6絵柄（計9ファイル、すべて `public/assets/achievement_stamp/` 配下）を `scripts/generate_delivery_revision_assets.py` により再生成・差し替え済み。シリーズの2ファイルは同一の絵柄で、表示に使う段階別画像と、同名のシリーズ画像をそろえて更新した。

| 切手 | 対象ファイル | 新しい題材 | 状態 |
| --- | --- | --- | --- |
| B01 | `stamp_b01.webp` | 前半に出発する通常便の荷車 | 生成・差し替え済み |
| B05 | `stamp_b05.webp` | 通常便に続いて出発する追加便 | 生成・差し替え済み |
| B06 | `stamp_b06.webp` | 満載便の出発と、その直後に続く一問 | 生成・差し替え済み |
| 折り返しのお届け | `stamp_series_back_steps_1.webp`、`stamp_series_back_steps.webp` | 前半と後半それぞれのお届け | 生成・差し替え済み |
| 真ん中の追加便 | `stamp_series_between_full_1.webp`、`stamp_series_between_full.webp` | 2台目の通常便と一緒に出る追加便 | 生成・差し替え済み |
| 二十問のお届け | `stamp_series_first_twenty_by_four_1.webp`、`stamp_series_first_twenty_by_four.webp` | 最初の20問で出発する4回の追加便 | 生成・差し替え済み |

## 追加便の進捗マーク（生成・統合済み）

5つの位置で共用するマーク2枚を `public/assets/ui_icon/` 配下へ 128×128 の透過背景正方形 WebP として生成し、プレイ画面に統合済み。iPad横向き相当の表示では、積載数と横に並べて約36〜47pxで表示する。主形と余白を同一ベースから構成して並べた際の位置ずれを防いでいる。

| 状態 | ファイル名 | 絵の要件 | 状態 |
| --- | --- | --- | --- |
| 未点灯 | `public/assets/ui_icon/extra_delivery_mark_empty.webp` | 生成りの封筒に濃い輪郭と折り目を入れ、中央は空ける。 | 生成・統合済み |
| 点灯 | `public/assets/ui_icon/extra_delivery_mark_lit.webp` | 同じ封筒の中央に、深緑の封ろうと太い白のチェックを置く。色を見分けづらくてもチェックで判別できるようにする。 | 生成・統合済み |

5つそろった状態は、点灯画像を5枚並べ、列全体の光と出発表示で示す。進捗の問数と出発の通知はUI側で読み上げる。
