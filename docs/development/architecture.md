# 実装構成

Vite + TypeScript + DOM/CSSの静的アプリ。サーバーAPI・アカウント同期は追加しない。依存は開発用のみ。日本語・読み・入力ガイド・数値・操作はDOM、景色は個別アセット。

- `src/typing`: ローマ字のNFA、seed袋方式、状態・採点・単調時計。JSON正本を直接参照する。
- `src/ui`: 表示・操作、入力フォーカス・ブラウザーイベントの接続。採点はGameSessionへ委譲。
- `src/economy`: BigInt有理数の価格・倍率・資材、建築境界を分割するWorldClock。現在は独立基盤、UI未接続。
- `src/profile`: 確定事実から図鑑・練習資格・記録を還元する基盤。IDB/72実績は後続。
- `public/assets`: 資材IDを維持した原画・WebP/SVG。制作/検収/統合を別管理。

Vitestは重要な仕様境界と参照モデル比較、Playwrightは入力と表示の統合を担当。CIはPython正本検査、lint、型、単体、ビルド、ブラウザー試験を実行する。実機Windows/macOSのIME・物理配列はLinux上の自動試験で代替しない。

保存は後続M4でIndexedDB transaction completeを成功点とする。描画・アニメーション・保存完了から得点や資材を生成しない。経済統合では確定事実IDとcityId/epochを使い原子的適用を行う。
