# Design, accessibility, and responsiveness

## Design verdict

Judge Mode is the most visually persuasive surface in the project. It feels like a deliberate public evidence dossier, with strong hierarchy, editorial typography, a memorable metric contrast, disciplined color, and a coherent sequence from claim to authority to modes to method to limitations. It looks substantially more finished than a typical hackathon dashboard.

The stricter visual-judge pass materially narrows that praise. Across `/`, `/judge`, `/new`, and replay at desktop and mobile, the first fold contains no explanatory image, figure, chart, canvas, video, audio, or accessible data table; Judge carries meaning through type and a static metric card. On mobile, even that proof begins below the fold. CounterLab therefore looks polished when read, but does not yet make its scientific mechanism, learner benefit, or agentic contribution visible in the 10–30 seconds that decide many hackathon evaluations.

The learner landing feels like a dark prompt shell while the studio/replay is a light notebook-lab application and Judge Mode is an editorial dossier. The three directions share copy and authority, yet the abrupt visual category changes make CounterLab feel like a suite of related surfaces rather than one unmistakable education product. This should not trigger a broad redesign. It should trigger one tightly scoped, fixed-evidence visual spine: a Verified Belief Break Theater above the fold, the trusted Lab Scene through the six stages, and a Boundary-to-Transfer visual carried into Repair. See `17_VISUAL_JUDGE_GENERATIVE_UI_AND_AGENTIC_CONTROL.md`.

## Responsive matrix

Observed public routes: `/`, `/judge`, `/replay/leakage-01`.

| Viewport  | Landing                                                                        | Judge Mode                                                            | Legacy replay                                                            |
| --------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 375×812   | No horizontal overflow; composer usable; alternate modes hidden behind Explore | No overflow; strong headline/CTAs; proof card begins below first fold | No overflow; stage shell collapses; several low-contrast inactive labels |
| 390×844   | Same; 1,114 px page height                                                     | Same; 7,091 px full page                                              | Covered at 375/768                                                       |
| 768×1024  | No overflow; proof/support copy visible                                        | No overflow; proof card and key result visible                        | No overflow                                                              |
| 1366×768  | Sidebar and main canvas clear; first fold contains support/modes               | Hero/result card effective                                            | Covered at 1440                                                          |
| 1440×900  | Balanced composition; no explanatory media object                              | Static first proof and start of authority story                       | No overflow; dense but legible                                           |
| 1920×1080 | Content remains bounded; no excessive stretch                                  | Authority section enters first fold                                   | Not separately captured                                                  |

At every required viewport `documentElement.scrollWidth <= clientWidth`. The long Judge page is approximately 4,600 px desktop and 7,100 px mobile, but its section rhythm and headings make that length usable. Usable length is not the same as fast judge comprehension: the first mobile viewport omits the numeric proof, and the mechanism/agent roles require further scrolling on every size.

## Accessibility results

Confirmed positives:

- One `<main>` landmark on each observed route; logical heading order with no detected skips.
- All visible controls in the audited states had accessible names; no duplicate IDs or missing image alternatives were detected.
- Visible keyboard focus rings were consistently present.
- Reduced-motion emulation matched and left no active animated elements.
- 200% text-resize proxy at 640×720 and 200% page-scale proxy at 1280×720 introduced no horizontal document overflow.
- Judge Mode had no detected visible-text contrast failure in the tested states.
- Capability status uses `role=status`/polite live announcement.

Confirmed gaps:

1. **Command-palette focus is not contained or restored.** Keyboard traversal leaves the dialog after its five command buttons and reaches background/body controls. Escape closes it but returns focus to `body`, not the invoker. This is a P2 keyboard/screen-reader defect.
2. **No skip links were found.** Judge Mode and the studio have repeated header/progress controls and long content. The learner landing keyboard audit also wrapped from composer content to visually earlier navigation. Add a first-focus skip-to-main link and preserve DOM order that matches the visual order.
3. **Legacy replay contrast is below WCAG AA for normal text.** Inactive stage labels measured 3.71:1, proof-console event count 3.59:1, shortcut label 4.32:1, and footer text 4.17:1 against their observed backgrounds. These are real visible elements, unlike the automated hidden-label false positive.
4. **Mobile mode discoverability is reduced.** `Explore` hides sample, replay, Judge Mode, and proof explanation; the label does not communicate those high-value choices.

Automated scan caveats:

- The 1×1 file input is a conventional visually hidden input whose visible label is large and named; it is not itself a touch-target failure.
- The hidden screen-reader label’s computed contrast is irrelevant because it is not visually rendered.
- No real assistive-technology session or full Axe/Lighthouse run was available, so dynamic screen-reader announcements beyond observed live regions remain unverified.

## Interaction quality

Positive:

- Loading/health states preserve layout.
- Judge Mode has dominant CTAs and makes sample/replay/live meanings explicit.
- Studio keeps Prediction, intervention, controls, observable, and outcome within one theater and collapses technical proof by default.
- Quantitative Boundary/result components have accessible-table designs in source/tests.
- Error routes fail safely; normal observed routes produced no page errors or failed requests.

Gaps:

- Missing session/proof deep links return the landing plus an overlapping transient toast rather than a durable recovery panel.
- Unknown routes silently become `/`, hiding navigation mistakes.
- Returning learners cannot see recent investigations from landing.
- Replay’s local completion under a verified banner is an interaction-integrity failure, not merely copy polish.

## Performance measurements

| Journey             | Profile             |     TTFB |                  FCP/LCP |     CLS | Long tasks               |
| ------------------- | ------------------- | -------: | -----------------------: | ------: | ------------------------ |
| Landing cold median | Normal              | 134.9 ms |                 1,080 ms | 0.00145 | 2 per cold run, 56–76 ms |
| Judge cold          | Normal              |   145 ms |                 1,064 ms | 0.00279 | 2, 56–61 ms              |
| Replay cold         | Normal              |        — | FCP 1,072 / LCP 1,144 ms |  0.0442 | 3 totaling 193 ms        |
| Landing cold        | 150 ms / 1.6 Mbit/s |        — |                 1,856 ms | 0.00145 | 2                        |
| Judge cold          | 150 ms / 1.6 Mbit/s |        — |                 1,804 ms | 0.00279 | 2                        |

Initial transfer was about 296.6 KiB, 868.5 KiB decoded. The main JavaScript was about 169.7 KiB transferred / 598.9 KiB decoded; CSS/fonts accounted for most of the remainder. These are good visible-load results, despite a single large application chunk.

Hashed CSS/JS/font assets were served with `Cache-Control: public, max-age=0, must-revalidate`. The guarded warm reload reached 656 ms LCP but transferred essentially the cold byte count, so immutable caching is an avoidable production inefficiency. This is P2 at most: measured first-load performance is already good.

## Product-form classification

- **Judge Mode:** coherent public evidence dossier with strong editorial craft, but a static explanation rather than a prize-level interactive demonstration.
- **Learner studio:** a credible new notebook learning product, with some engineering-dashboard affordances safely collapsed.
- **Landing:** polished prompt/wizard front door, but not yet a complete claim-only experience.
- **Legacy replay:** genuine stored evidence plus an incorrectly merged interactive reenactment.

CounterLab's Judge page does not read as a generic chatbot, but the landing can be mistaken for a generic AI prompt shell. Its principal first-prize design risk is no longer mere polish: the verified scientific transformation is not yet a continuous visual experience, and the generated Lab Scene is unreachable from the learner UI.

## Evidence

- `evidence/screenshots/ux/`
- `evidence/test-results/ux-browser-runtime/viewport-and-dom-audit.json`
- `evidence/test-results/ux-browser-runtime/keyboard-and-interaction-audit.json`
- `evidence/test-results/ux-browser-runtime/adaptation-audit.json`
- `evidence/performance/ux/live-performance-measurements.json`
- `evidence/network/ux/live-network-events.json`
- `evidence/console/ux/live-console-events.json`
- `evidence/test-results/visual-judge-public-baseline.json`
- `evidence/screenshots/visual-judge/`
- `17_VISUAL_JUDGE_GENERATIVE_UI_AND_AGENTIC_CONTROL.md`

## Limitations

No state-changing sample/live journey, real screen reader, Axe/Lighthouse run, long-filename upload, active result chart, or production modal beyond the command palette was exercised. The transient cyclic font-token defect seen during concurrent source edits was fixed before synthesis and is not a finding.
