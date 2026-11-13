# H系切手の制作候補

2026-11-13（指定クライアント日付、Asia/Tokyo）。先行するH01・H02を実際のimagegenで生成した。正本manifestのvisual_brief、512×512 RGBA、基準点(256,256)、安全域[32,32,480,480]、枠・文字・数値・状態を焼き込まない条件を確認した。H03〜H06はこの先行コミットでは未制作。

| ID | 原画の主題 | 全alpha範囲（右・下排他的） | runtime bytes | 状態 |
|---|---|---|---:|---|
| stamp_h01 | 封筒を脚でつかむハヤブサ、後ろへたたんだ流線形の翼 | (38,100)〜(471,394) | 99,094 | 制作候補、独立QA・実行時待機 |
| stamp_h02 | 静かな丸窓、手紙、上へまっすぐ伸びる一本の光 | (111,113)〜(394,476) | 83,920 | 制作候補、独立QA・実行時待機 |

原生PNGは1254×1254 RGBA。全キャンバスを448×448へ比例縮小し、512×512の(32,32)へ配置。切り抜き・マスク・alpha除去はせず、H01の大きな白いぼかしは**実際のimagegen編集**で透過へ修正した。H01初回の不採用原画も `public/assets/originals/rejected/family-h/` に保持する。全2点で安全域外alpha0、指定PNGと可逆WebPの全alphaとクリーム背景への合成結果が一致する。

実行時は `assets/achievement_stamp/stamp_h01.webp` と `stamp_h02.webp`。ネイティブ原画を `originals/{ID}.generated.png`、指定寸法PNGを `originals/{ID}.png` に保存。全3回の実行プロンプト・参照・UUID・選定理由は `originals/production/family-h/requests.json`、SHA-256・寸法・検査結果は `measurements.json`、再書き出しは `export.py`。最小比較は同階層 `preview/min-size.png` と `min-size-gray.png`。

制作担当は原生全点と、共通枠を合成した160/90px（絵柄128/72px）の彩色・グレーを目視した。鳥と封筒、丸窓と手紙は読める。H01は翼をたたんだ飛翔姿勢が静止でやや止まって見える可能性、H02の細い金色の糸は72pxとグレーで弱くなる点を、実際の結果画面での検収事項として残す。独立QA、結果画面合成、iPad/Safari、E2Eの合格を主張しない。UI・共通台帳・正本は編集せず、公開も行っていない。
