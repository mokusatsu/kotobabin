# M6 confirmed-input performance repair

Technical specification §14 keeps the handler P95 ≤5 ms, key-to-display P95 ≤50 ms, and no application long tasks ≥50 ms. The independent populated workload, thresholds, scoring, awards, and durable transaction boundaries are unchanged.

## Diagnosis

The actual CI baseline run 43498989069 / job 132139489051, source 567247d, reported handler P95 65 ms and display P95 67.7 ms across 243 trusted native keys. All 243 feedback frames changed; the valid fixture contained 960 words and 30 records. There were 51 long tasks of 50–95 ms.

A separate diagnostic exercised `GameSession.input → drainEvents → runtime.applyFacts → runtime.achievements`, retaining all confirmed facts, using the same `performanceProfile()` fixture generator. Node inspector CPU sampling at 100 µs covered 200 completed words / 1,200 keys, with repository work drained after each word. This isolates the confirmed runtime call chain; it is not a browser acceptance measurement. Linux cloud executor, Node v24.22.1, no browser or display scaling applies.

Before the repair, the nine largest self-sample stacks were full-state `structuredClone` calls. They included `applyFacts → repository.snapshot`, the public achievement getter, `reduceAchievements → applyAchievementFacts`, `observeCity → applyAchievementCity`, and repeated achievement clones in persisted reduction. The diagnostic synchronous P95 was 29.91 ms. The local diagnostic source is retained under ignored `work/perf-diagnostic/profile.ts` and inspector output at `/tmp/input-runtime.cpuprofile` during this session.

## Repair

Achievement fact and city reducers now copy only the branches they mutate. Each touched session gets a new summary and manual-delivery array; prior sessions, immutable record histories, evidence, context, and word entries remain shared. Award maps, unread lists, counters, and round qualification maps retain their existing updates. Public achievement views recursively freeze the confirmed state, skipping already frozen history. A metadata-only repository generation accessor removes the full-profile clone previously used just to read the deletion fence. Repository public snapshots still return detached clones, and mutation callbacks still run against cloned documents within the existing atomic persistence path.

The same local diagnostic after this change measured synchronous P95 2.53 ms. This is supporting diagnosis only; actual CI browser results are required before declaring §14 passed.

## Checks

- TypeScript check passed.
- All 97 existing app/profile unit tests passed.
- Two added regressions pass: deeply frozen old views survive completed words, automatic deliveries, terminal awards, and city purchase/replay; immutable previous evidence and event deduplication are retained.
- Repository schema remains v4; no old data, backups, eligibility conditions, cosmetic contracts, or workload thresholds are rewritten.
- The baseline unused `AchievementView` import in `src/ui/reward-art.ts` was removed separately with root authorization; whole-tree lint now passes.

## First actual repair measurement and saved-path follow-up

Actual production CI run 43500486035 on bd1e4f0 measured handler P95 10.4 ms, display P95 15.6 ms, frame P95 16.7 ms, zero long tasks, and changed feedback in all 242 trusted input frames. All 72 handbook entries and the 960-word qualified filter were verified; cold-load P95 was 561 ms across 20 trials, largest actual wire transfer 922,847 bytes. The handler still exceeded 5 ms, so this is not an acceptance pass.

The saved repository path reconciles a detached persisted snapshot after each successful write. That snapshot loses the previous in-memory frozen object identities; freezing its full history on the next word completion repeated unnecessary work inside native input. Reconciliation now freezes the detached canonical achievement snapshot at the existing persistence-completion boundary. Subsequent synchronous confirmed fact reducers share its frozen history and freeze only their new branches. Award calculation remains synchronous, and canonical reconciliation, transaction checks, records, and views are preserved. The initial Node diagnostic used memory storage (unsaved status), so it did not cover this saved-path reconciliation cost.

## Actual browser profile and animation restart repair

The saved-path follow-up still failed the handler budget: actual run 43501035356 attempt 2 measured 14.5 ms handler / 17 ms display, zero long tasks, and 243 changed native frames. Its first attempt failed a handbook `:focus-visible` assertion before the native report was saved; that failure remains recorded. Run 43501934603 on the same app code measured 13.9 ms handler / 18 ms display, zero long tasks, and 252 changed frames.

A separate diagnostic workflow, run 43501935059, sampled Chromium's production call chain at 100 µs across 247 native keys. Its source-mapped CPU summary confirms `getBoundingClientRect → pulse → paint → observe → commitFacts → mutate` inside native input (330 self samples). V8 also reports substantial unattributed native/browser `(program)` work; CPU sampling alone does not assign all of that to layout. The raw CPU profile is retained in the `m6-native-input-cpu` artifact. This diagnostic uses source maps and profiling and does not replace independent acceptance measurements.

The confirmed word/dispatch/arrival pulse previously reset `animationName`, read `getBoundingClientRect()` to force layout, then restored the animation. With the root's explicit narrow UI lease, pulse now alternates between two equivalent keyframe names using only the element's inline style. Each actual pulse toggles names even when its confirmed revision jumps by two; `data-revision` keeps the true counter. The original three keyframes and their aliases have identical frames. Existing pause and reduced-motion CSS still apply. No node is replaced, and fact deduplication, queues, arrival/resource accounting, input, and timing are unchanged. The effect on the remaining handler cost must be measured in the unchanged acceptance workflow.
