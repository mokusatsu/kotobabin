# M7 実表示コントラスト監査

初回対象はcandidate `d0da1aa`（main v8の後続M7）。製品sourceと共有CIは変更せず、既存の主要UIを実際に巡回する1件のread-only監査を専用CIへ追加した。作成時点ではbrowser結果未取得で、合格や不具合はまだ主張しない。

## 測定方法

1180×720、Chromium、静的production build、font100%でhome/地区/設備/入力確認/導入/MAIN/停止/設定/結果/手帳/図鑑/猫練習を開く。分割画面はnative Tab/矢印で全panelを巡回し、その時点で表示された通常DOM文字と入力/selectのcomputed colorを採取する。大規模なfixtureや製品の私的stateは注入しない。便終了の既存clock制御はUIへの到達にのみ用い、コントラスト値を操作しない。

単色の祖先background-colorを近い順にたどり、最初のopaque背景までRGBAを採取し、背面からalpha合成する。foregroundのalphaも背景へ合成し、WCAG sRGB相対輝度から比率を計算する。4.5:1未満はlowとして全selector/画面/文字/色/比率を記録する。大きい文字の3:1例外で通常文字の契約を緩めない。

画像/gradient/描画pseudo、重なるart、opacity/filter/blendで単色合成を確定できない文字は**unmeasured**とし、比率をnullにする。pointer-events:noneの背景も矩形で保守的に検出する。opaque祖先が遮る外部画像はその文字背景へ混ぜない。これはpixel色を推測する監査ではなく、複雑背景の文字を合格へ加算しない。装飾SVG、disabled/aria-disabled/inert、aria-hiddenは通常文字から除く。空inputは設定された文字styleの記録で、実glyphを打った状態とは区別する。

外観のアンチエイリアス・影による輪郭や画像領域全体の最悪コントラスト、全OS/全解像度、未訪問の全状態はこの監査の測定範囲ではない。特に画像上HUDは不確定として残し、必要なら実画像の背面/haloを別途検査する。低contrastが観測されたら親へ具体的に報告し、製品修正は親の担当にする。

JSON全標本はtest-results/contrast配下へ実ファイル保存し、native logへ低値の要約を出す。low/unmeasuredを隠すため監査を止めず全巡回してから報告するため、job successはcontrast全件合格の意味ではない。公式CIのみで実browserを動かし、代替ローカルserverは起動しない。
