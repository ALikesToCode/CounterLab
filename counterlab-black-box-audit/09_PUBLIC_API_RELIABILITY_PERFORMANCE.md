# CounterLab — Public API, Reliability & Performance Audit (Agents 9+13, merged scope)

- **Target:** https://counterlab.cserules.workers.dev/ (routes audited: `/`, `/judge`, `/new`, `/session/<uuid>`, `/proof/<uuid>`, `/replay/leakage-01`, plus `/api/*` probing)
- **Audit date:** 2026-07-19 (UTC) · **Mode:** strict black-box (no source/repo/log access)
- **Method:** browser automation only (visit/click/input/find/scroll/screenshot at 1920×1080) + analysis of downloaded proof artifacts. Screenshots: `evidence/screenshots/agent9_*.png`.
- **Evidence labels:** Directly observed / Reproduced / Observed in network response / Inferred from behaviour / Unverified / Could not test.

---

## 0. Tooling limitations (read first — they bound every claim)

| Constraint | Consequence for this audit |
|---|---|
| No DevTools / HAR / network panel / console | HTTP status codes and headers are only visible where the browser tool surfaces them (e.g. it reports `visit 404` for dead API routes). Cache headers, TLS, `Server`, `Cache-Control`, `ETag` are **Could not test**. |
| No direct HTTP from shell/ipython (egress blocked) | `curl`/`requests` time out. `web_open_url` returns **`audit rejected`** for every target URL (verified on 6 URLs). All network evidence is via the browser. |
| Browser tool wall-clock overhead ≈ **30–40 s per call** | Every `browser_visit`/`browser_click` costs ~30–40 s regardless of route. **Route-level page-load timing below this floor is unmeasurable.** All "cold vs warm" figures are upper bounds dominated by tool overhead, not app latency. |
| Browser is GET-only; no request crafting | POST/PUT/DELETE endpoint shapes cannot be invoked. Mutating API surface is **Inferred**, not observed. |
| Clicks are serialized ~30 s apart | True rapid double-click / double-submit **Could not test**. |
| No network control | Offline transitions **Could not test**. Rate-limiting **Could not test** (each request ~30 s; flooding would also be inappropriate). |
| Fixed 1920×1080, no file-input control | Live `.ipynb` upload path untestable; mobile/responsive out of scope (Agent 7 covers). |

**Where precise timing WAS possible:** the app emits a server-side, hash-chained event log per session, readable at `GET /api/sessions/<id>/events` with ISO timestamps. Those server timestamps are **authoritative** and are used for all compute-phase durations below. This is the strongest evidence in this report.

---

## 1. Executive summary

CounterLab's **sample and replay paths are fast, deterministic, and fully server-persisted**. The whole learner wizard is effectively instant at every step because the sample lesson is pre-staged; the only real compute the user waits for is the kernel "fair test", which I measured at **~12.8 s** — consistent with the judge-mode claim "See a belief break in twenty seconds". State survives a full page refresh; a completed session redirects `/session/<id>` → `/proof/<id>`; downloads (proof record, repaired notebook) are instant.

The significant reliability/production findings are:

1. **P1 — The "Evidence & proof" Activity feed is permanently empty and the events counter is stuck at "0 events"** across the session, the final proof page, AND the replay, even though the server has a full event chain (13 events for my session). The transparency feature the product advertises does not display evidence.
2. **P1 — Bogus replay URLs land on a perpetual "Opening this replay…" spinner** after the not-found toast, with misleading step-3 progress chrome and no recovery except "Start over".
3. **P1 — The entire session API is unauthenticated.** `GET /api/sessions/<id>` returns the complete session — learner's claim, revision, sealed prediction, full patch diff, and the full HMAC-signed proof bundle — to anyone who has the URL. Sessions persist server-side ≥6 h (a 6.2 h-old completed session was still fully readable and downloadable).
4. **P2 — "Fixed kernel computes every number" is, for sample/replay, replayed *stored* evidence** (`source: "stored-approved-leakage-v1"`, `recordedAt: 2026-07-14`; environment string: *"Cloudflare Worker with recorded local Docker runner evidence"*). Result hashes are byte-identical across every observed session. The site partially discloses this ("It is not a live model run" in replay), but the four-authorities marketing reads as live computation.
5. **P2 — `/new` "readiness checks" render pre-passed with no observable verification** ("Notebook lesson tools are ready to try", "Hosted notebook runner is ready" appear instantly on first load).

Positive reliability signals: consistent `{ok:true,data}` API envelope, real HTTP 404s under `/api/*`, `/api/health` with a `requestId`, deterministic experiment results, immutable hash-chained event log, HMAC-signed proof bundles.

---

## 2. Endpoint-shape inventory

### 2.1 SPA routes (client-rendered; unknown non-API paths silently redirect to `/`)

| Route | Purpose | Server work on load |
|---|---|---|
| `/` | Learner home (claim box, prompt starters, sidebar) | None observable (static) |
| `/judge` | Public evidence dossier (Judge Mode) | None observable (static) |
| `/new` | Live-mode gate; shows pre-passed readiness checks | None observable |
| `/session/<uuid>` | 6-step learner wizard (single route; steps are in-page state) | Hydrates from session store |
| `/proof/<uuid>` | Proof/Repair-final page; gated (redirects to `/session/<id>` if incomplete) | Hydrates from session store |
| `/replay/<replay_id>` | Verified replay (known id: `leakage-01`) | Hydrates from replay store |
| `/replay` (no id), `/<anything>` | → silent client redirect to `/` (no 404 page) (Reproduced by Agent 1; consistent with my robots/sitemap probes) | — |

### 2.2 JSON API (observed via browser GET; envelope `{ok:bool, data:...}`)

| Endpoint | Method | Observed response | Auth |
|---|---|---|---|
| `/api/health` | GET | `{"ok":true,"data":{"platform":"cloudflare-workers","sample":"available","replay":"available","liveGpt":"configured","liveCodex":"configured","liveKernel":"configured","sandbox":"configured","requestId":"a1d72a0828635805"}}` (Directly observed) | none |
| `/api/sessions/<session_id>` | GET | Full session aggregate: `sessionId, artifactId, mode, state ("REASONING_DIFF_ISSUED"), version, createdAt, updatedAt, beliefTest, prediction, verifiedResult, transferResult, patchResult (full diff), revision, reasoningDiff, proofBundle (all events + integrity.signature), versions` (Directly observed, ~34 KB) | **none** |
| `/api/sessions/<session_id>/events` | GET | `{"ok":true,"data":{"events":[ …13 hash-chained events with ISO timestamps, actor, kind, inputHashes/outputHashes, eventHash, previousEventHash ]}}` (Directly observed) | **none** |
| `/api/replays/<replay_id>` | GET | Full replay payload: `replayId, recordedAt, modelId, verifierVersion, templateCommit, compilerTrace (stage durations in ms), generationIsolation, candidateExecutionIsolation, result (all runs), patch (full diff + correctedResult)` (Directly observed) | **none** |
| `/api/sessions/<bogus>` | GET | **HTTP 404** (browser renders blank; body shape not visible) | — |
| `/api/anything`, `/api/version`, `/api/replay/<id>` (singular), `/api/sessions` (bare) | GET | **HTTP 404** — no session-list endpoint exists, so sessions are reachable only by exact id (reduces enumeration risk) | — |

**Inferred (Could not test — browser is GET-only):** the mutating half of the API almost certainly exists as POST endpoints that create sessions and append events (`session.create`, belief confirm, prediction commit, experiment run, revision, transfer, patch verify). The wizard's every action produces a server event within ~0.3–1 s, so these are synchronous RPC-style POSTs. Exact paths/verbs **Unverified**.

**Downloads:** "Download proof record" and "Download repaired notebook" are `<button>`s (no `href`); the file is delivered as a client-generated blob. Both downloads completed instantly in my run. Underlying fetch endpoint **Unverified**.

---

## 3. Timing tables

### 3.1 Route load (browser-tool wall-clock — UPPER BOUND; tool overhead ≈30–40 s/call dominates)

| Route | Cold | Warm-1 | Warm-2 | Interpretation |
|---|---|---|---|---|
| `/` | 49.87 s | 33.35 s | 37.16 s | First call includes browser launch; warm ≈ tool floor |
| `/judge` | 36.87 s | — | — | At tool floor ⇒ static/fast |
| `/replay/leakage-01` | 38.13 s | — | — | At tool floor ⇒ instant static render at step 3 |
| `/new` | 40.72 s | — | — | At tool floor; readiness checks pre-rendered |
| `/proof/<completed session>` | 44.36 s | — | — | At tool floor; served from storage |

**Cold vs warm is not meaningfully distinguishable**: the ~10–16 s delta between the first-ever call and later calls is attributable to browser launch, and all later calls cluster at 33–44 s ≈ the tool floor. **No multi-second Workers cold start is observable** above the noise floor — i.e. cold start, if any, is well under ~30 s and almost certainly under ~1–2 s. (Label: Directly observed numbers; cold-start conclusion **Inferred** and bounded by tooling.)

### 3.2 Compute-phase durations — SERVER-AUTHORITATIVE (from `/api/sessions/<id>/events`, my session `session_f0a81fbb-…`, 2026-07-19 04:41–04:53 UTC)

| Phase | Events (start → end) | Duration | Label |
|---|---|---|---|
| Test-plan compile + verify | `prediction.committed` 04:44:59.81 → `lab.verified` 04:45:00.75 | **0.94 s** | Observed in network response |
| **Kernel experiment ("fair test")** | Run-click 04:45:32.2 → `experiment.completed` 04:45:45.03 | **~12.8 s** | Observed in network response + Directly observed click time |
| Transfer evaluation | `transfer.started` 04:52:12.13 → `transfer.passed` 04:52:12.40 | **0.27 s** | Observed in network response |
| Patch compile + verify | `patch.compilation_started` 04:52:59.06 → `patch.verified` 04:53:00.38 | **1.32 s** | Observed in network response |
| Reasoning-diff issuance | `patch.verified` → `reasoning_diff.issued` 04:53:01.17 | 0.79 s | Observed in network response |
| Belief-test proposal (sample) | instant on click (pre-staged sample) | < 1 s | Directly observed |
| Full server-side session span | `session.created` 04:41:05 → `reasoning_diff.issued` 04:53:01 | 11 m 56 s (learner-paced, incl. all my reading/tool time) | Observed in network response |

### 3.3 The "twenty seconds" claim — VERIFIED for the compute step

- Judge page claim: **"See a belief break in twenty seconds."** Kernel sandbox `resourceLimits.wallSeconds = 20` (in proof bundle).
- My measured kernel run: **~12.8 s** ⇒ claim **holds** for the experiment step.
- Cross-check of three prior agents' proof bundles: `lab.verified → experiment.completed` gaps of 21.9 s / 29.3 s / 46.3 s. Those larger gaps are **learner reading time on the step-3 page before clicking "Run the fair test"** plus the ~13 s kernel run — not kernel compute. (The experiment only starts on the Run click; `lab.verified` fires ~0.9 s after the prediction is sealed.) Full-loop figures of ~9 m 55 s reported elsewhere are likewise learner-paced wall-clock, not compute.
- **Caveat for judges:** "twenty seconds" describes the kernel run, not the whole demo; a full sample loop realistically takes ~6–12 min of interaction. (Label: Inferred from behaviour + Observed in network response.)

### 3.4 Replay timing

- `/replay/leakage-01` renders **instantly** at step 3. "Continue replay" advanced to the next recorded state in the same render (34.5 s wall = tool floor; the advance itself is instant). **Replay is stepwise-instant state reconstruction, not time-based playback** (Directly observed). The backend compiler trace shows the *original* generation took 141 s + 69 s + 70 s (rejected runs) and 79 s (verified run) — replay does not re-enact those durations.

---

## 4. Streaming / polling classification

| Flow | Classification | Evidence |
|---|---|---|
| Sample belief-test (step 1→2) | **Instant** (pre-staged sample; no spinner) | Directly observed |
| Plan verify (step 2→3) | **Instant** (0.94 s server-side) | Observed in network response |
| Kernel experiment (step 3→4) | **~13 s wait, then single swap to full results.** No staged progress UI, no incremental/streamed text observed at my sampling granularity; the click returned after results were fully rendered. | Directly observed + Observed in network response |
| Transfer check (step 5→6) | **Instant** (0.27 s) | Observed in network response |
| Patch verify (step 6→proof) | **Near-instant** (1.3 s server-side) | Observed in network response |
| Replay advance | **Stepwise-instant** (manual click per recorded state) | Directly observed |
| Live event feed | **None.** The "N events" counter and Activity drawer never update (see Finding 1). The SPA almost certainly **polls** `GET /api/sessions/<id>` on transitions (state is always fresh after reload), but there is no visible live/pushed feed. | Directly observed (empty feed) + Inferred (poll-on-navigate) |

---

## 5. Error-contract table

| Input | Observed behaviour | Label | Assessment |
|---|---|---|---|
| `/replay/bogus-id-xyz` | Toast "Replay bogus-id-xyz was not found" + **perpetual** "Opening this replay… / CHECKING STORED EVIDENCE" spinner; URL unchanged; header shows misleading step-3 "Test" progress with ✓Question ✓Prediction; only recovery is "Start over" | Directly observed (Reproduced; screenshot `agent9_replay_bogus.png`) | **P1** — indefinite spinner after error + misleading chrome |
| `/session/bogus-session-id` | Toast "Session not found: bogus-session-id" + home UI rendered; **URL unchanged** (deep link neither resolves nor redirects; no 404 page) | Directly observed (`agent9_session_bogus.png`) | P2 — acceptable UX, but URL/content mismatch and no real 404 |
| `/proof/bogus-proof-id` | Same as above: "Session not found: bogus-proof-id" toast + home UI, URL unchanged | Directly observed | P2 |
| `/proof/<id>` before completion | Redirects to `/session/<id>` (gate) — Agent 1 Reproduced; consistent with completed-session behaviour I saw in reverse | Reproduced | OK |
| `/session/<id>` after completion | Redirects to `/proof/<id>` | Directly observed | OK (good state machine) |
| `/api/anything` | HTTP 404, blank body | Directly observed | OK (real 404 for API) |
| `/api/sessions/<bogus>` | HTTP 404, blank body | Directly observed | OK |
| `/robots.txt` | SPA fallback → client redirect to `/` (no robots.txt served) | Directly observed | P3 |
| `/sitemap.xml` | SPA fallback → client redirect to `/` | Directly observed | P3 |
| `/favicon.ico` | Browser tool reported **visit timeout** on **2/2 attempts** — the route hangs rather than returning an icon or a clean 404 | Reproduced (2×; may still be tool download-handling, but consistent) | P3 |
| Raw backend errors / state-machine names in UI | None seen. Errors are friendly toasts. State names (`INGESTED`, `REASONING_DIFF_ISSUED`) appear only in API JSON, not UI. | Directly observed | OK — no raw error leakage to UI |

---

## 6. Resilience behaviour

| Test | Result | Label |
|---|---|---|
| **Refresh mid-wizard** (at step 4) | Full state restored from server: sealed prediction, results table, step position all intact | Directly observed — **PASS** |
| Completed session revisited after 6.2 h | `/proof/<id>` fully readable; both downloads still work | Directly observed — **PASS** (session persistence ≥6 h) |
| `/session/<id>` of a completed session | Auto-redirects to `/proof/<id>` | Directly observed — PASS |
| "Start over" mid-flow / on proof page | Instantly navigates to `/`, **no confirmation**. Session persists server-side (proof URL still valid) but there is no in-app link back to it. | Directly observed — P3 (no confirm / no undo) |
| Browser back/forward | **Could not test** — the tool set has no back/forward control; direct URL navigation used instead. (Note: wizard steps are not sub-routes, so a real Back from a wizard step would exit to the previous *URL*, losing wizard place conceptually — state would still restore on return.) | Could not test |
| Duplicate rapid clicks / double-submit | **Could not test** — clicks are serialized ~30 s apart by tooling. No double-fire was *observed* during any single-click transition, and each transition produced exactly one server event (event log shows no duplicates). | Could not test / Inferred (no double-fire in event log) |
| CTA disabled during transitions | All sampled transitions were too fast to observe a disabled state; CTAs re-render instantly. The home "Test this claim →" button **is** disabled until the claim box is non-empty (Directly observed). | Inferred / Directly observed (home only) |
| Navigate away mid-generation and return | Not applicable to sample path (all generation < 1.5 s except 13 s kernel); refresh-during-kernel not attempted. | Unverified |
| Offline transition | **Could not test** (no network control) | Could not test |

---

## 7. Production-readiness signals

| Signal | Observation | Label |
|---|---|---|
| Health endpoint | `/api/health` returns component map + `requestId`. Components report `"configured"` (liveGpt/liveCodex/liveKernel/sandbox) vs `"available"` (sample/replay) — "configured" is not proof of availability. | Directly observed |
| Version markers | No `/api/version` (404); no build/version footer on any page. Version data exists only inside session/replay JSON (`versions`: kernel `0.1.0`, verifier `leakage-verifier-v1`, prompt/model `leakage-customer-churn-belief-v1`, template `1050fa76…`, environment *"Cloudflare Worker with recorded local Docker runner evidence"*). | Directly observed |
| Error pages | No 404 page anywhere (SPA silent-redirects); no maintenance page observed; no raw backend error ever surfaced to UI. | Directly observed |
| Cache behaviour | Client-side: wizard state is re-fetched from server on every load (always fresh; refresh test). Server-side: session/replay state persists ≥6 h. HTTP cache headers **Could not test**. | Directly observed / Could not test |
| Cold start (Workers) | Not observable above the ~30 s tool noise floor; no obvious cold-start symptom (first load was not an outlier beyond browser launch). | Inferred |
| Rate limiting | **Could not test** (requests ~30 s apart; no flooding attempted). | Could not test |
| Secrets/PII exposure | Full session contents (learner claim, revision, prediction, patch, HMAC-signed proof bundle) served without auth to any holder of the URL. Session IDs are `session_<uuidv4>` (unguessable) but shareable; no expiry observed in 6.2 h window. | Directly observed — **P1 exposure** |
| Integrity | Hash-chained event log (`previousEventHash` links), HMAC-SHA256 bundle signature, deterministic results, immutable prediction hash — strong provenance design. | Observed in generated artifact |
| Honesty markers | Replay banner: "It is not a live model run." / replay API: `generationIsolation: PARTIAL` with candid limitation; judge page: "A Proof Capsule proves integrity and scoped verification—not global mastery or formal sandbox security." — unusually candid. | Directly observed |
| Reproduce story | `/judge` lists `./scripts/test-all.sh`, `./scripts/run-mutations.sh leakage`, `./scripts/reproduce-session.sh leakage-01`, `./scripts/replay-patch.sh leakage-01` — these reference a **local repo that is not shipped with the deployed demo**; a judge cannot run them from the site. | Directly observed — P3 |
| Missing basics | No `robots.txt`, no `sitemap.xml` (both SPA-redirect); `/favicon.ico` consistently hangs (visit timeout 2/2) instead of returning an icon or 404. | Directly observed / Reproduced (favicon) |

---

## 8. Top reliability/performance findings (summary; full detail in `work/agent913_issues.json`)

1. **A9-01 (P1)** — Evidence/"Activity" drawer permanently empty + events counter stuck at 0 in session, proof, and replay, despite a full server-side event chain.
2. **A9-02 (P1)** — Bogus `/replay/<id>` yields a perpetual "Opening this replay…" spinner after the not-found toast, with misleading step-3 progress chrome and no recovery path.
3. **A9-03 (P1)** — Unauthenticated full-session API (`/api/sessions/<id>`, `/events`, `/api/replays/<id>`) exposes complete learner data + signed proof bundle; sessions persist ≥6 h with no observed expiry.
4. **A9-04 (P2)** — Sample/replay "fixed kernel computation" is replayed *stored* evidence (`stored-approved-leakage-v1`, recorded 2026-07-14; identical result hashes across sessions), in tension with "Fixed kernel computes every number" marketing.
5. **A9-05 (P2)** — `/new` readiness checks render pre-passed instantly with no observable verification (optimistic/static environment claims).
6. **A9-06 (P2)** — No 404 page for bad deep links; bogus `/session`//`/proof` show home UI under the wrong URL (share/refresh of the URL repeats the toast; nothing to bookmark).
7. **A9-07 (P3)** — No `robots.txt`/`sitemap.xml`; `/favicon.ico` timed out once (Unverified).
8. **A9-08 (P3)** — "Reproduce locally" scripts reference a repo not shipped with the demo.
9. **A9-09 (P3)** — "Start over" has no confirmation and no in-app way back to the persisted session.
10. **A9-10 (P3, positive/verification)** — "Twenty seconds" claim verified ≈12.8 s kernel run; downloads instant; refresh-restore works.

---

## 9. Recommendations (highest leverage first)

1. **Wire the Activity/events drawer to `/api/sessions/<id>/events`** (the data already exists and is hash-chained). Until fixed, remove the "N events" counter rather than show a wrong 0. *(Fixes A9-01; biggest trust win — the product's core promise is visible evidence.)*
2. **On replay/session not-found, replace the spinner with a terminal error state** (message + "Back to home" CTA) and reset the wizard chrome. *(A9-02)*
3. **Decide an exposure policy for the session API**: short-lived signed URLs, session expiry/TTL, or at minimum a robots/noindex + documented "anyone with the link can view" stance. *(A9-03)*
4. **Label sample/replay as "recorded verified evidence" wherever the four-authorities story is told** (the replay banner already does this; extend it to `/judge` and the step-3 "Fixed kernel" authority copy). *(A9-04)*
5. **Make `/new` readiness checks real** (call `/api/health`-style probes and show pending/pass/fail) or remove the implication of a live check. *(A9-05)*
6. Add a real 404 page for bad deep links; add `robots.txt`; investigate `/favicon.ico`. *(A9-06, A9-07)*

---

## 10. Could-not-test register (explicit)

- HTTP response headers, cache directives, TLS details, exact 404 body content (browser renders blank).
- POST/PUT/DELETE endpoint shapes (browser GET-only).
- True rapid double-click / double-submit protection.
- Rate-limit behaviour (requests ~30 s apart; no flooding).
- Offline transitions.
- Infrastructure-level cold start (below ~30 s tool noise floor).
- Live notebook upload / live authority path (file input not settable).
- Browser back/forward buttons (not in tool set).
- Client-side animation smoothness/jank beyond gross observation (no frame timing).
