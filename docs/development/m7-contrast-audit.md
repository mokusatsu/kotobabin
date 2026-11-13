# M7 実表示コントラスト監査

初回対象はcandidate `d0da1aa`（main v8の後続M7）。製品sourceと共有CIは変更せず、既存の主要UIを実際に巡回する1件のread-only監査を専用CIへ追加した。作成時点ではbrowser結果未取得で、合格や不具合はまだ主張しない。

## 測定方法

1180×720、Chromium、静的production build、font100%でhome/地区/設備/入力確認/導入/MAIN/停止/設定/結果/手帳/図鑑/猫練習を開く。分割画面はnative Tab/矢印で全panelを巡回し、その時点で表示された通常DOM文字と入力/selectのcomputed colorを採取する。大規模なfixtureや製品の私的stateは注入しない。便終了の既存clock制御はUIへの到達にのみ用い、コントラスト値を操作しない。

単色の祖先background-colorを近い順にたどり、最初のopaque背景までRGBAを採取し、背面からalpha合成する。foregroundのalphaも背景へ合成し、WCAG sRGB相対輝度から比率を計算する。4.5:1未満はlowとして全selector/画面/文字/色/比率を記録する。大きい文字の3:1例外で通常文字の契約を緩めない。

画像/gradient/描画pseudo、重なるart、opacity/filter/blendで単色合成を確定できない文字は**unmeasured**とし、比率をnullにする。pointer-events:noneの背景も矩形で保守的に検出する。opaque祖先が遮る外部画像はその文字背景へ混ぜない。これはpixel色を推測する監査ではなく、複雑背景の文字を合格へ加算しない。装飾SVG、disabled/aria-disabled/inert、aria-hiddenは通常文字から除く。空inputは設定された文字styleの記録で、実glyphを打った状態とは区別する。

外観のアンチエイリアス・影による輪郭や画像領域全体の最悪コントラスト、全OS/全解像度、未訪問の全状態はこの監査の測定範囲ではない。特に画像上HUDは不確定として残し、必要なら実画像の背面/haloを別途検査する。低contrastが観測されたら親へ具体的に報告し、製品修正は親の担当にする。

JSON全標本はtest-results/contrast配下へ実ファイル保存し、native logへ低値の要約を出す。low/unmeasuredを隠すため監査を止めず全巡回してから報告するため、job successはcontrast全件合格の意味ではない。公式CIのみで実browserを動かし、代替ローカルserverは起動しない。

## 初回の実ブラウザー観測

source `2e777bb`（製品base d0da1aa）、[CI43522125762](https://github.com/mokusatsu/kotobabin/actions/runs/43522125762)、job132218763421、実Chromium158.0.8127.18。監査1例は11.8秒で完走し、33画面/panel・単色計算773標本・複雑背景等で未測定194標本を記録した。artifact14083421403の実JSONも取得して確認した。

確定した低contrastはcity/equipmentの `#city-coin`／`#city-income`／`#city-warehouse`。通常16px/700の数値で、foreground `rgb(179,78,57)`／opaque背景 `rgb(216,231,215)`、比率 **4.0169956827:1**（2画面×3、disabledでも装飾SVGでもない）。親へ報告し、親が製品修正を担当する。

main-playing/practice-completeで有効な `#deliver-label` は白／その瞬間のopaque背景 `rgb(211,219,210)`、**1.4157609506:1**を観測した。初回は語完成の直後2RAFで採取しており、`button`のbackground .15s transition中か定常かを断定しない。次の限定追観測では、native語完成を開始する前から450msを毎RAF観測してdisabled状態・実color/background・比率・transitionを保存し、同じ便の定常状態も採取する。低い瞬間を待って隠す変更ではない。

主な採取済みinputは、確認画面の黒／(255,254,247)が20.77:1、gameの(32,61,54)／(255,254,248)が11.66:1。homeの測定可能最小4.91、停止6.32、設定6.20、手帳4.86、図鑑4.52。これらは当該単色確定標本の最小であり、画像/gradient上の未測定文字を含む画面全体の合格値ではない。結果はopacity/画像/gradientを含み多くが未測定、タイピングの背景画像上HUDも一括合格にはしない。全標本のselectorと不確定理由はJSONに残す。

## 実RAF追試：配達ボタンの遷移原因

source `bc12edd`（同じ未修正製品base）、[43522653028](https://github.com/mokusatsu/kotobabin/actions/runs/43522653028)、job132220519595は14.0秒で監査完走。native `BUTTON_CONTRAST_FRAMES` 28標本を独立取得した。時刻は**録画開始相対**であり、有効化の厳密瞬間からの経過ではない。

| 相対ms | disabled | foreground／background | 比率 |
|---:|---|---|---:|
| 47、59 | false | white／(233,236,227) | 1.1951 |
| 74 | false | white／(211,219,210) | 1.4158 |
| 106 | false | white／(119,151,142) | 3.1810 |
| 122 | false | white／(87,127,117) | 4.4701 |
| 139 | false | white／(65,111,101) | 5.6965 |
| 202〜459 | false | white／(36,89,79) | 8.0249 |

最初の1標本だけdisabledであり、その標本を通常文字の不合格へ含めていない。有効な文字が背景の0.15秒transition中に白へ先行して変わり、定常では合格するという原因を確認した。MAIN定常captureではこの低値は消えた一方、practice完成直後では同じ1.4158を再観測した。親へ、配達ボタンだけのbackground/color transitionを外して同時に可読色へ切り替える最小修正案を報告した。製品は本担当で変更していない。

cityの6標本はこの追試でも4.017で、transition由来ではない。親は別integrationで局所色修正中であり、その修正後の実測は本追試へ先取りしない。

## 既存標本の補助文字サイズ（追加runなし）

親の依頼により、初回JSONの100%標本だけから16px未満を抽出した。これはcontrastの新しい合否条件を作るものではなく、技術§12.1の補助文字初期16pxと比較する具体的な観測である。

| 実表示selector／場面 | computed px |
|---|---:|
| `.world-map-help`／home | 12 |
| `.world-map-help kbd`／home | 10.8 |
| `.dock-key-hint`／home | 11.2 |
| `.course-option small`／homeの3説明 | 12 |
| `#save-status`／home | 10.4 |
| `.city-balance span`、`#city-coin/#city-income/#city-warehouse`／home | 12.8 |
| `.button-small > kbd`／F2・Esc | 14.4 |
| `#deliver-button > kbd`／有効Space | 14.4 |
| `#save-status`／結果3phase | 12 |

`.delivery-route-state/.delivery-confirmation` はcomputed14pxだが、現在CSSではclipで可視inkを0にした読み上げ用live regionである。これを可視補助文と混同しない。初回collectorのrange採取にはこの未測定行も入ったため、後続collectorではzero-clipを表示対象から除外する（contrastのlow値を除外する変更ではない）。この表は訪問した状態だけであり、全画面/全状態の文字サイズ網羅監査とはしない。
