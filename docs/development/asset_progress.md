# 資材制作の進捗

2026-11-13（指定クライアント日付、Asia/Tokyo） / M0–M1 / 第2サイクル。正本 `spec/initial/data/visual_resource_manifest.json` は変更しない。

全248 ID中 47 IDの候補ファイルを制作（SVG39 / ラスター8）。製品全体の資材完成ではない。音源7 IDは未制作。

## アートディレクション

5代表画面をすべて目視し、紙色・森林緑・控えめな朱色、柔らかな水彩と太いシルエットへ統一。参考画面の切り出しは行わず、imagegenで地形・荷物・集配所・更地・住宅地段階1を新規制作した。文字と数値はDOM。

## 原画と書き出し

`public/assets/originals/{id}.generated.png` はimagegen出力を変更せず保存。`{id}.png` は指定寸法の制作キャンバス。寸法正規化とWebP変換はImageMagickで行い、外周のトリミングはしない。PNG・WebPの寸法とアルファ有無を検査。PNGのラスターサイズを正規化しており、生成器が3200×2000の原生解像度を出したとは扱わない。

| ID | 生成器出力 | 指定PNG / WebP | 未検証事項 |
|---|---|---|---|
| terrain_riverside | 1586×992 RGB | 3200×2000 RGB | 水際の厳密座標・港接点。右下の川岸は正本からずれが見えるため要修正。 |
| cargo_parcel | 1254×1254 RGBA | 256×256 RGBA | 足元アンカーの厳密照合 |
| city_hub | 1254×1254 RGBA | 512×512 RGBA | 地図合成・最小48pxでの確認 |
| city_plot_empty | 1448×1086 RGBA | 1024×768 RGBA | 足元アンカーの厳密照合・最小96×72pxでの確認 |
| city_residential_s1 | 1448×1086 RGBA | 1024×768 RGBA | 主屋の厳密範囲・足元アンカーの調整、成長時のみ描画 |

39 SVGは正本のviewBox・透過・ID・出力先に対応。共通UI32 / コース3 / 資源3 / ブランド1。SVGのXML構造とviewBoxを検査。16pxでの線の見え方はブラウザー確認待ち。

## 受入状況

生成画像5枚は単独画像を目視し、主題・可変文字なし・透過を確認。画像が存在することと、指定アンカーへ合成して製品検収済みであることを区別する。terrain_riverside・city_hubはCIのホーム画像、cargo_parcelはゲームUIへ接続済み。ホーム/プレイ/結果のCI画像を統括と独立QAが確認。厳密なアンカー・最小サイズ・経済状態との一致は未検証。terrain_riversideは幾何条件未達の候補として扱い、M1以降の修正対象とする。

## 第2サイクル：配送車両と荷づくりの小単位

2026-11-13（指定クライアント日付、Asia/Tokyo）。対象5 ID：車両2・敷き布1・木の荷づくり台1・既存川沿い地形の修正。新規ランタイム候補は3 ID。画像の生成数や再試行数を独立ID数へ加算しない。

| ID | 状態 | 指定寸法・基準点 | 実施した確認 | 残作業 |
|---|---|---|---|---|
| vehicle_cart_front | 実装済み・未検証 | 256×192 RGBA / (128,160) | 正面寄り、右下(+2,+1)、馬と幌なし荷台、文字なし、地面・影なし。50%不透明の範囲182×124+(35,35) | CI画面合成 |
| vehicle_cart_rear | 実装済み・未検証 | 256×192 RGBA / (128,160) | 背面寄り、右上(+2,-1)、同じ馬・車体。50%不透明の範囲158×143+(48,17) | CI画面合成 |
| equipment_packaging_0 | 実装済み・未検証 | 1200×800 RGBA / (600,680) | 机脚なし、敷き布・包み紙・ひも巻き・荷物1個。背景除去の再編集後にハローなし、50%不透明の範囲1070×380+(65,300) | 設備画面合成 |
| equipment_packaging_1 | 保留・阻害要因あり | 未納品 / (600,680) | 新規生成と背景除去を複数回試行 | 広い茶色のハローが残り、脚間にも背景が残るため不合格。正規ランタイム出力を作成せず、原画をrejectedへ保存 |
| terrain_riverside | 保留・阻害要因あり | 既存候補3200×2000 / 論理1600×1000 | 既存原画をimagegenで編集。港の荷下ろし範囲に水色画素なし（色の近似判定0/3024） | 岸線の厳密座標は不合格。y820で最初の水色x約1211.6（正本1240）、y999で約1084.5（正本1130）。編集候補のみrejectedへ保存、既存ランタイムは変更しない |

原画は `originals/{id}.generated.png` へ変更せず保存。指定寸法への正規化では切り出しを行わず、透過キャンバス上へ配置する。frontは256×192へ縮小。rearは230×173へ縮小して256×192の(13,3)へ配置し、接地を約y160へ合わせる。packaging_0は1080×443へ縮小して1200×800の(60,264)へ配置し、布の不透明な下端をy679に合わせる。PNGとWebPは同じ寸法・アルファを保持し、正規化PNGは8bit RGBAとし、WebPは可逆変換。3点のPNGとWebPでアルファの全画素一致と紙色に合成した全画素一致を確認。

生成器の原生寸法は車両各1448×1086、敷き布1958×803。原生寸法と正規化寸法を区別する。車両48×36・24×18と敷き布240×160の静止縮小表示を紙色へ合成して目視。馬車の前後と敷き布の主題を確認した。これは実行中のブラウザー画面合成を代替しない。

独立QA（Agent F）は3点の寸法・アルファ・最小表示の前後形状と敷き布を確認。rearの透過範囲が安全域y16より1px上へ出る指摘を受け、配置をy2→y3へ修正。再検査のアルファ範囲は(47,16)〜(206,160)で安全域内。3点は単体静止検収を通過し、ゲーム内の実行画面合成は引き続き未検証。地形は改善度だけで合格扱いせず、既存ランタイムを維持する判断を独立QAと一致させた。

不合格原画：`originals/rejected/equipment_packaging_1.halo.png`、`originals/rejected/terrain_riverside.coastline-attempt.png`。これらは制作済みの正規出力として集計しない。

## 全ID台帳

| ID | 制作 | 単体検収 | 統合 | 出力 |
|---|---|---|---|---|
| stamp_a01 | 未着手 | — | 未検証 | — |
| stamp_a02 | 未着手 | — | 未検証 | — |
| stamp_a03 | 未着手 | — | 未検証 | — |
| stamp_a04 | 未着手 | — | 未検証 | — |
| stamp_a05 | 未着手 | — | 未検証 | — |
| stamp_a06 | 未着手 | — | 未検証 | — |
| stamp_b01 | 未着手 | — | 未検証 | — |
| stamp_b02 | 未着手 | — | 未検証 | — |
| stamp_b03 | 未着手 | — | 未検証 | — |
| stamp_b04 | 未着手 | — | 未検証 | — |
| stamp_b05 | 未着手 | — | 未検証 | — |
| stamp_b06 | 未着手 | — | 未検証 | — |
| stamp_c01 | 未着手 | — | 未検証 | — |
| stamp_c02 | 未着手 | — | 未検証 | — |
| stamp_c03 | 未着手 | — | 未検証 | — |
| stamp_c04 | 未着手 | — | 未検証 | — |
| stamp_c05 | 未着手 | — | 未検証 | — |
| stamp_c06 | 未着手 | — | 未検証 | — |
| stamp_d01 | 未着手 | — | 未検証 | — |
| stamp_d02 | 未着手 | — | 未検証 | — |
| stamp_d03 | 未着手 | — | 未検証 | — |
| stamp_d04 | 未着手 | — | 未検証 | — |
| stamp_d05 | 未着手 | — | 未検証 | — |
| stamp_d06 | 未着手 | — | 未検証 | — |
| stamp_e01 | 未着手 | — | 未検証 | — |
| stamp_e02 | 未着手 | — | 未検証 | — |
| stamp_e03 | 未着手 | — | 未検証 | — |
| stamp_e04 | 未着手 | — | 未検証 | — |
| stamp_e05 | 未着手 | — | 未検証 | — |
| stamp_e06 | 未着手 | — | 未検証 | — |
| stamp_f01 | 未着手 | — | 未検証 | — |
| stamp_f02 | 未着手 | — | 未検証 | — |
| stamp_f03 | 未着手 | — | 未検証 | — |
| stamp_f04 | 未着手 | — | 未検証 | — |
| stamp_f05 | 未着手 | — | 未検証 | — |
| stamp_f06 | 未着手 | — | 未検証 | — |
| stamp_g01 | 未着手 | — | 未検証 | — |
| stamp_g02 | 未着手 | — | 未検証 | — |
| stamp_g03 | 未着手 | — | 未検証 | — |
| stamp_g04 | 未着手 | — | 未検証 | — |
| stamp_g05 | 未着手 | — | 未検証 | — |
| stamp_g06 | 未着手 | — | 未検証 | — |
| stamp_h01 | 未着手 | — | 未検証 | — |
| stamp_h02 | 未着手 | — | 未検証 | — |
| stamp_h03 | 未着手 | — | 未検証 | — |
| stamp_h04 | 未着手 | — | 未検証 | — |
| stamp_h05 | 未着手 | — | 未検証 | — |
| stamp_h06 | 未着手 | — | 未検証 | — |
| stamp_i01 | 未着手 | — | 未検証 | — |
| stamp_i02 | 未着手 | — | 未検証 | — |
| stamp_i03 | 未着手 | — | 未検証 | — |
| stamp_i04 | 未着手 | — | 未検証 | — |
| stamp_i05 | 未着手 | — | 未検証 | — |
| stamp_i06 | 未着手 | — | 未検証 | — |
| stamp_j01 | 未着手 | — | 未検証 | — |
| stamp_j02 | 未着手 | — | 未検証 | — |
| stamp_j03 | 未着手 | — | 未検証 | — |
| stamp_j04 | 未着手 | — | 未検証 | — |
| stamp_j05 | 未着手 | — | 未検証 | — |
| stamp_j06 | 未着手 | — | 未検証 | — |
| stamp_k01 | 未着手 | — | 未検証 | — |
| stamp_k02 | 未着手 | — | 未検証 | — |
| stamp_k03 | 未着手 | — | 未検証 | — |
| stamp_k04 | 未着手 | — | 未検証 | — |
| stamp_k05 | 未着手 | — | 未検証 | — |
| stamp_k06 | 未着手 | — | 未検証 | — |
| stamp_l01 | 未着手 | — | 未検証 | — |
| stamp_l02 | 未着手 | — | 未検証 | — |
| stamp_l03 | 未着手 | — | 未検証 | — |
| stamp_l04 | 未着手 | — | 未検証 | — |
| stamp_l05 | 未着手 | — | 未検証 | — |
| stamp_l06 | 未着手 | — | 未検証 | — |
| family_a | 未着手 | — | 未検証 | — |
| postcard_a | 未着手 | — | 未検証 | — |
| family_b | 未着手 | — | 未検証 | — |
| postcard_b | 未着手 | — | 未検証 | — |
| family_c | 未着手 | — | 未検証 | — |
| postcard_c | 未着手 | — | 未検証 | — |
| family_d | 未着手 | — | 未検証 | — |
| postcard_d | 未着手 | — | 未検証 | — |
| family_e | 未着手 | — | 未検証 | — |
| postcard_e | 未着手 | — | 未検証 | — |
| family_f | 未着手 | — | 未検証 | — |
| postcard_f | 未着手 | — | 未検証 | — |
| family_g | 未着手 | — | 未検証 | — |
| postcard_g | 未着手 | — | 未検証 | — |
| family_h | 未着手 | — | 未検証 | — |
| postcard_h | 未着手 | — | 未検証 | — |
| family_i | 未着手 | — | 未検証 | — |
| postcard_i | 未着手 | — | 未検証 | — |
| family_j | 未着手 | — | 未検証 | — |
| postcard_j | 未着手 | — | 未検証 | — |
| family_k | 未着手 | — | 未検証 | — |
| postcard_k | 未着手 | — | 未検証 | — |
| family_l | 未着手 | — | 未検証 | — |
| postcard_l | 未着手 | — | 未検証 | — |
| reward_frame_leaf | 未着手 | — | 未検証 | — |
| reward_tree_ornament | 未着手 | — | 未検証 | — |
| reward_frame_plaza | 未着手 | — | 未検証 | — |
| reward_fountain_ornament | 未着手 | — | 未検証 | — |
| reward_album_24_emblem | 未着手 | — | 未検証 | — |
| reward_celebration_postcard | 未着手 | — | 未検証 | — |
| reward_evening_panel | 未着手 | — | 未検証 | — |
| reward_frame_sunset | 未着手 | — | 未検証 | — |
| reward_board_48_emblem | 未着手 | — | 未検証 | — |
| reward_first_collection_emblem | 未着手 | — | 未検証 | — |
| reward_first_collection_stamp_art | 未着手 | — | 未検証 | — |
| reward_frame_journey | 未着手 | — | 未検証 | — |
| reward_expanded_album_emblem | 未着手 | — | 未検証 | — |
| reward_complete_72_emblem | 未着手 | — | 未検証 | — |
| reward_collection_stamp_art | 未着手 | — | 未検証 | — |
| district_residential | 未着手 | — | 未検証 | — |
| shop_residential | 未着手 | — | 未検証 | — |
| city_plot_empty | 実装済み・未検証 | 寸法・形式確認、目視済み | 未検証 | `assets/city_plot/city_plot_empty.webp` |
| city_residential_s1 | 実装済み・未検証 | 寸法・形式確認、目視済み | 未検証 | `assets/city_stage/city_residential_s1.webp` |
| city_residential_s2 | 未着手 | — | 未検証 | — |
| city_residential_s3 | 未着手 | — | 未検証 | — |
| city_residential_s4 | 未着手 | — | 未検証 | — |
| city_residential_s5 | 未着手 | — | 未検証 | — |
| district_market | 未着手 | — | 未検証 | — |
| shop_market | 未着手 | — | 未検証 | — |
| city_market_s1 | 未着手 | — | 未検証 | — |
| city_market_s2 | 未着手 | — | 未検証 | — |
| city_market_s3 | 未着手 | — | 未検証 | — |
| city_market_s4 | 未着手 | — | 未検証 | — |
| city_market_s5 | 未着手 | — | 未検証 | — |
| district_workshop | 未着手 | — | 未検証 | — |
| shop_workshop | 未着手 | — | 未検証 | — |
| city_workshop_s1 | 未着手 | — | 未検証 | — |
| city_workshop_s2 | 未着手 | — | 未検証 | — |
| city_workshop_s3 | 未着手 | — | 未検証 | — |
| city_workshop_s4 | 未着手 | — | 未検証 | — |
| city_workshop_s5 | 未着手 | — | 未検証 | — |
| district_park | 未着手 | — | 未検証 | — |
| shop_park | 未着手 | — | 未検証 | — |
| city_park_s1 | 未着手 | — | 未検証 | — |
| city_park_s2 | 未着手 | — | 未検証 | — |
| city_park_s3 | 未着手 | — | 未検証 | — |
| city_park_s4 | 未着手 | — | 未検証 | — |
| city_park_s5 | 未着手 | — | 未検証 | — |
| district_station | 未着手 | — | 未検証 | — |
| shop_station | 未着手 | — | 未検証 | — |
| city_station_s1 | 未着手 | — | 未検証 | — |
| city_station_s2 | 未着手 | — | 未検証 | — |
| city_station_s3 | 未着手 | — | 未検証 | — |
| city_station_s4 | 未着手 | — | 未検証 | — |
| city_station_s5 | 未着手 | — | 未検証 | — |
| district_harbor | 未着手 | — | 未検証 | — |
| shop_harbor | 未着手 | — | 未検証 | — |
| city_harbor_s1 | 未着手 | — | 未検証 | — |
| city_harbor_s2 | 未着手 | — | 未検証 | — |
| city_harbor_s3 | 未着手 | — | 未検証 | — |
| city_harbor_s4 | 未着手 | — | 未検証 | — |
| city_harbor_s5 | 未着手 | — | 未検証 | — |
| terrain_riverside | 実装済み・未検証 | 寸法・形式確認、目視済み | UI統合済み・CI画像確認、厳密座標は未検証 | `assets/terrain/terrain_riverside.webp` |
| terrain_seaside | 未着手 | — | 未検証 | — |
| terrain_highland | 未着手 | — | 未検証 | — |
| equipment_packaging_0 | 実装済み・未検証 | 寸法・アルファ・背景除去・縮小の独立QA済み | 未検証 | `assets/equipment_scene/equipment_packaging_0.webp` |
| equipment_packaging_1 | 保留・阻害要因あり | 背景ハロー残存で不合格 | 未検証 | — |
| equipment_packaging_2 | 未着手 | — | 未検証 | — |
| equipment_packaging_3 | 未着手 | — | 未検証 | — |
| equipment_packaging_4 | 未着手 | — | 未検証 | — |
| vehicle_cart_front | 実装済み・未検証 | 寸法・アルファ・向き・縮小の独立QA済み | 未検証 | `assets/vehicle/vehicle_cart_front.webp` |
| vehicle_cart_rear | 実装済み・未検証 | 寸法・アルファ・向き・縮小の独立QA済み | 未検証 | `assets/vehicle/vehicle_cart_rear.webp` |
| vehicle_van_front | 未着手 | — | 未検証 | — |
| vehicle_van_rear | 未着手 | — | 未検証 | — |
| vehicle_box_van_front | 未着手 | — | 未検証 | — |
| vehicle_box_van_rear | 未着手 | — | 未検証 | — |
| vehicle_truck_front | 未着手 | — | 未検証 | — |
| vehicle_truck_rear | 未着手 | — | 未検証 | — |
| vehicle_train_front | 未着手 | — | 未検証 | — |
| vehicle_train_rear | 未着手 | — | 未検証 | — |
| shop_canopy | 未着手 | — | 未検証 | — |
| shop_banner | 未着手 | — | 未検証 | — |
| shop_signboard | 未着手 | — | 未検証 | — |
| city_freight_terminal | 未着手 | — | 未検証 | — |
| equipment_packaging_icon | 未着手 | — | 未検証 | — |
| equipment_crews_icon | 未着手 | — | 未検証 | — |
| equipment_shops_icon | 未着手 | — | 未検証 | — |
| equipment_railway_icon | 未着手 | — | 未検証 | — |
| synergy_joint_delivery | 未着手 | — | 未検証 | — |
| synergy_sorting_network | 未着手 | — | 未検証 | — |
| synergy_tourism_service | 未着手 | — | 未検証 | — |
| research_materials | 未着手 | — | 未検証 | — |
| research_logistics | 未着手 | — | 未検証 | — |
| research_commerce | 未着手 | — | 未検証 | — |
| stamp_frame | 未着手 | — | 未検証 | — |
| memorial_frame | 未着手 | — | 未検証 | — |
| board_base | 未着手 | — | 未検証 | — |
| board_foil | 未着手 | — | 未検証 | — |
| album_base | 未着手 | — | 未検証 | — |
| brand_mark | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/brand/brand_mark.svg` |
| city_hub | 実装済み・未検証 | 寸法・形式確認、目視済み | UI統合済み・CI画像確認、厳密座標は未検証 | `assets/city_shared/city_hub.webp` |
| scaffold_small | 未着手 | — | 未検証 | — |
| scaffold_medium | 未着手 | — | 未検証 | — |
| scaffold_large | 未着手 | — | 未検証 | — |
| cargo_parcel | 実装済み・未検証 | 寸法・形式確認、目視済み | UI接続済み・荷物表示検収待ち | `assets/cargo/cargo_parcel.webp` |
| ui_home | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_home.svg` |
| ui_play | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_play.svg` |
| ui_practice | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_practice.svg` |
| ui_dictionary | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_dictionary.svg` |
| ui_handbook | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_handbook.svg` |
| ui_settings | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_settings.svg` |
| ui_lock | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_lock.svg` |
| ui_check | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_check.svg` |
| ui_pin | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_pin.svg` |
| ui_unread | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_unread.svg` |
| ui_info | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_info.svg` |
| ui_warning | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_warning.svg` |
| ui_search | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_search.svg` |
| ui_filter | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_filter.svg` |
| ui_sort | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_sort.svg` |
| ui_back | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_back.svg` |
| ui_chevron | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_chevron.svg` |
| ui_close | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_close.svg` |
| ui_retry | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_retry.svg` |
| ui_pause | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_pause.svg` |
| ui_sound | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_sound.svg` |
| ui_guide | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_guide.svg` |
| ui_text_size | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_text_size.svg` |
| ui_motion | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_motion.svg` |
| ui_more | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_more.svg` |
| ui_question | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_question.svg` |
| ui_clock | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_clock.svg` |
| ui_route | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_route.svg` |
| ui_plan | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_plan.svg` |
| ui_new_city | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_new_city.svg` |
| ui_history | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_history.svg` |
| ui_stop | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/ui_icon/ui_stop.svg` |
| resource_material | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/resource_icon/resource_material.svg` |
| resource_coin | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/resource_icon/resource_coin.svg` |
| resource_blueprint | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/resource_icon/resource_blueprint.svg` |
| course_relaxed | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/course_icon/course_relaxed.svg` |
| course_standard | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/course_icon/course_standard.svg` |
| course_challenge | 実装済み・未検証 | XML・viewBox確認 | 未検証 | `assets/course_icon/course_challenge.svg` |
| topic_daily | 未着手 | — | 未検証 | — |
| topic_food | 未着手 | — | 未検証 | — |
| topic_living | 未着手 | — | 未検証 | — |
| topic_town | 未着手 | — | 未検証 | — |
| topic_nature | 未着手 | — | 未検証 | — |
| topic_people | 未着手 | — | 未検証 | — |
| audio_key | 未着手 | — | 未検証 | — |
| audio_word | 未着手 | — | 未検証 | — |
| audio_dispatch_small | 未着手 | — | 未検証 | — |
| audio_dispatch_medium | 未着手 | — | 未検証 | — |
| audio_dispatch_full | 未着手 | — | 未検証 | — |
| audio_mistake | 未着手 | — | 未検証 | — |
| audio_theme | 未着手 | — | 未検証 | — |
