# M7 画面品質と隔離開発比較の受入

M7は初回手帳のはみ出し、WebKitの設定focus枠、全地図の最小幅、可視補助文字の初期16pxと選択倍率、都市数値と配達ボタンのcontrastを修正した。技術仕様§13の独立開発画面を追加し、通常の記録・街・実績を更新せず条件を再現できるようにした。Goal全体の完成ではない。

## 検証済み候補

source a58bc12の通常CI43525392565は全5成功、312単体/34files・113機能E2E。本番の自然90秒はChromium/WebKit各2、音声各3。全36画面条件43525392574も両engineで成功した。最初99bでは、文字を大きくした4枠装着/720高150%でdockが728〜774pxへはみ出す失敗を検出。文字を縮めず、gallery時のgapと重複readonly通知を調整して解消した。

初回手帳43525392820は両engine各12成功（早期手帳6＋世界/地区6）。DOM commit時点から画像保留中に計測し、後から画面内へ収束するだけの修正ではない。focused radioはWebKitでpseudo=falseでも実outline solid2px/primary色/contrast7.734が存在することを検証した。通常コントロールは元のfocus-visible判定を維持する。

dev比較43525392766は両各5成功。正式既定ルール90000ms/1打10点/荷物5/分母5を維持し、比較だけで60秒/20点/荷物3等を指定できる。公開GameSession操作で再生し、通常DB open0/元profile不変、半角a非採点、seed再現、custom語・期限を実入力で確認。OSの実IMEイベントを模擬再現の成功へ読み替えない。

性能43525392569はhandlerP95 4.7ms、描画15.7ms、longTasks0、245 native入力・72ID・960filter。20 uncached 10Mbps/RTT100ms試行の開始P95は583.42ms、最大転送735126bytes。予算/fixtureを緩めて合格にしていない。CIホストの実測であり物理iPadの保証値ではない。

[contrast記録](m7-contrast-audit.md)の通常時計追試は、775単色標本low0、city4.852:1・有効配達ボタン8.025:1。画像等185の未測定は残す。

## 最終追試と配布

14b4501でcompact地区名/図説明も選択文字倍率へ一貫追従させた。統合CI、fresh独立sakuraiの自然90秒と最終短期UI追試は進行中。成功を先取りせず、結果と同じSiteへの配布/配信先27件・nativeブラウザー200%をこの節へ追記する。

## 残るGoal

[資材棚卸し](m8-asset-acceptance-inventory.md)の3ID、局所の実合成記録、画像上等のcontrast、支援技術の発話、[OS入力と人6名の観察](manual-acceptance.md)を継続する。存在しない旧データ移行、人による全960語/72実績のやり直し、RGBA数学同一等の独自gateは追加しない。
