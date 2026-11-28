# kotobabin

## ローカルで起動

初回はリポジトリ直下で `npm ci` を実行します。続いて `npm run build` で配信用ファイルを作成し、同じ場所で `python -m http.server` を実行して [ことば便](http://localhost:8000/) を開きます。ソースを更新したときは再度ビルドしてください。

開発中に変更をすぐ反映したい場合は、`npm run dev` を実行してターミナルに表示された URL を開きます。

## GitHub Pages への公開

GitHub のリポジトリ設定で「Pages」を開き、「Build and deployment」の「Source」に「GitHub Actions」を選択します。

`main` にプッシュすると、Actions が Node.js 24 で `npm ci` と `npm run build` を実行し、`dist/` を公開します。Actions の「Deploy to GitHub Pages」から `main` を指定して手動実行することもできます。
