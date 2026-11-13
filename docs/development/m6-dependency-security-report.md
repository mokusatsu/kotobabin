# M6 依存関係・静的配信セキュリティ確認

対象sourceは **main `d645d9e`**。専用worktree `/workspace/work/m6-security-audit`、branch `audit/m6-dependency-security` で、2026-11-13 UTCに確認した。`goal.md` M6の依存関係／セキュリティ確認を対象とする独立監査であり、ゲーム全体の完成判定や公開先E2Eを代替しない。

**今回の範囲で修正を要する実問題は検出しなかった。** package、lock、srcは変更せず、このreportだけをコミットする。脆弱性や到達する危険な入力経路の根拠なしに依存major更新、追加の実行時検証、CI gateを導入していない。

## 依存関係と本番到達性

Node **24.22.1**、npm **11.9.0** を使用。`npm audit --json` と `npm audit --omit=dev --json` はともにexit0、info/low/moderate/high/critical **全0件**、vulnerabilitiesオブジェクトは空だった。これは監査時点のnpm advisory照合結果であり、未知の問題の不在を証明するものではない。

lockfileVersion3、packages201項目（rootを含む）。第三者パッケージはすべてdev指定で、第三者production依存は0。npm auditのprod1はroot自身を含む集計である。全resolvedは `registry.npmjs.org`、resolved項目のintegrity欠落は0、git/file/独自registry依存はない。

| 直接依存のlock実版 | 用途・到達性 |
|---|---|
| @eslint/js 9.39.5 / eslint 9.39.5 | 開発時Lint。静的配信でNode/Lint処理は動かない |
| typescript-eslint 8.72.2 | 開発時Lint。typescript-estree配下minimatchは既存overrideにより11.0.8 |
| typescript 5.9.3 | ビルド時型検査。ブラウザーからコンパイラーを起動する経路なし |
| vite 7.3.8 | ビルド／開発サーバー。productionは生成済み静的ファイル。Vite dev serverへの本番到達性なし |
| vitest 4.1.12 | 開発／CIテスト。アプリからのimportなし |
| @playwright/test 1.65.0 | CIブラウザーテスト。アプリからのimportなし |

srcからbare-package runtime importは検出しなかった。Vite生成のmodule-preload補助コードはbundleへ入るが、開発サーバー、テストrunner、Lint/型検査の処理が配信時に起動するものではない。監査advisoryは0件のため、個別脆弱性についてproduction到達／非到達へ振り分ける対象はない。

主な間接依存はRollup4.68.3、esbuild0.28.2、通常経路のminimatch3.1.5。既存のtypescript-estree配下overrideはminimatch11.0.8で、Node engineは20または22以上。CIのNode24と今回の実行環境は条件を満たす。通常 `npm ci` が成功し、後述のbuild/lint/typecheck/testsで現lockの互換性を確認した。lockのinstall script指定はesbuildとmacOS向けoptional fsevents2.3.3。勝手な依存削除やoverride変更はしていない。

`npm ci` はeslint9.39.5のサポート終了警告を出した。これは今回のauditで検出された脆弱性ではなく、将来の開発ツール更新時に扱う保守情報として区別する。根拠なしのESLint major更新は行わない。

確認対象hash:

- package.json SHA-256: `2b031ce8e58f59a97533a6de3fd1b04c0b7ff78ef2b156221cf634aa5aed02dc`
- package-lock.json SHA-256: `5aff37c2909498814be517b2d61d2fb103716d735994d6d3410e01530a0b1d68`

## DOM、外部通信、秘密情報

`innerHTML`、`outerHTML`、`insertAdjacentHTML`、`document.write`、`eval/new Function`、通信API、URL生成、保存／復元入口を検索し、以下の実データ経路を確認した。

- `src/ui/index.ts` のtemplate挿入、`delivery-scene.ts`、`result-stage.ts` は固定catalog／既知ID／数値stateから組み立てる。`bootstrap.ts:5–9` のHTML復帰は同じ初期HTMLのsnapshotで、外部HTMLの取得ではない。外部入力からscript実行、document.write、evalへ到達する経路は検出しなかった。
- バックアップで外部文字列になるファイル名は `src/ui/profile.ts:20–22` の `restoreConfirmation` で `&<>"'` をescapeしてからHTMLへ入る。エラー・保存状態等の通知はtextContent。図鑑検索は既知960語のfilterで、queryをHTMLへそのまま挿入しない。
- 地区・景観・設備・報酬のasset URLは固定catalogと既知ID、`import.meta.env.BASE_URL` から生成される。都市のlandscape/district等は `src/economy/codec.ts` のchoicesで入口検証され、任意のimport文字列をURLへ使わない。
- 明示的なfetchは `src/audio/AudioPlayer.ts:114` の同一base内の固定音源。外部HTTP/WebSocket、解析telemetry、ユーザー入力の送信、URLパラメーターからの自動importは検出しなかった。生成されたproduction JS2本にも絶対HTTP(S) URL文字列はなかった。
- `src/ui/index.ts:923` の読み上げはボタン操作によるブラウザーのSpeechSynthesisで、送る値は公開catalogの読み。ブラウザー／OSの音声エンジンが内部で通信するかはアプリコード外なので、アプリのfetchが同一originであることから「端末全体で外部通信0」とは断定しない。
- MessageChannelは内部taskの通知、BroadcastChannelは同一originで保存状態の更新通知に使う。外部windowメッセージをHTML／コードとして処理するlistenerは検出しなかった。

実際に `npm run build` したdistを検査した。219個のテキストファイル、95個のSVGを確認し、既知の秘密鍵／主要token形式の文字列、`.env`・`.npmrc`・秘密鍵ファイル名、source mapは検出0。SVGのscript/foreignObject/iframe、event handler属性、外部／javascript/dataのhref/srcも検出0だった。これは対象のファイル名・形式・パターン検査であり、あらゆる種類のsecretの不在を保証する検査ではない。

public配下の原画制作provenanceはdistにも含まれるが、画像生成の説明・参照パスをプレイヤーのバックアップやcredentialと混同していない。プレイヤーの保存内容をstatic bundleへ書き出すbuild経路はない。srcの環境変数参照はViteのBASE_URL/DEVに限定され、秘密をbundleへ埋め込む参照は検出しなかった。

本番JS検査対象:

- `assets/index-B14WJxgy.js`、2,468bytes、SHA-256 `fee3177f6bee9d45632b07353b7e78b1625d1993088710ce8a3e6100ffa02e7b`
- `assets/main-BAJUTE2x.js`、813,031bytes、SHA-256 `f9e5674cbac73fda4c1ca0a0a1a98f9645a55b61a9474ded2ee259951a4979e9`

## バックアップ入口

`src/ui/index.ts:405–435` はユーザーが選んだローカルFileを読み、`parseProfileBackup` で検証してから確認画面を出す。自動URL取得／自動上書きではない。`src/profile/repository.ts:71–132` ではJSON parse、現行v4、settings enum、既知語ID、整数／合計整合性、都市／実績の入口検証がある。主要objectの `__proto__` / `prototype` / `constructor` は拒否される。

`restoreData`（同433行以降）は明示confirmed、所有権、revision/generation、保護された破損状態を確認し、元データの控え作成と置換をtransactionで扱う。import側の所有者metadataを採用せず、現ローカルmetadataから世代を更新する。JSONの未使用extension文字列をHTMLやコードへ深くmergeする経路は検出しなかった。

書き出しは同UI440行以降で、local Blobを固定名 `kotobabin-backup.json` でdownloadし、object URLをrevokeする。外部uploadやserver保存は行わない。実問題のない入口以外へ追加validationを広げていない。

## 実行結果と受入の区別

| 実行 | 結果 |
|---|---|
| npm audit --json | exit0、全severity0 |
| npm audit --omit=dev --json | exit0、全severity0 |
| npm ci | 成功、150packages追加。現lockを変更しない |
| npm run build | 成功。56modules、上記production bundle生成 |
| npm run lint | 成功 |
| npm run typecheck | 成功 |
| npm test -- tests/profile/restore.test.ts tests/profile/repository.test.ts tests/profile/achievements.test.ts | **3 files / 62 tests passed** |
| git diff --exit-code -- package.json package-lock.json | 差分なし |

既存62 testsには、不正backup／整合性、明示確認、所有権、世代と復元等の検証が含まれる。今回新しいテストやCI gateは追加していない。buildの大きなchunk警告は出たが、セキュリティ脆弱性として扱っていない。

監査中に専用localhost:4893のpreviewを一時起動してブラウザー操作を試したが、設定画面到達前にtimeoutしバックアップUI確認は未完了だった。親の配信環境方針に従いpreviewを停止した。**この試行を成功、公開先受入、独立E2Eの証拠には一切数えない。** 親が保持する既存v8／発展都市の公式CI・管理preview上の復元UI証拠とも混同しない。今回のreportの根拠は上記の静的調査、audit、実build、既存62 testsである。

今回の範囲では最小修正の対象となる実問題が見つからなかったため、依存更新・src変更・追加の防御／検証は不要と判断した。公開環境の配信設定や将来のadvisoryまで検証済みとするものではない。公開・pushはしていない。
