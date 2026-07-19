# Visual judge, generative UI, and agentic-control audit

> **Release qualification note (2026-07-19):** This concurrent audit is
> preserved as product-review input. Its public capture used stock Chromium
> while `CLOAK_CDP_ENDPOINT` was unavailable, which conflicts with the current
> repository CloakBrowser-only policy. None of its screenshots, browser counts,
> console/network observations, or performance implications qualify the v6.1
> release. Recapture and remeasure through the formal CloakBrowser harness
> against the exact deployed source/Worker/Container identity before citing
> them as release or submission evidence.

Audit addendum: `2026-07-19T07:35:42Z`–`2026-07-19T07:35:57Z` public capture, followed by current-source tracing.

## Blunt verdict

The concern is correct.

CounterLab currently **explains** an unusually strong product better than it **lets a judge see and feel it happen**. Judge Mode has a strong desktop editorial hook, but the public first 10–30 seconds are still dominated by typography, forms, cards, and prose. The scientific transformation—shared customers crossing a split, one variable changing, a Prediction staying locked, a verifier releasing evidence, a boundary emerging, and a learner carrying the rule into a new case—is not presented as one continuous visual event.

This is a **P1 first-prize blocker**, not a Stage One defect. A technically weaker entry with a more immediate visual demonstration could outrank CounterLab on Design and Quality of the Idea before a judge discovers CounterLab's deeper implementation.

The source reveals a particularly important missed opportunity: CounterLab already has a bounded `lab-scene.json` contract with trusted block types for metrics, charts, controls, Boundary Maps, motion, notebook cells/diffs, transfer, Reasoning Diff, and proof. Runtime Codex produces that scene and the Worker validates and hash-binds it, but the browser does not expose or render it. The only `json-render` surface is a deterministic list of sanitized compiler events inside the technical proof drawer. It is safe and useful, but it is not the learner-visible generative UI promised by the architecture.

The GPT-5.6 concern is also substantially correct. GPT-5.6 currently performs one schema-constrained Belief Spec proposal. It does not run a continuing tool-using investigation, preserve an agentic thread through the learner journey, or control the presentation. More control is warranted—but over **inquiry, pedagogy, and trusted presentation**, never over numerical truth, scoring, verification, transfer grading, state unlocks, or proof release.

## Evidence boundary

- **Observed live:** `/`, `/judge`, `/new`, and `/replay/leakage-01` at 1440×900 and 390×844; first and second folds; GET/HEAD/OPTIONS only; zero unexpected console events or failed requests.
- **Observed from prior read-only replay captures:** recorded Test and locally projected completion surfaces.
- **Verified in current source:** Question, evidence, Model Duel, Prediction, Test, Theater, Boundary, Apply, Repair, Reasoning Diff, Lab Scene, GPT-5.6, Codex, Worker reconstruction, and browser API bindings.
- **Not executed:** no new session, upload, model call, Codex job, fixed run, transfer, patch, Capsule download, or production mutation.
- **Browser limitation:** required CloakBrowser CDP was unavailable. The owner explicitly authorized Chrome; the fallback is disclosed in the evidence record.

Primary measurement: `evidence/test-results/visual-judge-public-baseline.json`.

## First 10, 20, and 30 seconds

| Surface         | 10 seconds                                              | 20 seconds                                                     | 30 seconds                                                                         | Strict judge result                                                              |
| --------------- | ------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Landing desktop | “An AI question/notebook tool.”                         | Example claims clarify the ML problem.                         | Proof and product category are still not visible.                                  | Clean and usable, but visually generic.                                          |
| Landing mobile  | Prompt composer fills the viewport.                     | Examples are visible; alternate modes remain behind `Explore`. | Still no visual evidence object.                                                   | Loses the sample/Judge advantage.                                                |
| Judge desktop   | Belief-breaking headline and 98.5%/59.4% contrast land. | The changed evaluation boundary becomes understandable.        | The judge has still not seen the mechanism, agent contribution, or learner action. | Strong editorial presentation; not yet an exceptional interactive demonstration. |
| Judge mobile    | Headline and explanatory copy.                          | CTAs and scope; the numeric proof remains below the fold.      | A scroll reveals the static proof card.                                            | The “twenty seconds” claim is not visually fulfilled in the first viewport.      |
| Live setup      | Tool readiness and notebook requirement.                | Hosted capability appears healthy.                             | No learner transformation is shown.                                                | Feels like setup/operations.                                                     |
| Replay intro    | Replay provenance and technical identity.               | Mode honesty is understandable.                                | Educational value requires continuing.                                             | Feels like an audit record before it feels like learning.                        |

The first-fold assessment in the original audit was too generous. Replace “Judge Mode's first fold is exceptional” with:

> Judge Mode has a strong, unusually polished desktop editorial hook. Its proof is static, falls below the first mobile fold, and does not yet demonstrate the belief-breaking mechanism or agentic contribution.

## Quantified first-fold inventory

| Route and viewport            |                      First-fold explanatory media | Text characters | What carries the experience             |
| ----------------------------- | ------------------------------------------------: | --------------: | --------------------------------------- |
| `/` 1440×900                  | 0 image, SVG, canvas, video, audio, figure, table |             627 | Heading, prompt, textarea, links        |
| `/judge` 1440×900             | 0 image, SVG, canvas, video, audio, figure, table |             669 | Editorial type and styled numeric card  |
| `/new` 1440×900               |              1 branding SVG; no explanatory media |             518 | Readiness card and CTAs                 |
| `/replay/leakage-01` 1440×900 |              1 branding SVG; no explanatory media |             386 | Provenance values and CTA               |
| `/` 390×844                   |                               0 explanatory media |             408 | Prompt composer                         |
| `/judge` 390×844              |                               0 explanatory media |             439 | Headline, prose, CTAs; proof below fold |
| `/new` 390×844                |              1 branding SVG; no explanatory media |             494 | Readiness card                          |
| `/replay/leakage-01` 390×844  |              1 branding SVG; no explanatory media |             362 | Provenance and progress shell           |

These counts do not deny the visual craft of typography or CSS. They show that no explanatory graphic, motion object, accessible figure, chart, or media sequence carries the first-fold meaning.

All four routes also report the stale document title `CounterLab — CI for understanding`, weakening the current “scientific debugger for beliefs” positioning.

## All-page and all-stage experience audit

| Page or stage               | Current product form                                      | What is understood                                                             | What is not felt or seen                                                                             | Visual correction                                                                                                    |
| --------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Landing `/`                 | Dark prompt shell                                         | Ask a claim; notebook is supported                                             | What CounterLab does after the prompt; how it differs from a generic AI answer box                   | Put a verified sample transformation beside the composer; keep one dominant CTA                                      |
| Judge `/judge`              | Editorial dossier and static score card                   | False score versus deployment-relevant score; modes; authority after scrolling | Why the score changed, which evidence crossed the boundary, what the learner did, what GPT/Codex did | Make the score card a short verified visual sequence and keep it above the fold on mobile                            |
| Live setup `/new`           | Readiness/status card                                     | Runner and notebook tools are available                                        | Learner goal and payoff                                                                              | Replace status dominance with a three-frame “what CounterLab will discover” preview; collapse implementation health  |
| Replay intro                | Provenance card                                           | It is a stored replay and not a new model call                                 | Human question, surprising moment, reasoning change                                                  | Lead with the recorded belief-break thumbnail/timeline; move commit/model/verifier to Evidence & proof               |
| Question                    | Composer plus evidence references                         | Learner claim and exact notebook evidence                                      | Relationship between highlighted cell, metric, and deployment claim                                  | Show an annotated notebook fragment connected to the claim and evidence hashes                                       |
| Competing models            | Two equal text cards                                      | Two different explanations                                                     | Their causal difference and predicted observations                                                   | Two visual hypothesis lanes with the changed causal link highlighted                                                 |
| Prediction                  | Metric cards, radio choices, confidence slider            | Result will be hidden and expectation locked                                   | The physical commitment and later comparison                                                         | A “sealed prediction” token remains pinned beside every later visual                                                 |
| Test                        | Why-this-test panel, changed/held-fixed cards, event list | One intervention and independent checks                                        | Agent composition, control geometry, rejection/release as a coherent mechanism                       | Show the experiment as a small visual circuit: hypotheses → changed variable → controls → observable → verifier gate |
| Result / Experiment Theater | Large numeric comparison and tabs                         | The score changed and controls stayed fixed                                    | Why shared entities caused the change                                                                | Animate the split boundary and entity overlap before or with the score morph                                         |
| Boundary                    | Interactive table/heatmap in source                       | Where the conclusion changes                                                   | This signature object is several actions deep and not part of the fast story                         | Promote a compact Boundary Map preview into Judge/sample; retain full accessible table                               |
| Apply                       | Timeline and cost-transfer visuals                        | The rule must work in a changed context                                        | Continuity from the Boundary discovery to this case                                                  | Carry the same visual rule/token into the timeline or cost matrix                                                    |
| Repair                      | Change/preserve lists and diff disclosure                 | Original is preserved; patch is bounded                                        | The exact artifact-specific transformation                                                           | Show the notebook copy, highlight only affected cells, then reveal the verified diff                                 |
| Completion / Proof          | Before/after cards, Reasoning Diff table, proof drawer    | Reasoning changed; proof exists                                                | One memorable portable evidence object                                                               | Present an “evidence passport” summary before technical hashes/downloads                                             |

## The three signature visuals to build

### 1. Verified Belief Break Theater

Use a clearly labelled stored verified sample for the landing and Judge first viewport:

```text
RANDOM ROWS                         WHOLE CUSTOMERS
train  ●A ●B ●C | ●A ●D test       train  ●A ●B ●C | ●D ●E test
            389 shared                         0 shared
               98.5%  ───────────────▶  59.4%
model + preprocessing + seed stay pinned; evaluation unit changes
```

An 8–12 second reduced-motion-safe sequence should illuminate repeated entities crossing the random split, move the split to whole customers, drop overlap to zero, then morph the score. All values come from bundled fixed evidence. The scene is always labelled `Verified sample`; it never impersonates a fresh live run.

### 2. Agentic Experiment Composer

After Prediction locks, reveal a calm learner-facing composition rather than an agent cockpit:

```text
GPT-5.6 noticed repeated customer evidence
        ↓ proposes two testable explanations
Codex composes registered operations and scene bindings
        ↓
fixed scorer selects one eligible test
        ↓
frozen verifier releases or rejects
        ↓
fixed kernel supplies the only displayed numbers
```

The visual must show the one changed variable, held-fixed controls, observable, and authentic rejection/repair only when it occurred. It must never display private reasoning or suggest the generator approved itself.

### 3. Boundary-to-Transfer Map

Make the verified Boundary Map the product's signature scientific object. A compact heatmap/contour or entity-boundary grid should appear in the fast sample, allow one bounded choice, then carry the discovered rule into the timeline/cost-matrix transfer and finally the notebook diff. This turns the learner benefit from “we explained a bug” into “your revised rule survived a different problem.”

Every quantitative visual needs an accessible table, non-color symbols, keyboard inspection, reduced-motion parity, named units, and a verified binding receipt.

## The dormant generative-UI architecture

### What exists

`packages/generative-ui-contracts/src/index.ts` defines bounded blocks for:

- `Hypothesis`, `Prediction`, and `WhyThisTest`;
- allowlisted `Slider`, `Toggle`, and `SegmentedControl` inputs;
- `Metric`, `BarChart`, `LineChart`, and `Scatter` result views;
- `BoundaryMap` and `MotionCanvas` with accessible-table/reduced-motion bindings;
- `NotebookCell`, `NotebookDiff`, `Transfer`, `ReasoningDiff`, `ProofBadge`, and `Limitation`.

Runtime Codex is instructed to emit an unverified `labScene` beside the Discrimination Contract and Experiment IR. It may use only registered operation IDs and display bindings, cannot include verified result literals, and cannot promote its draft to `VERIFIED_TEST`. The Worker parses the scene, includes it in candidate verification, and records its hash in the hosted lineage.

### What does not exist in the public experience

- `apps/web/src` contains no `labScene`/`LabSceneV2` consumer.
- The browser session schema does not expose the scene.
- `ExperimentTheater` is assembled manually from fixed React content in `App.tsx`.
- `GeneratedProofView` defines only `ProofSequence` and `ProofStep`, with no actions.
- That view deterministically translates the last eight public events; a model does not compose its spec.
- It appears only in the collapsed proof console's Plan/Verifier tabs.

Therefore the honest claim is:

> CounterLab generates and verifies a bounded Lab Scene artifact in the runtime architecture, but the public learner UI does not yet render it. The current `json-render` proof view is constrained event presentation, not learner-visible runtime generative UI.

## GPT-5.6: give it more control, but the right control

Official OpenAI guidance describes GPT-5.6 reasoning models as strong for planning, tool use, scientific reasoning, and multi-step agentic workflows, and recommends the Responses API for that work. The API supports typed tools and multi-turn reasoning continuity. The current integration already uses the official SDK, Responses structured output, bounded reasoning effort, `store: false`, local Zod validation, and a privacy-preserving safety identifier, but it stops after one `responses.parse` Belief Spec proposal.

Sources:

- [OpenAI reasoning-model guidance](https://developers.openai.com/api/docs/guides/reasoning)
- [OpenAI tool-use guidance](https://developers.openai.com/api/docs/guides/tools)
- [OpenAI GPT-5.6 agentic and front-end prompting guidance](https://developers.openai.com/api/docs/guides/prompt-engineering#coding)

### Recommended role: agentic Learning Director

Give GPT-5.6 authority to decide:

- which approved evidence reference needs closer inspection;
- whether the learner's claim needs one clarifying question before a Belief Spec;
- which contrast between the two hypotheses should be made visually salient;
- which trusted scene blocks and narrative order best fit this learner and artifact;
- which allowlisted Boundary view or verified cell should be explored next;
- which hint to give after an incorrect Prediction or transfer attempt;
- how to explain a signed verdict and its limitation in learner language;
- when the learner should interpret, choose, or revise rather than receive more prose.

It may call only bounded server tools such as:

```text
inspect_approved_evidence(evidenceRefIds)
list_registered_candidate_tests(subjectPackId)
request_scene_blocks(allowedTypes, availableBindings)
inspect_signed_result_paths(resultHash, allowedPaths)
list_verified_boundary_views(boundaryReceiptHash)
request_learner_clarification(prompt)
```

The exact tool names are illustrative; the acceptance boundary is not.

### Authority that must remain fixed

| Decision                                  | GPT-5.6/Codex control            | Fixed/learner authority                                               |
| ----------------------------------------- | -------------------------------- | --------------------------------------------------------------------- |
| What evidence to spotlight                | May propose from approved refs   | Parser/resolver decides what exists; learner approves outbound packet |
| Whether to ask a clarification            | May decide                       | Learner answers; state does not advance without required confirmation |
| Which candidate experiment to describe    | May propose registered IDs       | Fixed scorer selects eligible winner                                  |
| Visual block type/order/copy              | May propose from trusted catalog | Fixed renderer and binding verifier decide what can display           |
| Numerical value, axis, unit, result array | No authority                     | Fixed kernel and validated Subject Pack metadata                      |
| Validity or Evidence Verdict              | No authority                     | Frozen technical and epistemic verifier                               |
| Boundary cells                            | No authority                     | Fixed kernel plus Boundary verifier/receipt                           |
| Transfer pass/fail                        | No authority                     | Deterministic transfer evaluator                                      |
| Patch unlock/scope/approval               | No authority                     | State gate, fixed patch verifier, learner approval                    |
| Proof release                             | No authority                     | Worker lineage checks and exact Capsule construction                  |

### Smallest safe agentic loop

Do not build an open-ended autonomous tutor. Add one bounded server-side loop, maximum four tool calls and one learner clarification per stage:

1. GPT-5.6 receives only the approved sanitized state packet.
2. It may inspect named evidence refs and registered capabilities.
3. It returns either one learner clarification or a schema-valid `LearningDirectorPlan` containing Belief Spec plus visual emphasis/scene intent.
4. Local validation resolves every evidence ID, operation ID, block type, and binding.
5. Codex compiles the bounded experiment/scene; fixed scorer/verifier/kernel retain authority.
6. After a signed result, a separate bounded GPT-5.6 call may compose the explanation and next learner question from allowed signed paths only.
7. Public events record tool names, approved references, model/prompt IDs, durations, and hashes—never private reasoning.

`store: false` should remain. If reasoning continuity is used, preserve only supported opaque/encrypted response items or an explicit validated state summary; never store or expose chain-of-thought.

## Visual architecture recommendation

The smallest acceptable implementation is not a new design system. It is a trusted renderer for the existing scene contract:

```text
Codex Lab Scene draft
        ↓ schema + lineage validation
fixed scorer/verifier selects and authorizes experiment
        ↓
Worker returns scene + allowlisted verified binding manifest
        ↓
trusted React registry resolves blocks
        ↓
fixed values/tables/motion arrays bind by signed path
        ↓
learner sees generated composition; fixed evidence remains authority
```

Start with six blocks only: `Hypothesis`, `Prediction`, `WhyThisTest`, one concept-specific experiment visual, `BoundaryMap`, and `NotebookDiff`. Reject unknown blocks, unknown props, duplicate IDs, unresolved paths, unavailable stage bindings, literal result values, unverified proof badges, and any action not registered for that legal state.

Use the same persistent visual experiment object across stages. It should accumulate rather than reset: Question highlights evidence; Prediction pins the learner's token; Test adds intervention/controls; result animates verified values; Boundary expands the map; Apply carries the rule; Repair shows the copied-cell diff. This creates one coherent product category instead of a sequence of attractive cards.

## Audio and motion

Do not build a voice tutor. The high-leverage audio work is the official sub-three-minute video and an optional **“Watch the 25-second proof”** micro-demo with captions/transcript and a mute control. Never autoplay sound. The visual sequence must remain fully understandable muted, at reduced motion, with text resized, and through its accessible table/summary.

Motion should explain state:

- entity dots crossing or no longer crossing a split;
- Prediction visibly sealing before values appear;
- verifier gate withholding/releasing the result;
- Boundary cell selection changing the inspected condition;
- the same rule traveling into transfer;
- one notebook copy cell changing while preserved cells remain still.

Avoid decorative particles, generic 3D, looping gradients, confetti, fake typing, and staged verifier failure.

## Acceptance tests

### Ten-second and thirty-second comprehension

From a clean visit, at 1440×900 and 390×844:

- after 10 seconds, at least 4 of 5 novice testers can say this tests a belief/claim with evidence rather than merely answering it;
- after 20 seconds, they can identify the one changed evaluation condition and the score consequence;
- after 30 seconds, they can name learner Prediction, GPT/Codex proposal, and fixed/verifier authority without reading a technical drawer;
- the verified/sample/live/replay status is visible without inference;
- the primary proof object is fully visible in the first mobile viewport or reached by the first dominant CTA, not hidden behind generic `Explore`.

### Binding and integrity

- every result-bearing block resolves an allowlisted path in the exact verified payload;
- axis labels, units, legends, tables, motion arrays, and displayed values agree with the signed/hash-bound payload;
- generated literal result values and unresolved/stale bindings fail closed;
- no scene displays before immutable Prediction and legal state;
- no generated scene can show `ProofBadge` or verified wording without Worker authority;
- sample/replay/live lineage remains persistent in screenshots and exports.

### Agentic control

- synthetic fixtures prove GPT-5.6 takes different bounded inquiry/presentation actions for entity leakage and class imbalance rather than returning one fixed scene;
- tool calls are allowlisted, strict-schema validated, limited by count/time/token/cost, and receive only sanitized data;
- prompt-injected notebook text cannot create a tool, path, result, action, or authority escalation;
- clarification, scene intent, explanation, and hint branches are tested;
- scorer selection, result, verdict, transfer, patch, and Capsule remain identical when model-authored presentation is mutated or removed;
- an unavailable/refused/timed-out model yields an honest typed state or fixed sample path, never a fabricated scene.

### Accessibility and performance

- every graph has an accessible name, exact table/summary, keyboard inspection, non-color encoding, and 200% zoom/text-resize support;
- reduced motion shows the same evidence and sequence immediately;
- no autoplay sound; captions/transcript exist for narration;
- 375×812, 390×844, 768×1024, 1366×768, 1440×900, and 1920×1080 have no horizontal page overflow;
- visual changes preserve current good LCP/CLS and avoid loading a heavy graphics engine.

## Score implications

- **Current Design should be 13/25, not 15/25.** Desktop Judge craft is strong, but landing, setup, replay, and stage visuals are too explanatory/static, and the mobile proof misses the first fold.
- **Current Technological Implementation remains 17/25.** The dormant Lab Scene and bounded authority are real, but unreachable presentation receives limited credit and GPT-5.6 is not yet a continuing agent.
- Closing the visual P1 with a verified scene renderer could add roughly **4–6 Design points**, **1–2 Technology points**, and **1 Idea point** because the implementation would become visible and memorable.
- A bounded, evaluated Learning Director can raise the technological ceiling; an open-ended agent without authority tests would lower the trust score instead.

## Do not build

- arbitrary model-generated React, CSS, HTML, JavaScript, Python, formulas, charts, or result arrays;
- a permanent agent cockpit or public chain-of-thought stream;
- an AI avatar, voice tutor, talking head, or autoplay narration;
- decorative 3D, generic particles, gamification, badges, confetti, or sound effects;
- multiple unrelated visual styles per Subject Pack;
- a generic dashboard builder or unrestricted “generate any lesson” feature;
- a staged rejection, fake live animation, or replay presented as a fresh run;
- a broad design-system rewrite before the one verified visual story is complete;
- additional subject breadth before the core visual/authority journey and release qualification pass.

## Highest-leverage next action

Render one verified entity-leakage Lab Scene end to end and place its Belief Break Theater in the first viewport of `/` and `/judge`, including mobile. Use that same scene through Prediction, Test, Boundary, Apply, and Repair. In parallel, prototype the bounded GPT-5.6 Learning Director against synthetic fixtures, but do not let the agentic expansion delay the exact public release, mandatory submission, or authority tests.

## Evidence

- Local ignored/non-qualifying capture record:
  `evidence/test-results/visual-judge-public-baseline.json`
- Local ignored/prohibited-fallback capture script:
  `evidence/test-results/visual-judge-audit.mjs`
- `evidence/screenshots/visual-judge/`
- `evidence/screenshots/live-chrome-replay-test-1440x900.png`
- `evidence/screenshots/live-chrome-replay-local-completion-1440x900.png`
- `apps/web/src/features/judge/JudgeModeView.tsx`
- `apps/web/src/components/studio/GeneratedProofView.tsx`
- `apps/web/src/components/studio/ProofConsole.tsx`
- `apps/web/src/components/learner/ExperimentTheater.tsx`
- `apps/web/src/components/generative-ui/BoundaryMapBlock.tsx`
- `apps/web/src/components/learner/TimelineTransfer.tsx`
- `packages/generative-ui-contracts/src/index.ts`
- `packages/belief-analyst/src/index.ts`
- `packages/codex-client/src/prompts.ts`
- `packages/codex-client/src/app-server.ts`
- `apps/web/worker/api.ts`

## Limitations

This addendum did not observe a fresh production GPT-5.6 or Codex call, a native v2 Lab Scene in the browser, a complete current public sample/live journey, a real learner study, or audiovisual-user testing. The claims about current agentic control and scene reachability are source-verified; the expected score effect and proposed comprehension thresholds are informed recommendations, not measured outcomes.
