# kotobabin

## GitHub Pages への公開

GitHub のリポジトリ設定で「Pages」を開き、「Build and deployment」の「Source」に「GitHub Actions」を選択します。

`main` にプッシュすると、Actions が Node.js 24 で `npm ci` と `npm run build` を実行し、`dist/` を公開します。Actions の「Deploy to GitHub Pages」から `main` を指定して手動実行することもできます。
