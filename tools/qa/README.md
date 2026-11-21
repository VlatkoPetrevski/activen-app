# QA tools (browser)

Python + Playwright (`pip install playwright && playwright install chromium`).

## `a11y_sweep.py` — every screen, phone and desktop

Serves nothing itself: build and serve the demo first.

```sh
pnpm --filter @activen/web exec vite build --mode demo
(cd apps/web/dist && python3 -m http.server 4173) &
npm i --prefix /tmp/axe axe-core@4
# optional: a FIT file to also check the import report
node -e 'import("./packages/importers/dist/testing.js").then(m => require("fs").writeFileSync("/tmp/sample.fit", m.intervalRunFit({ strap: true })))'
SAMPLE_FIT=/tmp/sample.fit AXE_JS=/tmp/axe/node_modules/axe-core/axe.min.js python3 tools/qa/a11y_sweep.py
```

Visits all athlete and coach screens at 390 px and 1280 px and reports page errors, console
errors, horizontal overflow and axe-core violations (WCAG 2.1 A/AA) to `a11y-report.json`.
Expected result: no errors, no overflow, no violations.

## `e2e_real_stack.py` — the real API, database and web app

```sh
createdb activen_e2e   # or psql -c "CREATE DATABASE activen_e2e"
DATABASE_URL=postgres://…/activen_e2e node packages/db/dist/migrate-cli.js
DATABASE_URL=postgres://…/activen_e2e node packages/db/dist/seed-demo-cli.js athlete.e2e@example.com
(cd apps/api && DATABASE_URL=… NODE_ENV=development node dist/main.js > ../../api.log 2>&1) &
(cd apps/web && npx vite --port 5173) &
API_LOG=api.log python3 tools/qa/e2e_real_stack.py
```

Email sign-in (magic link read from the development log), coach sign-up, invitation and
consent, coach analytics on real data, a structured workout written by the coach and seen by
the athlete, a share image drawn and downloaded, and a setting that survives a reload.
