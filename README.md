# ことば便（kotobabin）

ことばをローマ字で打って届ける、90秒の日本語タイピングゲーム。現在は段階開発の初回動作版です。導入・図鑑練習・設定とプロフィール保存に対応しています。街の建築・設備・研究・再出発と保存に対応しています。全72実績・資材の最終品質などは開発中です。

**オーナー限定の動作版:** https://kotobabin.mokusatsu.chatgpt.site

## 開発

Node.js 24とPython 3を使用します。

```sh
npm ci
npm run dev
```

ブラウザーで表示されたURLを開き、幅768px以上・物理キーボード・半角英字で操作してください。最初にaを入力して確認し、語の境目でSpaceを押すと配達します。保存が使える場合は設定・図鑑・練習資格・成績・街を保存します。保存状態は画面の表示を確認してください。別のタブや再読込後に閲覧状態になった場合は「ここで続ける」で操作を引き継げます。

```sh
npm run test:spec
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

仕様の入口は [spec/initial/README.md](spec/initial/README.md)、再開用記録は [docs/development/progress.md](docs/development/progress.md)、未完了の受入は [Issue #4](https://github.com/mokusatsu/kotobabin/issues/4) です。

GitHubはソース管理、公開先はChatGPT Sites（オーナーのみ）です。更新時は `.openai/hosting.json` の同じSite IDと閲覧範囲を維持してください。
