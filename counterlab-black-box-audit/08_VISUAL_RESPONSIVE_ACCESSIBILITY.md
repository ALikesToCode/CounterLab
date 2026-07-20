# 08 — VISUAL DESIGN, RESPONSIVE & ACCESSIBILITY (merged audit)

Audit date: 2026-07-19 · Target: https://counterlab.cserules.workers.dev/ · Agents 6 (visual), 7 (responsive), 8 (accessibility).
Master issues drawn from this dossier: MB-005, MB-006, MB-008, MB-011, MB-017, MB-021, MB-026, MB-030, MB-031, MB-032, MB-033, MB-040, MB-044, MB-045 (see 06_ISSUE_REGISTER).

## Executive synthesis

**Visual (Agent 6):** A guided interactive lesson welded to a verification console — engineering-demo DNA wearing an education skin. Strongest moments: Experiment-Theater reveal (sealed prediction in amber above the 98.5%→59.4% numerals), the transfer timeline (feature arrow crossing the NOW line), the prediction-seal ritual (gold commitment system), and best-in-class trust-labelling intent (SAMPLE/LIVE/REPLAY badges + persistent replay banner). Weakest: the Evidence & proof drawer reads "0 events" after a completed verified session (MB-005); the Boundary payoff sentence — the lesson's key insight — is ghosted at ~1.6–1.8:1 contrast (MB-011); the verified repair diff has no red/green coding; the reveal fires instantly with no suspense staging or delta encoding.

**Responsive (Agent 7):** Mobile readiness is UNPROVEN and at Medium-High inferred risk. Tooling blocked real viewport testing (fixed 1920×1080 automation browser); structural measurements show ≥1220 px header+stepper, ~995 px 7-column verified-runs table, 1015 px Reasoning-Diff table, 191–233 px fixed chrome, sub-44 px touch-target cluster, and selects truncating their own values at 1920 px. No mobile affordance (hamburger/compact nav) observed at desktop width. Judge-on-phone risk: Medium — dossier page plausibly survives; wizard/proof moments are the weak links.

**Accessibility (Agent 8):** No WCAG level met — partial conformance only, but the semantic foundation is genuinely strong (native fieldset/radios/selects/details, labelled wizard fields, slider with live value, text-rendered numerals, timeline text alternative, textual retryable errors). Level A failures observed: unnamed buttons (4.1.2 — palette commands named 'N'/'E'/'V' or empty; MB-017), no bypass block (2.4.1), keyboard-inaccessible homepage upload, nameless homepage textarea. AA failures: 8+ measured contrast violations incl. the 1.8:1 payoff sentence (1.4.3). The transfer ✓/× glyph collision (MB-006) is both a pedagogy and an accessibility failure: screen readers announce bare glyphs and the wrong answer carries the ✓. Estimated ~1–2 days of XS/S fixes to reach realistic AA.

---

# PART 1 — VISUAL DESIGN AUDIT (Agent 6, full)

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


---

# PART 2 — RESPONSIVE / MOBILE RISK AUDIT (Agent 7, full)

# Agent 7 — Responsive & Mobile Audit — CounterLab
Target: https://counterlab.cserules.workers.dev/ (routes: `/`, `/judge`, `/new`, `/session/<uuid>` 6-step wizard, `/proof/<uuid>`, `/replay/leakage-01`; overlays: Studio drawer, ⌘K palette, Evidence & proof drawer)
Audit viewport: **1920×1080 only (fixed; no mobile emulation, no DevTools, no raw HTML/CSS access)**.
All pixel measurements below are taken from full-page screenshots at 1920×1080 (device-pixel-ratio 1) using image analysis. Session walked: sample lesson `session_5cd19e8b-3063-42f7-86b6-686829a318b8`, all 6 steps completed through to `/proof/...`.

## 0. Method & honesty statement
Because the viewport cannot be resized, **no statement in this document is a direct observation of mobile behaviour** unless it is a measurement of a structure that cannot physically fit a smaller viewport (e.g. a 995 px-wide table cannot fit a 375 px phone without reflow — that is geometry, not emulation). Everything viewport-specific is marked **Could not test** plus an **Inferred-risk (High/Medium/Low)** and the desktop evidence behind the inference. Screenshots referenced live in `work/shots/`; some scrolled states were captured inline by the browser tool (noted as "inline capture").

Evidence labels used: **Directly observed** / **Inferred from behaviour** / **Unverified** / **Could not test**.

## 1. Global (site-wide) structural findings

| # | Finding | Measurement @1920 | Evidence | Mobile risk |
|---|---------|-------------------|----------|-------------|
| G1 | Fixed sticky header is a single non-collapsing row: logo (~235 px) + 6-step pill stepper + right actions ("INSTANT SAMPLE", "START OVER" ~13 px caps text). **No hamburger, no overflow menu, no collapse affordance at any point on desktop** | Header 80 px tall; stepper pill **685×59 px** (6 step buttons ~40 px hit height); total row needs **≥~1220 px** | shots/08_wizard_step1.png, 10_replay.png, 12_proof.png — Directly observed | **High (Inferred)** — geometry: 1220 px of fixed nav cannot fit ≤820 px without a reflow whose existence could not be verified |
| G2 | Sticky "Next:" guidance bar pinned under header on wizard steps; at rest its bottom edge **tucks ~4–6 px over the cards' top accent borders**; when sticky it sits ~2 px above the cards | Bar ~92 px tall at rest, ~58 px sticky (x394–1511) | shots/08 vs shots/09 + pixel profile — Directly observed (cosmetic) | **Medium (Inferred)** — bar text wraps to 2–3 lines at 375 px → taller sticky bar → more content covered; Could not test |
| G3 | Fixed bottom "Evidence & proof" bar on every app route, with small "Open" button | Bar 53 px tall, full width; **Open button ~60×23–32 px** | shots/08, 10, 12 — Directly observed | **High (Inferred)** — fixed chrome stacks (see G4); small target persists on touch |
| G4 | Total fixed chrome on app routes: header 80 + sticky Next ~58 + bottom bar 53 = **~191 px (18% of 1080)**; replay adds a 42 px purple banner → **~233 px** | measured | shots/08/09/10 — Directly observed at 1080p | **High (Inferred)** — same chrome on a 568 px-tall phone ≈ **34–41% of viewport** consumed before content; landscape phones (~360 px tall) ≈ 53–65% |
| G5 | No horizontal scrollbar on any route at 1920; all content columns are centered, max-width ~760–1240 px | — | all shots — Directly observed | Layout is **not fixed-width**: desktop layout is fluid-friendly *if* components reflow. Rescale-inferable: yes for text/cards, no for G1/G6/W5/P1/P2 |
| G6 | Homepage: persistent left sidebar, full-height, with bottom-anchored links ("Judge Mode", "How proof works", "No account needed" at y955–1057) | Sidebar **223 px** wide (would be 59% of a 375 px phone) | shots/01_home.png — Directly observed | **High (Inferred)** — must collapse off-canvas; no collapse control visible; bottom-anchored items may overlap nav on short viewports (<~700 px tall) |
| G7 | Meta viewport tag / media queries | — | **Unverified** — raw HTML not fetchable with available tools | Could not test. Rendered pages fill 1920 cleanly (consistent with `width=device-width`, unproven) |
| G8 | Mobile affordances at desktop width: **none found** — no hamburger, no "menu", no responsive-nav hints on any route or overlay. ⌘K palette is keyboard-first but reachable via a visible "⌘ Commands" button inside the Studio drawer | — | full walk — Directly observed (absence) | Mobile entry points exist for palette (drawer button) but not for nav/sidebar |

## 2. Per-screen risk register

### 2.1 Homepage `/` (shots/01_home.png)
| Item | Measurement | Label | Risk |
|---|---|---|---|
| Fixed sidebar (G6) + main card max-width ~760 px, centered | sidebar 223 px; card x692–1451 | Directly observed | Sidebar: **High inferred**; main card: Low (fluid) |
| "New question" button | **197×42 px** (h <44) | Directly observed | Marginal target fail (P3) |
| "Test this claim →" button | 159×44 px | Directly observed | OK |
| Sidebar nav rows ("Start with evidence" etc.) | text cap-height 8 px (~13–14 px font); row pitch ~40 px | Directly observed | Text <14 px → Low-Med readability risk; hit area ~40 px marginal |
| Prompt starter links | text links ~15–16 px, line pitch ~28 px | Directly observed | Small text-link hit areas → Med (inferred) |
| Question/Notebook segmented toggle | 232×52 px (2× ~116 px) | Directly observed | OK |
| Claim textarea, mid-page | ~760×200 px | Directly observed | Keyboard-overlap on phone: **Could not test (Med inferred)** — sticky chrome above/below leaves little room in landscape |
| Page scroll | entire page fits in 1080 px; no scroll | Directly observed | Low |

### 2.2 Judge dossier `/judge` (shots/03–07)
| Item | Measurement | Label | Risk |
|---|---|---|---|
| Hero 2-col: headline (~90 px serif) + dark evidence card | card **505×531 px** with inner 2-col metrics 98.5% vs 59.4% | Directly observed | Card 505 px > 375 px content width → must shrink; inner metric pair may crowd → **Med inferred** |
| "Start sample" / "Watch verified replay" buttons | 197×44, ~178×44 | Directly observed | OK |
| "Four authorities" grid | **4 columns** ~290 px each | Directly observed | >2 cols at mobile-equiv → **Med-High inferred** (must stack; stacking unverifiable) |
| "Three paths" cards | 3 columns ~380 px | Directly observed | Med inferred |
| Editorial sections ("A learning loop…", "Bounded proof…") | 2-col: sticky label + content | Directly observed | Low-Med inferred |
| "Reproduce locally" code card | mono ~14 px; longest line `./scripts/reproduce-session.sh leakage-01` ≈42 ch ≈ **350 px** | Directly observed | Fits 375 px (barely), overflows 320 px → **Low-Med inferred** h-scroll |
| Header (judge variant) | ~88 px; center caps text ~13 px + "JUDGE MODE" pill + "Learner view ↗" | Directly observed | Caps text 13 px; 3-part header crowding on phone → Med inferred |
| **Judge-on-phone verdict** | — | Inferred | Page is stacked editorial content + standard grids; plausibly survives a phone *if* grids stack. Risk to submission: **Medium** (see §5) |

### 2.3 `/new` readiness page (shots/11_new.png)
| Item | Measurement | Label | Risk |
|---|---|---|---|
| Single-column readiness card + 3-button row | buttons 235×44 / 175×44 / 190×44; row ~620 px | Directly observed | Row must wrap on ≤390 px → Low-Med inferred |

### 2.4 Wizard `/session/<uuid>` (sample lesson walked end-to-end)
**Step 1 — Question (shots/08, 09)**
| Item | Measurement | Label | Risk |
|---|---|---|---|
| 2-col cards: evidence (505 px) + claim form (591 px) | x393–898 / x922–1513 | Directly observed | Must stack ≤768 px → Med inferred |
| Sticky Next bar overlap (G2) | ~4–6 px tuck at rest | Directly observed | Cosmetic P3 @desktop; Med inferred mobile |
| "Use a starter claim" chip | 158×**42** | Directly observed | Marginal |
| "Compare two explanations" | ~230×44 | Directly observed | OK |
| Native file input "Choose File / No file chosen" | ~85×**30**, text ~13 px | Directly observed | Small target (native control) |
| Long filename `customer_churn_leakage.ipynb` (28 ch) | fits card @505 px | Directly observed | Med inferred clipping on narrow cards |

**Step 2 — Prediction (inline captures)**
| Item | Measurement | Label | Risk |
|---|---|---|---|
| 2-col explanation cards + "versus" gutter | ~520 px each | Directly observed | Must stack → Med inferred |
| Evidence excerpt grid (2+1 masonry: 535 / 425 / 375 px) | — | Directly observed | Med inferred |
| **Code excerpt line clipped mid-token**: "…from sklearn.preprocessing impor" ends at card edge with no ellipsis | card ~535 px | Directly observed | Content clipping @desktop (P3); much worse ≤390 px → **High inferred** |
| "Yes, this captures my view" / "Edit my explanation" | ~220×43 / ~175×43 | Directly observed | OK (43–44) |
| Seal panel: radio rows | ~1055×**62** full-width rows, radio circle ~22 px | Directly observed | Rows excellent targets |
| Confidence slider | thumb ~**16 px** diameter, full-width track | Directly observed | Thumb <44 px → touch-drag risk Med (track tappable) |
| "Seal my prediction" | ~165×44 | Directly observed | OK |

**Step 3 — Test (inline captures)**
| Item | Measurement | Label | Risk |
|---|---|---|---|
| Changed vs Held fixed cards | 2× ~550 px; "Held fixed" packs 5 inline ✓ items | Directly observed | Stack + wrap → Low-Med inferred |
| "Run the fair test →" | ~165×44 | Directly observed | OK |

**Step 4 — Boundary / Experiment Theater (inline captures)**
| Item | Measurement | Label | Risk |
|---|---|---|---|
| 4 view tabs (Observe/Explore/Boundary/Apply) | 4× ~**255×58** px, row ~1040 px | Directly observed | Row 1040 px → must shrink to ~90 px tabs (sub-labels crowd) or scroll → **High inferred** |
| **Metrics table** "Inspect the verified runs" | **7 columns** (RUN/SPLIT/ACCURACY/ROC AUC/TEST N/CUSTOMER OVERLAP/SEED), ~**995 px** wide, cell text ~13–14 px | Directly observed | 995 px ≥ 2.6× a 375 px phone → h-scroll or reflow required → **High inferred**; cell text <14 px |
| Table sits inside a <details> inside the Theater panel with its own inner vertical scrollbar | — | Directly observed | Nested scroll region = touch scroll-trap risk → Med-High inferred |
| Big metric comparison 98.5% → 59.4% | 2× ~530 px | Directly observed | Med inferred |

**Step 4 — Apply tab / rule builder (inline captures)**
| Item | Measurement | Label | Risk |
|---|---|---|---|
| **`<select>` dropdowns visibly truncate selected values at 1920**: "rows repeat the sa…", "hold out whole en…", "random rows can …" | 3 selects ~**170×35 px** in a 3-col clause grid (~200 px cols inside 775 px card) | **Directly observed** | Truncation at full desktop = real defect (P2); 35 px height <44; 3-col grid must stack → Med inferred |
| Radio pills "Build with evidence-linked clauses" / "Write freely" | ~300×44 / ~115×44, radio 16 px | Directly observed | OK |
| Evidence links under clauses | text ~13 px | Directly observed | Small text/targets Med inferred |
| "Try the rule on a new problem →" | ~245×48 | Directly observed | OK |

**Step 5 — Apply/transfer (inline captures)**
| Item | Measurement | Label | Risk |
|---|---|---|---|
| TRAINING / NOW / TEST timeline visual | 2 bars + marker | Directly observed | Low-Med inferred |
| 2-col choice groups ("evaluation design", "feature crosses NOW") | 2× ~440 px; radio rows ~405×60 | Directly observed | Rows good; groups must stack → Med inferred |
| "Check transfer" | ~180×46 | Directly observed | OK |

**Step 6 — Repair (inline captures)**
| Item | Measurement | Label | Risk |
|---|---|---|---|
| Repair preview 2-col checklists ("changes"/"preserves") | 2× ~480 px | Directly observed | Med inferred |
| "Verify notebook patch →" | ~205×44 | Directly observed | OK |

### 2.5 Proof page `/proof/<uuid>` (shots/12_proof.png + inline)
| Item | Measurement | Label | Risk |
|---|---|---|---|
| Content card max-width | x404–1502 (~1100 px) | Directly observed | Fluid-friendly |
| Before/After reasoning boxes | 2× ~480 px | Directly observed | Stack → Low-Med inferred |
| "Download repaired notebook" / "Download proof record" | 245×44 / 195×44 | Directly observed | OK |
| **Reasoning Diff table** | 3 cols ≈ 120 + 445 + 445 = **~1015 px** | Directly observed | Before/After cells ~160 px each on a phone → extremely tall wrapped cells or h-scroll → **Med-High inferred** |
| **Unified diff code block** | dark panel ~965 px wide, mono ~14 px, longest line ~**85 ch ≈ 655–700 px**, **inner vertical scrollbar** | Directly observed | Line length ≥1.75× phone width → h-scroll inside pre or wrap; nested v-scroll = scroll-trap → **High inferred** |
| Technical proof strings: `result_hash=a6ae7652…` (76 ch unbroken), script paths | fits @1920 | Directly observed | Unbreakable strings overflow 320–375 px unless `word-break` → Med inferred |
| "Download proof" (diff card) | ~155×44 | Directly observed | OK |

### 2.6 Replay `/replay/leakage-01` (shots/10_replay.png)
| Item | Measurement | Label | Risk |
|---|---|---|---|
| Extra purple banner above header | ~42 px → 3 stacked fixed bars (~233 px chrome) | Directly observed | **High inferred** on short viewports |
| Info card rows (Replay/Model/Verifier/Commit) | card ~860 px; commit hash 40 ch right-aligned | Directly observed | Hash fits @860; Med inferred narrow |
| Remainder reuses wizard components | — | Directly observed | Inherits all wizard risks |
| "Continue replay →" | ~165×44 | Directly observed | OK |

### 2.7 Overlays
| Overlay | Measurement | Label | Risk |
|---|---|---|---|
| Evidence & proof drawer (bottom sheet) | full-width, **~345 px tall**; tab row (Activity/Plan/Diff/Tests/Verifier/Provenance) ~450 px; **Close ~45–55×26 px** | Directly observed | 345 px = 32% of 1080, **~60% of a 568 px phone** if height is fixed; tab row overflows 320 px; Close <44 px → **Med-High inferred** |
| Studio drawer (left overlay + backdrop) | **360 px** wide; "Close project tools" ~145×**32**; "+ New analysis" 325×44; code previews ellipsized (by design) | Directly observed | 360 px = 96% of a 375 px phone / **112% of 320 px** → must go full-width → Med inferred; Close 32 px fail |
| ⌘K palette (modal) | **~610×530 px** centered; command rows ~**60 px** tall (excellent); Esc chip ~45×**26**; inner scroll list | Directly observed | Modal must shrink to ~343 px @375; rows ideal targets; Esc small; keyboard-less entry via drawer exists → Low-Med inferred |

## 3. Touch-target inventory @1920 (targets persist on touch)
**Failures vs 44 px (Apple HIG / WCAG 2.5.5):** Evidence-bar "Open" (~23–32 h) · drawer "Close" (~26) & "Close project tools" (~32) · Esc chip (~26) · `<select>`s (~35) · confidence slider thumb (~16) · native file input (~30) · stepper step buttons (~40 h) · "New question" (42) · starter chip (42) · sidebar nav rows (~40).
**Pass:** all primary CTAs 44–48 px · radio rows 60–62 px · palette rows ~60 px · toggle 52 px · textarea.
Note: WCAG 2.5.8 (AA, 24 px min) is failed only by the ~23 px "Open" edge case; the rest fail the stricter 44 px guidance. Radio *circles* are 16–22 px but their full rows are clickable — acceptable.

## 4. Text-size inventory (estimates from glyph metrics)
Sidebar nav ~13–14 px · judge header caps ~13 px · table cells ~13–14 px · evidence links ~13 px · small-caps labels ~12–13 px · code/diff mono ~14 px · body 16–18 px · H1 40–90 px (fluid scaling unverifiable). Several runs sit **below the 14 px mobile-comfort threshold** (risk: Low-Med; reading, not failure).

## 5. Judge experience on a phone — assessment
Judges often triage on mobile. `/judge` itself is the most mobile-survivable route: stacked editorial sections, big tap targets, standard grids whose stacking is conventional (but **unverifiable**). The judge journey, however, also crosses the sample wizard and `/proof`: those carry the 1220 px header/stepper, the 7-column table, the 85-char diff lines and ~200–230 px of fixed chrome. **Risk to submission: Medium** (High if the deploy lacks any responsive CSS, which we could neither confirm nor exclude; the absence of any desktop-visible mobile affordance is the worrying signal).

## 6. Viewport-test matrix — 11 viewports × 9 test items
Legend: **CNT** = Could not test (fixed 1920 viewport) + inferred risk. ✅ = tested at 1920. Risks cite the structural evidence from §1–2.

| Viewport (device proxy) | 1 Layout fits / no h-scroll | 2 Nav & stepper collapse | 3 Sticky chrome ≤25% | 4 Tables usable | 5 Code/diff readable | 6 Touch targets ≥44 | 7 Text ≥14 | 8 Drawers/palette fit | 9 Keyboard overlap |
|---|---|---|---|---|---|---|---|---|---|
| 320×568 (iPhone SE 1) | CNT **High** (G1 1220 px; W5 995 px; P1 1015 px; P2 ~700 px lines) | CNT **High** (no hamburger seen, G1/G8) | CNT **High** (chrome 191–233 px = 34–41%, G4) | CNT **High** (W5, P1) | CNT **High** (85-ch diff, W2 clip) | CNT **Med** (§3 failures persist) | CNT **Med** (§4) | CNT **High** (drawer 360 px > 320; sheet 345 px ≈ 60%) | CNT **Med** (textarea + sticky bars) |
| 360×640 (Galaxy S5) | CNT **High** (same geometry) | CNT **High** | CNT **High** (30–36%) | CNT **High** | CNT **High** | CNT Med | CNT Med | CNT **Med** (drawer = 100%) | CNT Med |
| 375×667 (iPhone 8/SE2) | CNT **High** | CNT **High** | CNT **High** (29–35%) | CNT **High** | CNT **High** | CNT Med | CNT Med | CNT Med (drawer 96%) | CNT Med |
| 390×844 (iPhone 12–14) | CNT **Med-High** | CNT **High** | CNT **Med** (23–28%) | CNT **High** | CNT **High** | CNT Med | CNT Med | CNT Med | CNT **Low-Med** |
| 414×896 (iPhone 11 Max) | CNT **Med-High** | CNT **High** | CNT Med (21–26%) | CNT **Med-High** | CNT **Med-High** | CNT Med | CNT Med | CNT Low-Med | CNT Low-Med |
| 430×932 (iPhone 14 Pro Max) | CNT **Med** | CNT **High** | CNT Med (20–25%) | CNT **Med-High** | CNT **Med-High** | CNT Med | CNT Med | CNT Low-Med | CNT Low |
| 768×1024 (iPad portrait) | CNT **Med** (header 1220 px > 768) | CNT **High** (stepper alone = 685 px) | CNT Low-Med (19–23%) | CNT **Med** (tables 995–1015 px) | CNT **Med** | CNT Low-Med | CNT Low | CNT Low | CNT Low |
| 820×1180 (iPad Air) | CNT **Med** (header) | CNT **High** | CNT Low-Med | CNT **Med** | CNT Med | CNT Low-Med | CNT Low | CNT Low | CNT Low |
| 1024×768 (iPad landscape) | CNT **Low-Med** (header ~1220 px close) | CNT **Med-High** | CNT **Med** (25–30% of 768) | CNT Low-Med | CNT Low-Med | CNT Low-Med | CNT Low | CNT Low | CNT **Med** (short height) |
| 1280×720 (small laptop) | CNT **Low** (fits ≥1220 px barely) | CNT **Med** | CNT **Med-High** (26–32% of 720) | CNT Low | CNT Low | n/a (pointer) | CNT Low | CNT Low | CNT Med (short height) |
| **1920×1080 (desktop)** | ✅ **Pass** (no h-scroll anywhere) | ✅/⚠️ No collapse exists (none needed) | ✅ 18–22% | ✅ fits (dense) | ✅ fits (W2 clip aside) | ⚠️ §3 failures measured | ⚠️ §4 runs <14 px | ✅ fit | n/a |

## 7. Overall mobile-readiness verdict
**Unproven and at-risk (Medium-High inferred).** The desktop layout is fluid-friendly (centered max-width columns, no h-scroll at 1920), but multiple measured structures — a ≥1220 px non-collapsing header/stepper, a 7-column 995 px table, a 1015 px diff table, 85-char diff lines, a 610 px modal, a 360 px drawer and 191–233 px of fixed chrome — cannot fit ≤390 px viewports without responsive handling whose existence could not be verified, and no mobile affordance (hamburger/compact nav) was observed at desktop width. Directly observed defects that will follow the user to mobile: truncating `<select>` values, sub-44 px targets (23–42 px), a clipped code line, and a minor sticky-bar/card overlap.

**Judge-on-phone risk to the submission: Medium.** The dossier page itself is conventional stacked content and plausibly survives; the linked wizard/proof flows that prove the product are where a phone judge would hit tables, diff blocks, truncated selects and heavy fixed chrome.


---

# PART 3 — ACCESSIBILITY AUDIT (Agent 8, full)

# Agent 8 — Accessibility Audit: CounterLab
**Target:** https://counterlab.cserules.workers.dev/ — routes audited: `/`, `/judge`, `/new`, `/session/<uuid>` (full 6-step sample wizard, completed twice — once passing, once deliberately failing the transfer), `/proof/<uuid>`, `/replay/leakage-01`, `/replay/bogus-id` (error state); overlays: Studio drawer ("Project & evidence"), ⌘K command palette, Evidence & proof bottom drawer.
**Method (black-box, honest limits):** no axe/Lighthouse, no screen reader, no keyboard-event tool, no DevTools, no raw HTML. Evidence comes from (a) the automation interactive-element list (exposes buttons/links/inputs/labels/details + accessible names), (b) rendered-text structure, (c) screenshot pixel analysis (vision + PIL color sampling → WCAG contrast ratios computed from measured sRGB), (d) observed overlay close affordances, (e) behaviour probing (filtering, gating, retries). Anything requiring DOM/AT is labelled accordingly.
**Evidence labels:** Directly observed · Directly observed (measured) · Inferred from behaviour · Unverified · Could not test.
**Severity:** P0 outage · P1 major barrier blocking a core journey for assistive-tech users (or pedagogically harmful misinformation) · P2 typical accessibility barrier · P3 polish.

---

## 1. Executive summary

CounterLab is **unusually strong on native semantics for a demo app**: native `fieldset`/`legend` + real radio inputs for the prediction and transfer choices, native labeled `<select>`s in the rule builder, visible labels on wizard textareas ("Your claim", "Your revised mental model"), a labeled range slider whose label carries the live value ("Confidence 72%"), native `<details>/<summary>` for hints, metrics and the diff, **text-rendered numerals instead of charts** (the 98.5% vs 59.4% payoff is real text, plus a real metrics table), a **complete text alternative for the transfer timeline** ("Training window: Jan — Mar. NOW marks prediction time…" plus a live selection echo), textual pass/fail verdicts with guidance, retry after failure, visible close controls and Esc hints on overlays, and proof downloads with clear names.

The problems are concentrated in four places:
1. **Contrast** — the single most important sentence of the lesson (the Boundary payoff) measures **~1.8:1**, and a cluster of muted small text sits between 2.1–4.5:1.
2. **Accessible names** — the ⌘K palette's command buttons are named "N"/"E"/"V" or nothing at all; unnamed buttons exist in the Studio drawer; chrome controls have weak names ("C", "NB", "0 events Open").
3. **Keyboard reachability** — no skip link on any route; the homepage file upload is a `<label>` with no focusable input; scroll-region keyboard access unverified; modal focus trapping unverified.
4. **Meaning & status communication** — transfer ✓/× glyphs sit next to the learner's *answer* while encoding *feature safety*, so the **wrong answer is decorated with a ✓ and the correct answer with a ×**; the bogus-replay error state leaves the page in perpetual "loading" with the error only in a toast; live-region semantics for all dynamic feedback are unverifiable.

**WCAG 2.2 conformance estimate: no level met — "partial conformance" at best.** Likely Level A failures: 4.1.2 (unnamed/misnamed buttons), 2.1.1 (homepage upload, inferred), 2.4.1 (no bypass mechanism), 3.3.2 (unlabeled homepage textarea, inferred), 1.1.1 (glyph-only meaning, arguable). Level AA failures: 1.4.3 (multiple, measured). Criteria that could not be evaluated (4.1.3, 2.4.3, 2.1.2, 3.1.1, 1.4.4/1.4.10, 2.3.3, 2.1.4) carry real risk and are listed as Unverified/Could-not-test. With ~1–2 days of the fixes below (most are XS/S), **AA conformance is realistically achievable** — the semantic foundation is already good.

---

## 2. Automated-style findings table

| ID | Sev | Route / component | Finding | WCAG (confidence) | Evidence |
|----|-----|-------------------|---------|-------------------|----------|
| A8-01 | **P1** | /session step 4 → Boundary tab | Payoff card text ~1.8:1 ("The conclusion changes at the entity boundary…") | 1.4.3 (confident) | Directly observed (measured) |
| A8-02 | **P1** | /session step 5 transfer | ✓/× glyphs encode feature safety but sit beside the learner's answer → wrong option gets ✓, correct identification gets ×; glyph-only meaning for AT | 1.1.1 / 1.3.3 (confident there is a barrier; criterion arguable) | Directly observed (both states) |
| A8-03 | **P1** | ⌘K palette | Command buttons' accessible names are the shortcut-badge letters ("N","E","V"); two commands unnamed | 4.1.2, 2.4.6 (confident) | Directly observed |
| A8-04 | P2 | Studio drawer | Empty-name buttons (backdrop; recent-session card) | 4.1.2 (confident) | Directly observed |
| A8-05 | P2 | All routes | No skip-navigation link; ~8–12 chrome tab stops before content per wizard step | 2.4.1 (confident) | Directly observed (absence) |
| A8-06 | P2 | `/` composer | Claim textarea has no accessible name; placeholder-only (placeholder also 3.59:1) | 3.3.2 / 1.3.1 (medium-high) | Directly observed + Inferred |
| A8-07 | P2 | `/` composer | File upload only via `<label>`; hidden input → keyboard-inaccessible (wizard does it correctly with a native input) | 2.1.1 (medium-high) | Inferred from behaviour |
| A8-08 | P2 | `/` sidebar | Section labels 2.47:1, "No account needed" 2.07:1 | 1.4.3 (confident) | Directly observed (measured) |
| A8-09 | P2 | /replay/bogus-id | Perpetual loading + toast-only error + no in-content recovery | 4.1.3 + robust UX (confident on behaviour; live-region part unverified) | Directly observed |
| A8-10 | P3 | Multiple | Small-text contrast cluster: stepper 3.71, placeholders 3.59, palette descriptions 3.59, dimmed palette items 1.4–3.1, teal caps 4.48, judge card caption 4.18, diff-table cells 4.46 | 1.4.3 (confident) | Directly observed (measured) |
| A8-11 | P3 | Wizard CTAs | Disabled-button gating; required fields never programmatically indicated; blocking reason undiscoverable | 3.3.2 / 4.1.2 (medium) | Directly observed + Inferred |
| A8-12 | P3 | All routes | Identical `<title>` everywhere ("CounterLab — CI for understanding") | 2.4.2 (confident) | Directly observed |
| A8-13 | P3 | Chrome controls | Weak names: "C", "NB", "0 events Open", palette input labelled "⌕ Esc" | 2.4.6 / 4.1.2 (confident/medium) | Directly observed |
| A8-14 | P2 | All dynamic feedback | Live regions (role=status/alert) unverifiable; selection echoes, verdicts, toasts, counters are plain text — announcement risk | 4.1.3 (unverified) | Unverified |
| A8-15 | P2 | Palette / Studio drawer | Focus trap, initial focus, Esc, focus return unverified; backdrop exposed as a button ⇒ background likely not inert | 2.1.2 / 2.4.3 (unverified) | Unverified / Could not test |
| A8-16 | P3 | /proof diff, palette list | Scrollable regions may not be keyboard-scrollable (tabindex unverified) | 2.1.1 (unverified) | Unverified |
| A8-17 | P3 | Palette | Single-character accelerators (N/E/V) — scoping/disable-ability unverified (2.1.4); typing in search filters correctly (observed) | 2.1.4 (unverified) | Could not test |

**P0:** none found (nothing fully blocks all users; the core loop completes with mouse + sight).

---

## 3. Measured contrast table (PIL sampling of screenshots; WCAG relative-luminance ratios)

| Element (route) | fg (measured) | bg (measured) | Ratio | Verdict |
|---|---|---|---|---|
| Boundary payoff body text (step 4 Boundary card) | rgb(167,183,201) | rgb(240,242,243) | **1.82:1** | ❌ P1 |
| Boundary payoff line 2 | rgb(169,184,202) | rgb(240,242,243) | **1.80:1** | ❌ P1 |
| Sidebar "Start with evidence" (/) | rgb(78,78,84) | rgb(5,5,6) | **2.47:1** | ❌ P2 |
| Sidebar "No account needed" (/) | rgb(67,67,73) | rgb(5,5,6) | **2.07:1** | ❌ P2 |
| Stepper upcoming steps ("6 Repair") | rgb(119,134,154) | white | **3.71:1** | ❌ P3 |
| Textarea placeholder (wizard step 1) | rgb(124,134,148) | rgb(251,252,254) | **3.59:1** | ❌ P3 |
| Palette command descriptions | rgb(123,136,156) | white | **3.59:1** | ❌ P3 |
| Palette unavailable commands | rgb(141–211 grays) | white | **1.4–3.1:1** | ⚠️ inactive-exempt, still poor |
| "VERIFIED SAMPLE BOUNDARY" teal caps | rgb(5,124,122) | rgb(240,242,243) | **4.48:1** | ⚠️ borderline fail |
| "389 shared customers" (judge dark card) | rgb(117,123,123) | rgb(11,24,32) | **4.18:1** | ❌ P3 |
| Reasoning-diff table cell text | rgb(112,120,132) | white | **4.46:1** | ⚠️ borderline fail |
| "How proof works" paragraph (/) | rgb(105,105,112) | rgb(9,9,11) | **3.65:1** | ❌ P3 |
| Disabled CTA "Compare two explanations" | white | rgb(154,180,244) | 2.06:1 | exempt (inactive) |
| Disabled CTA "Seal my prediction" | white | rgb(196,166,114) | 2.32:1 | exempt (inactive) |
| Sidebar nav links (/) | rgb(164–168 grays) | rgb(5,5,6) | 8.2–8.6:1 | ✅ |
| Teal tagline "Ask like chat…" (/) | rgb(142,231,217) | rgb(9,9,11) | 13.8:1 | ✅ |
| Judge body paragraph | rgb(54,69,77) | rgb(242,239,230) | 8.63:1 | ✅ |
| Judge footer tagline (gray half) | rgb(91,101,108) | rgb(242,239,230) | 5.18:1 | ✅ |
| Theater tabs (Explore/Apply) | rgb(167,183,201) | rgb(6,19,38) | 9.09:1 | ✅ |
| Theater small labels (Familiar rows etc.) | rgb(120–153 grays) | rgb(13,32,56) | 4.5–6.9:1 | ✅ (borderline OK) |
| Studio drawer labels/code | various | navy | 5.7–15.4:1 | ✅ |
| Replay banner text | rgb(222–234) | rgb(79,58,138) | 6.8–7.7:1 | ✅ |
| Error toast text | rgb(182,56,60) | white | 5.80:1 | ✅ |
| "Transfer not yet passed" banner | rgb(118,40,36) | rgb(251,232,231) | 8.48:1 | ✅ |
| Timeline "uses available information ✓" | rgb(76,93,115) | rgb(244,247,252) | 6.27:1 | ✅ |
| "VERIFIED TEST" gold badge | rgb(11,24,32) | rgb(255,207,90) | 12.3:1 | ✅ |
| Diff code on navy (context/hunk) | rgb(197,207,220) | rgb(7,19,35) | 11.8/6.96:1 | ✅ |
| "0 characters" counter | rgb(99,114,133) | white | 4.91:1 | ✅ |

---

## 4. Manual validation notes by area

**Keyboard navigation / tab order.** All controls on the happy path are native buttons/inputs/selects/labels-details → tab-reachable in principle. Element lists appear in visual/DOM order (header → stepper → content → bottom evidence bar), so tab order is *plausible*. Gaps: no skip link (A8-05); homepage upload (A8-07); scroll regions (A8-16); every wizard step repeats ~8–12 chrome stops. Could not send Tab — *Inferred*.

**Focus visibility (2.4.7).** Clicked radios show a strong blue border + tint (selected style doubles as focus cue). Post-click screenshots of buttons show **no distinct focus ring** — button :focus-visible styling is Unverified, risk of weak indicators. The H1 outline seen on first homepage load is likely a tool artifact, not a focus style. *Unverified.*

**Skip links / landmarks / headings.** No skip link anywhere (A8-05). Visual hierarchy is strong and consistent (one clear hero heading per page; eyebrow captions; section heads). Programmatic landmarks (`main`/`nav`/`aside`), heading levels, stepper list semantics + `aria-current`, and table `<th>` associations (metrics table, reasoning-diff table) are *Unverified* — both tables linearize sensibly in the text dump. Session page shows two visually top-level headings ("Try your rule on forecasting." + "What information exists at prediction time?") — check h1 uniqueness.

**Names & roles.** Good: descriptive names on nav, CTAs, downloads ("Download repaired notebook", "Download proof record", "Export proof" works — a proof capsule downloaded), hint disclosures, "Close project tools". Bad: A8-03/A8-04/A8-13 (palette letters, unnamed buttons, "C"/"NB"/"0 events Open"/"⌕ Esc"). No icon-only control lacked some text except the kbd-badge buttons.

**Forms.** Wizard: labels present on textareas and selects; prediction uses `fieldset`+legend+radios; slider label includes live value. Gaps: homepage textarea nameless (A8-06); no required indications; gating via hard-disabled buttons (A8-11); file-input inconsistency (A8-07). Character counter ("0 characters") updates live — announcement *Unverified*.

**Status / live regions (4.1.3).** Rich status text exists (selection echoes "Selected split: …", "Transfer not yet passed… The patch remains locked", "Transfer status: Passed", toast "Replay bogus-id was not found", "0 events"). All are generic text nodes; live-region attributes *Unverified* (A8-14). If absent, this is the single biggest SR risk in the product.

**Modals/drawers.** Palette + Studio drawer behave modally (scrim, dimming); Evidence drawer is a non-modal bottom sheet (acceptable). Visible closes + Esc hint present; scrim-click closes Studio drawer. Trap/Esc/focus-return *Could not test* (A8-15). Backdrop exposed as an empty button suggests background is not inert.

**Color-only meaning.** Mostly good redundancy: status dots always paired with text ("INSTANT SAMPLE", "Test plan verified", "Deployed live authority is configured"); lock emoji paired with "PREDICTION SEALED"/"FIX STILL LOCKED" text; Before/After cards labeled in words; gold/purple badge coding always labeled. Exceptions: transfer ✓/× semantics (A8-02); timeline window boxes turn yellow + dashed on wrong split (style-only cue — minor, text echo exists); diff +/- lines presumably color-coded red/green but **carry literal +/- characters** (good). Completed stepper steps put "✓" inside the button name (good).

**Charts / visual evidence alternatives.** No canvas charts found — results are real text numerals + a real metrics table + textual comparisons: **exemplary**. Timeline diagram has a full text equivalent. Code excerpts are real selectable text.

**Code blocks.** Real monospace text, good contrast; the unified diff sits in a fixed-height scroll region (A8-16). Hunk headers/code ≥ 6.9:1.

**Downloads.** Clear names; "Export proof" from the palette successfully downloaded a capsule file. File format accessibility of the .ipynb/capsule is out of scope.

**Reduced motion (2.3.3).** *Could not test* — no way to set `prefers-reduced-motion`. Drawer slides and possible number-reveal animation inferred; no vestibular-risk patterns observed. Recommend a reduced-motion media query disabling drawer/scale animations.

**Zoom / 200% text resize (1.4.4, 1.4.10).** *Could not test* (fixed 1920×1080). Inferred moderate risk: sticky bottom evidence bar + long wizard pages; palette with internal scroll at 200% could clip; card-based layout looks reflow-friendly.

**Page titles / language.** Identical `<title>` on all routes (A8-12). `<html lang>` unverifiable (no raw HTML) — content is English; set `lang="en"`.

**Error states.** Transfer failure: textual, specific, retryable — **good practice**. Bogus replay: A8-09 (P2). Unsupported-file rejection not exercised (claimed "refused, not guessed").

---

## 5. Prioritized remediation (effort: XS < 1h, S < half-day, M < 2 days)

1. **A8-01** — recolor Boundary payoff text (XS). *Fixes the demo's money-shot.*
2. **A8-02** — replace ✓/× answer-echo glyphs with words "safe"/"leaky" + per-option correctness in the verdict (S). *Protects pedagogical integrity.*
3. **A8-03/A8-04/A8-13** — accessible names pass: palette items, drawer buttons, chrome controls (XS–S).
4. **A8-05** — skip link (XS).
5. **A8-09** — error branch for bad replay IDs + role=alert toast (S). *Judges probe error states.*
6. **A8-14** — role=status/alert on echo/verdict/toast containers (S) — verify need first with DOM access.
7. **A8-06/A8-07/A8-11** — homepage composer: label the textarea, use the native file input, aria-required + reason text near gated CTAs (S).
8. **A8-08/A8-10** — raise muted text tokens to ≥ 4.5:1 (S).
9. **A8-15/A8-16** — dialog pattern (trap/Esc/return/inert) + tabindex=0 scroll regions (M/XS).
10. **A8-12** — per-route titles (XS).

## 6. Could-not-test register
Screen-reader announcement of everything (no AT) · live regions (4.1.3) · focus trap/Esc/focus-return (no keyboard events) · focus-visible styling on buttons · heading/landmark semantics, aria-current, table headers (no DOM) · html lang · scroll-region keyboard access · 2.1.4 shortcut scoping outside search · reduced motion · 200% zoom/reflow · `<label for>` association of wizard textareas (visible labels present; association inferred).

*All screenshots referenced live in `work/shots/`. Contrast ratios computed from measured pixel clusters via WCAG relative-luminance formula; anti-aliased text introduces ±0.1–0.2 tolerance.*

