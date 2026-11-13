# ことば便：独立 sakurai 実E2E再レビュー

対象 `6b8900b157700664fc718f914aa62bfab3b908d5`。CI [43486057406](https://github.com/mokusatsu/kotobabin/actions/runs/43486057406) の自身の実ブラウザ操作ログと、その操作で保存したWebKit画像・DOM記録だけを再評価した。実装、製品仕様、他者レビューは読んでいない。

**今回の確認範囲は合格。以前の画面構成P1・切手絵柄P2は解消し、新たな阻害事項は観測しなかった。**

Chromium／WebKit × 1180×720通常／1180×820動きを減らす設定の4経路が完走。入力はTab・方向キー・Enter・Space・Escape・F2のみ。実際の表示語を75〜100語入力し、自然終了まで90.35〜91.82秒、独立した得点画面、毎回22件すべての個別報酬、再挑戦まで確認した。再挑戦の入力画面復帰は282〜376ms。記録した画面にスクロール要求・画面外の操作項目はなかった。

1. **全画面の配達世界：P1解消。** 実際の5語完成＋Space後、倉庫から曲線の道へ出る荷車、道中の移動、届け先側の荷物と到着量の増加を連続記録した。以前の上部150pxの輸送帯／下半分の不透明パネルはなく、道が画面を横断し、文字が世界に重なるHUDになった。720px画面の世界図は1148×664、荷車は約128×96。次の語の先頭文字も輸送中に受け付け、ガイドの強調が進んだ。
   - 原則：桜井氏の動画 #042、短い引用「画面のどこをどのくらい使ってプレイさせるかを意識してレイアウトする」。固定出典 [`skills/sakurai/references/planning.md:28`](https://github.com/kociden/sakurai-skill/blob/913dc46b9dedc5e0b12e3834d25d684cf8213f87/skills/sakurai/references/planning.md#L28)。
   - 私の解釈：タイピングの成果を運ぶ物体と道が主要な画面領域を使うことで、「入力したら世界で荷物が動いた」という関係を追いやすくなった。提案した世界の拡大・不透明パネル撤去は、実操作の記録で確認できた。
   - 証拠：自身の `08-dispatch-5-{departure,transit,arrival}.png/json`、両高さの入力・発送ログ。

2. **獲得切手の個性：P2解消。** 通常設定の22枚を一枚ずつ実際に開き、全22画像を目視した。「最初の建物」は家、「五十のことば」は手紙、「風を切る便」はツバメなど、達成に対応する別々の完成絵柄になった。両高さの22件ずつのDOM記録に「制作中」は0件。動きを減らす設定でも個別の名前・条件・絵柄を順に確認でき、Escapeの動き省略後も同じ獲得品が残った。
   - 原則：動画 #095、引用「単なる報酬では足りない」。固定出典 [`skills/sakurai/references/planning.md:61`](https://github.com/kociden/sakurai-skill/blob/913dc46b9dedc5e0b12e3834d25d684cf8213f87/skills/sakurai/references/planning.md#L61)。
   - 私の解釈：個別開封は達成を褒める瞬間であり、同じ仮絵の反復より、実績に結び付いた絵のほうが「自分が何をできたか」を祝いとして受け取れる。提案した各切手の完成絵柄への置換を確認した。表示は確定済み成果で、抽選・架空のレア度は観測しなかった。
   - 証拠：自身の `11-earned-item-1`〜`22.png/json`、`ACTUAL_REVEALED_ITEM`、`INDIVIDUAL_REVEALS 22`。

3. **建設・設備の地図反映：実資源で確認。** 全体地図から住宅地全域へキーボードで入り、実配達後に中断確認の「終了して移動する」を選んで戻った。段階0の杭・更地が段階1の家・店舗へ変化。獲得コインから50コインの設備購入を実行し、荷づくり台Lv0→Lv1に加えて同じ地図上の箱・設備表示が増えた。
   - 原則：動画 #180、引用「効果を可視化（数値の序列でなく直感的に）」。固定出典 [`skills/sakurai/references/planning.md:110`](https://github.com/kociden/sakurai-skill/blob/913dc46b9dedc5e0b12e3834d25d684cf8213f87/skills/sakurai/references/planning.md#L110)。
   - 私の解釈：街の成長が数値だけでなく、購入前後で同じ場所に建物・設備として残るため、配達の使い道を直感的に確かめられる。今回の家・店舗・荷づくり台について追加修正は不要。
   - 証拠：自身の `03-plot-plan`、`14-earned-construction-map`、`15-earned-equipment-options`、`16-actual-equipment-purchase-map.png/json`。

**期限を跨ぐSpaceの過去指摘には検証上の留保が残る。** 過去の自身の実走では、最後の語の配達Space時に既に「届いた切手を見る」がフォーカスされ、得点画面を通り過ぎた。動画 #244の引用「ただし演出がゼロだと戸惑う」（固定出典 [`skills/sakurai/references/specs.md:99`](https://github.com/kociden/sakurai-skill/blob/913dc46b9dedc5e0b12e3834d25d684cf8213f87/skills/sakurai/references/specs.md#L99)）を、私の解釈として、前画面の操作が新しい画面の意味を勝手に消さない文脈引継ぎへ適用した。修正案はキー解放・新しい意思入力を待つ短い入口保護だった。今回4経路では独立得点画面から意図したEnterで進めたが、ログに同じ期限跨ぎの瞬間はなく、この境界条件そのものの解決を断定しない。

証拠の保管先：`evidence/6b8900b-{chromium,webkit}.log`、`own-artifacts/6b8900b/webkit/`。画像は実E2Eの補助であり、画像確認をブラウザ操作の代わりにはしていない。評価用スキルはコミット `913dc46b9dedc5e0b12e3834d25d684cf8213f87` に固定した。
