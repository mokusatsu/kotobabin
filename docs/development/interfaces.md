# 担当間インターフェース

型の詳細な正本は各 `src/*/index.ts`。共通変更は統括が調整する。同じファイルを同時編集しない。独立ブランチ/worktreeを使用。

| 境界 | 契約 |
|---|---|
| main → UI | `mountApp(HTMLElement)`、CSSはmainから読み込む |
| UI → RomajiEngine | 読みからNFA。input(key)は誤打で状態を維持。canonicalLengthは同じグラフの最短経路 |
| UI → GameSession | 確認済みキーと単調時刻ms。input/deliver/tick/pause/resume/skip/finish。UIは採点しない |
| GameSession → UI | snapshotのphase/語/guide/score/cargo/時計/統計を描画。遷移に同じキーを再利用しない |
| CourseGenerator | courseId/seed/preferredWordId/版を固定、易中中難易の袋方式、retryは同計画 |
| GameSession → 他エンジン | drainEventsのsessionId/factSequenceを持つWordCompleted/DeliveryCommitted/RoundFinished等を一度適用 |
| 経済 | 基準長・確定配達点から資材。倍率は得点へ適用しない。WorldClockはゲーム時計と独立 |
| 記録 | MAIN/PRACTICE/TUTORIALを維持、救済/ガイド/計画/版の異なる比較キーを混合しない |
| 保存（未実装） | transaction内で最新状態を読み、事実/進捗/報酬/カーソル/epochを原子更新 |

M1のInputAdapterは後続のIME実機受入を含む完成品ではない。未確定compositionやpasteが誤採点されないことを優先し、未検証環境を対応済みとしない。
