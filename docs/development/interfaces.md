# 担当間インターフェース

型の詳細な正本は各 `src/*/index.ts`。共通変更は統括が調整する。同じファイルを同時編集しない。独立ブランチ/worktreeを使用。

| 境界 | 契約 |
|---|---|
| main → UI | `mountApp(HTMLElement, AppRuntime)`、CSSはmainから読み込む |
| UI → RomajiEngine | 読みからNFA。input(key)は誤打で状態を維持。canonicalLengthは同じグラフの最短経路 |
| UI → GameSession | 確認済みキーと単調時刻ms。input/deliver/tick/pause/resume/skip/finish。UIは採点しない |
| GameSession → UI | snapshotのphase/語/guide/score/cargo/時計/統計を描画。遷移に同じキーを再利用しない |
| CourseGenerator | courseId/seed/preferredWordId/版を固定、易中中難易の袋方式、retryは同計画 |
| GameSession → 他エンジン | drainEventsのsessionId/factSequenceを持つWordCompleted/DeliveryCommitted/RoundFinished等を一度適用 |
| 経済 | 基準長・確定配達点から資材。倍率は得点へ適用しない。WorldClockはゲーム時計と独立 |
| 記録 | MAIN/PRACTICE/TUTORIALを維持、救済/ガイド/計画/版の異なる比較キーを混合しない |
| 保存 | transaction内で最新状態を読み、事実/進捗/報酬/カーソル/epochを原子更新 |

M1のInputAdapterは後続のIME実機受入を含む完成品ではない。未確定compositionやpasteが誤採点されないことを優先し、未検証環境を対応済みとしない。

## M2接続と保存

`mountApp(root, runtime)` は `src/app/runtime.ts` のAppRuntimeを使用。設定/プロフィールは即時メモリー投影、耐久保存の状態は別に表示する。`applyFacts(facts, context)` は全事実の順序を渡す。`takeOver({discardUnsaved:true})` は明示確認後のみ使い、古い未保存投影を控えに残す。保存前の拒否でrepoがsavedでも、未保存投影を自動でスナップショット置換しない。

GameSessionのPRACTICEは完成後にrepeatWord/nextPracticeWord/endPracticeを選び、PracticeSessionEndedを一度発行する。TUTORIALは実発送の成功と連続失敗救済を保持し、RoundFinishedを偽造しない。ガイド表示履歴は便内で維持。CityEconomyの投資メソッドはまだ単独プリミティブであり、UI接続前に(cityId,economyEventId)の台帳と原子保存を追加する。

## M3接続

AppRuntimeのcityはBigIntを保持するコピー、destinationは開通済み地区。beginSession(sessionId,mode)は倍率/地区/削除世代を固定し、cityBusy中はfalseを返す。applyFactsはプロフィールと街を同じ最新ドキュメントから更新する。cityCommandはcityId/economyEventIdと固定時刻を持ち、DBでの最新見積確認後に所有数を表示する。cityBusy中に次の便を始めない。endSessionは未配達追加点を作らず、TUTORIALも明示閉鎖する。

コード/metadata/削除世代の境界はProfileRepository、経済命令の重複/価格/保存形式はCityEconomyとcodec、画面は純粋なsnapshot表示。命令失敗時は部分的に時間や残高を進めない。

## M4実績・復元・表示

`beginSession(sessionId, mode, destination, context)` をREADYで呼び、実績の練習資格と成長比較元を固定する。`extensions.achievements` の `AchievementState` は実績計測開始後の確定事実だけを集計する。`applyAchievementFacts` は語・配達・便の適格性を区別し、`applyAchievementCity` は経済の成立後の状態から現在都市と生涯値を区別する。実績・切手・称号・追加報酬・未読・処理済み位置・街・プロフィールを同じドキュメント更新で確定する。

GameSessionの単調時計と履歴の日時は分ける。実績用の事実コピーだけに、受信時に固定した壁時計を渡す。描画・保存成功・閲覧は解除条件にしない。到着監視の定期観察IDは累積保存せず、購入・研究のカウンターに必要な命令IDだけを保持する。途中終了したセッションは仮達成を解除へ変えず、閉鎖状態とカーソルを残す。

`achievementAction` は目標・公開・既読・装着・通知設定だけを変更し、所有していない報酬の装着を拒否する。`resetProfile` は3範囲を分離し、記録削除では実績用の成長比較も消す。`restoreProfile` は現行バックアップを検証した後、元データの控えと新しい削除世代を原子的に保存する。UIは確認後に現在の便を終了してから削除・復元する。旧形式の互換性はD012で対象外。

画面移動はF2のメニュー、矢印・Enter・Escと通常のTab操作で行う。入力中に英字を画面移動へ流用しない。指定iPadの表示はD013を適用し、実フォーカスを維持したパネル切替でスクロールを必要としない構成へ統合中。

## M5 ゲームステージ追記

配送表示はWordCompleted/DeliveryCommittedの確定事実と地区のarrivedMicro差分を受け取り、最大6群へ集約する。結果演出の進行・省略は実績付与を呼ばない。入力DOMは情報切替・配送・通知で置換しない。
