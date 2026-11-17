# アセット制作進捗（Asset Progress）

最終更新: 2026-11-14

## 制作済み・統合済み資材

- **SVG資材（92/92点）**: `public/assets/` 配下へ全点生成済み（ブランドロゴ、UIアイコン32、系統紋章12、共通枠5、地区アイコン6、題材アイコン6、設備アイコン4、コースアイコン3、研究アイコン3、資源アイコン3、連携アイコン3、店舗増設パーツ3、節目装飾11）。
- **効果音（6/6点）**: `public/assets/sound_effect/` 配下へWAV形式で生成済み（`audio_key`, `audio_word`, `audio_dispatch_small`, `audio_dispatch_medium`, `audio_dispatch_full`, `audio_mistake`）。
- **ラスター原画・スプライト（133点生成済み）**:
  - `public/assets/raster/`: 基本地形・拠点・店舗・荷物・初期車両25点
  - `public/assets/achievement_stamp/`（72/72点）: `stamp_a01.webp`〜`stamp_l06.webp`（`gpt-image-2.6-flare` による3×2コンタクトシート×12枚から512×512 WebPへ切り出し、`handbookScreen.ts`・`resultScreen.ts` へ統合済み）
  - `public/assets/postcard/`（12/12点）: `postcard_a.webp`〜`postcard_l.webp`（2×2コンタクトシート×3枚から1600×1000 WebPへ切り出し、`handbookScreen.ts` へ統合済み）
  - `public/assets/sprites/`（地区段階・車両スプライト追加）:
    - 全6地区の Stage 1〜5（30/30点: 今回 `residential_stage_2,4` と他5地区の `stage_2,4,5` 計17点を3×2コンタクトシート×3枚から透過PNG生成し、`src/ui/utils/format.ts` の `getDistrictBuildingSprite` で1〜5段階すべてを解決）
    - 車両スプライト（10/10点: 今回未生成の `vehicle_cart_rear`, `vehicle_van_rear`, `vehicle_box_van_front/rear`, `vehicle_truck_front/rear`, `vehicle_train_rear` 計7点を2×2コンタクトシート×2枚から透過PNG生成）

## 残りの未生成ラスター

- 節目ラスター4点（`reward_celebration_postcard`, `reward_evening_panel`, `reward_first_collection_stamp_art`, `reward_collection_stamp_art`）、設備段階画（`equipment_packaging_0,2,3,4`）、足場段階差分（`scaffold_small/medium/large`）。
