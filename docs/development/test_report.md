# テスト・検証報告（Test Report）

最終更新: 2026-11-13

## 自動テスト・静的検査

- `npm run typecheck` (`tsc --noEmit`): 0エラー合格
- `npm run lint` (`eslint src tests`): 0エラー合格
- `npm test` (`vitest run`): 7ファイル・46テスト全合格
  - `tests/smoke.test.ts` (1)
  - `tests/typing/romajiEngine.test.ts` (8) — 全960語 `canonicalLength` 照合・分岐・`っ`/`ん`/`ー`
  - `tests/typing/gameSession.test.ts` (12) — 90秒境界・ポーズ/スキップ・IME・20語画面フィクスチャ (`2070点`, `93.3%`, `連続5語`)
  - `tests/economy/cityEconomy.test.ts` (12) — 全644価格セル・20語経済 (`1449生成 / 531到着 / 918待ち`, `住宅地段階3 @ 83.625s`, `収益 4.2->8.2/s`)・放置・再出発
  - `tests/progression/achievementEngine.test.ts` (7) — 全72実績・40報酬・スコープ隔離・図鑑フィルター
  - `tests/progression/profileRepository.test.ts` (5) — IndexedDB v4 11ストア・カーソル冪等性・単一タブ排他・メモリフォールバック
  - `tests/ui/appController.test.ts` (1) — 全画面遷移・本編ヘッダー非表示要件・ポーズ問題隠し
- `npm run build`: `dist/` ビルド成功

## 実ブラウザー検証（`python -m http.server 4173 --directory dist`）

- 対象URL: `http://localhost:4173/`
- ネットワーク: 50リクエスト / 失敗0件（404・5xxなし）
- コンソール / JSエラー: 0件
- 確認フロー: ホーム（6地区地図・コース/届け先選択）→ 半角確認(`a`) → READY（コイン/設備非表示確認）→ 実打鍵(`nira` → 荷物1/5・40点・タイマー進行) → `Esc`一時停止（問題非表示確認）→ ホーム復帰（8コイン・4資材・未読バッジ2件反映）→ 街の設備 / 配達手帳(2/72) / ことば図鑑(960語) / 設定 の全タブ表示確認。

## Sakurai-Skill E2Eレビュー＆ブラッシュアップ（イテレーション1〜3）

- **イテレーション1（手応え・実績祝福・オンボーディング導入）**:
  - 実績解除日 `1970/1/1` バグ修正（`Date.now()` 実時刻保存＋レガシーガード）
  - 誤打時・荷崩れ時の揺れアニメーション＋`荷崩れ！ (-X個)` ポップ表示、積載中のリスク・リターン並置表示
  - 語完了荷物ポップ、`配達完了！ +XXX点` バースト、実績獲得トースト、結果画面のゴールド祝福バナー＋音演出
  - ホームの目的バナー、チュートリアルからの「本編へ進む（90秒）」導線、街の設備の「作る→運ぶ→稼ぐ＆Lv10/25/50で2倍」導入バナー、設定の「効果音テスト」ボタン追加
- **イテレーション2（不具合修正・再挑戦スピード・購入可シグナル・ライブ称賛）**:
  - チュートリアル「本編へ進む」等の `mousedown` `preventDefault()` によるblur誤ポーズ解消
  - `街の設備` で未開通地区選択時の `EconomyError` 解消、1440px幅ヘッダー1行固定
  - プレイ中の `連続ノーミス ○語！` ピル＋残り10秒以下の緊急タイマー強調、結果画面「同じ問題でもう一度 (Enter)」初期フォーカス、ホーム/結果/設備の「強化可・可」バッジ追加
- **イテレーション3（最終実ブラウザー検証 `http://localhost:4173/`）**:
  - コンソールエラー **0件**、通信失敗 **0件**、全5項目のE2Eフロー合格

## オンボーディング・チュートリアル実装と独立E2E検証（2026-11-16追記）

- **静的解析・ビルド・単体/統合テスト（ソース変更完了時点）**:
  - `npm run typecheck && npm run lint && npm test && npm run build`: **全て成功**（`Test Files 9 passed (9)` / `Tests 53 passed (53)`、`tests/ui/onboarding.test.ts` 3件を追加、`dist/` ビルド成功）
- **独立エージェント（`sakurai-skill` 参照）実ブラウザーE2Eレビュー（`http://127.0.0.1:4173/` / `1180x820` 10インチiPad横向き / `dist/` / `1.0x`・`1.3x`・`reduceMotion`）**:
  - **Round 1〜2（指摘修正）**:
    - コーチマークの配置・クリッピング、S1/S2のナビゲーション挙動（S1はナビ開放、S2はヘッダー5タブおよび「配達手帳を開く」を `disabled`＋遷移ガードでロック）、用語統一（「地区」「中央集配所」「A01 はじめのことば」）、まとめ積み・荷崩れ解説・3回失敗救済・整数資材表示、`.kb-prompt-ja` 縦見切れ（2px相当）を修正（CSS Grid `minmax(0, 1fr) 320px` + `container-type: size`、`.kb-shell:has(...)`・`navLocked`、`.kb-prompt-ja` の `line-height: 1.38; padding-block: 4px;` 等）。
  - **Round 3（`vite preview` にて最終再確認・全3項目合格）**:
    - Home S1/S2（`1.0x` / `1.3x`）: `scrollW == clientW == 1148`、右側コーチマーク見切れ **0px**、地区ピン・バッジ干渉なし（「住宅地」マップピン直接タップでの出発も正常）
    - S1/S2 ナビ制御: S1ではヘッダータブ遷移とホーム（S1 `1 / 4`）復帰が可能、S2ではヘッダー5タブ・`配達手帳を開く` が `disabled: true` かつ強制クリックでもS2を維持
    - `.kb-prompt-ja`: `1.0x` で `scrollH: 74 <= clientH: 74`、`1.3x` で `scrollH: 94 <= clientH: 94`
    - `pageerror`: **0件**、`console.error`: **0件**、HTTP 4xx/5xx: **0件**、アセット通信失敗: **0件**
