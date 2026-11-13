# M6 独立技術QA

基準: main `cc1beef`。起動回復差分 `73d9b0b` を検査用worktreeへ適用。以下は実行前の監査と試験計画であり、成功報告ではない。製品コード・共有CI・既存74件の試験は変更しない。

| 正本箇所 | 監査結果と不足 | 追加する実ブラウザー検査 |
|---|---|---|
| 技術仕様36行 | 初期読込後の回線断は対応、新規オフライン起動は保証外 | 読込完了後にnetwork offline、実入力・結果・次の便・IDB保存を確認 |
| 610、661行付近、§17 | 素材失敗と保存不能の全UI経路は既存E2Eにない。音声fallbackとIDB整合性検査は既存にある | 地形・車両・実績絵の通信失敗、IndexedDB SecurityErrorの明示的注入でも実入力・結果・次の便を継続 |
| 616行 | 従来index.htmlは空、main.tsは非同期起動失敗の回復境界がない。題材JSONはcoreへ同梱され、独立words.json失敗を装う試験は不正確 | 本番mainハッシュchunkを実際に中断。原因と再読込リンク、native Tab/Enterによる回復を確認 |
| 614行 | ブラウザーのキー→表示P95≤50ms、処理単体P95≤5ms、50ms以上の本編long taskの実測がない | 実native入力のcapture/bubbleと次RAF、Long Tasks APIを計測。偽の時計は使わない |
| 616行 | 圧縮後初期3MB、cacheなし10Mbps・latency100msの開始P95≤3秒が未計測 | Chromium CDPの設定・実転送量・Content-Encoding・開始可能時刻を20 cold試行で記録 |
| 618行 | 960語・72実績と保存を含むブラウザー性能は未計測。既存Node benchmarkは実機／ブラウザー証拠ではない | 明示した隔離benchmark fixtureで960語進捗・履歴を用意し、全72定義の手帳・全960語の図鑑・実入力と保存の時間を測る |

最初の追加は `tests/e2e/m6/resilience.audit.ts` の4件。専用configと `.github/workflows/m6-qa.yml` は本番ビルドに対してChromium/WebKitを使い、`feat/recover-startup` のpushまたはworkflow_dispatchで実行する。`.audit.ts` のため既存通常 `.spec.ts` へ重複登録しない。既存依存関係を参照してESLintとPlaywrightの収集だけをローカル実行し、ローカルサーバー／ブラウザーは起動していない。実行結果はCI後に追記する。

クラウド実行時とSitesのmanaged preview指針を確認した。ローカルで試す場合は公式daemonの経路だけを使い、代替サーバーで迂回しない。今回のブラウザー実行は承認されたGitHub CIに限定する。物理iPad、Windows/macOSの実IME・配列は未検証であり、UAやOS名を変更して合格に数えない。過去互換性は既存ユーザー指示により対象外。

## 第1回の実CI結果

対象 `032bf00`、[M6 CI 43496071029](https://github.com/mokusatsu/kotobabin/actions/runs/43496071029)。独立QA担当がGitHubのネイティブツールで両ジョブの実ログを取得し、Chromium job132129379078は4/4成功（9.8秒）、WebKit job132129378640は4/4成功（28.3秒）を確認した。

実通信の地形・車両・A01絵柄を失敗させても実入力6語・結果・次の便へ進めた。初期読込完了後のnetwork offlineでも同じ経路とIDB保存を維持した。IndexedDBのSecurityErrorを明示的に注入した全UIでは「ページを閉じると残らない」メモリー保存の案内を表示し、便と次の入力を継続した。本番mainハッシュchunkの中断では原因と再読込リンクを表示し、native Tab/Enterで回復後、実際に1語完成した。画像だけの検査ではない。保存拒否の注入は実OSのプライバシーモード確認ではなく、初回オフライン起動の保証も追加していない。

この4件は起動・縮退の受入根拠であり、性能予算の合格根拠には使わない。転送量・低速cold開始・実native入力・960語進捗と72定義の手帳の性能は、別のChromium専用測定で記録する。物理iPad／Windows・macOSのIME、実機性能は引き続き未検証。

## 性能計測の独立CI（未実行）

`.github/workflows/m6-performance.yml` は `feat/measure-performance` のpush、またはworkflow_dispatchのみで動作する。既存の障害復旧4例とは別ジョブ・別設定である。製品コードと共有CI設定は変更しない。

- Chromium CDPで、キャッシュのない新規コンテキスト20回に10Mbps・100msを適用。実際の `Network.loadingFinished.encodedDataLength`、応答のContent-Encoding、開始可能までの時間を保存し、P95 3秒と初回3MBを検証する。identity応答を「圧縮配信」と呼ばない。Vite静的previewの配信測定であり、Sites CDNの測定ではない。
- 公開GameSession・実績reducerと変更なしの保存validatorで、960語すべて各3回の無誤打練習と30件の便履歴を作る。これはCI隔離環境の合成ドメインfixtureであり、利用者の速度・獲得履歴を示さない。Vitestで生成後、実際のIDB保存と再読込を行う。製品の開発用hookは追加しない。
- 実際のnative入力を240打以上送り、trusted inputのcapture→bubble間隔（handler代理値）、keydown→次のanimation frameのDOM変化（表示代理値）を記録する。P95 5ms/50ms、観測区間のlong taskを検証する。表示装置の実発光やOS IME遅延の測定ではなく、long taskにはブラウザ・計測の影響も入り得るため、失敗時はtraceや個別原因を調べて帰属を判断する。
- 同じ960語状態で、実UIの12系統を順に開き72個の実績IDを確認する。図鑑はページ分割を保持したまま全960語の「練習で無誤打3回」filterを実行する。960行の同時DOM表示は要求しない。UI応答とRAF間隔は記録し、仕様にない新しい合否閾値は作らない。

実行時のOS、CPU型番・論理CPU数、メモリ、Node、実ブラウザversion、viewport、倍率、全標本をJSON artifactに残す。GitHubホストの結果をMM9C3J/A実機の合格へ読み替えない。ローカルではESLint、Playwrightの収集（2例）、fixture生成・validator検証（1例）だけを実施し、ブラウザや代替サーバーは起動していない。実性能値と合否はCI実行後に追記する。

## 第1回の実性能CI：未達（2026-11-14）

実行43498989069／job132139489051、測定branch567247d（製品ff984）をGitHub native job-log APIで独立取得した。2例中、cold20回は合格（35.3秒）、大容量進捗での入力は性能閾値で失敗（17.9秒）した。collection・fixture・ページ操作の失敗ではない。

実ホストはLinux7.0.0-1019-azure、AMD EPYC7763、論理4CPU、メモリ16,759,439,360bytes、Node24.22.2、Chromium158.0.8127.18、1180×720／100%。入力243打すべての次フレームでDOM変化を確認し、72実績ID・960語の無誤打3回filterも確認した。handler代理値P95 **65ms**（目標5ms）、表示代理値P95 **67.7ms**（目標50ms）、RAF間隔P95 **50ms**、long task **51件（50〜95ms）**。図鑑filter42.46ms、系統切替の観測範囲10.14〜158.01ms。これらを実機iPadの値として扱わない。

大きいhandler標本は語完成に対応する周期で現れる。コードではnativeInput→onCharacter→mutate→commitFacts→runtime.applyFactsの同期経路で、960語を含む実績状態のstructuredClone／reducerと描画が行われる。これは調査すべき具体的な経路であり、各関数の寄与率はCPU profile採取前には断定しない。閾値の緩和、語数・実績条件の削減はしていない。

計測側の不備も1点見つかった。list reporterの`info.attach({body})`だけでは、JSON標本がupload-artifact対象ディレクトリに実ファイルとして残らず、当該artifactはerror-contextのみだった。したがってcoldが3秒／3MB以下で合格した事実は確認できるが、coldの正確なP95・転送値は当該実行から回収できない。次回用にJSONをoutputPathへ明示保存し、要約値もnative logに出すようテストだけ修正した。合否基準と計測対象は変更しない。再実行の理由は製品性能改善またはこの標本保存の修正であり、旧4例の障害復旧を繰り返す理由にはしない。
