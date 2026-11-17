# 仕様と実装の対応表（Requirements Traceability）

| 仕様領域 | 正本 | 実装 | テスト / 検証 | 状態 |
|---|---|---|---|---|
| ローマ字受理規則 | `spec/initial/data/romaji_rules_v1.json` | `src/typing/romajiEngine.ts` | `tests/typing/romajiEngine.test.ts`（全960語基準長一致） | 検証済み |
| 出題・3コース・波 | `spec/initial/data/words.json` | `src/typing/courseGenerator.ts` | `tests/typing/gameSession.test.ts` | 検証済み |
| IME・キー処理・90秒・荷物 | `spec/initial/docs/technical_specification.md` | `src/typing/inputAdapter.ts`, `src/typing/gameSession.ts` | `tests/typing/gameSession.test.ts`（20語フィクスチャ一致） | 検証済み |
| 経済・物流・建築・設備・放置・再出発 | `spec/initial/tools/economy_model.py`, `economy_config.json` | `src/economy/cityEconomy.ts`, `worldClock.ts`, `math.ts` | `tests/economy/cityEconomy.test.ts`（全644価格セル・20語経済一致） | 検証済み |
| 全72実績・40報酬・960語図鑑 | `achievement_catalog.json`, `legacy_word_index_v1.json` | `src/progression/achievementEngine.ts`, `dictionaryTracker.ts` | `tests/progression/achievementEngine.test.ts` | 検証済み |
| IndexedDB v4・冪等性・単一タブ排他 | `spec/initial/docs/technical_specification.md` | `src/progression/profileRepository.ts` | `tests/progression/profileRepository.test.ts`（`fake-indexeddb`） | 検証済み |
| 全画面UI・地図・アクセシビリティ | `screen_design.md`, `design_tokens.json`, `rendering_rules.json` | `src/ui/`（9画面＋共通Header/CityMap/AudioPlayer） | `tests/ui/appController.test.ts` + 実ブラウザーQA | 統合済み |
| 画像・SVG・音源資材 | `visual_resource_manifest.json` | `public/assets/`（92 SVG, 6 WAV, 12ラスター） | `asset_progress.md`（残り137ラスターはクォータ制限で保留） | 保留・阻害要因あり |
