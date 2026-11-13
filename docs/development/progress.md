# 再開用進捗

基準日: 2026-11-13（Asia/Tokyo）。Goalは未達成。初回M0/M1統合サイクル。

## 再開手順

1. このファイル・roadmap・test_report・asset_progress・requirements_traceabilityを読む。
2. `git status` とGitHub PR/CI/mainを取得し、既存変更を破棄しない。
3. `npm ci`、`npm run test:spec`、`npm test`、`npm run build`で現状を確認。
4. 依存が解消した次の小タスクを選ぶ。IME/InputAdapter、練習/導入、経済台帳/購入/画面、IDB/実績を優先。
5. 実装/独立QA後、同じSites IDへオーナー限定で更新する。

## 現在

- 仕様のみの初期リポジトリから開発基盤を追加。
- 既存Python検証6コマンド成功。
- 入力、UI、経済、記録、アート、独立QAの6担当を並列開始。
- 入力エンジンは960語と20語2070点フィクスチャに一致、単体54件成功。統合後試験待ち。
- 経済の式/時計は644価格・24資材組・時計境界の比較成功。UI未接続。
- Sitesを作成しownerだけのcustom accessを確認。公開は統合後。

## 未完了

M2のIME実機確認/練習/導入/設定全体、M3の購入実行/経済イベント台帳/6地区UI/研究/再出発、M4の72実績/報酬/IDB/復元/複数タブ、全アート/音源、M6全受入。コードの存在を完成判定にしない。最終結果はこのサイクル終了時に追記。
