# M6 必須技術試験・依存関係の独立照合

2026-11-14 JST。製品baseline `ff98495`、QA branch `test/m6-firefox-audit`。製品実装、共有CI、独立レビュアーの試験本文は変更しない。旧版データ互換性は利用者の明示指示で対象外。画像座標・残りK/L素材の審査は別担当とする。

## 必須項目と証拠の区分

| 技術仕様の根拠 | 現在の証拠 | 残る確認・限定 |
| --- | --- | --- |
| §14 line600–606 対象OS・ブラウザー・安定版と前世代 | GitHub CIのLinux Chromium/WebKitで製品buildの実native操作。実Firefoxは既存workflowにない | 今回、同じ独立journey2例とnative Web Audio3例をFirefoxで実行する。Windows11 Chrome/Edge/Firefox、macOS Safari/Chrome、各前世代を確認したことにはならない |
| §14 line604–606 JIS/US・Microsoft/Google/macOS IME ON/OFF | 純粋入力経路、DOM接続、合成イベント拒否とcomposition中断の自動試験 | 実物配列・物理Caps Lock・OS候補確定・別アプリへの移動は対象実機で未検証。LinuxのUAやplatformを変更して代替しない |
| §14 line607 表示寸法・200%browser拡大 | tablet-navigation/input-geometry/layout-settingsで実DOM寸法とfont100/125/150、1180×720/820ほかを厳密検証 | MM9C3J/Aの実Safari、OSブラウザー200%拡大の実物確認は未証明。フォント設定やdeviceScaleFactorをbrowser zoomの証明にしない |
| §14 line610 縮退、§15 保存例外時の継続 | M6実CI43496071029 Chromium/WebKit各4/4：画像取得失敗、初回読込後offline、IDB拒否、core chunk取得失敗→keyboard reload。既存audio3例・reduced motion・結果のみ通知の実UI試験 | fresh offline初回アクセスは§2で保証外。実OSのプライバシー設定・機器の音声中断はfault injectionとは区別する |
| §14 line614–618 性能、全72実績／960語・保存 | 実CI43498989069のcold20例は合格。960語/30履歴/243打/72ID/filterを実行しhandlerP95=65ms、displayP95=67.7ms、long task51件で未達 | 製品hot path修正担当が対応中。閾値・語数・解除条件を減らして合格にしない。実測hostは4logicalCPU/16.76GB EPYC、物理iPadや8GB内蔵GPU機ではない。Sites CDNのcold転送は未測定 |
| §14 line620 コントラスト・非色表示・フォーカス・手動読み上げ | キーボードのみの実独立journey、フォーカス可視性・fit・非色状態文言をDOM試験で確認 | 全画面の4.5:1数値監査、支援技術の実読み上げ、練習の手動読み上げ実機動作は今回の実行証拠には含まれない。未検証と未実装を混同しない |
| §15 入力・誤打・90秒境界・停止・練習・演出中入力 | 既存74functional E2E／294unit、独立実90秒journey、FIFO配送中次語受付、結果への残存Space/S防止。M6新理由以外で全件を重複実行しない | OS由来入力と物理環境は上記のとおり別判定 |
| §15.2／§16.9／§17 保存・重複・経済・複数タブ | 既存actual IDB／runtime／reset／takeover／city transaction／full-price map変化／実報酬ID reveal試験 | 参照Python一致だけでブラウザー入力合格としない。合成ドメインfixtureを利用者の通常便記録や実速度と呼ばない |
| §17 line892–896 公開条件・記録情報 | 上記を純粋ロジック・DOM接続・実engine・物理環境へ区分して記録 | 物理対象・前世代・性能未達が残る間、全技術条件完了とは記載しない。非公開previewの継続は最終全条件達成宣言と区別 |

## Firefoxの限定追加

`.github/workflows/m6-firefox.yml` は `test/m6-firefox-audit` push／workflow_dispatchで動作する。Ubuntuの実FirefoxをPlaywrightが起動し、実engine versionとOSをnative logへ記録する。既存の `playwright.production.config.ts --browser=firefox`（独立2例）と `playwright.audio.config.ts --browser=firefox`（音声3例）をそのまま使う。scriptの書換え、条件緩和、UA spoof、dev source import、fake clockの追加はしない。2jobは独立して動き、一方の失敗で他方の証拠を失わない。実際のLinux Gecko差異を検出する追加であり、Windows Firefox/MS-IME合格の代理ではない。

作成時点では収集のみで、Firefoxの成功をまだ主張しない。CIの実行URL・job・engine version・件数・失敗内容は実行後に追記する。ローカルで代替preview/server/browserを起動しない。

## 現在lockに対する依存関係監査

`ff98495` の `package-lock.json` に対して `npm audit --json` を実行し、exit0、info/low/moderate/high/critical **全0** を取得した。npmの既知advisory照合結果であり、製品コード全体の脆弱性ゼロ証明ではない。

lockfileVersion3、200 package entries、全resolved URLは `https://registry.npmjs.org/`、resolved付き全entryにintegrityあり。直接依存は7つのdevDependenciesのみ。lockの実版はVite7.3.8、Vitest4.1.12、Playwright1.65.0、TypeScript5.9.3、ESLint9.39.5、typescript-estree8.72.2。実行script宣言のあるtransitive packageはesbuild0.28.2とoptional fsevents2.3.3で、lock差し替え・未知レジストリ参照は見つからなかった。

過去のlint dependency修正50db576を照合し、typescript-estree配下のminimatch overrideが現在も宣言されることを確認した。rootに古いmajorのminimatchが存在することだけでは脆弱と断定しない。今回の実auditは0件で、依存版・lockは変更しない。将来の新規advisoryやレジストリ内容はこの時点の結果に含まれない。

## 第1回の実Firefox結果

run43500330798／source645b025。独立journey job132144109750のnative logを独立取得し、**2/2成功（3.6分）**を確認した。実Firefox159.0、Linux7.0.0-1019-azure、1180×720／820で、変更なしのkeyboard-only世界・地区・90秒配達・結果・実報酬・再挑戦・設備操作を通過した。これをWindows FirefoxやiPad実機の合格とは呼ばない。

音声job132144109800は**1/3成功（24.9秒）**。150%キーボード操作は成功した。音声opt-inはmusicCount0、障害後の明示retryは「音を再生できません」が継続して失敗した。取得したtraceでは両例とも音声ファイルの通信要求がなく、retry側のAudioContext生成数は1に達している。したがって音源decodeの失敗と断定できず、context開始／resume段階を切り分ける必要がある。テスト条件、音声assertion、製品は変更しない。

追加するhealth preflightは実Firefoxの独立した空ページでnativeボタンを押し、native AudioContext生成・resume・発音開始のstate/errorとOSのaudio device/process有無を記録するだけである。実AudioContextを置換せず、音声sinkやFirefox設定も変更しない。CI audio環境と製品処理のどちらに原因があるかは、この観測前には断定しない。health自体のローカル実行はしていない。

### 音声環境の切り分け結果とrunner側の修正

診断run43501262495／job132147338876で、`/dev/snd` がなくPulseAudio/PipeWireプロセスもないことを観測した。製品コードを読み込まない実Firefox159.0のnativeボタン操作でも、AudioContextは生成できるがinitial=`suspended`、resumeが5秒経過後も未完了（`resumed:null,error:null,complete:false`）だった。同じrunの製品音声例は再び1/3。これは少なくともテストhost自体に音声開始を妨げる条件があり、製品のOGG/MP3失敗とはまだ判定できないことを示す。

この観測に対してrunnerの音声jobだけへPulseAudioとnull OS sinkを追加する。ブラウザーのAudioContext・実ファイル取得・decode・source再生は既存のままで、Firefoxのautoplay設定やテストassertionを変更しない。healthがnative resume=`running`まで成功しなければjobを失敗とし、音声利用可能な試験環境とは扱わない。null sinkはCI音声経路のためであり、スピーカーから聞こえる音質・音量や実機での聴取合格を主張しない。runner修正後の実3例の結果は未取得。
