# Final synthesis validation

Final source checkpoint under test: `dd451c77606ec270cfba030784df50cb3aa19969`.

## Public GET-only recheck

- Chromium 150.0.7871.128 / Playwright 1.61.1.
- Checked at `2026-07-18T20:04:20.161Z`.
- `/`: 200, expected H1, asset `/assets/index-Bf0xU---.js`.
- `/judge`: 200, expected H1, same asset.
- `/ready`: 200, all five checks true.
- `/api/health`: 200, sample/replay available and GPT/Codex/kernel/sandbox configured.
- Console warnings/errors: 0; failed requests: 0; error responses: 0.
- No non-GET/HEAD/OPTIONS request was allowed.

Full JSON: `final-public-recheck.json`.

## Latest-delta focused tests

From `apps/web` with in-repository temp/cache:

```text
../../node_modules/.bin/vitest run --config vitest.config.ts --no-file-parallelism worker/deployment-config.test.ts src/App.test.tsx src/features/judge/JudgeModeView.test.tsx
```

Result: **3 files, 52/52 tests passed**.

From repository root:

```text
.venv/bin/python -m pytest scripts/test_production_smoke.py -p no:cacheprovider -q --tb=short
```

Managed sandbox result: 12 passed, one loopback socket fixture failed with `PermissionError: [Errno 1] Operation not permitted`. Required rerun outside only that managed socket restriction: **13/13 passed**.

## Artifact validation

- `04_ISSUE_REGISTER.json`: parsed; 22 unique records; all 29 required fields present; counts P0=1/P1=9/P2=11/P3=1.
- `04_ISSUE_REGISTER.csv`: parsed; 22 rows; 29 columns; unique IDs.
- `10_DEVPOST_SCORECARD.json`: parsed; criterion sums equal 0, 57, 81, and 89.
- All 20 requested deliverable paths exist (17 Markdown plus CSV and two JSON artifacts).
- Every exact backticked `evidence/...` reference in the canonical Markdown reports resolved; wildcard evidence families were inspected separately.
- Final secret scan passed across **1,572 repository files** after the canonical artifact set was created.

## Scope integrity

No product source, production data, Cloudflare configuration, deployment, Devpost field, repository publication, or credential was changed by the audit. The shared worktree’s unrelated/concurrent changes were preserved.
