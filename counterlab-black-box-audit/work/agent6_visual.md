# Agent 6 — Visual Design & Interaction Audit: CounterLab
Target: https://counterlab.cserules.workers.dev/ · Viewport 1920×1080 · All screenshots: `evidence/screenshots/agent6_*`
Evidence labels: **DO** = directly observed · **IB** = inferred from behaviour · **UV** = unverified · **CT** = could not test.

---

## 0. Overall verdict (summary first)

CounterLab is a **visually ambitious, mostly well-crafted product with a split personality**: a ChatGPT-style dark chat homepage that opens into a light, editorial, assessment-flavoured 6-step lesson wizard with engineering-console chrome (Studio drawer, ⌘K palette, evidence drawer). Craft is high — serif display type, disciplined grids, real state design — but four defects keep it from feeling finished: (1) the trust surface that is the product's entire pitch (Evidence & proof drawer) is **empty after a fully completed verified session**; (2) the boundary statement — part of the falsification payoff — is **ghosted at ~1.7:1 contrast** (measured); (3) error/empty journeys (bad replay id, live flow without artifact) fall into **permanent false-loading states** instead of designed error screens; (4) the notebook **diff has no red/green coding**, muting the repair payoff. The falsification reveal *is* staged as a climax (dark "Experiment Theater" inversion + sealed-prediction juxtaposition) but the transition into it is instant — no suspense beat.

**Feels like:** a *guided interactive lesson welded to a verification console* — "CI for understanding" is a genuinely coherent new shape, but the console chrome (⌘K, Studio, six-tab evidence drawer) outweighs what a learner needs, so it reads as **engineering-demo DNA wearing an education skin**. Not a chatbot, not a dashboard, not a notebook debugger — closest to an assessment wizard + provenance console hybrid.

---

## 1. Screen-by-screen critique

### 1.1 Homepage `/` — dark chat shell (agent6_01, _02, _54)
- **Hierarchy:** kicker ("Ask like chat. Prove it like science.", teal, centered) → 40px sans H1 → subtext → Question/Notebook pill toggle → big textarea card → "Test this claim →" (lavender, right) / "+ Attach notebook" (left) → prompt starters → proof/support blurbs → "Need a hint?". Clean, centered ~760px column, generous whitespace. **DO**
- **CTA priority:** Primary CTA clear. But the two fastest trust paths — "Try verified sample" / "Watch verified replay" — are small gray sidebar text links, visually beneath "+ New question". For a judge with 3 minutes, the sample entry is under-promoted. **DO** (agent6_01)
- **Disabled state:** "Test this claim →" empty-form disabled = washed periwinkle, measured **2.52:1** (text (36,44,62) on bg (87,104,145)). Reads "off", not "waiting for input". Fills to saturated lavender once text entered — good state delta. **DO** (agent6_01 vs _02)
- **Contrast (dark theme, measured):** main subtext (125,125,133) on (9,9,11) = **4.87:1** (bare pass); sidebar section label "START WITH EVIDENCE" (92,92,99) on (5,5,6) = **3.07:1 FAIL**; "No account needed" (69,69,74) = **2.14:1 FAIL**; nav links 5–6:1 pass; prompt-starter lavender 9.2:1 strong. **DO** (agent6_54, pixel-sampled)
- **Notebook tab state:** subtle, appropriate changes (active pill, helper line, placeholder swap, attach label). **DO** (agent6_54)
- **Transient artifact:** first load showed a blue focus-outline box around the H1; gone on subsequent visits — likely autofocus-on-mount. Looks like a glitch on first paint. **IB** (agent6_01 vs _54/_55)
- **Dead nav:** sidebar "How proof works" anchor produces no navigation or visible change (stays on `/`). **DO** (agent6_55)

### 1.2 `/judge` — public evidence dossier (agent6_03–07)
- **Completely different visual language:** cream paper background (242,239,230), serif display type ("See a belief break in twenty seconds."), small-caps kickers, editorial two-column hero. It is *beautiful* — magazine-dossier feel, dark navy evidence card on mint offset shadow with a yellow "VERIFIED TEST" tab. **DO**
- The dossier design system (serif, cream, navy, mint, yellow) is actually the *same* language as the session wizard — so the app has **one light editorial identity plus one orphaned dark chat homepage**, not two equal themes. The dark home feels like a different product bolted on. **DO**
- Four-authorities A/B/C/D grid and "Three paths" cards are disciplined; the dark center card (Live) correctly dominates; badges "SAMPLE LESSON" / "LIVE NOTEBOOK ANALYSIS" / "VERIFIED REPLAY" are consistently placed top-of-card. **DO** (agent6_05)
- Trust texture is excellent: "KNOWN BOUNDARY" yellow callout, checkmark limitation list, terminal-style reproduce card, closing line "Chatbots explain. CounterLab lets reality answer." **DO** (agent6_06–07)
- Minor: replay card admits "This legacy v1 replay … does not offer a Proof Capsule download" — honest, but underscored product gap. Two same-weight outlined CTAs ("Use the sample lesson" / "Watch the verified replay") compete at the bottom of `/new`. **DO**

### 1.3 Session wizard `/session/<uuid>` — light editorial, 6 steps
**Chrome:** sticky header with centered stepper pill (numbered circles → green ✓ on completion, active = filled blue), mode badge right ("● INSTANT SAMPLE" / "● LIVE GENERATION" / "● REPLAY MODE" — consistent placement, distinct colors), "START OVER", "Project & evidence" (Studio trigger), "Need a hint?" bar, fixed bottom "Evidence & proof · N events · Open" bar. **Stepper is genuinely good progress indication** — checks accumulate, future steps gray. **DO** (agent6_08, _17, _46)

**Recurring layout defect:** the white "Next: …" bar **overlaps the two cards beneath it** (~30px tuck, negative-margin stacking). On Step 1 the left card's title "Uploaded notebook evidence" is half-clipped behind the bar (zoom-confirmed). Repeats on Steps 1–3 (likely all). **DO** (agent6_08z zoom, _13)

**Step 1 Question:** evidence card (IPYNB badge, ✓SUPPORTED mint pill, big 0.985 stat with left accent border, cell excerpts, integrity expander with SHA-256 mono) vs claim card (blue top border). Card hierarchy strong. Native `Choose File / No file chosen` input is unstyled and clashes. **DO** (agent6_08–11)

**Step 2 Prediction:** progressive disclosure — confirm pill ("✓ You confirmed…"), then a gold-accented "Seal" section (gold kicker, gold confidence slider, gold "Seal my prediction" button). Radio cards highlight pale yellow when chosen; expectation echoes into "0.985 → Fall materially" stat boxes. The **seal ritual is one of the best-designed moments** — color-coding the commitment action differently from navigation CTAs is smart. **DO** (agent6_14–16)

**Step 3 Test:** "PREDICTION SEALED" yellow lock card (0.985 → Fall materially, 72% confidence) + "● Test plan verified" mint pill + CHANGED/HELD-FIXED cards + "Evidence & proof" inline expander + mint "Ready?" CTA bar. Clear, layered, trustworthy. **DO** (agent6_17–18)

**Step 4 — THE REVEAL ("Experiment Theater"):** the page inverts: a dark navy rounded theater on the cream page, "LOCKED PREDICTION" amber translucent bar directly above "Familiar rows 98.5% → New customers 59.4%" in huge white numerals, caption "98.5% became 59.4% when the test contained only new customers.", "Held fixed…" right-aligned, sub-tabs Observe/Explore/Boundary/Apply with mint active state and "Completed" sub-labels, expandable white metrics table (random 98.5%/0.984 · group 59.4%/0.641 · identity ablation 67.4%/0.725, overlap 389(100%)/0(0%), seed 1729). **Staged as a climax — yes: inversion + lock juxtaposition + scale. But:** (a) the transition was **instant** — no suspense beat, no animation observed between click and settled state (**IB**, agent6_19 taken immediately post-click already settled); (b) the drop is not visually encoded — both numerals same size/color, only a thin teal arrow; no red/down treatment, **no chart anywhere** (purely typographic). A minimal two-bar visual would multiply scannability. **DO** (agent6_19–21)

**Boundary tab:** headline "Find where the conclusion changes", then the key card — "VERIFIED SAMPLE BOUNDARY / The conclusion changes at the entity boundary. / The verified whole-customer run has 0 shared customers; the random-row run has 389." — rendered **ghosted**: measured heading **1.82:1**, body **1.63:1** (text (167–179,183–193,202–213) on (240,242,243)). Effectively invisible; it stayed ghosted through session completion. This is the intellectual payoff of the Boundary step and it is the lowest-contrast text in the product. **DO** (agent6_23, _24, _23z zoom, pixel-measured)

**Apply tab / Step 5 Transfer:** rule builder (radio "Build with evidence-linked clauses", three clause columns When/I should/because with evidence links, composed "revised mental model" sentence in bold) — pedagogically lovely. Defect: the clause `<select>`s **truncate** ("rows repeat the s…") — learner can't read the full clause in the control. Transfer step adds a custom **timeline diagram** (TRAINING Jan–Mar | NOW | TEST Apr–Jun) where the chosen feature draws a gold arrow *crossing NOW* with a ✕ — the best information graphic in the product. "🔒 FIX STILL LOCKED" badge ties repair to transfer success. **DO** (agent6_25–30)

**Step 6 Repair & proof page `/proof/session_<uuid>`:** completion state is strong: "You can now distinguish: 'good on familiar rows' from 'generalizes to new entities'", Before/After reasoning cards, "Transfer status: Passed", two download surfaces (primary "Download repaired notebook" + outlined "Download proof record"), "Reasoning Diff" table (Belief/Prediction/Code/Transfer, lavender header), technical proof block (result_hash, seed, replay_id, reproduce commands in mono). **DO** (agent6_31–35, _38)
**Diff defect:** "See the verified notebook change" opens a navy code panel with a unified diff where **−/+ lines are the same gray as context** (zoom-verified; `−from sklearn.model_selection import train_test_split` vs `+…GroupShuffleSplit` identical color; hunk headers same color too). For the moment the product *proves* the repair, the single most conventional affordance (red/green) is missing. **DO** (agent6_36–37, _37z)

### 1.4 Evidence & proof drawer (bottom) — the trust surface (agent6_39–42, _45)
- Proper bottom drawer: header, Close, six tabs (Activity, Plan, Diff, Tests, Verifier, Provenance), scrim-less but non-blocking.
- **After a fully completed verified sample session (test run + patch + proof issued): Activity "No activity evidence yet", Plan "No plan evidence yet", Diff "No diff evidence yet", Tests/Verifier same; header reads "0 events".** Only Provenance has rows (Artifact hash, Session ID, Result hash, "Boundary: Locked until verification", "Capsule: Issued after verified repair"). **DO**
- The empty copy ("It will appear here when the session produces it") implies pending work on a *finished* session — the product's core promise looks broken on the exact journey every judge takes first. **DO**
- Provenance rows are ambiguous/stale: "Boundary: Locked until verification" still shown *after* verification+repair completed; "Capsule: Issued after verified repair" reads as policy, not state. **DO** (agent6_42)

### 1.5 Studio drawer ("Project & evidence") (agent6_43, _50)
- Left slide-in, dark navy, page scrim behind (proper modal behaviour), "Close project tools", "+ New analysis" white button, CURRENT NOTEBOOK card (or dashed "Choose a notebook / no artifact selected" empty state), EVIDENCE NAVIGATOR cells with mono snippets, RECENT SESSIONS ("reasoning diff issued" with green dot — cross-session persistence works), and the ⌘ palette trigger "⌘ Commands · Ctrl K". Well-composed; dark drawer on light app echoes the theater. **DO**

### 1.6 ⌘K palette (agent6_44)
- Centered modal, scrimmed page, search input "What do you want to do?" + Esc kbd chip, commands with single-letter kbd hints (N/E/V), **state-aware disabling** ("Lock prediction", "Run fair test" grayed on completed session), footer "All commands also have visible controls in the workspace. — CounterLab Studio". Genuinely excellent palette design. The only oddity: it exists at all for a 6-step lesson — console chrome outweighs learner need. **DO**

### 1.7 Replay states (agent6_46, _56, _47, _48)
- `/replay/leakage-01`: **deep-purple full-width banner** "● Verified replay leakage-01 · Recorded 2026/7/14" + "● REPLAY MODE" header badge + grayed future steps — replay is unmistakably labelled and the banner **persists through the replayed wizard steps**. Trust-labelling done right. **DO**
- `/replay/bogus-id`: error toast pill top-right ("Replay bogus-id was not found") + **permanent** "CHECKING STORED EVIDENCE / Opening this replay…" loading page (re-checked after a wait — never resolves), **no recovery CTA** in the content area, and the stepper **leaks stale progress** (✓✓ 3 Test) from my previous session into the error view. A typo'd URL bricks the screen. **DO** (agent6_47, _48)

### 1.8 `/new` live flow (agent6_49, _51–53)
- Readiness screen: green-dot preflight card ("Notebook lesson tools are ready to try", "Hosted notebook runner is ready") — nice ops-console touch; three CTAs (one primary + two same-weight outlines). Stepper shows "1 Question" active although content is pre-lesson setup — mildly misleading progress. **DO** (agent6_49)
- "Continue with my notebook" (no file chosen) lands on Question step in a **permanent false-loading state**: red "LOADING" pill, "Preparing artifact…", "Not available" metric, integrity "Pending intake / 0 cells / Pending". Nothing is loading; no prompt to upload appears; the disabled "Compare two explanations" gives no reason. Red for a loading badge is also convention-breaking (red = error). **DO** (agent6_51–53)
- "Use a starter claim" one-click fills the textarea (78 chars) — efficient. **DO** (agent6_52)

---

## 2. Cross-cutting assessment

- **Typography:** two families — a transitional serif for display/editorial moments (wizard headlines, dossier, serif-italic quote cards) and a grotesque sans for UI/body; mono for hashes/cells/commands. Hierarchy (kicker → serif display → sans body) is consistent *within* the light theme. Line lengths disciplined (~60–75ch). The dark homepage uses only sans — part of the split identity. **DO**
- **Color system:** light theme = cream (242,239,230), navy (6,19,38), blue primary, mint success, gold/amber for commitment & warnings, teal accents; dark theme = near-black + lavender. Gold is meaningfully reserved for seal/commit/replay-prediction states — a real system. **DO**
- **Buttons:** clear primary/secondary/ghost hierarchy; selected radio cards highlight well; disabled states are uniformly washed-out low-contrast (measured 2.52:1) with **no reason text**. Hover states **CT** (no hover tool). **DO/CT**
- **Loading states:** text-only ("Preparing artifact…", "Opening this replay…", red LOADING pill). No spinners, skeletons, or progress bars observed anywhere; all sample transitions instant. The two states that *do* show loading copy are the two that never resolve (bogus replay, missing artifact). **DO**
- **Modals/drawers:** Studio drawer + scrim = correct; ⌘K modal + scrim = correct; bottom evidence drawer non-modal = reasonable; toast (error pill) top-right = fine but it outlives its usefulness on a bricked page. **DO**
- **Trust labelling:** **the strongest system in the product.** INSTANT SAMPLE / LIVE GENERATION / REPLAY MODE badges (consistent header placement, distinct colors), purple replay banner persisting mid-journey, VERIFIED TEST tab on dossier, SUPPORTED/FIX STILL LOCKED/PREDICTION SEALED pills, "Sample result stays fixed" mono badge. Sample vs replay vs live vs verified are visually distinct and consistently placed. One inconsistency: red "LOADING" pill borrows error color. **DO**
- **The strongest moment (falsification reveal):** staged as climax by inversion + locked-prediction juxtaposition + typographic scale — but robbed of suspense by an instant transition and no visual encoding of the drop (no chart, no color direction). Half-staged. **DO/IB**
- **Empty states:** drawer empty states are copy-generic and factually wrong on completed sessions; Studio empty state good; live-artifact "empty" masquerades as loading. **DO**
- **Error states:** the only reachable one (bad replay id) is the worst screen in the product — eternal loader + stale stepper + no exit. **DO**

## 3. What feels unfinished / crowded / generic / over-engineered
1. Evidence drawer empty on the flagship journey (unfinished).
2. Ghosted boundary statement (unfinished/a11y).
3. Eternal false-loading error states (unfinished).
4. Colorless diff (unfinished).
5. Next-bar/card overlap on every step (unfinished).
6. Dark chat home vs light editorial app = two products (inconsistent).
7. Console chrome (⌘K, Studio, six-tab drawer) heavier than the learner task (over-engineered).
8. Dark-theme muted labels failing AA; native file input; truncated selects; dead "How proof works" link (fit-and-finish).

## 4. Strongest design moments (credit)
1. **Experiment Theater reveal** — dark inversion + sealed prediction locked above the 98.5%→59.4% numerals (agent6_19–20).
2. **Transfer timeline** — feature arrow drawn crossing the NOW line with a ✕ (agent6_29).
3. **Prediction-seal ritual** — gold color system, lock card, confidence slider (agent6_15–17).
4. **Trust-badge system + purple replay banner** (agent6_46, _56); **⌘K palette** with state-aware commands (agent6_44); **Reasoning Diff before/after** (agent6_33–34); **judge dossier editorial craft** (agent6_03).

## 5. Could not test
- Hover/focus-visible states on controls (no hover tool); keyboard-only operation of ⌘K (opened via clickable "⌘ Commands" button instead); true animations/transitions (static screenshots — instant swap inferred); live notebook upload & generation beyond the artifact gate (requires OS file dialog); Proof Capsule download contents (buttons observed, not downloaded); class-imbalance lesson variant (only leakage sample exercised).
