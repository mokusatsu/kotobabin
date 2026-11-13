# 開発方針

- 静的Webページで動作する構成にする。ビルドにPythonやNode.jsを使うのは問題ない。
- 10インチiPad横向き（MM9C3J/A）で正常に表示される状況をテストターゲットとする。
- 段階的に実装を進め、節目ごとに履歴を引き継がない独立エージェントに[sakurai-skill](https://github.com/kociden/sakurai-skill)だけを参照させてE2Eレビューさせ、完成度を上げる。
