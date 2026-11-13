# 判断記録

## D001: 正本と段階開発

元の仕様は改変せず、TypeScript/DOMの静的アプリでM0/M1を最初のサイクルとする。全仕様完成を初回の終了条件としない。目標そのものは維持する。

## D002: 正確な算術

価格・経済はPython参照と同じ整数/有理数を使用。得点は10L、配達はfloor(Vn/5)。誤打した語も完成点は10Lで、未配達ボーナスだけを失う。経済倍率はタイピング得点へ掛けない。

## D003: 公開先変更

ユーザーの後続指示「Pages → ChatGPT Sites」に従いGitHub Pagesは使用しない。GitHubはpublicなソース管理、実行するSiteはオーナー限定。Sites project_idは `.openai/hosting.json` に固定し、同じSiteを更新する。閲覧者の追加や公開範囲拡大をしない。

## D004: 検証範囲

960語の正本検査やLinux Chromium自動試験は、Windows/macOSのOS IME・JIS/US物理キーボード・初見観察を代替しない。M6まで未検証項目を明示する。

## D005: 作業担当

入力/画面/経済/記録/アート/独立QAを別worktreeへ分担。統括が設定・進捗・統合・公開を担当。変更は小さな機能コミットとPRで保存する。

## D006: Sitesソース同期

この実行環境にはSitesパッケージのsource helperスクリプトが存在しなかったため、同じSiteの短期資格情報をecho無効のstdinで受け、メモリー上のGit HTTPヘッダーとしてのみ使用してSite専用リモートへ通常pushした。資格情報をファイル・Git設定・コマンド引数へ保存していない。pushしたHEADからViteをビルドし、hosting.jsonとdistのみのtar.gzをnative private deployへ渡した。次回はhelperが利用可能なら正式helperを使う。
