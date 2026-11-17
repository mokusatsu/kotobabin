# ことば便 資材検証報告

版4.1

資材一覧の契約照合は不合格である。24,452件の判定を実行し、5件の不一致を検出した。

この実行結果を全件合格の根拠として扱わない。不一致または読み取り不備を解消し、再実行した報告で結果を確認する。個別原画、実行時の視認性、操作、楽しさの検収はこの検査の対象外である。

## 実行した判定

| 区分 | 判定 | 不一致 |
|---|---:|---:|
| 原本・版・参考画面 | 40 | 4 |
| 実績・称号・追加報酬 | 2,908 | 0 |
| 地区・段階・景観 | 540 | 0 |
| 設備・価格・鉄道・連携・研究 | 3,914 | 0 |
| 資材件数・型・制作条件 | 7,353 | 0 |
| 正参照・逆参照・表示状態 | 8,815 | 0 |
| 地図座標・固定経路 | 848 | 0 |
| 生成文書の再現一致 | 2 | 0 |
| 破損注入による検出確認 | 32 | 1 |

## 検出した不一致

| コード | 箇所 |
|---|---|
| `SOURCE.sha256` | source_contracts.economy_config.json |
| `SOURCE.sha256` | source_contracts.words.json |
| `SOURCE.sha256` | source_contracts.words.schema.json |
| `SOURCE.sha256` | source_contracts.romaji_rules_v1.json |
| `MUTATION.not_detected` | source_hash_wrong |

読めた値、期待値、集計、破損検出結果は[検証結果JSON](../data/resource_validation_report.json)に記録する。予定資材のファイルが存在しないこと自体はエラーにしない。

## 再実行

```bash
python3 tools/validate_resources.py
```
