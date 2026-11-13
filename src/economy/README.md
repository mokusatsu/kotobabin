# 街の経済エンジン

数値の正本は `spec/initial/data/economy_config.json`。micro値は計算中BigInt、保存時は10進文字列にする。

- `EconomyFormulas`：荷づくり・研究倍率、完成語・確定配達の資材量、個別切上げ価格、一括購入見積、輸送・営業速度、開発費用。
- `initialWorldState(wallMs)` / `WorldClock(state)`：既存輸送待ち・計画積立・建築・営業を整数msで更新。境界の到着→建築→以後の営業速度を順守。`advanceTo`で絶対時刻、`restoreAt`で最大8時間と壁時計の最大値を保持する。
- `initialCityState(wallMs)` / `CityEconomy(state)`：全経済操作と確定事実の適用。`snapshot()`はBigIntを保持する独立コピーを返す。

## CityEconomyの契約

`beginSession(sessionId, districtId='residential', mode='normal', atMs?)` で、cityId・届け先・資材倍率を固定する。`completeWord`へ `{cityId, sessionId, factSequence, baseLength, mistakes?, completed?, confirmation?, atMs?}`、`shipCargo`へ `{cityId, sessionId, factSequence, scoreSum, cargoCount, reason, atMs?}` を渡す。UIや描画イベントから資源を直接加算しない。

事実識別子の再適用は `applied:false, reason:'duplicate'`、前の街の事実は`stale_city`を返す。同じ識別子で内容が変われば例外。前の街の事実は時刻を処理する前に拒否するため、遅延イベントの未来時刻によって現在の街の輸送・入金が進むこともない。Python参照モデルは時刻を先に進めるが、この拒否境界は技術仕様16.6の「旧cityId宛ての遅延イベントは新しい街へ適用しない」を優先する。台帳は状態に保持し、snapshotから再構築しても二重適用を防ぐ。フィンガープリントは固定順序のJSONペイロードそのものを保持する。PythonのSHA-256表現とは異なるが、内容一致・衝突拒否の意味は同じである。

`endSession(atMs?)`は未配達ボーナスを作らず、当該便の生成量・便中の到着量（前便の待ちも含む）・収益の差分を返す。再呼出しは同じ要約を返す。`generatedMicro`、`arrivedMicro`、配送・営業収益は生涯累積、`cityArrivedMicro`は今回の街の累積である。

投資はセッション終了後に行う。下記の投資・再出発メソッドは単一状態を変更するプリミティブであり、`(cityId,economyEventId)` の操作台帳をまだ持たない。同じ購入要求を再呼出しすればもう一度購入する。技術仕様16.8を満たすには、UI接続前に原子的なコマンドラッパーを追加し、最新状態・cityId・操作ID・revision・所有権epochを確認して重複・旧都市の操作を拒否し、資源・解除・処理済み位置・時計を一つの保存トランザクションに含める必要がある。完成語と配達の事実台帳だけで、経済操作全体の再試行安全性が完成したとは扱わない。

- `quotePurchase(kind, quantity=1, districtId?)` / `purchase(..., atMs?)`：1/10/max、個別価格の合計、資金不足の部分購入、段階別店舗上限、倍率・輸送待ち・営業速度の前後比較。
- `startPlan` / `pausePlan` / `resumePlan`：停止時も積立を保持、再開時は自由在庫から即時充当。完成後の次計画は自動開始しない。
- `openDistrict`：現在の段階合計とコイン条件。
- `buyRailway`：段階3・10班・コイン・自由在庫条件。予約資材を使わない。
- `buySynergy` / `buyResearch`：前提、価格、単独所有、ランク上限。
- `newCityPreview` / `startNewCity({confirmed, location, landscape, atMs?})`：全6地区段階3と到着100,000、整数平方根による報酬、HOME/RESULT確認。研究・設計図・生涯統計を保持し、cityIdと都市固有台帳を更新する。語彙・実績・設定等は本エンジンの外のプロフィール領域なので変更しない。

`atMs`を与える操作は、指定時刻の到着・建築を先に精算してから操作する。省略時は現在の経済時刻で処理する。保存側で時刻と資源を同一トランザクションにする。

## 検証

`python3 tests/economy/generate_fixtures.py` と `python3 tests/economy/generate_transactions.py` は、変更していないPython正本から期待値を再生成する。

- 全644価格、24組の資材倍率境界、整数ms建築境界、停止計画、放置上限、時間分割。
- 4シナリオの操作ごとにPython状態と比較し、各操作間でsnapshotから再構築する。完成・配達・購入・計画・開通・鉄道・全連携・研究・再出発・古い街の事実・復帰再試行を含む。
- 全投資入口の5モード中拒否、事実内容衝突、入力確認・途中語の資材0、鉄道の予約資材保護、正確な再出発閾値、旧実績用配達回数と経済配達回数の分離。

## 残作業

- `(cityId,economyEventId)`による経済操作コマンドの重複防止・旧都市拒否（UIへ投資・再出発を公開する前の必須条件）。
- IndexedDBでの保存・読込み時の入口検証とトランザクション。コンストラクターは検証済みの`CityState`を受け取り、内部で同じ検証を繰り返さない。
- ゲームセッション・UI・実績への接続と、確定経済イベントのプロフィール反映。
- 代表20語の経済状態を使った画面統合検証、実際の放置復帰・再起動E2E。

経済単体の動作確認をM3全体の製品統合完了とは扱わない。
