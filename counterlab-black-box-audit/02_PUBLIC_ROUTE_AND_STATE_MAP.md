# CounterLab — Public Route & State Map (Agent 1: Public Surface Cartographer)

- **Target:** https://counterlab.cserules.workers.dev/ (+ `/judge`)
- **Audit date:** 2026-07-19 (UTC) · **Mode:** strict black-box (no source/repo/log access)
- **Method:** browser automation only (visit/click/input/find/scroll/screenshot). Screenshots in `evidence/screenshots/agent1_*.png`; downloaded artifacts in `evidence/agent1_download_*`.
- **Tooling limits:** no DevTools console/HAR; `web_open_url` egress-blocked ("audit rejected"); browser tools cannot set file inputs (live notebook upload untestable); HTTP status codes/headers not observable — redirect/status statements below refer to client-observable behavior.
- **Evidence labels used:** Directly observed / Reproduced / Observed in generated artifact / Inferred from behaviour / Unverified / Could not test.

---

## 1. Text route diagram

```
counterlab.cserules.workers.dev
├── /                          Learner home (dark). Claim textarea, Question/Notebook tabs, prompt starters,
│                              sidebar: New question · Try verified sample · Watch verified replay ·
│                              Judge Mode (/judge) · How proof works [DEAD LINK] · "No account needed"
│      │ "Test this claim →" (enabled only when textarea non-empty)
│      ▼
├── /new                       Live-mode gate ("LIVE GENERATION" badge). Readiness checks, then:
│      │                       [Continue with my notebook] [Use the sample lesson] [Watch the verified replay]
│      │ Continue → Step-1 Question in "Preparing artifact…" perpetual loading (dead end without upload)
│      ▼
├── /session/<session_uuid>    6-step learner wizard (single route; steps are in-page states, NOT sub-routes):
│      │                       1 Question → 2 Prediction (confirm explanation → seal prediction + confidence)
│      │                       → 3 Test (plan verified → "Run the fair test") → 4 Boundary (Experiment Theater:
│      │                       Observe/Explore/Boundary/Apply tabs + rule builder) → 5 Apply (transfer quiz)
│      │                       → 6 Repair (preview changes/preserves → "Verify notebook patch")
│      │ "Verify notebook patch" navigates to /proof/<session_uuid>
│      │ Bad id → toast "Session not found: <id>" + home UI (URL unchanged)
│      ▼
├── /proof/<session_uuid>      Proof page (Repair final). GATED: visiting before completion redirects to
│                              /session/<id>. Before/after reasoning, Transfer status, Reasoning Diff table,
│                              verified notebook diff, technical proof (result_hash, seed, replay_id, scripts),
│                              downloads: repaired notebook (.ipynb), proof record (JSON bundle, HMAC-signed)
├── /judge                     Public evidence dossier ("Judge Mode", light theme). Hero, 98.5→59.4 comparison,
│                              4 authorities (GPT-5.6 / Runtime Codex / Fixed kernel / Frozen verifier),
│                              3 evidence modes (Sample lesson → /session/<uuid> · Live → /new ·
│                              Replay → /replay/leakage-01), 6-step loop, claims/limits, reproduce scripts
├── /replay/<replay_id>        Verified replay (only known id: leakage-01, linked from home + /judge).
│      │                       Purple "Verified replay · Recorded 2026/7/14" banner + REPLAY MODE badge,
│      │                       provenance (Model gpt-5.6-sol, Verifier leakage-verifier-v1, Commit 4f2f6472…).
│      │                       Starts at step 3 → "Continue replay" → "Show me what happened" → theater →
│      │                       rule builder → transfer quiz → "Verify notebook patch" → final read-only state
│      │ Bad id → "Replay <id> was not found" + perpetual "Opening this replay…" spinner
├── /replay (no id)            → silent redirect to /
└── /<anything-else>           → silent redirect to / (NO 404 page anywhere)

Overlays/drawers (available on session/replay/proof pages, not routes):
  • "Project & evidence" → Studio drawer: Current notebook, Recent sessions (status labels:
    INGESTED / REASONING DIFF ISSUED), "+ New analysis", "⌘ Commands Ctrl K"
  • Command palette (⌘K/Ctrl K or button): search + commands; context-gated
  • "Evidence & proof" bottom drawer: Activity · Plan · Diff · Tests · Verifier · Provenance tabs
```

**No query params, hash routes, or deep links were observed in any page** (Directly observed). Sessions are addressable only via opaque `/session/<uuid>` / `/proof/<uuid>`; replay via `/replay/leakage-01`.

---

## 2. Route & state table

### R1 — `/` (Learner home)
| Field | Value |
|---|---|
| How discovered | Target root (given) |
| Purpose | Entry: state a claim, attach notebook, branch to sample/replay/live/judge |
| Primary user | Learner (also judge entry) |
| Visible actions | Sidebar: `+ New question` (clears draft), `Try verified sample` (creates `/session/<uuid>`), `Watch verified replay` (→ `/replay/leakage-01`), `Judge Mode` link (→ `/judge`), `How proof works` link (**dead — no effect, Reproduced 2×**). Tabs: `Question` / `Notebook` (Notebook swaps copy to "Attach a supported .ipynb…" and label to "+ Attach supported .ipynb"). Textarea "Your question or claim". `+ Attach notebook` (label wrapping hidden file input). `Test this claim →` (**disabled until textarea non-empty**). 2 prompt-starter buttons (fill textarea). Footer text: "How proof works: fixed kernels calculate… frozen checks verify…" · "Supported today: … Unsupported evidence is refused, not guessed." `Need a hint?` details → contains link `Review the supported evidence boundary` (**dead — no effect, Reproduced**) |
| Required prior state | None ("No account needed") |
| Loading state | None observed (instant) |
| Empty state | Default view (no draft) |
| Success state | Claim submit → routes to `/new` (claim text carried over, Directly observed: 55-char probe appeared in live draft) |
| Failure state | Toast top-right "Session not found: `<id>`" when arriving from bogus `/session/` or `/proof/` URL (Directly observed) |
| Mobile status | Untested (Agent 7); single-column layout likely OK; wide claim box |
| Accessibility | Tabs are `<button>`s; submit disabled-without-text is announced only by absence from tab order (Inferred); details/summary used natively (good); dark theme contrast appears adequate |
| Screenshot | `agent1_home.png`, `agent1_hint_expanded.png`, `agent1_notebook_tab.png`, `agent1_claim_submit.png` |

### R2 — `/judge` (Public evidence dossier / Judge Mode)
| Field | Value |
|---|---|
| How discovered | Sidebar "Judge Mode" link (href shown: `/judge`); also given by commander |
| Purpose | Judge-facing evidence dossier: thesis, 4-authority architecture, 3 evidence modes, claims & limits, reproduce commands |
| Primary user | Hackathon judge |
| Visible actions | `Start sample →` (creates fresh `/session/<uuid>`, Directly observed ×2 ids), `Watch verified replay` (→ `/replay/leakage-01`), `Run live →` (link href `/new`), `Open learner view` / `Learner view ↗` / logo (→ `/`) |
| Required prior state | None |
| Loading state | None |
| Empty state | n/a (static dossier) |
| Success state | All CTAs route correctly (Directly observed) |
| Failure state | None observed |
| Mobile status | Untested; long scroll (~3500 px), card grids |
| Accessibility | Semantic sections; step list is text-only; anchor links have real hrefs (good) |
| Screenshot | `agent1_judge.png` … `agent1_judge_bottom.png` |

Content notes (Directly observed): "Generated vs. computed vs. verified — A GPT-5.6 frames the belief · B Runtime Codex compiles the test plan · C Fixed kernel computes every number · D Frozen verifier decides what may ship." Modes: "Sample lesson … Always labelled as a sample." / "Live notebook analysis … Deployed live authority is configured" / "Verified replay … persistent replay banner … Recorded 2026/7/14. This legacy v1 replay is genuine but does not offer a Proof Capsule download." Limits: "Known boundary … two reviewed ML Subject Packs … A Proof Capsule proves integrity and scoped verification—not global mastery or formal sandbox security." Reproduce: `./scripts/test-all.sh`, `./scripts/run-mutations.sh leakage`, `./scripts/reproduce-session.sh leakage-01`, `./scripts/replay-patch.sh leakage-01`.

### R3 — `/new` (Live notebook gate)
| Field | Value |
|---|---|
| How discovered | `Run live →` link on `/judge` (href `/new`); homepage claim submit also lands here |
| Purpose | Gate for live notebook analysis; environment readiness check |
| Primary user | Learner with own notebook |
| Visible actions | `Continue with my notebook →`, `Use the sample lesson`, `Watch the verified replay`; sidebar-less; badge "LIVE GENERATION"; `Start over`; `Project & evidence` drawer |
| Required prior state | None |
| Loading state | Readiness checks resolve instantly to two ready lines |
| Empty state | n/a |
| Success state | Continue → step-1 Question (but see failure) |
| Failure state | **Dead end (Reproduced 2×):** Continue with no upload → ".ipynb Loading · Uploaded notebook evidence · Preparing artifact…" forever; integrity panel "Notebook SHA-256 Pending intake · Evidence cells 0 · Support decision Pending"; primary CTA "Compare two explanations" disabled; no prompt to upload; only escape is "Use a different notebook" file input. Misleading label: claims "Uploaded notebook evidence" when nothing was uploaded |
| Mobile status | Untested |
| Accessibility | File input only reachable via label text "Use a different notebook" |
| Screenshot | `agent1_new.png`, `agent1_new_upload.png`, `agent1_new_preparing.png` |

### R4 — `/session/<session_uuid>` (6-step learner wizard)
| Field | Value |
|---|---|
| How discovered | `Try verified sample` (home), `Start sample` (/judge), `Use the sample lesson` (/new) |
| Purpose | The learning loop: Question→Prediction→Test→Boundary→Apply→Repair |
| Primary user | Learner |
| Required prior state | None for sample; live mode needs an upload (Could not test) |
| Loading state | Sample: none (instant). Live: perpetual "Preparing artifact…" (see R3) |
| Empty state | Step 1 with empty claim textarea ("0 characters") |
| Success state | Step advance; steps 1–5 stay in-route; step 6 "Verify notebook patch" → `/proof/<id>` |
| Failure state | Bad session id → toast "Session not found: `<id>`" + home UI under unchanged URL (Directly observed) |
| Mobile status | Untested |
| Accessibility | Step nav buttons for completed steps (✓ Question/Prediction/…) allow jumping back; radios have real fieldsets/labels (good); confidence slider default 72% |
| Screenshot | `agent1_sample_step1*.png`, `agent1_sample_step2*.png`, `agent1_sample_step3.png`, `agent1_sample_step4*.png`, `agent1_sample_step5.png`, `agent1_sample_repair_diff.png`, `agent1_session_bogus.png` |

In-wizard states (all Directly observed, "Instant sample" badge present throughout):
1. **Question:** notebook card `.IPYNB` + `SUPPORTED`; accuracy 0.985 + roc_auc 0.984 excerpts (Cell 3 · output 0); "Full evidence and integrity" details: Notebook SHA-256 `d0e9f323…5bbc9`, Evidence cells 5, Support decision SUPPORTED; "Use a different notebook" file input (Could not test upload); claim textarea; `Use a starter claim` (fills 78-char claim); primary CTA `Compare two explanations` (⌘K) enabled only after claim non-empty.
2. **Prediction:** two competing models with Predicts/Conditions-and-limits details ("The intervention can test evaluation leakage in this supported notebook; it does not prove global model quality or learner mastery."); `Yes, this captures my view` / `Edit my explanation` / "More ways to respond" details (`Not enough evidence`, `Reject`); after confirm → seal form: expectation radios (Remain near 98% / Fall materially / I am unsure) + Confidence slider 72% + `Seal my prediction` (enabled only after radio chosen).
3. **Test:** "Prediction sealed 🔒"; "Test plan verified"; Changed: evaluation unit random rows→whole customers; Held fixed: model family/target/metric/preprocessing/seed; Evidence & proof details: Mode "Verified sample", Result authority "Fixed kernel", Release state "Verified plan; result not released"; `Run the fair test` → jumps straight to step 4 (computation instant for sample).
4. **Boundary:** Experiment Theater (dark) — "Verified result" badge vs "Locked Prediction"; 98.5% (389 shared customers) → 59.4% (0 shared); tabs: `Observe` (default), `Explore` (**locked for sample**: "Sample result stays fixed for a reproducible lesson"; live notebooks can change split/identity/entity/test size), `Boundary` ("The conclusion changes at the entity boundary… 0 vs 389 shared customers"), `Apply` (rule builder: write-mode radios; 3 dropdown clauses each with `Evidence:` links; "Your revised mental model" textarea; `Try the rule on a new problem`); "Inspect the verified runs" table: random row split 98.5%/0.984/720/389(100%)/seed 1729 · customer group split 59.4%/0.641/720/0(0%)/1729 · identity ablation 67.4%/0.725/720/389(100%)/1729 · result `a6ae7652e04e…`.
5. **Apply:** "New problem · No notebook hints"; "Fix still locked" badge; timeline transfer quiz (TRAINING Jan–Mar · NOW · TEST Apr–Jun): split radios (Random daily rows / Time-ordered holdout) + feature radios (Known item price / Centered rolling target) → `Check transfer`.
6. **Repair:** "Transfer passed · Patch unlocked"; repair preview (changes: random rows→whole-customer holdout, identity removed, overlap reported; preserves: target, model family, unrelated cells, original notebook); `Verify notebook patch` → `/proof/<id>`.

### R5 — `/proof/<session_uuid>` (Proof page / Reasoning Diff)
| Field | Value |
|---|---|
| How discovered | "Verify notebook patch" at end of wizard; Studio drawer "Recent sessions" → completed session |
| Purpose | Final artifact: Reasoning Diff for people, Proof Capsule (proof record) for machines |
| Primary user | Learner; judge (verification) |
| Visible actions | `Download repaired notebook` (.ipynb, works — 5.9 KB JSON, contains patched GroupShuffleSplit cell + `counterlab` metadata + `COUNTERLAB_PATCHED_RESULT` line), `Download proof record` (works — 34 KB JSON bundle, 12 hash-chained events, `integrity: hmac-signed/hmac-sha256`, `externalVerifier.status: VERIFIED`), `Download proof` (same record), details: "See the verified notebook change" (unified diff), "Technical proof and reproduction" (result_hash `a6ae7652e04e…`, seed 1729, replay_id leakage-01, 2 reproduce commands), Evidence & proof drawer |
| Required prior state | **Gated (Directly observed):** visiting `/proof/<fresh-session-id>` before completion redirects to `/session/<id>` step 1 |
| Loading state | None |
| Empty state | n/a (unreachable before completion) |
| Success state | Full page as above; "Transfer status: Passed" |
| Failure state | Bad id → toast "Session not found" + home UI |
| Mobile status | Untested |
| Accessibility | Diff rendered as text (screen-reader OK); tables used for Reasoning Diff (good) |
| Screenshot | `agent1_proof_mid.png`, `agent1_proof_bottom.png`, `agent1_proof_premature.png`, `agent1_claim_leak_proof_page.png` |

**⚠ Display/record divergence (Reproduced):** during **in-app navigation** (Studio → Recent sessions) with an unsubmitted claim draft present, "Before and after reasoning → Before" and Reasoning-Diff "Belief → Before" render the **ambient draft claim**, not the session's recorded claim ("I think the high score means the model will work for completely new customers." vs displayed "agent1 inert probe…"). A **cold reload** of the same URL renders the correct recorded claim. See issue A1-04.

### R6 — `/replay/<replay_id>` (Verified replay; known id `leakage-01`)
| Field | Value |
|---|---|
| How discovered | Sidebar "Watch verified replay"; /judge mode card + CTA (href `/replay/leakage-01`) |
| Purpose | Read-only reconstruction of a recorded reject–repair trace |
| Primary user | Judge; learner (demo) |
| Visible actions | `Continue replay` → `Show me what happened` → theater tabs (Observe/Explore/Boundary/Apply) → rule builder → transfer quiz (interactive) → `Verify notebook patch` → final state; `Start over`; disabled `Download repaired notebook` / `Download proof record` |
| Required prior state | None; restarts from step 3 on every visit (Directly observed) |
| Loading state | "Checking stored evidence / Opening this replay…" (persistent on bad id) |
| Empty state | n/a |
| Success state | Mirrors sample content with recorded claim "The notebook accuracy proves generalization to new customers."; Mode "Verified replay"; Release state "Verified result stored"; result hash `2501654264b9…` (≠ live sample's `a6ae7652e04e…` — see A1-10) |
| Failure state | Bad id → "Replay `<id>` was not found" **plus perpetual "Opening this replay…"** (contradictory, Directly observed) |
| Mobile status | Untested |
| Accessibility | Disabled download buttons look enabled (blue) but are non-interactive — state communicated only by subtle styling; "Preparing proof" placeholder never resolves (looks like perpetual loading) |
| Screenshot | `agent1_replay*.png`, `agent1_replay_bogus.png` |

**Replay step-indicator bug (Reproduced):** progress header stays "Step 4 of 6 Boundary" (steps 5–6 unchecked) through transfer quiz, "Transfer passed · Patch unlocked", and final proof view.

### R7 — Catch-all / 404 behavior
| Field | Value |
|---|---|
| How discovered | Direct guess `/nonexistent-agent1`; also `/replay` (no id) |
| Behavior | Silent client-side redirect to `/` — no 404 page, no message (Reproduced 2×). HTTP status unobservable (tooling) |
| Screenshot | `agent1_404.png`, `agent1_replay_noid.png` |

### O1 — Studio drawer ("Project & evidence") — overlay on session/replay/proof pages
- Content (Directly observed): "Current notebook" (`NB` button; "Choose a notebook — No artifact selected"), "Recent sessions" list with status labels (`customer_churn_leakage.ipynb INGESTED`, `customer_churn_leakage.ipynb REASONING DIFF ISSUED`), `＋ New analysis`, `Close project tools`, `⌘ Commands Ctrl K`.
- Clicking a recent session **restores it** (completed session → its `/proof/<id>` page) — history works (Directly observed). History appears to be browser-storage driven (Unverified mechanism; survives navigation within the same browser).

### O2 — Command palette (⌘K / Ctrl K; button in Studio drawer)
- Search input + Esc label; commands with shortcuts: `Analyze notebook` (N), `Show evidence` (E), `Run fair test`, `Show verifier` (V); context-disabled (greyed, non-indexed): `Lock prediction`, `Review patch`, `Download patched notebook`, `Export proof`, `Start over`. Footer: "All commands also have visible controls in the workspace." (Directly observed on replay page.)
- `Show verifier` opens Evidence drawer at Verifier tab — empty ("No verifier evidence yet") even though session verifier events exist in the record.

### O4 — "Lesson map · Saved step" read-only review (positive)
- Clicking any completed step button (✓ Question / ✓ Prediction / ✓ Test / ✓ Boundary / ✓ Apply) — including from `/proof/<id>` — opens a read-only review of that step's saved evidence: "Review your original question. This is the evidence saved at that point in your lesson. Inspect it without losing your current place. Saved evidence is read-only." Actions: `Return to current step`, `Start a new lesson`. Trust label: "This is the artifact evidence attached to the question, not a newly computed result." Notably, this saved-step view renders the **correct recorded claim** even in-app (contrast with A1-04's proof-page leak). URL stays on the current route (steps are states). Screenshot: `agent1_step_back_nav.png`.

### O3 — "Evidence & proof" bottom drawer
- Bar: "● Evidence & proof · 0 events · Open/Close". Tabs: Activity · Plan · Diff · Tests · Verifier · Provenance.
- **Stub (Reproduced):** Activity/Plan/Verifier show "No `<x>` evidence yet. It will appear here when the session produces it." — even after a fully completed verified session whose downloaded record contains 12 events; event counter stays "0 events" through all 6 steps and the proof page. Diff/Tests not individually clicked (pattern assumed; flagged Unverified). Provenance tab IS populated: Artifact `d0e9f323…5bbc9` · Session id · Result `a6ae7652…6c94` · "Boundary: Locked until verification" · "Capsule: Issued after verified repair" (labels static post-completion).

---

## 3. Trust-label catalog (what is labelled, and where labelling is absent/ambiguous)

**Present and consistent (Directly observed):**
- Mode badges: `INSTANT SAMPLE` (sample session), `LIVE GENERATION` (/new), `REPLAY MODE` + purple "Verified replay leakage-01 · Recorded 2026/7/14" banner on every replay screen (persistent as promised).
- Evidence binding: `.IPYNB` + `SUPPORTED` chips, "Support decision", "Notebook SHA-256" (matches `artifactManifest.fileSha256` in downloaded record — consistent).
- Result authority: "Mode: Verified sample / Verified replay", "Result authority: Fixed kernel", "Release state: Verified plan; result not released" → "Verified result stored"; "Locked Prediction 🔒"; "Test plan verified"; "Subject Pack test plan verified".
- Repair gating: "Fix still locked" during Apply; "Transfer passed · Patch unlocked"; "The original upload will not be overwritten."
- Replay provenance: Model `gpt-5.6-sol`, Verifier `leakage-verifier-v1`, Commit `4f2f6472…e192`.
- Honest limits (/judge): "legacy v1 replay … does not offer a Proof Capsule download"; "Proof Capsule proves integrity and scoped verification—not global mastery".
- Proof-record timestamps verified accurate: all 12 event stamps and `createdAt` (2026-07-18T19:21–19:30Z) match host-verified real UTC of the run (host UTC 2026-07-18T20:10 checked against host local CST UTC+8). **Note:** an earlier draft of this audit suspected a timezone mislabel; that was an audit-side error (host local vs UTC confusion), **not** a product defect.

**Absent or ambiguous:**
- Four distinct hash values all presented as "the" result hash: session theater/proof `a6ae7652e04e…` vs replay theater/technical `2501654264b9…` vs downloaded-notebook metadata `counterlab.resultHash = 2501654264b9…` vs patched-cell output `resultHash = 26b6ad52ef36…`. Terminology not disambiguated in UI (see A1-10).
- "Preparing artifact…" in live mode is labelled like an upload-in-progress although no artifact exists (A1-03).
- Replay final buttons look active but are disabled; "Preparing proof" never resolves (A1-07).
- Provenance labels "Boundary: Locked until verification" / "Capsule: Issued after verified repair" do not reflect completed state (A1-13).
- Drawer "0 events" counter vs 12-event signed record (A1-05).
- Proof-page "Before" belief not bound to record (A1-04).

---

## 4. Could-not-test (tooling constraints)
- File upload end-to-end (live analysis, "Use a different notebook", unsupported-notebook refusal) — browser tools cannot set file inputs. The inert probe notebook was prepared but could not be attached.
- HTTP status codes, response headers, API endpoints, HAR — no network tooling; `web_open_url` blocked ("audit rejected").
- DevTools console / JS errors / storage keys — not exposed by browser tools.
- Physical ⌘K/Ctrl-K keystrokes (palette tested via its button instead).
- Mobile/responsive viewports (assigned to Agent 7); no obvious desktop blockers seen.
- `Evidence:` links inside the Apply rule builder (mapped, not clicked).
- Explore-tab recompute for live notebooks (requires upload).

## 5. Evidence inventory (Agent 1 files)
- Screenshots: `agent1_home.png`, `agent1_home_scrolled.png`, `agent1_hint_expanded.png`, `agent1_evidence_boundary.png`, `agent1_how_proof_works.png`, `agent1_sample_loading.png`, `agent1_sample_step1_full.png`, `agent1_sample_step1_bottom.png`, `agent1_sample_step1_lower.png`, `agent1_sample_step2.png`, `agent1_sample_step2_lower.png`, `agent1_sample_step3.png`, `agent1_sample_test_run.png`, `agent1_sample_step4_lower.png`, `agent1_sample_step4_observe.png`, `agent1_sample_step4_explore.png`, `agent1_sample_step4_boundary_tab.png`, `agent1_sample_step4_apply_tab.png`, `agent1_sample_step5.png`, `agent1_sample_transfer_result.png`, `agent1_sample_repair_diff.png`, `agent1_proof_mid.png`, `agent1_proof_bottom.png`, `agent1_proof_premature.png`, `agent1_claim_leak_proof_page.png`, `agent1_evidence_drawer.png`, `agent1_drawer_provenance.png`, `agent1_judge.png`, `agent1_judge_2.png`, `agent1_judge_3.png`, `agent1_judge_4.png`, `agent1_judge_bottom.png`, `agent1_replay.png`, `agent1_replay_2.png`, `agent1_replay_result.png`, `agent1_replay_step5.png`, `agent1_replay_repair.png`, `agent1_replay_final.png`, `agent1_replay_final_buttons.png`, `agent1_replay_bottom.png`, `agent1_replay_noid.png`, `agent1_replay_bogus.png`, `agent1_new.png`, `agent1_new_upload.png`, `agent1_new_preparing.png`, `agent1_404.png`, `agent1_session_bogus.png`, `agent1_proof_bogus.png`, `agent1_claim_submit.png`, `agent1_project_evidence.png`, `agent1_history_restore.png`, `agent1_command_palette.png`, `agent1_command_palette2.png`, `agent1_show_verifier.png`, `agent1_notebook_tab.png`.
- Generated artifacts: `evidence/agent1_download_repaired_notebook.bin` (valid .ipynb JSON, 5,939 B, SHA-256 `eb20dc7e…a034`), `evidence/agent1_download_proof_record.bin` (JSON bundle, 34,060 B).
