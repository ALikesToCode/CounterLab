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
