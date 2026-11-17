# モジュール間インターフェース契約

正本: `src/contracts/types.ts`, `src/contracts/data.ts`

- **Typing (`src/typing/`)**:
  - `RomajiEngine(reading)`: `canonicalLength`, `guide`, `typed`, `step(key)`
  - `CourseGenerator`: `generateCourseWords(courseId, seed, preferredWordId?)`, `getTutorialWords()`, `getPrototypeWords()`
  - `GameSession`: `beginMain(...)`, `beginPractice(...)`, `beginTutorial()`, `handleKey(key, timestampMs, nowMs)`, `commitManualDelivery(nowMs)`, `pause(nowMs)`, `resume(nowMs)`, `skipWord(nowMs)`, `abort(nowMs)`
  - `InputAdapter`: DOM `<input>` / `window` イベントを正規化し、`isComposing` / `keyCode === 229` / `Process` / `blur` / `visibilitychange` で安全に一時停止
- **Economy (`src/economy/`)**:
  - `CityEconomy`: `applyTypingFact(fact, snapshot)`, `advanceTo(nowMs)`, `openDistrict(...)`, `startPlan(...)`, `pausePlan(...)`, `resumePlan(...)`, `purchase(...)`, `buyRailway(...)`, `buySynergy(...)`, `buyResearch(...)`, `startNewCity(...)`
  - `WorldClock`: `calculateOfflineProgress(savedWallMs, nowWallMs)`（最大8時間・時計逆行保護）
- **Progression (`src/progression/`)**:
  - `AchievementEngine`: `applyFact(fact)`, `evaluateCity(citySnapshot)`（全72実績＋40報酬）
  - `DictionaryTracker`: 960語完了・`clean3` 習熟度・初版240語フィルター
  - `ProfileRepository`: `IndexedDbProfileRepository`（v4・11ストア・単一タブ排他ロック）と `MemoryProfileRepository` フォールバック
