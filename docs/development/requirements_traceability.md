# 仕様対応表

2026-11-14 JST改訂。統合候補 `a3fca16` の実装・試験ソースと、以下の実行済み証拠へ照合した全節索引。**実装済**はコードの存在、**単体**は純粋ロジック/データ検査、**実E2E**は実ブラウザー操作、**未実機**は物理OS/IME/端末の未確認、**未検収**は最終体験/美術/全件受入の残りを示す。一つの節に複数の段階が併存する。節全体の完了率は推測しない。現在の統合候補を、配信済Sites保存版7や過去CIのsourceと同一視しない。

## 証拠索引（sourceと実行を分離）

| 記号 | 実行・source | 検証した範囲と限界 |
|---|---|---|
| E1 | [CI43493429446](https://github.com/mokusatsu/kotobabin/actions/runs/43493429446)、`ae1bb785fbc01a61ca0e3316e40a6dba45d9e6ad`、success | 294単体・74機能E2E、静的本番の独立Chromium/WebKit各2・音声各3。§ごとの根拠は該当tests名を併記。現在の追加83例の成功ではない。 |
| E2 | [CI43486057406](https://github.com/mokusatsu/kotobabin/actions/runs/43486057406)、`6b8900b` | 全画面配送・地図・個別結果のM5受入。残存Space問題が後に再現しPR19→E1で再検証された履歴を維持。[独立レビュー](reviews/sakurai-game-stage.md)。 |
| E3 | [M6 CI43496071029](https://github.com/mokusatsu/kotobabin/actions/runs/43496071029)、`032bf00` | Chromium4/4、WebKit4/4：実画像要求失敗・初回読込後offline・IDB拒否・core失敗→keyboard再読込。fresh offline起動/実OS privacyモードは保証しない。 |
| E4 | [M6 CI43505778109](https://github.com/mokusatsu/kotobabin/actions/runs/43505778109)、`c318b701794aeec4cf6b9838a381a184ab578f0d` | native logsを独立取得。Chromium4/4(13.0s)、WebKit4/4(23.3s)。失敗画像のclass/非表示/残る枠も検査。`3ea7ed5`はsummaryのpreviewから開封場面へ検査位置を強化。後続`a3fca16`の[43506207992](https://github.com/mokusatsu/kotobabin/actions/runs/43506207992)も実Chromium4/4(9.1s)・WebKit4/4(30.9s)成功をnative logsで確認。 |
| E5 | [Firefox43500330798](https://github.com/mokusatsu/kotobabin/actions/runs/43500330798) `645b025`、[43501588274](https://github.com/mokusatsu/kotobabin/actions/runs/43501588274) `410a0bb` | Linux Firefox159の独立自然90秒2/2と音声3/3。無音runnerのnative resume停止を実OS PulseAudio sinkで解消。Windows Firefox/IME・実聴取の証拠ではない。[詳細](m6-coverage-audit.md)。 |
| E6 | [都市CI43499932487](https://github.com/mokusatsu/kotobabin/actions/runs/43499932487)、`968e456`（先行`8fa0db9`はendpoint不足でskip） | 旧968eは研究select焦点消失で失敗し、当時commerce/最終restart/restoreは未到達。修正後のa3fca16／[43506208050](https://github.com/mokusatsu/kotobabin/actions/runs/43506208050)は両engineとも全6stage5/鉄道・全3研究rank5・再出発・UI backup復元と資源照合を通過後、最終reloadのowner期待／readonly実値で失敗。既存契約に沿うreadonly→明示引継ぎの修正は再実行待ち。[記録](m6-city-acceptance.md)。 |
| E7 | [性能CI43498989069](https://github.com/mokusatsu/kotobabin/actions/runs/43498989069)、測定`567247d`／製品`ff984` | cold20試行は予算内、960語/30履歴の入力243打でhandlerP95=65ms・表示67.7ms・long task51件の未達。別枝修正の数値は通常保存E2Eと統合受入まで同一視しない。標本保存修正`f50d923`も測定対象/閾値を変えない。 |
| E8 | [資材監査](m6-art-audit.md)、[安全域修正](m6-safe-inset-report.md)、[台帳](asset_progress.md)、統合候補`0ba8aaf`以降 | 248 ID候補、寸法/viewBox/参照、修正後missing0/structural0/alphaSafe0。監査時SHA・失敗/修正履歴は報告を正本とする。地形共有岸線・水離隔18px・全縮小合成の最終検収は別。 |
| E9 | `tests/profile/achievements.test.ts`、`tests/achievements/acceptance.test.ts`、`tests/e2e/fixtures/cosmetics.ts` | 全72/追加40の条件実装と単体境界。960語・10便のGameSession事実に**直接構築した都市**を加えたmodel、seedUnlocksの報酬整合性、全72の閲覧fixtureを区別する。通常経済進行・native入力で全72解除した証拠へ読み替えない。 |
| E10 | 統合候補`a3fca163ecfae8bc67d7689b2b9dfe7412490a95`、[通常CI43506207995](https://github.com/mokusatsu/kotobabin/actions/runs/43506207995)、[M6 game43506208050](https://github.com/mokusatsu/kotobabin/actions/runs/43506208050)、[resilience43506207992](https://github.com/mokusatsu/kotobabin/actions/runs/43506207992) | 改訂時点で通常CIは実行中。resilienceは両4/4成功(E4)、M6 gameは独立inventory両job成功だが都市両jobの最終reloadで失敗(E6)。新83例・全40鑑賞/4装着枠・6表示条件の総合受入や全都市工程の成功をまだ加算しない。c318のM6game失敗履歴も保持。 |

## 現在の全節対応

適用変更: 2026-11-14のユーザー指示により、過去互換性と旧版からの移行は対象外（[D012](decisions.md)）。現行バックアップ復元・削除・整合性は対象に残す。

| ID | 正本・節 | 状態 | 実装/試験/画面/資材 |
|---|---|---|---|
| game_experience:11 | [1 体験の目的](../../spec/initial/docs/game_experience.md) | 実装済・実E2E／初見未検収 | GameSession・全画面UI。E1/E2/E5の実90秒と再挑戦。初心者3＋中級者3の観察基準は未実施。 |
| game_experience:17 | [2 配達の基本](../../spec/initial/docs/game_experience.md) | 実装済・単体・実E2E | typing/session、engine、delivery-scene。完成点・荷物損失・manual/full/deadline/skipをtests/typing、integration/typing-city、E1/E2で検証。 |
| game_experience:35 | [3 三つの時間幅](../../spec/initial/docs/game_experience.md) | 実装済・単体・実E2E／体験未検収 | TUTORIAL/MAIN/PRACTICE、即時反応・便・都市。modes.spec、city-ui、独立E2E E1/E2。長期の人による成長・反復偏重は未観察。 |
| game_experience:63 | [4 配達で育つ街](../../spec/initial/docs/game_experience.md) | 実装済・単体・一部実E2E | economy/city・commands・app/runtime。E1の建築/購入、equipment-mapの実取引。全地区終盤はE6で再出発/復元まで到達、最終reload/引継ぎは再検証中。 |
| game_experience:176 | [5 実績の発見と選択](../../spec/initial/docs/game_experience.md) | 実装済・単体・実E2E | profile/achievements、ui/handbook・goal-recommendation。目標・隠し条件・未読をachievements.spec／tablet-keyboardで検査(E1)。全72通常解除の証明ではない。 |
| game_experience:200 | [6 進捗と確定の共通規則](../../spec/initial/docs/game_experience.md) | 実装済・単体・実E2E | 確定事実cursor・mode・暫定・通常完走・救済・途中終了をprofile/achievements、achievement-eventsとachievements.specで検査(E1)。 |
| game_experience:240 | [7 実績全72件](../../spec/initial/docs/game_experience.md) | 72条件実装・単体／一部実E2E | A〜Lをcatalogとreducerに接続。境界・モード・同時報酬を単体検査。E9の合成都市/seedと通常プレイ全72解除は区別する。 |
| game_experience:388 | [8 切手と街の報酬](../../spec/initial/docs/game_experience.md) | 実装済・単体／新UI実E2E待ち | 切手72・称号72・追加40報酬、独立4装着枠。cosmetics/reward-art単体、M6閲覧fixtureの6表示条件はE10で実行中。全報酬通常獲得・全美術検収は未了。 |
| game_experience:432 | [9 通知と解除演出](../../spec/initial/docs/game_experience.md) | 実装済・単体・実E2E | GameAudio・result-stageの確定ID個別開封/短縮・結果のみ通知。E1/E2/E5、scoreの残存Space/SはPR19後E1で再検証済。 |
| game_experience:458 | [10 本編と練習の接続](../../spec/initial/docs/game_experience.md) | 実装済・単体・実E2E | catalogue/PRACTICE、3回資格→指定語MAIN、復習。modes・achievements(F04)・tablet-keyboard E1。960語同時DOM表示を要件にしない。 |
| game_experience:506 | [11 体験の合格条件](../../spec/initial/docs/game_experience.md) | 未検収（自動試験は部分対応） | E1/E2の独立エージェント実操作は存在。正本指定の人6名・5/6等の理解/初回配達基準、長期バランスを達成した証拠はない。 |
| game_experience:575 | [12 設計参考資料](../../spec/initial/docs/game_experience.md) | 参照済・適用判断を記録 | decisions、履歴非継承レビューを参照。参考資料の存在は体験合格や実装完了の証拠にしない。 |
| game_experience:592 | [13 実績・発展段階・設備の詳細台帳](../../spec/initial/docs/game_experience.md) | データ実装・単体／最終検収残 | catalog72、district6×stage0..5、equipment全値を実装。価格/集合検査とモデル一致(E1)。全外観・終盤UIはE6/E8/E10の限定を保持。 |
| technical_specification:5 | [1 目的と適用範囲](../../spec/initial/docs/technical_specification.md) | 実装済／全条件未完 | typing/profile/economy/uiの責務分離を実装。§14/17の実機・性能・全件受入は別行で管理。 |
| technical_specification:17 | [2 構成と責務](../../spec/initial/docs/technical_specification.md) | 実装済・単体・実E2E | 静的Vite build、題材同梱、bootstrap、runtime。E3/E4で実core取得失敗→原因/keyboard reload、初期読込後offlineを検証。fresh offline初回は保証外。 |
| technical_specification:38 | [3 採点と記録の共通契約](../../spec/initial/docs/technical_specification.md) | 実装済・単体・実E2E | session・profileで完成点/基準長/正確率/比較keyを分離。960語・20語2070点とtyping-cityの参照trace、E1の得点/再挑戦。 |
| technical_specification:84 | [4 ローマ字判定](../../spec/initial/docs/technical_specification.md) | 実装済・単体・実E2E | RomajiEngineと正本規則。960語の最短長/ガイド経路、撥音/促音/分岐はengine.test。実native文字入力 E1/E5。 |
| technical_specification:145 | [5 キーボード入力と処理順](../../spec/initial/docs/technical_specification.md) | 実装済・単体・実E2E／未実機 | InputAdapterでtrusted操作順序、repeat/paste/合成拒否。input-adapter単体と実browser script、E1/E2。物理長押し/OS由来列は未実機。 |
| technical_specification:184 | [6 IMEと入力環境の確認](../../spec/initial/docs/technical_specification.md) | 実装済・単体・一部実E2E／未実機 | 半角a確認・composition中断・未確定操作。input-adapter/modesとmodes.spec。Win/macOS IME・JIS/US実物は未確認。 |
| technical_specification:212 | [7 時計と一時停止](../../spec/initial/docs/technical_specification.md) | 実装済・単体・実E2E | 90秒monotonicと都市実時間を分離。期限境界・blur重複・pauseをtyping/city-runtime/delivery-scene E1/E2で検証。 |
| technical_specification:232 | [8 状態遷移](../../spec/initial/docs/technical_specification.md) | 実装済・単体・実E2E | HOME/CHECK/TUTORIAL/READY/MAIN/PAUSED/RESULT/PRACTICE、F2・途中終了確認・引継ぎ。modes/profile-ui/result-stage/tablet-keyboard E1。 |
| technical_specification:257 | [9 出題と問題データ](../../spec/initial/docs/technical_specification.md) | 実装済・正本検査・単体・実E2E | 960語・3コース・固定集合、generator、catalogue。validate_content・engine/profile、modes/profile-ui E1。正本全960とUI集合の一致を検査。 |
| technical_specification:392 | [10 実行中データと永続化](../../spec/initial/docs/technical_specification.md) | 実装済・単体・実IDB E2E | ProfileRepositoryの原子更新/ownership/epoch/generation、現行backup/reset。persistence/restore/reset/runtime-restore E1。旧版互換性・移行はD012で対象外。 |
| technical_specification:446 | [11 実績イベントと解除の確定](../../spec/initial/docs/technical_specification.md) | 実装済・単体・一部実E2E | 全72条件・確定fact・報酬/未読/目標。achievement-events/acceptance/achievementsとE1。E9のfixtureを通常全解除の証拠にしない。 |
| technical_specification:533 | [12 表示と音声の実装条件](../../spec/initial/docs/technical_specification.md) | 実装済・単体・実E2E／実機・最終検収残 | 32/22/24×倍率・固定入力・全画面HUD、PageUp/Down、任意WebAudio。E1/E2/E5、M6装飾UIはE10再検証中。実聴取/読み上げ・全contrastは未確認。 |
| technical_specification:574 | [13 調整可能な値](../../spec/initial/docs/technical_specification.md) | 実装済・データ/モデル検査 | 正本configへ価格・倍率・stage費用・研究を保持。economy fixturesとvalidator E1。人の遊び心地を数値一致で合格にしない。 |
| technical_specification:598 | [14 対応環境と品質目標](../../spec/initial/docs/technical_specification.md) | 一部実E2E／性能未統合・未実機 | E1/E5でLinux3engine、E3/E4で縮退。E7入力P95失敗→別枝修正中。物理対象/前世代/200%browser zoom/全contrast/Sites転送は未確認。 |
| technical_specification:622 | [15 受入試験](../../spec/initial/docs/technical_specification.md) | 単体・DOM・実E2E／実機未完 | 基礎入力・期限・保存・練習・報酬・経済をE1/E2で実行。各節全件の物理OS/IME試験や人の観察完了とはしない。 |
| technical_specification:738 | [16 街の経済・物流・再出発](../../spec/initial/docs/technical_specification.md) | 実装済・単体・一部実E2E | micro整数・原子台帳・2時計・offline上限・全投資/再出発。commands/typing-cityとE1。全6終盤→restart/restoreはE6で到達、最終reload/引継ぎは再検証中。旧版移行だけ対象外。 |
| technical_specification:890 | [17 実装の完了条件](../../spec/initial/docs/technical_specification.md) | 未完（部分受入を保持） | 実装/単体/DOM/実browserの証拠を下記に分離。物理OS/IME・人の基準・性能統合・全資材検収は未完、Goal全体完了を主張しない。 |
| technical_specification:898 | [18 技術参考資料](../../spec/initial/docs/technical_specification.md) | 参照済・適用判断を記録 | API・入力/保存/アクセシビリティの参考。参考資料の列挙を実行済み試験へ加算しない。 |
| technical_specification:918 | [19 美術資材とゲーム状態の接続](../../spec/initial/docs/technical_specification.md) | 接続実装・機械検査／実E2E・美術検収部分 | 248 ID候補とruntime参照、地区/設備/報酬を接続。E8の構造/安全域検査とE10の画面試験を分離。共有岸線・18px離隔等は未検収。 |
| screen_design:7 | [1 見た目と読みやすさ](../../spec/initial/docs/screen_design.md) | 実装済・実E2E／未実機・美術検収残 | ゲーム全画面/HUDへD013〜D015を適用。E1/E2で2高さ×3倍率fit・focus。原画/contrast全件と物理iPadは未検収。 |
| screen_design:28 | [2 画面と判断の役割](../../spec/initial/docs/screen_design.md) | 実装済・実E2E | F2でHOME/街/設備/手帳/図鑑/設定、Esc戻り・modal focus。tablet-keyboard/navigation E1、独立E2/E5。 |
| screen_design:43 | [3 ホームと街の地図](../../spec/initial/docs/screen_design.md) | 実装済・実E2E | world-stage全体図・native地区選択→全域zoom・行き先/開始dock。world-stage E1/E2、装飾gallery追加後はE10待ち。 |
| screen_design:55 | [4 街の設備](../../spec/initial/docs/screen_design.md) | 実装済・単体・実E2E | city/equipmentと見積再確認。equipment-mapの実購入でmap geometry変化・保存 E1。全研究/鉄道/再出発はE6で到達、最終reloadまでの成功とはしない。 |
| screen_design:74 | [5 本編](../../spec/initial/docs/screen_design.md) | 実装済・単体・実E2E | delivery-sceneのFIFO出荷/移動/実到着、透明出題HUD・固定入力。delivery-scene/input-geometry E1/E2。E7性能未統合。 |
| screen_design:107 | [6 結果](../../spec/initial/docs/screen_design.md) | 実装済・単体・実E2E | result-stage独立score→sealed→実ID reveal→summary、Enter/Tab明示開始とEsc/S短縮。result-stage E1、独立E2/E5。 |
| screen_design:119 | [7 配達手帳](../../spec/initial/docs/screen_design.md) | 実装済・単体・一部実E2E | handbook72件・進捗・目標・未読・隠し・報酬。achievements E1。M6全40鑑賞/4装着/albumページは表示fixture E10検証中。 |
| screen_design:144 | [8 ことば図鑑と練習](../../spec/initial/docs/screen_design.md) | 実装済・単体・実E2E | catalogue960・分類/集合filter・練習repeat/next/3回資格。modes/achievements/tablet-keyboard E1。 |
| screen_design:152 | [9 街の詳細、帰還、再出発](../../spec/initial/docs/screen_design.md) | 実装済・単体・部分実E2E | city/runtimeの帰還・offline cap・明示再出発、restore。runtime-city E1。終盤の再出発・復元はE6で到達、最終reload/引継ぎは再試験待ち。 |
| screen_design:162 | [10 幅、状態、実装へ渡すもの](../../spec/initial/docs/screen_design.md) | 実装済・実E2E／実機未確認 | 狭幅本編の案内、1280以下F2、1180×720/820×100/125/150、操作矩形とscroll0をE1で検証。実browser200%zoomは未確認。 |
| screen_design:180 | [11 代表画像と同一プロフィールの数値例](../../spec/initial/docs/screen_design.md) | 参照・数値モデル検査／最終画面未検収 | canonical同一profile数値と経済fixtureを照合。代表画像と最新全画面HUDの厳密な全件外観受入はE8/E10に残す。 |
| screen_design:218 | [12 美術制作の指示](../../spec/initial/docs/screen_design.md) | 制作候補あり／最終検収残 | 原画とruntimeを248 ID台帳へ保持(E8)。候補存在・機械検査を共有岸線/最小識別/全合成の合格にしない。 |
| screen_design:230 | [13 設計参考資料](../../spec/initial/docs/screen_design.md) | 参照済・適用判断を記録 | 決定D013〜D015・独立skillレビューを参照。参考資料を合格件数へ加算しない。 |
| screen_design:237 | [14 個別資材と画面状態](../../spec/initial/docs/screen_design.md) | 接続実装・単体／一部実E2E・未検収 | 実経済count→車/包装/店舗帯/鉄道/研究/連携を接続。district-map/equipment-visuals、equipment-map E1。新全資材E10待ち。 |
| achievement_catalog:9 | [1 件数と対象の読み方](../../spec/initial/docs/achievement_catalog.md) | データ実装・検査 | 72条件/12系統・40追加報酬のID/対象をcatalogとvalidatorで照合(E1)。 |
| achievement_catalog:31 | [2 全72実績](../../spec/initial/docs/achievement_catalog.md) | 72条件実装・単体／一部実E2E | profile/achievements・achievement-events・境界/モード受入。E9は合成都市を含む。実native72件全解除という主張はしない。 |
| achievement_catalog:1031 | [3 12系統の追加報酬](../../spec/initial/docs/achievement_catalog.md) | 実装済・単体／表示実E2E待ち | 3枚postcard/6枚foilを72と別countで付与。seed報酬検査は条件達成証拠と別。全系統実画像はE10閲覧fixture。 |
| achievement_catalog:1050 | [4 追加報酬40項目の全件表](../../spec/initial/docs/achievement_catalog.md) | 40報酬実装・単体／実E2E部分 | threshold48とA-H第1集48を分離、184所有数の整合性。reward-art/cosmetics、実fixtureの全40表示 E10検証中。 |
| achievement_catalog:1118 | [5 報酬を表示する場面](../../spec/initial/docs/achievement_catalog.md) | 実装済・単体・部分実E2E | 4装着枠と鑑賞物、HOME/handbook専用gallery。reward-art/cosmetics単体、新6条件実画面E10待ち。地図装飾と機能設備を区別。 |
| achievement_catalog:1126 | [設計根拠](../../spec/initial/docs/achievement_catalog.md) | 参照済 | 正本catalogと設計根拠を参照。通常の全条件到達・理解の受入は別判定。 |
| city_development_catalog:9 | [1 地区の開通条件](../../spec/initial/docs/city_development_catalog.md) | 実装済・単体・部分実E2E | 6地区開通前提をcommands/cityで検査。初回住宅地E1、全地区進行E6。 |
| city_development_catalog:22 | [2 全36段階](../../spec/initial/docs/city_development_catalog.md) | 実装済・単体／実E2E・美術検収部分 | 6×stage0..5の正本値・図を接続。E1更地/建設/建物、E6全6stage5到達の証拠。全原画幾何はE8未検収。 |
| city_development_catalog:158 | [3 建築状態と店舗・鉄道の独立](../../spec/initial/docs/city_development_catalog.md) | 実装済・単体・実E2E | plan予約/停止/自由在庫と店/鉄道の独立。city-ui、equipment-map E1、commandsで重複/失敗原子性。 |
| city_development_catalog:175 | [4 景観3種](../../spec/initial/docs/city_development_catalog.md) | 実装済・モデル／景観検収部分 | 3landscape選択・再出発・world/配送場面反映。源コードあり、実UI再出発/復元後のreloadはE6再試験、岸線/18pxはE8未達。 |
| city_development_catalog:185 | [5 街に必要な原画](../../spec/initial/docs/city_development_catalog.md) | 全候補あり／機械検査・未検収 | 全30建物/6代表店・地形3を登録。E8で構造検査、共有座標・最小識別・全合成は部分検収。 |
| city_development_catalog:198 | [設計根拠](../../spec/initial/docs/city_development_catalog.md) | 参照済 | 正本段階/資材マスター参照。候補数で最終合格を推定しない。 |
| equipment_catalog:9 | [1 設備の役割と購入](../../spec/initial/docs/equipment_catalog.md) | 実装済・単体・実E2E | quote1/10/max・価格再確認・原子命令・map反映。equipment-map E1。 |
| equipment_catalog:22 | [2 荷づくり台の全レベル](../../spec/initial/docs/equipment_catalog.md) | 全値実装・単体・部分実E2E | packaging0..50価格/倍率、外観帯とcapacity rack。Python価格fixtureと7→8等実購入 E1。M6包装原画追加はE10検収待ち。 |
| equipment_catalog:80 | [3 配送班の全所有数と価格](../../spec/initial/docs/equipment_catalog.md) | 全値実装・単体・部分実E2E | crews0..50、無料初期を有償countへ含めない。beyondcap実購入・map差分/保存 E1、車種前後はE10。 |
| equipment_catalog:146 | [4 店舗の全所有数と価格](../../spec/initial/docs/equipment_catalog.md) | 全値実装・単体・部分実E2E | shops0..50・累積価格/営業・10/25/50帯。beyondcap実購入 E1、全原画合成E8/E10。 |
| equipment_catalog:223 | [5 貨物鉄道6路線](../../spec/initial/docs/equipment_catalog.md) | 実装済・単体・一部実E2E | 全6railway値と対象別route。E1住宅地実購入、E6全6実購入到達、復元後の最終reload/引継ぎ再試験。 |
| equipment_catalog:238 | [6 連携設備3種](../../spec/initial/docs/equipment_catalog.md) | 実装済・単体・実E2E部分 | joint_delivery/sorting_network/tourism_serviceの前提・効果/一意購入。commands全3、equipment-map実連携 E1。 |
| equipment_catalog:248 | [7 恒久研究の全18状態](../../spec/initial/docs/equipment_catalog.md) | 全18状態実装・単体／終盤実E2E部分 | 3branch×rank0..5。単体全値とE1材料rank1..3。E6で全3branch rank5とrestart/restoreに到達、最終reload/引継ぎは再検証中。 |
| equipment_catalog:273 | [8 外観を何枚作るか](../../spec/initial/docs/equipment_catalog.md) | 全候補・接続／美術検収残 | 車種/包装/店舗帯/railを経済stateで合成。E8/E10。全所有数を50別原画として加算しない。 |
| equipment_catalog:287 | [設計根拠](../../spec/initial/docs/equipment_catalog.md) | 参照済 | 価格と外観帯の正本参照。実数値と人の体験調整を分ける。 |
| content_catalog:7 | [1 納品する資材](../../spec/initial/docs/content_catalog.md) | データ実装・正本検査 | 960語JSON・規則・固定集合を同梱。validate_content、engine tests E1。 |
| content_catalog:23 | [2 原稿と難度の考え方](../../spec/initial/docs/content_catalog.md) | データ実装・単体／人の検収残 | 3course240/300/420、canonicalLengthで生成。分類/難度データ検査あり、初心者/中級者の編集品質観察は未完。 |
| content_catalog:47 | [3 入力要素と練習の幅](../../spec/initial/docs/content_catalog.md) | 実装済・単体・実E2E | 分岐/促音/撥音/長音と各course・練習。engine、modes/profile-ui E1。物理IME経路は未実機。 |
| content_catalog:63 | [4 導入3語と試作30語](../../spec/initial/docs/content_catalog.md) | 実装済・単体・実E2E | 導入短語・試作30は同じ960から参照。tutorial成功/失敗救済 E1。別問題集を作らない。 |
| content_catalog:108 | [5 固定集合と実績・変更時の扱い](../../spec/initial/docs/content_catalog.md) | 実装済・単体・実E2E部分 | E04初版240とL03全960/各course集合、版keyを分離。profile境界とcatalogue E1。旧版データ互換性は対象外。 |
| content_catalog:142 | [6 全960件・分類別一覧](../../spec/initial/docs/content_catalog.md) | 全960実装・単体／実UI集合検査 | 960全ガイド/基準長/ID、固定集合を全件検査 E1。E7のqualified960 filter実行と72view計測は性能合格とは別。 |
| resource_implementation:7 | [1 正本と資材の引き方](../../spec/initial/docs/resource_implementation.md) | 参照接続実装・正本検査 | ID→manifest→runtime pathsをvalidatorと明示表で接続(E1/E8)。巨大制作manifestはruntimeへ同梱しない。 |
| resource_implementation:19 | [2 原画と最小表示の契約](../../spec/initial/docs/resource_implementation.md) | 全候補・機械検査／最終検収残 | 149raster/92SVG/7audio。source_size/alpha/viewBoxと原画保持 E8。最小表示・足元・連続成長・全合成の最終受入は別。 |
| resource_implementation:73 | [3 地図の共通座標と接続](../../spec/initial/docs/resource_implementation.md) | 実装済・実E2E部分／岸線未検収 | world→全地区zoom・delivery pathをE1/E2で実操作。E8で共有岸線と18px水離隔未達を保持。 |
| resource_implementation:145 | [4 実績の状態合成](../../spec/initial/docs/resource_implementation.md) | 実装済・単体・実E2E部分 | earned/hidden/target/unread/equippedをDOMとstamp frameで合成。E1の実解除、E10の全72表示fixtureは別証拠。 |
| resource_implementation:173 | [5 地区と設備の状態合成](../../spec/initial/docs/resource_implementation.md) | 実装済・単体・実E2E部分 | district-map/coreとequipment-visuals、計画/paused/店舗/crew/rail/研究/連携。E1実取引、追加原画E10検証中。 |
| resource_implementation:195 | [6 動きの通常・軽減と音](../../spec/initial/docs/resource_implementation.md) | 実装済・単体・実E2E／未聴取 | FIFO実到着・reduced motion・音mute/MP3fallback。E1/E2/E5。OS sinkを持つFirefox実decodeは人の音質聴取と別。 |
| resource_implementation:223 | [7 追加画像を作らない表示](../../spec/initial/docs/resource_implementation.md) | 実装済・単体・実E2E部分 | 文字・価格・進捗・50段階capacityをDOM/SVG geometry合成。equipment-map E1。焼込み画像数で状態数を増やさない。 |
| resource_implementation:240 | [8 制作後の検収](../../spec/initial/docs/resource_implementation.md) | 機械検査・実E2E部分／未検収あり | E8のmissing/structural/alpha0は候補の技術検査。E10の現UI合成、独立レビュー、正本全幾何・最小識別は未検収を保持。 |
| resource_implementation:257 | [設計根拠](../../spec/initial/docs/resource_implementation.md) | 参照済 | 正本マスターと制作/変換履歴を参照。制作担当の目視と独立実E2Eを混同しない。 |
| visual_resource_inventory:11 | [1 制作点数とファイル数](../../spec/initial/docs/visual_resource_inventory.md) | 全248候補／最終検収残 | 149raster+92SVG+7audio。E8の存在/寸法検査と最終受入数は別。ファイル数や倍率をID数へ加算しない。 |
| visual_resource_inventory:55 | [2 論理バリエーションからの算出](../../spec/initial/docs/visual_resource_inventory.md) | データ実装・正本検査 | 72stamp、6×stage0..5、外観帯と644価格セル等をvalidatorで照合 E1/E8。 |
| visual_resource_inventory:71 | [3 資材台帳・全件](../../spec/initial/docs/visual_resource_inventory.md) | 全参照候補あり・機械検査／未検収 | 全runtime paths存在とsource寸法/viewBox、修正後alphaSafe0 E8。台帳中の古い失敗を隠さず修正報告と対応付ける。 |
| visual_resource_inventory:458 | [4 制作の順序と公開条件](../../spec/initial/docs/visual_resource_inventory.md) | 部分受入・公開条件未完 | M5までのE1/E2を保持。M6候補E10・性能E7・物理対象/人の基準/幾何を最終完了扱いしない。 |
| visual_resource_inventory:468 | [5 参照画像と納品状態](../../spec/initial/docs/visual_resource_inventory.md) | 原画/書出し保持・候補検査 | originalsの原生/要求/不採用/書出し、E8。参考図やcontactsheetを実ブラウザー操作の代理へしない。 |
| visual_resource_inventory:480 | [設計根拠](../../spec/initial/docs/visual_resource_inventory.md) | 参照済 | 正本manifest・制作根拠参照。候補や参考図の存在は全件最終検収ではない。 |

## 過去サイクルの記録（当時の状態）

以下はsource付きの履歴であり、現在の状態は上の全節表と証拠索引を優先する。「未着手」等を現時点の状態へ再利用しない。旧版移行だけは利用者指示に従い現在対象外と明記する。

### 初回の具体的受入項目

| 項目 | 状態 | 根拠 |
|---|---|---|
| 960語の最短入力長とガイド完了 | 検証済み | tests/typing、QA独立全件照合 |
| 仕様20語2070点・42秒境界 | 検証済み | tests/typing、QA独立リプレイ |
| 価格644件・資材生成24組 | 検証済み | tests/economy/reference_fixtures.json、Pythonモデル |
| ブラウザーでM1操作・再挑戦 | 統合済み | tests/e2e/game.spec.ts、CI E2E3件、4画像独立確認 |
| Windows/macOS OS IME・JIS/US配列 | 未着手 | 実機確認必要 |
| 全72実績・報酬の永続化 | 未着手 | M4 |
| 241画像/SVG・音源7点 | 作業中 | asset_progressを参照 |

### 表示契約の更新

初期Issue #4の文字・中間幅・一覧は、その後ゲームステージとHUDへ更新され、E1で実文字100/125/150%・1180×720/820・中間幅/狭幅を検査した。旧「未対応」を現在へ持ち越さない。物理iPad Safari、真のbrowser200%zoom、全contrast、M6装飾/全資材合成の最終検収はなお残る。

### 第2サイクルで検証した具体項目

| 正本の項目 | 状態 | 実装・根拠 |
|---|---|---|
| 導入の実発送成功/3語失敗救済 | 検証済み | GameSession、src/ui、typing/modes.test.ts、modes.spec.ts |
| 図鑑960語・固定集合と練習3回資格 | 検証済み | src/profile、src/ui/catalogue.ts、modes.spec.ts・profile-ui.spec.ts |
| 救済スキップとガイド表示履歴 | 検証済み | GameSession・UI、modes.spec.ts・layout-settings.spec.ts |
| 設定/語別進捗/記録の原子保存 | 検証済み | ProfileRepository、repository.test.ts・persistence.spec.ts |
| 複数タブのreadonly/epochと控え | 検証済み | ProfileRepository・AppRuntime、runtime.test.ts・profile-ui.spec.ts |
| 旧版移行 | 対象外（D012） | 利用者が過去互換性をすべて除外。現行backup/resetは上表の対象に残す |
| 補助文字16px・狭い地図の一覧・150% | 検証済み | style.css・UI、layout-settings.spec.ts。125%実画面は未検証 |
| 経済全投資の数値 | 検証済み | CityEconomy、Python4シナリオ39操作。画面/台帳は別 |
| 全72実績/報酬、街を含む保存 | 未着手 | 次のM3/M4接続 |

第2サイクルの検証CIは43448078577（コード479cbb8）。節全体や製品全体の完了率は算出していない。

### 第3サイクル

| 項目 | 状態 | 実装・根拠 |
|---|---|---|
| 投資命令の一意性・見積再確認 | 検証済み | economy/commands.ts、commands.test.ts、city-persistence.spec.ts |
| 生成/到着/予約/自由在庫/時計の保存 | 検証済み | app/runtime.ts、city-runtime.test.ts、runtime-city.spec.ts |
| 最初の建物・営業・設備購入 | 検証済み | ui/city.ts、city-ui.spec.ts |
| 再出発・鉄道・全研究の数値 | 検証済み | city.test.ts、commands.test.ts。全画面検収は未了 |
| 街とプロフィールの原子更新/削除世代 | 検証済み | mutateDocument、repository.test.ts、reset-persistence.spec.ts |
| 引継ぎの明示途中終了と新便 | 検証済み | UIとruntime、profile-ui.spec.ts。通常停止復帰は維持 |
| 残りの全資材・全72実績・実IME | 作業中 | asset_progress・Issue #4、次のM4/M5/M6 |

CI43452776448（d8a5425）で142単体と21 E2E成功。コードの存在だけで製品全件の受入完了とはしていない。

### M5 ゲームステージ追記

D013〜D015: 全画面配送、世界→全地区拡大、地図上の建設/全設備、独立した90秒結果と個別実績、キーボード移動、2高さ×3文字倍率。6b8900b CI 43486057406 の74機能E2Eと本番独立2件×2エンジンが受入根拠。実機IME/性能と全資材検収は未完。
