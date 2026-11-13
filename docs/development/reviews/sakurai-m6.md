# ことば便 M6 独立E2Eレビュー

対象は最終source `108da49`。評価基準は [sakurai-skill（固定commit 913dc46b9dedc5e0b12e3834d25d684cf8213f87）](https://github.com/kociden/sakurai-skill/tree/913dc46b9dedc5e0b12e3834d25d684cf8213f87) のSKILL.mdおよびUI・企画設計の関連参照だけを使用した。AGENTS.mdはユーザーのレビュー規則として読んだ。製品実装、製品仕様、製品テスト、過去レビュー、他者QAは評価資料にしていない。

## 判定

**8経路すべて、自然時間の90秒完走、今回の27枚すべての個別提示、結果まとめ、獲得前後の絵葉書鑑賞へキーボードで到達した。進行不能は観測していない。改善指摘は1件。**

自分で著作した [無改変の実行シナリオ](../../../tests/reviews/sakurai-m6-final.mjs) をCIの実Chromium/WebKitへ無改変で渡して実行した。画面内に現れたローマ字を読み、通常のキーボード入力で完成させた。時計・保存値・アプリ状態の改変、強制フォーカス、クリックは使用していない。画像はこの操作履歴の補助資料として扱った。

| ブラウザー | 画面 | 動き | 完成語数 | 結果得点 | 個別提示 | まとめ・鑑賞 |
|---|---|---|---:|---:|---:|---|
| Chromium | 1180×720 | 通常 | 123 | 12,064 | 1〜27/27 | 到達 |
| Chromium | 1180×720 | reduce | 120 | 12,220 | 1〜27/27 | 到達 |
| Chromium | 1180×820 | 通常 | 123 | 12,068 | 1〜27/27 | 到達 |
| Chromium | 1180×820 | reduce | 121 | 12,168 | 1〜27/27 | 到達 |
| WebKit | 1180×720 | 通常 | 110 | 10,980 | 1〜27/27 | 到達 |
| WebKit | 1180×720 | reduce | 102 | 10,318 | 1〜27/27 | 到達 |
| WebKit | 1180×820 | 通常 | 113 | 11,104 | 1〜27/27 | 到達 |
| WebKit | 1180×820 | reduce | 109 | 10,876 | 1〜27/27 | 到達 |

点数差は各実行で完成した語・入力回数が異なる記録であり、性能やブラウザー間の得点同一性を判断する比較実験ではない。

## 確認できた動作

- F2、Tab、Enter、Escだけでホーム・配達手帳・コレクションを行き来した。入力準備で実際に `a` を入力し、「準備できました →」から進行した。初回導入は実画面の「導入を飛ばして本編へ」で進め、本編を自然時間で完走した。
- 結果には「90秒の配達、完了。」「新しい切手が27枚」。通常設定では封筒→開封→次の切手を27件進め、reduceでは封筒段階を挟まず各切手の提示を27件進めた。全経路で番号1〜27を重複なしに確認した。最後は「今回の配達」「また、ひとつ先へ。」のまとめへ到達した。
- 開封画面には成果名、解除した行為、切手絵柄、同名称号、「配達の成果として、すでに確定しています。」を表示した。大きな絵柄と成果名、明瞭な次操作を自分の実操作後の画像で確認した。長い条件文の例「流れが速くなった」も720画面内に収まっていた。
- 結果直後は「届いた切手を見る →」、開封後は「次の切手へ →」、鑑賞画像のページでは「コレクションへ戻る」にフォーカスがあり、強制操作なしで次へ進めた。最初の開封後にEscを入力しても、その切手と次操作を維持した。全演出省略のSキーは表示を確認しただけで、今回の最終経路では押していない。
- 「郵便局の絵葉書」は獲得前に「未獲得のプレビュー」、完走後に「獲得済み」と表示した。画像の実ロードも両方で確認した。720では390×243.75、820では540×337.5で、郵便局・自転車・花の絵が表示された。鑑賞しても装着を変えない旨の説明があり、装着操作は行っていない。

## 指摘1：絵を眺めているページでも、その報酬の所有状態を残す（中優先度）

**観察事実**

全8経路の `unowned-preview` と `post-round-preview` は1/2ページに報酬名と「未獲得のプレビュー／獲得済み」を表示する。しかし「次の表示 →」を実際に決定した2/2ページでは、その名前と状態ラベルが消える。絵そのもの、同じ解除条件「A系統の実績を3件解除」、同じ鑑賞説明だけが表示される。獲得前後の画像に違いはなく、上部の0/72枚と27/72枚は全体の枚数である。

補助画像：[未獲得で絵を表示](/workspace/work/sakurai-m6-collection/own-artifacts/final-108da49/chromium/m6-inventory.launch.ts-ind-5ab14-on-and-natural-round-review-chromium/own-probe/chromium-720-no-preference-unowned-preview-image.png)、[獲得後に同じ絵を表示](/workspace/work/sakurai-m6-collection/own-artifacts/final-108da49/chromium/m6-inventory.launch.ts-ind-5ab14-on-and-natural-round-review-chromium/own-probe/chromium-720-no-preference-post-round-preview-image.png)。操作と表示内容は同ディレクトリーのJSONの該当ラベルで追跡できる。

**skillの記載（逐語引用）**

> 「ウィンドウ化による関連付け」

桜井氏の動画 #018「わかりやすさとスタイル性」の要点。[固定版 `skills/sakurai/references/ui.md` 7行](https://github.com/kociden/sakurai-skill/blob/913dc46b9dedc5e0b12e3834d25d684cf8213f87/skills/sakurai/references/ui.md#L5-L7)。

**当てはめる理由（レビュー側の解釈）**

この画面では同じ報酬を未獲得でも鑑賞できるため、「いま見ている絵」と「自分が獲得したか」は関連付けて読む必要がある情報である。状態を前のページへ分離すると、絵を眺めながら所有状態を確かめるにはページを戻る必要がある。全体の枚数だけでは当該絵の所有は判断できない。skillがこのページ構成を直接禁じているという主張ではなく、関連する情報をまとめる道具をこの用途へ適用した判断である。

**具体的な修正案**

絵のすぐ上に「郵便局の絵葉書 · 未獲得のプレビュー」または「郵便局の絵葉書 · 獲得済み」を残す。ページ送りで隠れない短いヘッダーとして画像と同じ表示単位にまとめる。枚数表示と装着を変えない説明はそのまま併記できる。

## 寸法の留保と未検証範囲

最終記録532件中531件は文書サイズが実ビューポートと一致した。例外はWebKit・720・通常の `handbook-before` 1件で、取得時点の文書高2736px、補助画像でも下部が画面外だった。次のコレクション操作以降79件は720pxに収まり、この経路はスクロール入力なしで完遂した。初回手帳表示の持続時間や再現頻度を追加測定していないため、常時発生する問題とは断定しない。同時に、全画面が常にスクロール不要とする無条件の合格にも広げない。[その時点の補助画像](/workspace/work/sakurai-m6-collection/own-artifacts/final-108da49/webkit/m6-inventory.launch.ts-ind-5ab14-on-and-natural-round-review-webkit/own-probe/webkit-720-no-preference-handbook-before.png)。

鑑賞の具体的な前後比較は郵便局の絵葉書1種。全40種の鑑賞物、額縁や称号の装着変更、72実績全件、実iPad、OSのIME挙動、音、フレームレート・遅延性能はこのレビューで検証していない。reduceはブラウザーコンテキストの動きを減らす設定として実行し、ゲーム内設定の変更操作とは区別した。

## 証跡

- [自分の最終Chromiumログ](/workspace/work/sakurai-m6-collection/evidence/final-108da49-chromium.log)
- [自分の最終WebKitログ](/workspace/work/sakurai-m6-collection/evidence/final-108da49-webkit.log)
- [8経路の集計と元JSONへの参照](/workspace/work/sakurai-m6-collection/final-evidence-summary.json)
- 補助画像・DOM JSON：`own-artifacts/final-108da49/chromium/` と `own-artifacts/final-108da49/webkit/`

前段の探索で付けた `result-first` 等は単なるスクリプトの記録名である。今回の完走判断は記録名ではなく、自然な残り時間の推移、実際の完了文、成果、個別の切手番号、まとめ画面の実DOMに基づく。


統合注記：実行は[CI43510839755](https://github.com/mokusatsu/kotobabin/actions/runs/43510839755)のsource108da49。補助画像・元JSONは同runのartifact Chromium14078812909 / WebKit14079131495、集計は[sakurai-m6-evidence.json](sakurai-m6-evidence.json)。本文のローカル証跡パスは実行時の保存先をそのまま保持した。指摘本文は独立担当の記述であり、追修正の合格を意味しない。
