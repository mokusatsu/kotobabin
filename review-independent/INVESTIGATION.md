# Independent M7 black-box investigation

Status: final candidate source notification pending. The three runs below are UI reconnaissance on candidate app 9442a2513becef8aa42d54f411d8eb1ab634eae7, not final-candidate validation.

Reviewer source boundary: read only repository AGENTS.md for review operations and sakurai-skill pinned commit 913dc46b9dedc5e0b12e3834d25d684cf8213f87 (main, UI and planning). No product source/specification, existing test, QA, or other review read. Browser DOM visible text/geometry are observations, not implementation inspection. No app changes. No local app server.

Own scenarios were authored from UI evidence gathered by this reviewer. Actual Chromium/WebKit browsers ran on official GitHub hosted runners; input was keyboard events (Tab/Enter/F2/Escape/letters), no app focus(), injected saved state, or altered clock.

| Run | Review commit | Result | Evidence |
|---|---|---|---|
| [43521536694](https://github.com/mokusatsu/kotobabin/actions/runs/43521536694) | 00079cca9dfc87a67baa64f92f6acaee3ea30cde | Chromium/WebKit discovery passed | discovery-logs.txt, evidence-discovery; artifact14082444466 |
| [43522018769](https://github.com/mokusatsu/kotobabin/actions/runs/43522018769) | 48d50f3 | Chromium/WebKit menu keyboard discovery passed | menu-logs.txt, evidence-menus; artifact14084175462 |
| [43522336692](https://github.com/mokusatsu/kotobabin/actions/runs/43522336692) | 23fddcd | 4 passed, 2 scenario errors | matrix-logs.txt, evidence-matrix; artifact14083966095 |

Run3 scenario errors: at 1180x820 the reviewer incorrectly assumed eight handbook display pages; UI has fewer pages at this larger height. The script attempted an extra disabled next-display action. This is not a product finding. Final scenario instead reads the displayed total from the UI.

Run3 labels `settings150`, `home150`, `district150`, `handbook150`, `handbook150-display2` do **not** establish 150% text was selected: native radio inputs cannot be individually reached through Tab. This reconnaissance attempt had no checked assertion. Those artifacts are ordinary-size UI observations only. Final scenario selects with real ArrowRight input and asserts the selected 150 radio state.

Observed UI workflow: home starts with delivery button focused, Tab reaches district buttons, Enter opens district detail, Escape returns. F2 opens navigation. Handbook, catalogue, settings, help are available through Tab/Enter. IME check requires a, then tutorial shows a skip-to-main button. Visible `.next-key` letters and `.prompt-word` will be used solely as the player's displayed input guide for final actual typing.

`references/` contains numbered copies from the pinned sakurai-skill sources to make later exact quotations reviewable. Any finding must additionally cite the original pinned permalink, observations, causal relevance, and a specific repair.
