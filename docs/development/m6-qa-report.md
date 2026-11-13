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
