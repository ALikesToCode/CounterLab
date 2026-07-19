# Evidence index

## Checkpoints and evidence policy

- Public Worker version: `bef5edb7-6a76-4c72-94be-fcb2b94e668d` (#82).
- Cloudflare deployment: `dad4cd71-3dcd-4b00-a1b6-d16068d53c81`, 100% traffic, created `2026-07-18T18:12:53.84457Z`.
- Final source checkpoint: `dd451c77606ec270cfba030784df50cb3aa19969`.
- Browser: Chromium `150.0.7871.128`, Playwright `1.61.1`, explicitly owner-authorized because the required CloakBrowser endpoint was unavailable.
- Public safety: GET/HEAD/OPTIONS-only; no production write, model call, job, patch, download, or deployment.
- Source worktree: moving and dirty due concurrent owner/agent work. Relevant source hashes were rechecked by red team when HEAD advanced; audit files are the only intentional writes from this audit.

Evidence labels mean:

- **Observed live:** captured from the deployed public app/API.
- **Verified in source:** directly traced in the final relevant implementation.
- **Verified by test:** an exact recorded test command/result supports it.
- **Documented only:** present in plans/docs without stronger evidence.
- **Inferred:** reasoned consequence, clearly bounded.
- **Unverified:** inaccessible, unsafe under read-only scope, or not run.

## Primary immutable-ish audit captures

| SHA-256                                                            | Path                                                                 | Authority/use                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `8cd883fe8c1da9b302519d701f7fa6cc8dd19345585a41fe8d3be856fb6b735c` | `evidence/network/public-api-baseline.md`                            | Worker/deployment identity, readiness, replay API, security-header baseline. |
| `08e06b6a3748b38f36aa8c04ebf7361413eb0420b084b82d10154013dab8ee36` | `evidence/test-results/devpost-official-baseline.md`                 | Official deadline, mandatory fields, criteria, tie-break order.              |
| `934e7b0908e93ba008c2e8611db5e1b4c160701d27a05e50eb44ff9a2c3a1b00` | `evidence/test-results/devpost-project-baseline.md`                  | Actual empty pre-draft project state.                                        |
| `c31c636abf5e5921f85f576903ab5513b13301a2d1d38635835bf7bbe59d297b` | `evidence/test-results/live-chrome-public-routes-20260719.json`      | Executed public routes, viewports, DOM/state observations.                   |
| `949641f7818096c5dd1736ec3115dd3dc717c8cad69fde5d0adf70adbadfa6bb` | `evidence/test-results/live-chrome-public-routes-trace-20260719.zip` | Playwright trace for public route pass.                                      |
| `bc2f0905256ddd9948f94d2702d23cb0d3f41005f9650bdf377352464ccc061f` | `evidence/console/live-chrome-console-20260719.json`                 | Browser console/page errors; expected missing-resource cases separated.      |
| `1713d6521fd835e30b7daed803bcb9cb55caf5d0931c4b597221cf635e20bf3a` | `evidence/network/live-chrome-network-20260719.json`                 | Public request/response/failure capture.                                     |
| `810b17a6fd9107a2b9a167e3868df9b8d994773bea2f33edcaa38d37d3f6a028` | `evidence/performance/ux/live-performance-measurements.json`         | Cold/warm/throttled timing, transfer, cache, long-task data.                 |
| `10d77e5ffa8ef0e9185ca9699ec0ce4cd95e1d4c0988db914f4d4b62210bb918` | `evidence/test-results/agent-repo-technical.md`                      | Commands, source trace, test results, sandbox limitations.                   |
| `e7c13aa8d29f09f26916eccf9d953b91ee1821d7828ca29da0da2b2d275bb95d` | `evidence/test-results/agent-submission-market.md`                   | Official submission and current primary-source competitive scan.             |
| `887ab303783e3901a958cd9e3fe7cbf7b8f43bc0c678ab1575e2cf86e7a83808` | `evidence/test-results/red-team.md`                                  | Independent P0/P1 reproduction, wording correction, score challenge.         |
| `98c5b24d80f2349ebf0016dadcc0bd728262b3700b22f83ec7a2f2376808041a` | `evidence/test-results/final-public-recheck.json`                    | Final GET-only landing/Judge/readiness/health recheck at 20:04 UTC.          |
| `f3c322b610bac9dd8b6859c76d6ac9756742477776a7b4bfc5c57fc4fe8762d5` | `evidence/test-results/final-source-delta.md`                        | Four-commit drift inspection through final repository checkpoint.            |
| `e483aa7b37bc1e959557653d7f04b22a58889eb5726ba77683919bc4c35e1df7` | `evidence/test-results/final-synthesis-validation.md`                | Final JSON/CSV/path/test/public validation log.                              |

Hashes were computed at synthesis time. Browser profile/cache/runtime directories are retained for reproducibility but are not authoritative evidence and are intentionally not indexed file-by-file.

## Browser evidence

### Canonical route and state captures

- `evidence/test-results/live-chrome-public-routes-20260719.json`
- `evidence/test-results/live-chrome-public-routes-trace-20260719.zip`
- `evidence/console/live-chrome-console-20260719.json`
- `evidence/network/live-chrome-network-20260719.json`
- `evidence/test-results/final-public-recheck.json`
- `evidence/test-results/final-synthesis-validation.md`

The historical one-off browser launch scripts are intentionally not tracked.
They launched stock Chromium during the earlier audit and do not satisfy the
repository's current CloakBrowser-only browser policy; the immutable result,
trace, network, console, and screenshot captures remain the audit evidence.

### Key screenshots

- First fold: `evidence/screenshots/red-team-judge-1440x900.png`, `evidence/screenshots/ux/judge-390x844-first-fold.png`.
- Landing/mobile: `evidence/screenshots/ux/landing-1440x900-first-fold.png`, `evidence/screenshots/ux/landing-375x812-full.png`.
- Plain-claim destination: `evidence/screenshots/red-team-plain-claim-destination.png`.
- Legacy replay authority: `evidence/screenshots/red-team-legacy-replay-after-continue.png`, `evidence/screenshots/red-team-legacy-replay-local-completion.png`.
- Missing/deep links: `evidence/screenshots/live-chrome-missing-session-1366x768.png`, `evidence/screenshots/live-chrome-missing-proof-1366x768.png`, `evidence/screenshots/live-chrome-unknown-route-1366x768.png`.
- Keyboard/modal: `evidence/screenshots/ux/legacy-replay-command-palette.png`, `evidence/screenshots/ux/judge-keyboard-focus.png`.
- Responsive/full-page set: `evidence/screenshots/ux/` for 375×812, 390×844, 768×1024, 1366×768, 1440×900, and 1920×1080.

### Accessibility/interaction/performance data

- `evidence/test-results/ux-browser-runtime/viewport-and-dom-audit.json`
- `evidence/test-results/ux-browser-runtime/keyboard-and-interaction-audit.json`
- `evidence/test-results/ux-browser-runtime/adaptation-audit.json`
- `evidence/test-results/ux-browser-runtime/run-summary.json`
- `evidence/performance/ux/live-performance-measurements.json`
- `evidence/network/ux/live-network-events.json`
- `evidence/console/ux/live-console-events.json`

## Repository and test evidence

- `evidence/test-results/agent-repo-technical.md` is the canonical detailed command/result log.
- `evidence/test-results/live-source-unit-tests.txt` records the independent live-source slice.
- Authority slice: 13 files, 106/106 passed.
- Worker/API/UI slice: 4 files, 124/124 passed.
- Independent live source slice: 5 files, 49/49 passed.
- Python: 227/231 passed; four failures were managed-sandbox socket/permission-mode limitations and were not classified as regressions.
- Codex process slice: 24 passed/18 failed because the synthetic child process exited under the managed sandbox; no external Codex call occurred. These are limitations, not claimed passes.
- Root/web/Worker TypeScript checks passed.
- Secret scan passed 1,085 inspected repository files.
- Full `test-all`, release build, Docker build, and credentialed production Playwright suite were not run against a clean fixed checkout because the shared worktree was moving/dirty and the audit was read-only.

## Submission and market evidence

- `evidence/test-results/devpost-official-baseline.md`
- `evidence/test-results/devpost-project-baseline.md`
- `evidence/network/github-access-baseline.md` — unauthenticated repository request returned 404; public/private judge sharing remains unverified.
- `evidence/test-results/agent-submission-market.md`
- `evidence/test-results/market-primary-source-browser.json`

The competitive scan was targeted, not exhaustive, and uses current public primary pages for Khanmigo, Google/Gemini guided study/notebooks, Inq-ITS, PhET, Jupyter AI, JELAI, and AI Scientist-v2. The supported conclusion is “distinctive synthesis,” not categorical uniqueness.

## Specialist reports and precedence

- `evidence/test-results/agent-live-journeys.md` contains valuable inventories and raw notes, but later sections retain stale wording that says rendering/screenshots were unavailable. **Do not use those stale paragraphs.** The executed Chrome JSON/trace/screenshots, `03_END_TO_END_JOURNEY_MATRIX.md`, and red-team report supersede them.
- `evidence/test-results/agent-repo-technical.md` is authoritative for exact test commands and source findings.
- `evidence/test-results/agent-submission-market.md` is authoritative for the official submission baseline and targeted market scan.
- `evidence/test-results/red-team.md` is authoritative for P0/P1 confirmation, narrowed claims, and score challenge.
- `evidence/test-results/final-source-delta.md` records the inspected four-commit drift through the final repository checkpoint.

## Unresolved evidence limitations

- No exact source commit or Container digest was exposed for Worker 82.
- No public state-changing sample/live session was created; no current GPT-5.6/Codex/runner invocation was observed.
- No active SSE disconnect, API timeout, runner/model unavailable state, transfer fail/pass, patch approval/rejection, copy download, Capsule export, refresh during job, or second-project concurrency was exercised publicly.
- No real screen reader, Axe, or Lighthouse run was available; manual keyboard/DOM/contrast/reduced-motion/zoom proxies were used.
- External Cloudflare rate rules and Container rollback pairing were inaccessible.
- Repository public/private sharing state could not be established from an unauthenticated 404.
- No public video or final screenshots existed to audit.
- No learner pilot data existed.

These limitations are reflected in issue severity, scores, and the explicit statement that the full user definition of done was not met.
