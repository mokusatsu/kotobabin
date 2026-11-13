# 仕様対応表

2026-11-14 JST再棚卸し。M7追記は下記E19以降とm7-acceptance.mdに分ける。以下M6証拠の基準は文書main `d645d9e` と、配信済Sites保存版8の製品source `3c636ff92ec2c83c71653459ab857e2d2d874976` を基準にする。両者の差分はprogress/test_reportの文書のみ。**実装済**、**単体**、**実E2E受入済**、**検証不足**、**既知品質課題**、**未検収**を区別する。物理OS/IME試験は技術§14/15.3/17の明記範囲へ限定し、指定iPadのviewport試験から独自の物理iPad性能gateを作らない。製品・テストソースが同じでも、CI・配信先・合成表示fixtureの証拠範囲を混同しない。

## 過去の証拠索引（初回改訂時点の履歴）

| 記号 | 実行・source | 検証した範囲と限界 |
|---|---|---|
| E1 | [CI43493429446](https://github.com/mokusatsu/kotobabin/actions/runs/43493429446)、`ae1bb785fbc01a61ca0e3316e40a6dba45d9e6ad`、success | 294単体・74機能E2E、静的本番の独立Chromium/WebKit各2・音声各3。§ごとの根拠は該当tests名を併記。現在の追加83例の成功ではない。 |
| E2 | [CI43486057406](https://github.com/mokusatsu/kotobabin/actions/runs/43486057406)、`6b8900b` | 全画面配送・地図・個別結果のM5受入。残存Space問題が後に再現しPR19→E1で再検証された履歴を維持。[独立レビュー](reviews/sakurai-game-stage.md)。 |
| E3 | [M6 CI43496071029](https://github.com/mokusatsu/kotobabin/actions/runs/43496071029)、`032bf00` | Chromium4/4、WebKit4/4：実画像要求失敗・初回読込後offline・IDB拒否・core失敗→keyboard再読込。fresh offline起動/実OS privacyモードは保証しない。 |
| E4 | [M6 CI43505778109](https://github.com/mokusatsu/kotobabin/actions/runs/43505778109)、`c318b701794aeec4cf6b9838a381a184ab578f0d` | native logsを独立取得。Chromium4/4(13.0s)、WebKit4/4(23.3s)。失敗画像のclass/非表示/残る枠も検査。`3ea7ed5`はsummaryのpreviewから開封場面へ検査位置を強化。後続`a3fca16`の[43506207992](https://github.com/mokusatsu/kotobabin/actions/runs/43506207992)も実Chromium4/4(9.1s)・WebKit4/4(30.9s)成功をnative logsで確認。 |
| E5 | [Firefox43500330798](https://github.com/mokusatsu/kotobabin/actions/runs/43500330798) `645b025`、[43501588274](https://github.com/mokusatsu/kotobabin/actions/runs/43501588274) `410a0bb` | Linux Firefox159の独立自然90秒2/2と音声3/3。無音runnerのnative resume停止を実OS PulseAudio sinkで解消。Windows Firefox/IME・実聴取の証拠ではない。[詳細](m6-coverage-audit.md)。 |
| E6 | [都市CI43499932487](https://github.com/mokusatsu/kotobabin/actions/runs/43499932487)、`968e456`（先行`8fa0db9`はendpoint不足でskip） | 旧968eは研究select焦点消失で失敗し、当時commerce/最終restart/restoreは未到達。修正後のa3fca16／[43506208050](https://github.com/mokusatsu/kotobabin/actions/runs/43506208050)は両engineとも全6stage5/鉄道・全3研究rank5・再出発・UI backup復元と資源照合を通過後、最終reloadのowner期待／readonly実値で失敗。当時はreadonly→明示引継ぎ修正の再実行待ちだったが、後続E13で全工程成功。[記録](m6-city-acceptance.md)。 |
| E7 | [性能CI43498989069](https://github.com/mokusatsu/kotobabin/actions/runs/43498989069)、測定`567247d`／製品`ff984` | cold20試行は予算内、960語/30履歴の入力243打でhandlerP95=65ms・表示67.7ms・long task51件の未達。この初回失敗は後続E12の同じ独立suite合格とE11の通常保存回帰成功で更新された。標本保存修正`f50d923`も測定対象/閾値を変えない。 |
| E8 | [資材監査](m6-art-audit.md)、[安全域修正](m6-safe-inset-report.md)、[台帳](asset_progress.md)、統合候補`0ba8aaf`以降 | 248 ID候補、寸法/viewBox/参照、修正後missing0/structural0/alphaSafe0。監査時SHA・失敗/修正履歴は報告を正本とする。当時の地形共有岸線・水離隔18px・全縮小合成の留保は、後続E17の18.0診断/修正履歴と個別美術V4へ更新。 |
| E9 | `tests/profile/achievements.test.ts`、`tests/achievements/acceptance.test.ts`、`tests/e2e/fixtures/cosmetics.ts` | 全72/追加40の条件実装と単体境界。960語・10便のGameSession事実に**直接構築した都市**を加えたmodel、seedUnlocksの報酬整合性、全72の閲覧fixtureを区別する。通常経済進行・native入力で全72解除した証拠へ読み替えない。 |
| E10 | 統合候補`a3fca163ecfae8bc67d7689b2b9dfe7412490a95`、[通常CI43506207995](https://github.com/mokusatsu/kotobabin/actions/runs/43506207995)、[M6 game43506208050](https://github.com/mokusatsu/kotobabin/actions/runs/43506208050)、[resilience43506207992](https://github.com/mokusatsu/kotobabin/actions/runs/43506207992) | 初回改訂時点では通常CIが実行中だった。resilienceは両4/4成功(E4)、M6 gameは独立inventory両job成功だが都市両jobの最終reloadで失敗(E6)。当時は新83例・全40鑑賞/4装着枠・全都市工程を成功加算しなかった。現在は後続E11〜E15の307単体/101機能/各25/配信15で更新し、この失敗履歴自体は保持。 |

## 最新受入の証拠（旧E1〜E10を更新）

旧E1〜E10は失敗・修正の履歴として保持する。現在の判定は次の実行を優先する。GitHub APIでheadSha/全job結論を照合し、E11のverify、E12、E13の都市/復帰、E14の両jobはnative job logsも独立取得した。`329f489`・`bc6752d`と配信sourceの `src/public/spec/tests` 差分が空であることをGitで確認した。

| 記号 | sourceと実行 | 現在受け入れた範囲 |
|---|---|---|
| E11 | 配信source `3c636ff`：[CI43519098385](https://github.com/mokusatsu/kotobabin/actions/runs/43519098385) 全5success、verify job132208525135 | 307単体/33files、101機能E2E(4.4分)、独立本番Chromium/WebKit各2・音声各3。先行同製品tree `329f489adc3c720336c61fd255c1806fa6a98c1b` の[43515540759](https://github.com/mokusatsu/kotobabin/actions/runs/43515540759)も全5success。旧「新83例待ち」「装飾UI待ち」は現在へ持ち越さない。 |
| E12 | `329f489`：[性能43515540738](https://github.com/mokusatsu/kotobabin/actions/runs/43515540738)、job132196471966、2/2(49.0秒) | 960語/30履歴fixtureで242打、handler P95 **5.0ms**・表示 **15.8ms**・long task **0**、72定義・960語filter48.76ms。20coldの開始P95 **570.81ms**、最大wire **732,970bytes**。独立suite/閾値は維持。CIホスト上の実測合格で、物理iPad/8GB内蔵GPUの性能やSites CDNの同一数値を主張しない。 |
| E13 | `329f489`：[都市43515540825](https://github.com/mokusatsu/kotobabin/actions/runs/43515540825)、[復帰43515540841](https://github.com/mokusatsu/kotobabin/actions/runs/43515540841)、[Firefox43515541143](https://github.com/mokusatsu/kotobabin/actions/runs/43515541143)、全success | 都市Chromium/WebKit各1成功(34.6/48.8秒)、全6stage5/6鉄道/3研究5/再出発/UI backup復元/reload readonly→明示引継ぎ。復帰各4成功(10.3/23.0秒)。Firefoxは独立2・native音声3成功。都市の準備は公開commandで構築したfixtureで、全資源を人がnative入力で稼いだ検査ではない。 |
| E14 | `bc6752d73e71fa9c7d83a721fa79ab459aaaa84e`（workflow差分、製品/tests tree同一）：[43516884760](https://github.com/mokusatsu/kotobabin/actions/runs/43516884760)、jobs132200990571/132200990940 | Chromium/WebKit **各25成功**(1.5/1.9分)。1180×720/820、真のfont100/125/150、4枠装着・readonly reload/引継ぎ・鑑賞名と所有状態・操作矩形/重なり等。定常配置の受入であり、手帳の全瞬間の寸法一致を保証しない。 |
| E15 | 保存版8（製品 `3c636ff`）：[配信報告](test_report.md#m6-保存版8の配信先e2e2026-11-14-jst)、実ログ `/workspace/work/m6-live-e2e-artifacts/sanitized.log` | 同じowner限定Siteで実Chromium **15/15(4.9分)**。独立自然90秒2・配送3（OS軽減変更を含む）・曲線経路1・コスメ9。ログを読み、viewport記録 **86/86** が文書寸法一致・scroll=(0,0)と独立再集計した。閲覧用の全所有fixtureは全72の通常獲得証拠ではない。 |
| E16 | `3c636ff`：[曲線43519098393](https://github.com/mokusatsu/kotobabin/actions/runs/43519098393) 両success、[配送幾何報告](m6-delivery-geometry.md) | 路外145.77pxの旧失敗を、描画進捗RAFと原画anchor160/192へ修正。必須in-transit/arrivedを実入力と同時観測。最終候補の独立実測最大約7pxはレーンoffsetを含む。動的OS軽減もE11/E15でevent内→次RAF/静止/解除を実検査。 |
| E17 | [資材台帳の最新追記](asset_progress.md)、[川の独立検査](m6-riverside-independent-art-review.md)、[海/高原の独立検査](m6-coast-independent-art-review.md) | 248候補の存在/構造/安全域0問題、全原画保持。3景観の港離隔は近似色診断 **18.0map_px**、dry矩形/経路の水色0。旧16.5/17.5・川の大幅ずれを現状へ流用しない。岸線の色診断残差は川0.833/海1.5/高原2.167map_px。数学的な全画素同一性という追加gateを設定せず、接続/合成/最小識別の残る美術判定を別に記録する。 |
| E18 | [独立レビュー](reviews/sakurai-m6.md)・[同一シナリオ追試](reviews/sakurai-m6-retest.md)、`329f489`の43515540825 | 履歴非継承担当が自身の実E2E8経路で自然90秒・各27個別開封・まとめ・獲得前後鑑賞を完遂し、名前/所有状態の分離指摘の修正を確認。当時初回WebKit手帳の一時overflowが残ったが、後続E19で修正・再検証。正本の人6名理解観察を代替しない。 |


## M7の追加受入

| 記号 | 実行・source | 範囲と限界 |
|---|---|---|
| E19 | [初回手帳/地図43525392820](https://github.com/mokusatsu/kotobabin/actions/runs/43525392820)、a58bc12 | 両engine各12成功。最初のDOM commitから画像保留中の早期60標本、ページ再入場、世界/地区と100/125/150%を検証。WebKit radioの実枠2px・contrast7.734を検査し、pseudo flagだけで可視と判定しない。 |
| E20 | [通常43525392565](https://github.com/mokusatsu/kotobabin/actions/runs/43525392565)、[全画面43525392574](https://github.com/mokusatsu/kotobabin/actions/runs/43525392574)、a58bc12 | 全5成功（312単体・113機能E2E、本番自然90秒両各2、音声各3）、画面条件両各36成功。min800不足は6地区HUD+選択地区図へ切替。4装着/readonly/再読込/引継ぎを含む。閲覧fixtureを全72通常獲得へ流用しない。 |
| E21 | [開発比較43525392766](https://github.com/mokusatsu/kotobabin/actions/runs/43525392766)、a58bc12 | 両各5成功。通常DB open0・元profile不変、公開engineの比較rules/実入力・seed/カスタム語/期限/IME確認・2高さのUI。OS IME実機の代替ではない。 |
| E22 | [性能43525392569](https://github.com/mokusatsu/kotobabin/actions/runs/43525392569)、a58bc12 | 245 native入力、handlerP95 4.7ms/表示15.7ms/longTasks0、72ID/960filter。20 uncached試行開始P95 583.42ms/735126bytes。閾値は不変、実機iPad測定とはしない。 |
| E23 | [実表示contrast](m7-contrast-audit.md)、99b0eec同一sourceの43524643662 | 自然90秒/通常RAF。単色確定775 low0、city4.852・有効配達ボタン8.025、採取した可視補助文<16が0。画像/gradient等185は未測定のまま保持。全画面一括合格ではない。 |
| E24 | [248ID棚卸し](m8-asset-acceptance-inventory.md)、[独立11点](m8-independent-l-art.md)、[依存/静的監査](m6-dependency-security-report.md) | 未制作0、149master/全runtime保持、寸法/viewBox/safe問題0。具体残件は3IDと局所合成の記録不足。npm audit0・既存62保存関連試験等を確認。静止検査を実E2Eの代替へ数えない。 |

最新14b4501はcompact地区名/図の説明を選択文字倍率へ一貫して追従させるCSS2行の追加で、該当の統合CIと独立短期追試は実行中。配信先E2Eとnative200%の最終結果は配布後に追記する。

## 残る項目の分類（goal.mdとの照合）

| ID/分類 | 正本・観察 | 受入済との差分／次の判定 |
|---|---|---|
| I1 **修正・受入済：開発補助** | 技術§13、595行。任意語/荷物/残時間/IME停止/得点イベント/seed、停止中変更→新比較→通常記録隔離 | src/config/game-parameters.tsの日本語名/識別子と既定値、dev.html/専用src/dev入口を実装。通常DBをimportせず比較JSONはnormalRecord:false。E21でDB open0/元profile不変・公開engine再現を実操作確認。正式デフォルトの採点は維持。 |
| Q1 **修正・受入済：初回手帳** | 旧E18のWebKit318ms標本で文書2736、1856msで収束した一時はみ出し | PR25で画面切替のfocus境界にpagination.flushを設けた。E19は画像保留のDOM commit/早期RAFを両6条件で検査し文書=viewport・画面外操作0・H1焦点を確認。旧一時はみ出しを現時点の未解消へ持ち越さない。 |
| V1 **正本が求める検証不足** | 技術§14/15.3/17：Windows11 Chrome/Edge/Firefox、macOS Safari/Chrome、安定版と前世代、Microsoft/Google/macOS IMEとJIS/US | Linuxの3engine native入力/イベント境界は受入済。これをOS IME実機合格とはしない。明記された組合せの記録が不足し、機能未実装の証拠ではない。 |
| V2 **正本が求める検証不足** | game_experience§11の初心者3/中級者3、5/6の初回配達/損失理解/目標操作/資材と到着の理解 | 独立AIレビュー8経路と自動E2Eを、人6名の理解度観察へ読み替えない。一般プレイの経済バランス/反復偏重も人の観察結果がない。 |
| V3 **表示/アクセシビリティの検証残** | 技術§14の実browser200%・本文4.5:1・読み上げ | E23の単色確定775で具体低値を解消。画像等185の最悪値と支援技術の発話結果は未測定。native Chrome tabs.setZoom(2)のv8実操作でCSS960/1180の本編と640の猫練習を確認、min800不足を修正。最新配信での200%追試は予定。fontScale/deviceScaleFactorの代用ではない。 |
| V4 **美術の残る個別検収** | goal§5、resource_implementation§2/3/8 | E24で具体不足をstation_s4左翼、residential_s1/s5予約枠の微小alphaの3IDへ限定。L6切手/H-L絵葉書5の独立静止検収も追加済。設備帯等の未追跡実合成は局所matrixへ限定し、全248を未制作に戻さない。 |
| N1 **追加必須にしない** | AGENTS/D013はMM9C3J/Aを表示テストtargetとし1180×720/820で実E2E。性能基準は技術§14の検証用PC | 指定viewportの受入を物理iPad所持まで無効化しない。追加の「物理iPadでP95≤5ms」「全OS×全画面×全資材を実機で全巡回」は正本以上の独自gate。環境の限定は書くが必須作業として増やさない。 |
| N2 **追加必須にしない** | goal§8の全72条件/モード/進捗/永続化/重複検査と、§17のfixture分離 | 条件の単体全件/負例、事実→原子保存、実native代表/終盤UIは別々に受け入れる。表示fixtureを通常全獲得へ流用しない一方、「人が全960/72を最初から手打ち完遂」までは新たに義務化しない。 |
| N3 **追加必須にしない** | 地図座標/基準点/透過と水彩raster検収 | 名目anchor点にopaque画素が必要、近似色閾値の全岸線差が数学的0、可逆PNG/WebPのRGB完全一致が全資材必須、という判定は正本にない。指定alpha/安全域/接続/図柄は守り、この独自判定だけで未実装や不合格としない。 |
| N4 **対象外/後続指示優先** | D003・D012・D014〜D015 | goal.mdの旧GitHub Pages案は同一owner限定Sitesへ変更済みでE15受入。旧版移行/過去互換性は対象外。代表画像の旧縦カード配置の完全複製を、新しい全画面ゲームHUD要求より優先しない。 |

初回のI1/Q1は上記の実装と再検証で閉じた。V1〜V4は証拠/検収の不足であり、同じ「未実装」へまとめない。E11等の成功も正本全必須条件の無条件完了を意味しない。goal.md自体・仕様原本はこの監査で変更しない。

## 現在の全節対応

適用変更: 2026-11-14のユーザー指示により、過去互換性と旧版からの移行は対象外（[D012](decisions.md)）。現行バックアップ復元・削除・整合性は対象に残す。

| ID | 正本・節 | 状態 | 実装/試験/画面/資材 |
|---|---|---|---|
| game_experience:11 | [1 体験の目的](../../spec/initial/docs/game_experience.md) | 実装済・実E2E／初見未検収 | GameSession・全画面UI。E11/E13/E15の実90秒と再挑戦。初心者3＋中級者3の観察基準は未実施。 |
| game_experience:17 | [2 配達の基本](../../spec/initial/docs/game_experience.md) | 実装済・単体・実E2E | typing/session、engine、delivery-scene。完成点・荷物損失・manual/full/deadline/skipをtests/typing、integration/typing-city、E1/E2で検証。 |
| game_experience:35 | [3 三つの時間幅](../../spec/initial/docs/game_experience.md) | 実装済・単体・実E2E／体験未検収 | TUTORIAL/MAIN/PRACTICE、即時反応・便・都市。modes.spec、city-ui、独立E2E E1/E2。長期の人による成長・反復偏重は未観察。 |
| game_experience:63 | [4 配達で育つ街](../../spec/initial/docs/game_experience.md) | 実装済・単体・実E2E受入済 | E11/E13/E15。初回native建設/購入と、公開command構築後の全6stage5・鉄道・全研究5・再出発/復元/reload/handoffを実UIで検証。資材を人が全量稼いだ速度/経済バランスの証拠ではない。 |
| game_experience:176 | [5 実績の発見と選択](../../spec/initial/docs/game_experience.md) | 実装済・単体・実E2E | profile/achievements、ui/handbook・goal-recommendation。目標・隠し条件・未読をachievements.spec／tablet-keyboardで検査(E1)。全72通常解除の証明ではない。 |
| game_experience:200 | [6 進捗と確定の共通規則](../../spec/initial/docs/game_experience.md) | 実装済・単体・実E2E | 確定事実cursor・mode・暫定・通常完走・救済・途中終了をprofile/achievements、achievement-eventsとachievements.specで検査(E1)。 |
| game_experience:240 | [7 実績全72件](../../spec/initial/docs/game_experience.md) | 72条件実装・単体／一部実E2E | A〜Lをcatalogとreducerに接続。境界・モード・同時報酬を単体検査。E9の合成都市/seedと通常プレイ全72解除は区別する。 |
| game_experience:388 | [8 切手と街の報酬](../../spec/initial/docs/game_experience.md) | 実装済・単体・実E2E受入済／個別美術検収残 | 切手72・称号72・追加40報酬・独立4装着枠。E11/E14/E15で全40鑑賞、名前/所有状態、両高さ×3倍率/readonly引継ぎを検証。表示fixtureと条件全件単体は別証拠(E9/N2)。 |
| game_experience:432 | [9 通知と解除演出](../../spec/initial/docs/game_experience.md) | 実装済・単体・実E2E | GameAudio・result-stageの確定ID個別開封/短縮・結果のみ通知。E1/E2/E5、scoreの残存Space/SはPR19後E1で再検証済。 |
| game_experience:458 | [10 本編と練習の接続](../../spec/initial/docs/game_experience.md) | 実装済・単体・実E2E | catalogue/PRACTICE、3回資格→指定語MAIN、復習。modes・achievements(F04)・tablet-keyboard E1。960語同時DOM表示を要件にしない。 |
| game_experience:506 | [11 体験の合格条件](../../spec/initial/docs/game_experience.md) | 未検収（自動試験は部分対応） | E1/E2の独立エージェント実操作は存在。正本指定の人6名・5/6等の理解/初回配達基準、長期バランスを達成した証拠はない。 |
| game_experience:575 | [12 設計参考資料](../../spec/initial/docs/game_experience.md) | 参照済・適用判断を記録 | decisions、履歴非継承レビューを参照。参考資料の存在は体験合格や実装完了の証拠にしない。 |
| game_experience:592 | [13 実績・発展段階・設備の詳細台帳](../../spec/initial/docs/game_experience.md) | データ実装・単体・実E2E／個別検収残 | catalog72、6地区stage0..5、設備全値。価格/集合検査と参照モデル、終盤UI E13、全資材構造/実合成 E17/E14を確認。残る個別美術はV4。 |
| technical_specification:5 | [1 目的と適用範囲](../../spec/initial/docs/technical_specification.md) | 実装済／開発補助・検証残 | typing/profile/economy/uiの責務分離とE11/E15を受入。§13開発補助I1、OS/IME等V1〜V4、初回手帳Q1は別管理。 |
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
| technical_specification:533 | [12 表示と音声の実装条件](../../spec/initial/docs/technical_specification.md) | 実装済・単体・実E2E／限定品質課題 | 32/22/24×倍率・固定入力・全画面HUD・PageUp/Down・任意WebAudio。E11/E14/E15で装飾/動的OS軽減も受入。初回WebKit手帳Q1、contrast/支援発話V3は残る。 |
| technical_specification:574 | [13 調整可能な値](../../spec/initial/docs/technical_specification.md) | 実装済・単体・実E2E | E21、src/config/game-parameters.ts、dev.html。正式既定値と日本語名/識別子を対応。停止中に条件変更→新比較を再開、通常記録/DBと隔離。GameSession/InputAdapterを再利用し採点をUIで再実装しない。 |
| technical_specification:598 | [14 対応環境と品質目標](../../spec/initial/docs/technical_specification.md) | CI品質実測受入／対象環境等の検証残 | E12の独立閾値維持でhandler5.0ms/表示15.8ms/long task0、20cold開始570.81ms/732970bytes。E13でLinux3engine/縮退、E14/E15で指定表示。未統合という旧記載を廃止。物理OS/IME・200%/contrastはV1/V3、iPad専用性能を追加gateにしない。 |
| technical_specification:622 | [15 受入試験](../../spec/initial/docs/technical_specification.md) | 単体・DOM・実E2E／実機未完 | 基礎入力・期限・保存・練習・報酬・経済をE1/E2で実行。正本で明記された物理OS/IME試験(V1)や人の観察(V2)完了とはしない。 |
| technical_specification:738 | [16 街の経済・物流・再出発](../../spec/initial/docs/technical_specification.md) | 実装済・単体・実E2E受入済 | micro整数/原子台帳/2時計/offline上限、全投資と再出発。E13両engineで全6終盤→restore→readonly reload→明示handoffまで成功。旧版移行は対象外。 |
| technical_specification:890 | [17 実装の完了条件](../../spec/initial/docs/technical_specification.md) | 部分受入済／具体的残件あり | E11〜E18の実装/単体/実browser/配信先を受入。残りはI1・Q1・V1〜V4へ限定し、独自gate N1〜N4を足さない。Goal全体完了はまだ宣言しない。 |
| technical_specification:898 | [18 技術参考資料](../../spec/initial/docs/technical_specification.md) | 参照済・適用判断を記録 | API・入力/保存/アクセシビリティの参考。参考資料の列挙を実行済み試験へ加算しない。 |
| technical_specification:918 | [19 美術資材とゲーム状態の接続](../../spec/initial/docs/technical_specification.md) | 接続実装・機械検査・実E2E／個別検収残 | 248 IDと実経済/実績stateを接続。E17の最新港離隔18と安全域検査、E14/E15合成を受入。全画素数学的同一性を新gateにせず、図柄/縮小/接続の個別美術判定V4を残す。 |
| screen_design:7 | [1 見た目と読みやすさ](../../spec/initial/docs/screen_design.md) | 実装済・実E2E受入済／限定品質課題 | D013〜D015全画面/HUD。E11/E14で2高さ×3倍率、E15実Site。定常fitは受入済だが初回WebKit手帳Q1を全瞬間成功へ広げない。contrast等V3・個別美術V4は別。 |
| screen_design:28 | [2 画面と判断の役割](../../spec/initial/docs/screen_design.md) | 実装済・実E2E | F2でHOME/街/設備/手帳/図鑑/設定、Esc戻り・modal focus。tablet-keyboard/navigation E1、独立E2/E5。 |
| screen_design:43 | [3 ホームと街の地図](../../spec/initial/docs/screen_design.md) | 実装済・実E2E受入済 | 世界全体図→選択地区全域zoom、行き先/開始dock、4枠装着のhome/readonly reload/handoff。E11/E14/E15で実操作・重なり検査。 |
| screen_design:55 | [4 街の設備](../../spec/initial/docs/screen_design.md) | 実装済・単体・実E2E受入済 | 見積/1・10・maxと原子命令、実購入のmap geometry変化・保存 E11。全研究/6鉄道/再出発 E13の最終reloadまで成功。 |
| screen_design:74 | [5 本編](../../spec/initial/docs/screen_design.md) | 実装済・単体・実E2E受入済 | 曲線道路上の実FIFO出荷/移動/到着、透明HUD固定入力。E11/E12/E15/E16。OS軽減の動的変更→次RAF静止/解除、入力継続も実検査。 |
| screen_design:107 | [6 結果](../../spec/initial/docs/screen_design.md) | 実装済・単体・実E2E | result-stage独立score→sealed→実ID reveal→summary、Enter/Tab明示開始とEsc/S短縮。result-stage E1、独立E2/E5。 |
| screen_design:119 | [7 配達手帳](../../spec/initial/docs/screen_design.md) | 実装済・単体・実E2E／初回表示課題 | 72件・進捗/目標/未読/隠し・全40鑑賞/4装着/台紙/albumページ E11/E14/E15。名前/所有状態を原画と同一表示単位へ保持。初回WebKit transient Q1のみ未解消。 |
| screen_design:144 | [8 ことば図鑑と練習](../../spec/initial/docs/screen_design.md) | 実装済・単体・実E2E | catalogue960・分類/集合filter・練習repeat/next/3回資格。modes/achievements/tablet-keyboard E1。 |
| screen_design:152 | [9 街の詳細、帰還、再出発](../../spec/initial/docs/screen_design.md) | 実装済・単体・実E2E受入済 | 都市/帰還/offline cap/明示再出発、UI backup/restore。E13で全6終盤と最終reload/handoffを完遂。実経済到達のfixture境界はE13を参照。 |
| screen_design:162 | [10 幅、状態、実装へ渡すもの](../../spec/initial/docs/screen_design.md) | 実装済・実E2E受入済／200%検証残 | 狭幅本編案内・F2・1180×720/820×真の100/125/150、操作矩形/scroll0。E11/E14/E15。指定端末viewport受入と物理端末照合は区別。実browser200%はV3。 |
| screen_design:180 | [11 代表画像と同一プロフィールの数値例](../../spec/initial/docs/screen_design.md) | 数値モデル・実UI受入／個別美術検収残 | 正本20語2070点と経済traceを単体/モデル照合。代表画像の判断情報を新HUDで実検査(E11/E15)。D014/D015後の画面を旧カード配置へ戻す独自条件は置かない。 |
| screen_design:218 | [12 美術制作の指示](../../spec/initial/docs/screen_design.md) | 全248候補・制作/機械/実合成検査／個別検収残 | E17に原画/変換/安全域/最新地形検査、E14/E15に実合成。存在のみで全図柄受入とせず、残るasset単位判定はV4。 |
| screen_design:230 | [13 設計参考資料](../../spec/initial/docs/screen_design.md) | 参照済・適用判断を記録 | 決定D013〜D015・独立skillレビューを参照。参考資料を合格件数へ加算しない。 |
| screen_design:237 | [14 個別資材と画面状態](../../spec/initial/docs/screen_design.md) | 接続実装・単体・実E2E受入／個別検収残 | 実count→車/包装5帯/店舗帯/鉄道/研究/連携。E11/E13/E14で取引と描画、最新資材E17。全countを別原画へ増やさない。 |
| achievement_catalog:9 | [1 件数と対象の読み方](../../spec/initial/docs/achievement_catalog.md) | データ実装・検査 | 72条件/12系統・40追加報酬のID/対象をcatalogとvalidatorで照合(E1)。 |
| achievement_catalog:31 | [2 全72実績](../../spec/initial/docs/achievement_catalog.md) | 72条件実装・単体／一部実E2E | profile/achievements・achievement-events・境界/モード受入。E9は合成都市を含む。実native72件全解除という主張はしない。 |
| achievement_catalog:1031 | [3 12系統の追加報酬](../../spec/initial/docs/achievement_catalog.md) | 実装済・単体・表示実E2E受入済 | 3枚postcard/6枚foil、12系統。E9で報酬条件/整合性、E11/E14で全系統の実画像鑑賞を検査。表示用所有は通常取得の記録と区別(N2)。 |
| achievement_catalog:1050 | [4 追加報酬40項目の全件表](../../spec/initial/docs/achievement_catalog.md) | 40報酬実装・単体・表示実E2E受入済 | 総数48とA-H第1集48、184所有数を区別。全40の画像/文字参照と実鑑賞・caption E11/E14。通常全解除を人が完遂する追加gateは置かない。 |
| achievement_catalog:1118 | [5 報酬を表示する場面](../../spec/initial/docs/achievement_catalog.md) | 実装済・単体・実E2E受入済 | 4独立装着枠と鑑賞物、home/handbook専用gallery。E11/E14/E15で両高さ×3倍率、所有/未所有、readonly reload/引継ぎを検査。機能設備と区別。 |
| achievement_catalog:1126 | [設計根拠](../../spec/initial/docs/achievement_catalog.md) | 参照済 | 正本catalogと設計根拠を参照。通常の全条件到達・理解の受入は別判定。 |
| city_development_catalog:9 | [1 地区の開通条件](../../spec/initial/docs/city_development_catalog.md) | 実装済・単体・部分実E2E | 6地区開通前提をcommands/cityで検査。初回住宅地E11、全地区/最終reload進行E13。 |
| city_development_catalog:22 | [2 全36段階](../../spec/initial/docs/city_development_catalog.md) | 実装済・単体・実E2E／個別美術検収残 | 6×stage0..5の値/画像を接続。E11初回更地/建設/建物、E13全6stage5とrestore後画像。原画の個別図柄/縮小判定はV4。 |
| city_development_catalog:158 | [3 建築状態と店舗・鉄道の独立](../../spec/initial/docs/city_development_catalog.md) | 実装済・単体・実E2E | plan予約/停止/自由在庫と店/鉄道の独立。city-ui、equipment-map E1、commandsで重複/失敗原子性。 |
| city_development_catalog:175 | [4 景観3種](../../spec/initial/docs/city_development_catalog.md) | 実装済・モデル・実E2E／接続個別検収残 | 3景観選択→世界/配送場面、seaside再出発/復元 E13。港離隔18とdry矩形/経路はE17の独立近似診断で更新。旧未達を現在へ流用しない。 |
| city_development_catalog:185 | [5 街に必要な原画](../../spec/initial/docs/city_development_catalog.md) | 全候補・機械/静止/実UI検査／個別検収残 | 30建物/6代表店/3地形ほかをE17で登録/構造検査。E13で全stage5実合成、最小識別等の個別判定はV4。 |
| city_development_catalog:198 | [設計根拠](../../spec/initial/docs/city_development_catalog.md) | 参照済 | 正本段階/資材マスター参照。候補数で最終合格を推定しない。 |
| equipment_catalog:9 | [1 設備の役割と購入](../../spec/initial/docs/equipment_catalog.md) | 実装済・単体・実E2E | quote1/10/max・価格再確認・原子命令・map反映。equipment-map E1。 |
| equipment_catalog:22 | [2 荷づくり台の全レベル](../../spec/initial/docs/equipment_catalog.md) | 全値実装・単体・実E2E受入済 | packaging0..50価格/倍率、正本の5外観帯、各購入capacity成長。初回Lv0→1は原画_0→_1、Lv7→8は同_1帯を保持。E11/E13/E17。 |
| equipment_catalog:80 | [3 配送班の全所有数と価格](../../spec/initial/docs/equipment_catalog.md) | 全値実装・単体・実E2E受入済 | crew1..50、無料初期と有償を区別。beyondcapのgeometry/保存、車種前後/鉄道をE11/E13/E16で実検査、原画E17。 |
| equipment_catalog:146 | [4 店舗の全所有数と価格](../../spec/initial/docs/equipment_catalog.md) | 全値実装・単体・実E2E受入済 | shop0..50、営業/価格と10/25/50帯、beyondcap実購入・保存/図形差分 E11、終盤E13、実合成E14/E17。 |
| equipment_catalog:223 | [5 貨物鉄道6路線](../../spec/initial/docs/equipment_catalog.md) | 実装済・単体・実E2E受入済 | 全6railway値と対象route。E11住宅地、E13全6購入→再出発→復元→reload/handoff後を検査。 |
| equipment_catalog:238 | [6 連携設備3種](../../spec/initial/docs/equipment_catalog.md) | 実装済・単体・実E2E部分 | joint_delivery/sorting_network/tourism_serviceの前提・効果/一意購入。commands全3、equipment-map実連携 E1。 |
| equipment_catalog:248 | [7 恒久研究の全18状態](../../spec/initial/docs/equipment_catalog.md) | 全18状態実装・単体・実E2E受入済 | 3branch×rank0..5の数値/負例は単体、E13で全3branch rank5、再出発の研究保持/復元/最終reloadまで成功。 |
| equipment_catalog:273 | [8 外観を何枚作るか](../../spec/initial/docs/equipment_catalog.md) | 全候補・接続・実E2E／個別美術検収残 | 車種/包装/店舗帯/railを実stateで合成 E11/E13/E16/E17。残る図柄/縮小の個別判定V4。 |
| equipment_catalog:287 | [設計根拠](../../spec/initial/docs/equipment_catalog.md) | 参照済 | 価格と外観帯の正本参照。実数値と人の体験調整を分ける。 |
| content_catalog:7 | [1 納品する資材](../../spec/initial/docs/content_catalog.md) | データ実装・正本検査 | 960語JSON・規則・固定集合を同梱。validate_content、engine tests E1。 |
| content_catalog:23 | [2 原稿と難度の考え方](../../spec/initial/docs/content_catalog.md) | データ実装・単体／人の検収残 | 3course240/300/420、canonicalLengthで生成。分類/難度データ検査あり、初心者/中級者の編集品質観察は未完。 |
| content_catalog:47 | [3 入力要素と練習の幅](../../spec/initial/docs/content_catalog.md) | 実装済・単体・実E2E | 分岐/促音/撥音/長音と各course・練習。engine、modes/profile-ui E1。物理IME経路は未実機。 |
| content_catalog:63 | [4 導入3語と試作30語](../../spec/initial/docs/content_catalog.md) | 実装済・単体・実E2E | 導入短語・試作30は同じ960から参照。tutorial成功/失敗救済 E1。別問題集を作らない。 |
| content_catalog:108 | [5 固定集合と実績・変更時の扱い](../../spec/initial/docs/content_catalog.md) | 実装済・単体・実E2E部分 | E04初版240とL03全960/各course集合、版keyを分離。profile境界とcatalogue E1。旧版データ互換性は対象外。 |
| content_catalog:142 | [6 全960件・分類別一覧](../../spec/initial/docs/content_catalog.md) | 全960実装・単体／実UI集合検査 | 960全ガイド/基準長/ID、固定集合を全件検査 E1。E12でqualified960 filter・72view・native入力の独立性能suiteも合格。人の全語手打ち完遂を追加必須にはしない(N2)。 |
| resource_implementation:7 | [1 正本と資材の引き方](../../spec/initial/docs/resource_implementation.md) | 参照接続実装・正本検査 | ID→manifest→runtime pathsをvalidatorと明示表で接続(E1/E8)。巨大制作manifestはruntimeへ同梱しない。 |
| resource_implementation:19 | [2 原画と最小表示の契約](../../spec/initial/docs/resource_implementation.md) | 全候補・機械検査／最終検収残 | 149raster/92SVG/7audio。source_size/alpha/viewBox/原画保持はE17、実合成はE11/E14/E15。個別の最小識別/接続をV4へ限定し、名目anchorのopaque画素など独自基準は追加しない。 |
| resource_implementation:73 | [3 地図の共通座標と接続](../../spec/initial/docs/resource_implementation.md) | 実装済・実E2E／接続個別検収残 | 世界→全地区zoom/配送道路 E11/E15/E16。E17で3地形の港離隔18・dry矩形/経路を再確認。色閾値と数学的完全一致は別とし、全共有接続の個別判定をV4に残す。 |
| resource_implementation:145 | [4 実績の状態合成](../../spec/initial/docs/resource_implementation.md) | 実装済・単体・実E2E受入済 | earned/hidden/target/unread/equippedと原画/共通枠。E11実解除、E14/E15全72表示fixture/所有とcaptionを分離検査。 |
| resource_implementation:173 | [5 地区と設備の状態合成](../../spec/initial/docs/resource_implementation.md) | 実装済・単体・実E2E受入済 | district-map/core/equipment-visuals。計画/停止/店/crew/rail/研究/連携をE11/E13、原画追加後E14/E17で合成検査。 |
| resource_implementation:195 | [6 動きの通常・軽減と音](../../spec/initial/docs/resource_implementation.md) | 実装済・単体・実E2E／実聴取は別 | FIFO実到着・reduced・動的OS切替、8voice/mute/MP3fallback E11/E13/E15/E16。実WebAudioとOS sinkを通すが人の聴取結果は追加取得していない。 |
| resource_implementation:223 | [7 追加画像を作らない表示](../../spec/initial/docs/resource_implementation.md) | 実装済・単体・実E2E部分 | 文字・価格・進捗・50段階capacityをDOM/SVG geometry合成。equipment-map E1。焼込み画像数で状態数を増やさない。 |
| resource_implementation:240 | [8 制作後の検収](../../spec/initial/docs/resource_implementation.md) | 機械/静止/実E2E検査済／個別検収残 | E17の最新構造/安全域、E14/E15/E18の実UI・独立レビューを保持。残る図柄/縮小/共有接続の個別判定はV4。全248を一括未検証としない。 |
| resource_implementation:257 | [設計根拠](../../spec/initial/docs/resource_implementation.md) | 参照済 | 正本マスターと制作/変換履歴を参照。制作担当の目視と独立実E2Eを混同しない。 |
| visual_resource_inventory:11 | [1 制作点数とファイル数](../../spec/initial/docs/visual_resource_inventory.md) | 全248制作/統合・検査／個別検収残 | 149raster+92SVG+7audio。原画/実行形式はE17、実合成/codecはE11/E14。制作数と最終個別検収数を区別。 |
| visual_resource_inventory:55 | [2 論理バリエーションからの算出](../../spec/initial/docs/visual_resource_inventory.md) | データ実装・正本検査 | 72stamp、6×stage0..5、外観帯と644価格セル等をvalidatorで照合 E1/E8。 |
| visual_resource_inventory:71 | [3 資材台帳・全件](../../spec/initial/docs/visual_resource_inventory.md) | 全参照候補・機械/実UI検査／個別検収残 | 全paths/source寸法/viewBox、安全域修正0問題 E17。E11/E14/E15で合成後実操作。古いalpha/岸線失敗を現データへ再利用しない。 |
| visual_resource_inventory:458 | [4 制作の順序と公開条件](../../spec/initial/docs/visual_resource_inventory.md) | 統合/配信受入済／全Goal残件あり | E11〜E18でM6統合・配信先15を受入。残りI1/Q1/V1〜V4を明示し、独自必須N1〜N4を追加しない。 |
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

初期Issue #4の文字・中間幅・一覧は、その後ゲームステージとHUDへ更新され、E1で実文字100/125/150%・1180×720/820・中間幅/狭幅を検査した。旧「未対応」を現在へ持ち越さない。その後E11/E14/E15でM6装飾/定常配置と配信先まで受入。現在の不足はQ1/V1〜V4を参照し、物理iPad専用性能を独自必須へ追加しない。

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

D013〜D015: 全画面配送、世界→全地区拡大、地図上の建設/全設備、独立した90秒結果と個別実績、キーボード移動、2高さ×3文字倍率。6b8900b CI 43486057406 の74機能E2Eと本番独立2件×2エンジンが受入根拠。これは当時の状態。現在は性能E12とM6受入E11〜E18で更新し、残件をI1/Q1/V1〜V4へ分ける。
