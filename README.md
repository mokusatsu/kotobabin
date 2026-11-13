# ことば便（kotobabin）

ことばをローマ字で打って届ける、90秒の日本語タイピングゲーム。倉庫から届け先までの配送、街全体から地区への拡大、建築・設備の変化を同じゲームステージに表示します。終了後は得点と今回獲得した切手を一枚ずつ確認できます。3コース、960語、導入・練習、街の6地区・研究・再出発、72実績・報酬・鑑賞、プロフィール保存・控えの復元を統合しています。段階開発中で、実機IMEや資材の最終検収などは未完了です。

**オーナー限定の動作版:** https://kotobabin.mokusatsu.chatgpt.site

## 開発

Node.js 24とPython 3を使用します。

```sh
npm ci
npm run dev
```

ブラウザーで表示されたURLを開き、幅768px以上・物理キーボード・半角英字で操作してください。最初にaを入力して確認し、語の境目でSpaceを押すと配達します。保存が使える場合は設定・図鑑・練習資格・成績・街を保存します。保存状態は画面の表示を確認してください。画面移動はF2、選択は矢印またはTab、決定はEnter、戻るはEscです。別のタブや再読込後に閲覧状態になった場合は「ここで続ける」で操作を引き継げます。

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
