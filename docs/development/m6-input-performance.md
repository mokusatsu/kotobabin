# M6 confirmed-input performance repair

Technical specification §14 keeps the handler P95 ≤5 ms, key-to-display P95 ≤50 ms, and no application long tasks ≥50 ms. The independent populated workload, thresholds, scoring, awards, and durable transaction boundaries are unchanged.

## Diagnosis

The actual CI baseline run 43498989069 / job 132139489051, source 567247d, reported handler P95 65 ms and display P95 67.7 ms across 243 trusted native keys. All 243 feedback frames changed; the valid fixture contained 960 words and 30 records. There were 51 long tasks of 50–95 ms.

A separate diagnostic exercised `GameSession.input → drainEvents → runtime.applyFacts → runtime.achievements`, retaining all confirmed facts, using the same `performanceProfile()` fixture generator. Node inspector CPU sampling at 100 µs covered 200 completed words / 1,200 keys, with repository work drained after each word. This isolates the confirmed runtime call chain; it is not a browser acceptance measurement. Linux cloud executor, Node v22.16.0, no browser or display scaling applies.

Before the repair, the nine largest self-sample stacks were full-state `structuredClone` calls. They included `applyFacts → repository.snapshot`, the public achievement getter, `reduceAchievements → applyAchievementFacts`, `observeCity → applyAchievementCity`, and repeated achievement clones in persisted reduction. The diagnostic synchronous P95 was 29.91 ms. The local diagnostic source is retained under ignored `work/perf-diagnostic/profile.ts` and inspector output at `/tmp/input-runtime.cpuprofile` during this session.

## Repair

Achievement fact and city reducers now copy only the branches they mutate. Each touched session gets a new summary and manual-delivery array; prior sessions, immutable record histories, evidence, context, and word entries remain shared. Award maps, unread lists, counters, and round qualification maps retain their existing updates. Public achievement views recursively freeze the confirmed state, skipping already frozen history. A metadata-only repository generation accessor removes the full-profile clone previously used just to read the deletion fence. Repository public snapshots still return detached clones, and mutation callbacks still run against cloned documents within the existing atomic persistence path.

The same local diagnostic after this change measured synchronous P95 2.53 ms. This is supporting diagnosis only; actual CI browser results are required before declaring §14 passed.

## Checks

- TypeScript check passed.
- All 97 existing app/profile unit tests passed.
- Two added regressions pass: deeply frozen old views survive completed words, automatic deliveries, terminal awards, and city purchase/replay; immutable previous evidence and event deduplication are retained.
- Repository schema remains v4; no old data, backups, eligibility conditions, cosmetic contracts, or workload thresholds are rewritten.
- Whole-tree lint currently reports a baseline unused `AchievementView` import in `src/ui/reward-art.ts`, outside this repair's owned files.
