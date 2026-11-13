# 街の経済エンジン

数値の正本は `spec/initial/data/economy_config.json`。micro値は計算中BigInt、保存時は10進文字列にする。

- `EconomyFormulas`：荷づくり・研究倍率、完成語・確定配達の資材量、個別切上げ価格、一括購入見積、輸送・営業速度、開発費用。
- `initialWorldState(wallMs)` / `WorldClock(state)`：既存輸送待ち・計画積立・建築・営業を整数msで更新。境界の到着→建築→以後の営業速度を順守。`advanceTo`で絶対時刻、`restoreAt`で最大8時間と壁時計の最大値を保持する。
- `initialCityState(wallMs)` / `CityEconomy(state)`：全経済操作と確定事実の適用。`snapshot()`はBigIntを保持する独立コピーを返す。

## CityEconomyの契約

`beginSession(sessionId, districtId='residential', mode='normal', atMs?)` で、cityId・届け先・資材倍率を固定する。`completeWord`へ `{cityId, sessionId, factSequence, baseLength, mistakes?, completed?, confirmation?, atMs?}`、`shipCargo`へ `{cityId, sessionId, factSequence, scoreSum, cargoCount, reason, atMs?}` を渡す。UIや描画イベントから資源を直接加算しない。

事実識別子の再適用は `applied:false, reason:'duplicate'`、前の街の事実は`stale_city`を返す。同じ識別子で内容が変われば例外。前の街の事実は時刻を処理する前に拒否するため、遅延イベントの未来時刻によって現在の街の輸送・入金が進むこともない。Python参照モデルは時刻を先に進めるが、この拒否境界は技術仕様16.6の「旧cityId宛ての遅延イベントは新しい街へ適用しない」を優先する。台帳は状態に保持し、snapshotから再構築しても二重適用を防ぐ。フィンガープリントは固定順序のJSONペイロードそのものを保持する。PythonのSHA-256表現とは異なるが、内容一致・衝突拒否の意味は同じである。

`endSession(atMs?)`は未配達ボーナスを作らず、当該便の生成量・便中の到着量（前便の待ちも含む）・収益の差分を返す。再呼出しは同じ要約を返す。`generatedMicro`、`arrivedMicro`、配送・営業収益は生涯累積、`cityArrivedMicro`は今回の街の累積である。

投資はセッション終了後に行う。以下の直接メソッドは単一状態を変更するプリミティブなので、画面・保存側は必ず `executeCityCommand(city, command)` を使う。

`CityCommand` は `cityId, economyEventId, atMs?` と `type` 別の引数を持つ。typeは `purchase / startPlan / pausePlan / resumePlan / openDistrict / buyRailway / buySynergy / buyResearch / startNewCity`。`(cityId,economyEventId)` で適用済みの内容を台帳へ保持し、再送は `applied:false, reason:'duplicate'`、未登録の旧都市操作は `stale_city`、同じIDで異なる内容は例外となる。重複・旧都市を時刻処理前に判定する。再出発後もコマンド台帳を保持するため、再出発の保存再試行も設計図を二重加算しない。

コマンドは候補コピーに操作を適用し、成功時だけ元の状態へ確定する。資金不足・前提不一致等の失敗で現在の時計や資源だけが進むことはない。購入画面は表示した見積の `expectedCount` と `expectedTotalCostMicro`（10進文字列）を同時に指定する。最新状態で実数量・価格が変われば再確認を要求し、異なる数量を黙って購入しない。

保存側は最新プロフィールを読む同じreadwriteトランザクションで、cityId・revision・所有権epochを確認し、コマンドと資源・解除・処理済み位置・時計を一緒に保存する。エンジンの台帳だけでは複数タブの所有権やIndexedDB原子性を代替しない。

- `quotePurchase(kind, quantity=1, districtId?)` / `purchase(..., atMs?)`：1/10/max、個別価格の合計、資金不足の部分購入、段階別店舗上限、倍率・輸送待ち・営業速度の前後比較。
- `startPlan` / `pausePlan` / `resumePlan`：停止時も積立を保持、再開時は自由在庫から即時充当。完成後の次計画は自動開始しない。
- `openDistrict`：現在の段階合計とコイン条件。
- `buyRailway`：段階3・10班・コイン・自由在庫条件。予約資材を使わない。
- `buySynergy` / `buyResearch`：前提、価格、単独所有、ランク上限。
- `newCityPreview` / `startNewCity({confirmed, location, landscape, atMs?})`：全6地区段階3と到着100,000、整数平方根による報酬、HOME/RESULT確認。研究・設計図・生涯統計を保持し、cityIdと都市固有台帳を更新する。語彙・実績・設定等は本エンジンの外のプロフィール領域なので変更しない。

`atMs`を与える操作は、指定時刻の到着・建築を先に精算してから操作する。省略時は現在の経済時刻で処理する。保存側で時刻と資源を同一トランザクションにする。

## 保存境界と表示値

`encodeCityState(state)` は `schemaVersion: "1.0.0"` を持つJSON互換データを返す。全micro値と倍率の分子・分母は10進文字列にする。`decodeCityState(unknown)` は外部データの唯一の検証入口で、検証済み `CityState` を返す。未知の版、負数・小数・浮動小数形式、構成と異なる地区・研究、段階・所有上限・計画費用・積立、セッション・事実・コマンドの識別子の不整合を `CityStateError` として拒否し、黙って初期化しない。

保存値の資材保存則も入口で検査する。現在の待ち量と生涯到着量の和は生涯生成量以下（再出発で捨てた待ちがあるため等号とは限らない）。各地区の到着量は、自由在庫・積立・各段階の消費・鉄道消費の合計に等しい。現在の到着総量は全地区の到着量の和になる。入力ごとに同じ検証を繰り返さない。

`summarizeCity(state)` は地区ごとの輸送・営業速度、輸送待ち時間、開通・計画・鉄道費用と可否、研究・連携・再出発の可否を返す。`canInvest` は進行中セッションがある間falseになる。画面側で経済の前提条件を再実装せず、この値と `quotePurchase` を使用する。

## 検証

`python3 tests/economy/generate_fixtures.py` と `python3 tests/economy/generate_transactions.py` は、変更していないPython正本から期待値を再生成する。

- 全644価格、24組の資材倍率境界、整数ms建築境界、停止計画、放置上限、時間分割。
- 4シナリオの操作ごとにPython状態と比較し、各操作間でsnapshotから再構築する。完成・配達・購入・計画・開通・鉄道・全連携・研究・再出発・古い街の事実・復帰再試行を含む。
- コマンド台帳のJSON保存・再読込後の全投資再送、再出発再送、内容衝突、失敗時の原子性、購入見積再確認、破損保存データの拒否、放置復帰の高水位。
- 全投資入口の5モード中拒否、事実内容衝突、入力確認・途中語の資材0、鉄道の予約資材保護、正確な再出発閾値、旧実績用配達回数と経済配達回数の分離。

## 残作業

- IndexedDBプロフィールへの接続、複数タブのrevision・epoch確認と同一トランザクション。コンストラクターはdecode済みの`CityState`を受け取り、内部で同じ検証を繰り返さない。
- ゲームセッション・UI・実績への接続と、確定経済イベントのプロフィール反映。
- 代表20語の経済状態を使った画面統合検証、実際の放置復帰・再起動E2E。

経済単体の動作確認をM3全体の製品統合完了とは扱わない。
