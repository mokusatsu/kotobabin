# 設計判断記録（Decisions）

## 1. ローカルGit専用運用
- ユーザー指示に基づき、リモート（GitHub）は使用せず、ローカルGitリポジトリの `main` ブランチで段階的にコミット・検証を管理する。

## 2. フレームワーク非依存のTypeScript + Vite構成
- `technical_specification.md` に従い、DOM描画と入力制御の低遅延・IME制御の確実性を優先し、ランタイム依存のない純粋なTypeScript + HTML + CSS + Vite構成を採用。

## 3. 画像生成クォータ制限への対応
- `image-generator`（`gemini-3.1-flash-image`）が12枚生成後に `429 RESOURCE_EXHAUSTED`（リセットまで約4時間54分）に到達したため、リトライせず `docs/development/asset_progress.md` に制約を記録。
- 92点のSVGおよび6点のWAV効果音はスクリプトで全点生成済みであり、未生成ラスターは既存の生成済みラスターとSVGでフォールバック表示する。

## 4. `spec/initial/` のSHA256検査について
- Windows環境（`core.autocrlf=true`）で初期チェックアウトされたJSONがCRLFであるため `validate_resources.py` の4件の `SOURCE.sha256` が差分となるが、仕様JSONの数値・構造・`validate_content.py`・`economy_model.py`（51/51）はすべて正常通過している。`spec/initial/` の正本は改変しない。
