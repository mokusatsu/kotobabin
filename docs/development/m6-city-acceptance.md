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

Browser acceptance has not yet passed at this commit. CI will provide the actual run result and retained trace on failure. This is production-build Chromium coverage, not live private Site execution, hardware iPad testing, or independent final art acceptance.
