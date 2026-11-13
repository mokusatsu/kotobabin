# ことば便（kotobabin）

ことばをローマ字で打って届ける、90秒の日本語タイピングゲーム。現在は段階開発の初回動作版です。街の経済UI、実績、永続保存などは開発中です。

**オーナー限定の動作版:** https://kotobabin.mokusatsu.chatgpt.site

## 開発

Node.js 24とPython 3を使用します。

```sh
npm ci
npm run dev
```

ブラウザーで表示されたURLを開き、幅768px以上・物理キーボード・半角英字で操作してください。最初にaを入力して確認し、語の境目でSpaceを押すと配達します。現在の成績はページを閉じると残りません。

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
