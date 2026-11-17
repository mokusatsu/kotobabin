# アーキテクチャ設計

## レイヤー構成と依存方向

```
src/ui/          (Agent B: DOM描画・画面遷移・AudioPlayer)
   │
   ├──> src/typing/       (Agent A: RomajiEngine, CourseGenerator, InputAdapter, GameSession)
   ├──> src/economy/      (Agent C: CityEconomy, WorldClock, BigInt固定小数点演算)
   └──> src/progression/  (Agent D: AchievementEngine, DictionaryTracker, ProfileRepository)
          │
          └──> src/contracts/ (共有型定義・JSON正本ローダー)
```

## 設計原則

1. **状態管理と描画の分離**:
   - `GameSession`, `CityEconomy`, `AchievementEngine`, `ProfileRepository` はDOMに依存しない純粋なTypeScriptモジュール（`InputAdapter` のみDOMイベントを正規化）。
2. **確定事実（ConfirmedFact）による疎結合**:
   - 仮入力表示やアニメーション完了で得点・資源・実績を加算せず、`WordCompleted`, `DeliveryCommitted`, `PracticeSessionEnded`, `RoundFinished` の確定事実のみを `(sessionId, factSequence)` 冪等性付きで反映。
3. **決定的な固定小数点経済**:
   - `1 unit = 1,000,000 micro` の `BigInt` 演算と区間分割シミュレーションにより、`spec/initial/tools/economy_model.py` と1ビットの誤差もなく一致。
4. **ローカル完結の静的Webアプリ**:
   - `base: './'` でビルドし、`dist/` を `python -m http.server` でそのまま配信可能。
