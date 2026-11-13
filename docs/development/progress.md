# 再開用進捗

基準日: 2026-11-13（Asia/Tokyo）。**Goalは未達成**。初回M0/M1サイクルの実装・独立レビュー・CIを完了。M1の製品受入には下記の残項目がある。

## 現在の実装と保存先

- [PR #1](https://github.com/mokusatsu/kotobabin/pull/1): 開発基盤、3コース・全960語、NFA入力、90秒、完成点・荷物・配達、停止/再開、同じseedで再挑戦、最初のアート。mainへ統合済み。
- [PR #2](https://github.com/mokusatsu/kotobabin/pull/2): Pythonと一致する経済式・WorldClock。mainへ統合済み。購入実行/台帳/経済UIは未実装。
- [PR #3](https://github.com/mokusatsu/kotobabin/pull/3): 確定事実の図鑑/練習資格/記録の純粋関数。mainへ統合済み。IDB/72実績/UIは未実装。
- ChatGPT Sites: https://kotobabin.mokusatsu.chatgpt.site 。project_idは `.openai/hosting.json` を再利用。custom accessはオーナー1名、外部閲覧者0。GitHub Pagesは使用しない。
- 開発用依存のGHSA-g3hv-75wg-m249はPR #6で対象のminimatchだけ修正版へ更新し、npm audit 0件と関連検証を確認。
- 初回公開ソース `b3f657b49e2749cd2866bb480c996e8945a63116`。期限境界修正 `819b1b5` はCI成功済み。公開版の最新SHAはSitesバージョンとGitHubの最終状態を確認する。更新は同じSiteへ行い、公開範囲を維持する。

## 検証済み

- Python正本の検証6コマンド成功。入力全960語と代表20語2070点は独立QAでも一致。
- 統合単体78件（入力63、経済6、記録9）、型検査、Lint、本番ビルド成功。
- PR #1・#2・#3のGitHub CIで正本検査、型、Lint、単体、本番ビルド、Chromium E2E3件が成功。
- CIで生成した1440幅のホーム/プレイ/結果と767幅ホームの4画像を統括・独立QAが確認。主要操作に欠け/重なりなし。対象OSの実機IME確認ではない。
- 終了直前の未確定入力が89999msで停止を延長する問題を独立QAが再現し、分類時刻を現在時刻に修正。9件の回帰と独立再現で解消を確認。
- 生成画像5点・SVG39点の候補を保存。3画像をUIへ表示。寸法/透過と生成原画は確認済み。厳密な合成条件の検収は未了。

## 次のサイクル

[Issue #4](https://github.com/mokusatsu/kotobabin/issues/4) を開始点とする。

1. `git status`、GitHub main/PR/CI、Sitesバージョンを取得し、既存変更を破棄しない。
2. `npm ci`、`npm run test:spec`、`npm test`、`npm run build`で現状を確認。
3. UI担当: 練習/導入、停止からの救済スキップ、設定/ガイド履歴を既存エンジンへ接続。補助文字16px、地図幅800未満の一覧切替、1366×768・中間幅・文字拡大を検証。
4. 入力担当/QA: Windows/macOS・JIS/US・OS IME、入力確認と中断/復帰の実機受入を記録。
5. 経済担当: 確定イベント台帳と購入トランザクションを実装し、Pythonモデルへ一致させてから6地区UIへ接続。
6. 記録担当: 72実績とIDB原子保存/復元/複数タブを段階実装。過去得点から資源や実績を推定発行しない。
7. アート担当: 水際/港接点と足元アンカーを修正、全資材と7音源を継続制作。経済状態と同期するまで段階1を常時表示しない。
8. 小さなPRごとに独立QA・関連検証→main統合→同じSitesへオーナー限定更新→この記録を更新。

## 阻害要因と未完了

Sites管理プレビューはrelay port4173のタイムアウト、共有ブラウザーは `gaas-browser node_repl sandbox cannot be disabled` で起動できない。GitHub CIのChromiumと取得画像は検証可能だった。Sites公開版の対話操作、対応OS/IME、初見観察、性能の実測は未検証。

M2の練習/導入/設定全体、M3の購入/台帳/研究/再出発/経済UI、M4の72実績/報酬/IDB/復元/複数タブ、全アート/音源、M6全受入は残る。コードや今回の公開だけで製品完成としない。Goal停止を呼ばず継続する。自動継続機構の動作を保証せず、このファイルから再開できる状態を保つ。
