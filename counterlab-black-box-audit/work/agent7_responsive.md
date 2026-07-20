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
