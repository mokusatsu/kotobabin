# M6 city acceptance — source-aware production E2E

This adds one bounded technical journey for missing mandatory mature-city coverage. It is separate from the independent fresh-player reviewer and from native earning evidence.

Existing `city-ui.spec.ts` covers the first native development and an equipment purchase. `equipment-map.spec.ts` covers residential railway, materials research ranks1–3, and physical growth beyond representative sprite caps. `world-stage.spec.ts` covers six district navigation controls but expands residential only. Existing reset/restore suites cover repository/runtime replacement, corrupt-state preservation and ordinary UI deletion; they do not cover a valid fully mature city restarting and restoring its own exported backup entirely through keyboard UI. Those existing scenarios were not duplicated.

## Added scope

`tests/e2e/m6/city.audit.ts` runs against production output through `playwright.m6-city.config.ts`, with one fresh Playwright browser context at1180×720. It finishes the final plan in all six districts, purchases all six railways, purchases every rank1–5 in all three research branches, checks the world and district stage5 art by actual image response and decode, and verifies six actual railway routes. Each purchase/plan batch is checked against the newly persisted IndexedDB command ledger: public command replay must reproduce the complete economic snapshot, and retransmission must be a no-op. Typing profile progress must remain unchanged by these operations.

It exports the mature profile through the native UI download, performs an eligible keyboard-confirmed restart into the seaside landscape, checks reset ownership and persistent research/blueprints, activates the backup file input with Enter, supplies that exact downloaded file at the OS file-chooser boundary, confirms restoration by keyboard, reloads and checks the six restored stage5 images, six railways and three research5 values. No forced focus or pointer clicks are used. Screenshots supplement actual actions and assertions.

## Explicit fixture boundary

`city.fixture.ts` derives its setup from the existing public `matureCityFixture`. Its confirmed clean cargo groups use the actual canonical length24 catalogue entry and the existing fixture's full-cargo scoring convention. Public economic facts, public elapsed-time simulation and `executeCityCommand` earn resources, develop districts, obtain blueprints through an eligible restart, and prepare six stage4 districts with ten crews. No balance, stage, ownership, research or award is assigned directly. This synthetic confirmed-fact setup is not native typing, native earning, offline-time-cap evidence, or proof of a human's progression pace.

Only the encoded result is placed into an explicitly fresh isolated IndexedDB before the app starts. An inert same-origin SVG page supplies the database origin without running an app owner. Thereafter all mutations under test occur through actual keyboard UI; IndexedDB reads and source-aware model replay are assertions.

`engine.fixture.ts` bundles the public APIs on the Node test-runner side with esbuild; it does not import `/src` modules into the production browser. esbuild is available through the existing Vite development dependency. The bundle is written to a temporary OS directory per worker.

## Execution and current evidence

Test discovery passed:

```sh
npx playwright test --config playwright.m6-city.config.ts --list
```

The fixture was independently bundled and executed in Node; it decoded successfully and produced city3,48 earned blueprints, all six districts stage4, crews10 and sufficient unreserved stock. The bundle command used for that inspection was:

```sh
npx esbuild tests/e2e/m6/city.fixture.ts --bundle --platform=node --format=cjs --outfile=/tmp/m6-final.cjs
```

No local development or preview server was started. Actual browser execution is assigned to GitHub CI by the integration owner, using the official Vite production preview in CI only. The distinct config starts no server and requires `M6_CITY_BASE_URL`; the integration job supplies `http://127.0.0.1:4173` after `npm run build`, starts the CI-only preview, and runs:

```sh
M6_CITY_BASE_URL=http://127.0.0.1:4173 npx playwright test --config playwright.m6-city.config.ts
```

## Observed CI result: both journeys skipped

Fetched and read both native GitHub job logs for [run43498938436](https://github.com/mokusatsu/kotobabin/actions/runs/43498938436), checked out at `8fa0db935694d3292db647a96a31c7361a98f1e7`.

| Engine | Native job | Observed test result |
|---|---|---|
| Chromium | [132139312370](https://github.com/mokusatsu/kotobabin/actions/runs/43498938436/job/132139312370) | `2026-11-13T20:10:40.1763732Z   1 skipped` |
| WebKit | [132139312433](https://github.com/mokusatsu/kotobabin/actions/runs/43498938436/job/132139312433) | `2026-11-13T20:11:20.0361553Z   1 skipped` |

Both logs identify the mature-city journey at `city.audit.ts:66:1`; both artifact steps report that no files were found under `test-results/m6-city/`. Job success therefore does not establish browser acceptance. Neither log provides an executed result for the six stage5 plans, six railways, fifteen research purchases, restart or restoration. Build completion is present, but the journey was skipped by its explicit missing-`M6_CITY_BASE_URL` guard. The next bounded correction is to supply `M6_CITY_BASE_URL=http://127.0.0.1:4173` to the CI test process, then execute this same existing case against the CI-only production preview. No additional scenario or product change is justified by these logs.

Canonical research affordability was checked directly from `economy_config.json`: ranks1–5 cost1+2+3+4+5=15 blueprints per branch, three branches cost45, and the public-command fixture earns48, leaving3 after the fifteen purchases.

Browser acceptance remains unverified. The intended evidence is production-build Chromium/WebKit UI operation after an explicit synthetic confirmed-fact fixture, not native earning from a fresh player profile, live private Site execution, hardware iPad testing, or independent final art acceptance.


## Executed CI follow-up: research selection loses keyboard focus

[Run43499932487](https://github.com/mokusatsu/kotobabin/actions/runs/43499932487), root head `968e456`, actually executed the case after the endpoint correction. Native [Chromium job132142727126](https://github.com/mokusatsu/kotobabin/actions/runs/43499932487/job/132142727126) and [WebKit job132142727478](https://github.com/mokusatsu/kotobabin/actions/runs/43499932487/job/132142727478) both failed at the research purchase phase, trying to reveal a missing target and then timing out on the nonexistent `.ipad-page-host:visible`.

The downloaded Chromium artifact14073008132 contains all six stage5 screenshots and a native trace/error context. The sequential test had completed all six stage5 plans, all six railway purchases and replay assertions, and materials/logistics ranks1–5. Its error context shows research `5 / 5 / 0`,18 blueprints, and the materials option selected with its purchase button disabled. The trace records `mfwp@3403` pressing Home from logistics, followed by two ArrowDown presses and Enter; the panel remained on materials, so the expected commerce purchase button did not exist.

This is a product focus defect, not a lack of earned funds. The select change triggers `updateCityViews`, which replaces its special-equipment panel. `renderMarkup` preserves focus only for elements carrying `data-action` or `data-equip-slot`; `#special-equipment-item` carries neither, so changing the native select removes the focused node and subsequent native keys miss the select. The technical case now asserts focus and value after each existing selection key, producing a direct diagnostic instead of the later pagination-helper timeout. It does not re-tab between keys, assign the value, bypass the selector, or weaken purchase/model assertions. Product repair belongs to integration.

Commerce ranks, valid restart and backup restoration were not reached in this run. No completion claim is made for those steps. Chromium trace inspection establishes the detailed cause; WebKit's native log establishes the same failure location, without claiming an independently inspected WebKit trace.
