# M6 指摘1の追試：source329f489

追試対象は `329f489adc3c720336c61fd255c1806fa6a98c1b`。自分の無改変 `final-runner.mjs` を実Chromium/WebKitで再実行した8経路のログ・DOM JSON・補助画像だけを根拠とする。親の実装説明を修正確認の根拠にしていない。

**指摘1は修正確認済み。** 8/8経路で、絵が実際に表示されるページに「郵便局の絵葉書 · 未獲得のプレビュー」が残り、自然な90秒のプレイと報酬獲得後には同じ場所が「郵便局の絵葉書 · 獲得済み」へ変わった。画像の実ロードも各経路の獲得前後で確認した。720通常の前後画像と820reduceの前後画像を実見し、絵の直上の状態ラベルを読み取れた。

元の評価根拠は桜井氏の動画 #018「わかりやすさとスタイル性」の要点「ウィンドウ化による関連付け」――[固定版 `skills/sakurai/references/ui.md` 7行](https://github.com/kociden/sakurai-skill/blob/913dc46b9dedc5e0b12e3834d25d684cf8213f87/skills/sakurai/references/ui.md#L5-L7)。画像とその所有状態を別ページで照合する必要がなくなったため、この指摘の因果となった情報分離は解消したと判断する。

- [720通常・未獲得で絵を表示](/workspace/work/sakurai-m6-collection/own-artifacts/final-329f489/chromium/m6-inventory.launch.ts-ind-5ab14-on-and-natural-round-review-chromium/own-probe/chromium-720-no-preference-unowned-preview-image.png)
- [720通常・獲得後に絵を表示](/workspace/work/sakurai-m6-collection/own-artifacts/final-329f489/chromium/m6-inventory.launch.ts-ind-5ab14-on-and-natural-round-review-chromium/own-probe/chromium-720-no-preference-post-round-preview-image.png)
- [820reduce・未獲得で絵を表示](/workspace/work/sakurai-m6-collection/own-artifacts/final-329f489/webkit/m6-inventory.launch.ts-ind-5ab14-on-and-natural-round-review-webkit/own-probe/webkit-820-reduce-unowned-preview-image.png)
- [820reduce・獲得後に絵を表示](/workspace/work/sakurai-m6-collection/own-artifacts/final-329f489/webkit/m6-inventory.launch.ts-ind-5ab14-on-and-natural-round-review-webkit/own-probe/webkit-820-reduce-post-round-preview-image.png)

8経路すべて、自然時間で90秒の完了表示→27件の個別獲得提示（番号1〜27を重複なし）→まとめ→獲得後の鑑賞へ再到達した。キーボード操作で進行不能は観測していない。720の鑑賞は画像が2/3ページ、820は2/2ページとなった。720の画像ページでは前の表示へ、820ではコレクションへ戻るへフォーカスがあり、いずれも操作可能だった。

寸法の留保は再現した。WebKit・1180×720・通常の初回 `handbook-before` の1記録で文書高2736px、ほかの531記録はビューポート内だった。これは2回の最終実行で同じ場面に現れた観察である。現時点では持続時間の追加測定を待っており、定常的にはみ出すとも、自動で収まるとも断定しない。

[8経路の追試集計](/workspace/work/sakurai-m6-collection/retest-329f489-summary.json)、[自身のChromiumログ](/workspace/work/sakurai-m6-collection/evidence/final-329f489-chromium.log)、[自身のWebKitログ](/workspace/work/sakurai-m6-collection/evidence/final-329f489-webkit.log)。元レビューの未検証範囲はこの追試でも維持する。


## 初回手帳の時間追試

製品source329f489を対象に、別review branch95f858aで自分の[timing-probe.mjs](/workspace/work/sakurai-m6-collection/timing-probe.mjs)を実行した。既知のF2→Tab選択→Enterで初めて配達手帳を開き、その後はキーボード操作を加えず、実時間を待って記録した。状態・時計の改変はない。

| ブラウザー | Enter後の実記録時刻 | 文書高 | 可視controls数 | 可視controlsの最下端 | フォーカス |
|---|---:|---:|---:|---:|---|
| Chromium | 306ms | 720px | 11 | 632.47px | H1 配達手帳 |
| Chromium | 1343ms | 720px | 11 | 632.47px | H1 配達手帳 |
| Chromium | 4378ms | 720px | 11 | 632.47px | H1 配達手帳 |
| WebKit | 318ms | 2736px | 32 | 2450.92px | H1 配達手帳 |
| WebKit | 1856ms | 720px | 11 | 632.44px | H1 配達手帳 |
| WebKit | 4943ms | 720px | 11 | 632.44px | H1 配達手帳 |

ビューポートはすべて1180×720、通常の動き設定。WebKitで初回のはみ出しが再現した一方、操作せず待つだけで画面内のページ表示へ収まることを実観察した。はみ出しは318msの標本に存在し、1856msの標本で消えていた。収束時刻はその標本間であり、発生からの厳密な継続時間は測っていない。4943msでも画面内を維持した。したがって、従来の留保を「初回の短い表示過程ではみ出しを観測するが、この実行では約1.856秒時点までに自動収束し、焦点は失われなかった」へ具体化する。常時スクロールが必要な状態とも、初回はみ出しまで解消した状態とも評価しない。

実行時間は要求した待ち時間と一致するとは限らないため、上表にはスクリーンショット・記録処理も含んだ実際の経過msを記載した。

[自身のChromium時間追試ログ](/workspace/work/sakurai-m6-collection/evidence/timing-95f858a-chromium.log)、[自身のWebKit時間追試ログ](/workspace/work/sakurai-m6-collection/evidence/timing-95f858a-webkit.log)。


統合注記：[実行43515540825](https://github.com/mokusatsu/kotobabin/actions/runs/43515540825)、補助artifact Chromium14080943148 / WebKit14080483676。時間追試は[43518061711](https://github.com/mokusatsu/kotobabin/actions/runs/43518061711)、artifact14080839430 / 14080919310。本文のローカル証跡パスは実行時の保存先。
