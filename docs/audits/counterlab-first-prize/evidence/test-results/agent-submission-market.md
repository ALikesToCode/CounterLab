# Agent 11 + 12 — submission, judge, impact, and market audit

Audit time: 2026-07-18 19:25 UTC (2026-07-19 00:55 IST)

Scope: read-only inspection of the official OpenAI Build Week record and
announcements, the authenticated CounterLab Devpost project, the repository's
submission materials, the rendered public CounterLab routes and screenshots,
and a targeted current primary-source competitor scan. No Devpost field was
changed and no public CounterLab write request was made.

## Verdict

**Stage One currently fails.** The live authenticated Devpost project is still
project `1330312`, named `Untitled`, in `submission_pre_draft`. Its tagline is
null, description is empty, video URL is null, public slug and publication
timestamp are absent, the Build Week `website_url` is null, and
`submitted_at` is null. This independently reproduces the earlier baseline.
The official 2026-07-18 deadline announcement explicitly tells entrants to
start the Devpost submission now; the deadline remains
`2026-07-22T00:00:00Z` (Tuesday July 21 at 17:00 PT). At 19:25:12 UTC on July
18, 275,688 seconds (3 days, 4 hours, 34 minutes, 48 seconds) remained.

The product package underneath the missing submission is much stronger than
the Devpost state: Judge Mode communicates a distinctive thesis and concrete
98.5% versus 59.4% proof quickly, the README documents a non-trivial authority
architecture, and all 357 inspected commits are dated from July 14 through July
19, 2026. But none of that can receive judging credit until a complete entry is
submitted.

## Official requirements and live readiness

Current official connector fetches at 2026-07-18 19:24 UTC confirm:

- submissions are open until `2026-07-22T00:00:00Z`;
- Education covers projects that push forward AI for students, teachers, or
  educational organizations;
- judging/tie-break order is Technological Implementation, Design, Potential
  Impact, then Quality of the Idea;
- a working Codex + GPT-5.6 project, category, description, public YouTube demo
  under three minutes, repository URL, README/setup guidance, Codex/GPT-5.6
  build story, and `/feedback` session ID are required;
- the repository must be public with relevant licensing or private and shared
  with `testing@devpost.com` and `build-week-event@openai.com`;
- required custom fields include submitter type, country, category, repository
  URL, and `/feedback` session ID;
- the demo voiceover must cover what was built, Codex, and GPT-5.6.

Submission asset audit:

| Requirement | Evidence | State |
| --- | --- | --- |
| Project name/tagline/description | Live project is Untitled/null/empty | **Missing** |
| Education category | Intended throughout repository; no submitted entry | **Not submitted** |
| Working public app | `/`, `/judge`, `/new`, and replay rendered over authorized Chromium; live exact-version state-changing journey was intentionally not executed | **Partially verified** |
| Public video <3 min with audio | `docs/DEMO_SCRIPT.md` is a 2:45 plan; no video asset or URL found | **Missing** |
| Repository URL/access | Devpost has no repo URL; origin is `github.com/ALikesToCode/CounterLab`; unauthenticated access evidence returned 404 | **Missing / access unverified** |
| Relevant license | Repository `LICENSE` is MIT | **Present** |
| README setup/sample/run guidance | README has setup, architecture, support boundary, verification commands, sample/replay/live distinctions | **Present, but release caveat is prominent** |
| Codex collaboration + GPT-5.6 roles | README has unusually detailed runtime and build-time separation | **Present** |
| `/feedback` session ID | No ID found in README, docs, or submission evidence | **Missing** |
| Public judge/test URL | Live app exists, but Devpost Build Week website URL is null | **Missing from entry** |
| Screenshots/thumbnail | `docs/SCREENSHOT_PLAN.md` says planned/not captured; audit screenshots now exist but are not curated submission assets | **Missing from submission package** |
| Impact evidence | Pilot protocol exists; result is `NO_DATA`, zero participants | **No measured learner outcome** |
| Hackathon-period provenance | Git history begins 2026-07-14 and inspected HEAD was 2026-07-19 | **Strong** |

The repository draft copy is not ready to paste unchanged. It uses `CI for
Understanding`, `Belief Test`, `Experiment Plan`, and `Proof Bundle`, while the
current live/README vocabulary is `scientific debugger for beliefs`, Question,
Prediction, Test, Boundary, Apply, Repair, and Proof Capsule. It also fails to
lead with the current Judge Mode, Boundary Map, tri-state evidence, or explicit
four-authority proof. The README is stronger, but opens with a warning that the
local v6.1 branch is not pushed, deployed, or browser-qualified and that the
public URL is a separate release. This is honest and important, but, without an
exact-current release receipt, it gives a judge a direct reason to doubt that
the best screenshots/video match production.

## Simulation A — submission-only judge

### Actual public submission

There is nothing judgeable: the project is an untitled pre-draft with no
description, video, website, or submission timestamp. Likely outcome: Stage
One administrative failure before criterion scoring.

### If the current repository draft were pasted without correction

The judge would understand one strong entity-leakage story and a serious
generated-versus-fixed authority design. They would not see a video or visual
proof, would encounter stale vocabulary, would not know which source version
is deployed, and would find no measured learner result. The likely mental model
would be “technically impressive notebook-verification demo” rather than a
complete, validated education product.

### Submission-only comprehension

- What it is: mostly clear from the README, less clear from the stale title.
- Who it is for: ML learners using supported scikit-learn notebooks; this
  audience is too implicit in submission copy.
- Problem: learners trust a high metric produced by the wrong evaluation
  boundary; strong concrete story.
- Differentiation: generated proposals cannot authorize evidence; strong.
- Codex role: bounded runtime compiler plus build collaborator; strong in
  README, absent from the missing actual submission.
- Impact: plausible but unmeasured.
- Product completeness: doubtful because the documented best branch and public
  release are explicitly separated.

## Simulation B — hands-on judge

Evidence: live Chromium screenshots and extracted DOM from Worker version 82,
captured 2026-07-18 19:16 UTC. Public-origin requests were restricted to GET,
HEAD, and OPTIONS, so this is a comprehension simulation, not a full live-run
qualification.

### 20 seconds on `/judge`

Understood:

- CounterLab tests a notebook belief by changing the evaluation unit.
- The concrete result is memorable: random rows 98.5% versus whole customers
  59.4%, with shared-customer counts 389 versus 0.
- Fixed computation, not fluent prose, decides what the evidence supports.
- The strongest obvious CTA is `Start sample`; replay is a secondary option.

Still unclear:

- “ML learner with a surprising notebook result” is implied, not named.
- Codex's role and the four-way authority split are below the first fold.
- Sample, live, and replay meanings are below the first fold; only sample and
  replay CTAs appear above it.
- Impact evidence is absent.

### 60 seconds

A modest scroll reaches “Four authorities. No blurred hand-offs.” GPT-5.6
frames the belief, runtime Codex compiles operation IDs, the fixed kernel
computes, and the verifier releases. This is the strongest technical proof and
directly answers the tie-break criterion. The judge can now explain why this is
not a chatbot. The risk is that the explanation is still a dossier, not proof
that those roles ran in the clicked journey.

### 3 minutes

The judge can learn the three explicit modes and six-step method, plus bounded
claims and reproduction commands. Judge Mode feels coherent and unusually
honest. It also reveals that only two closely related ML Subject Packs ship and
that replay is legacy v1 without a Proof Capsule. The advertised live status
is “configured,” not “current journey smoke-passed.”

### 10 minutes

The replay is persistently labelled and opens with clear provenance. However,
the safe interaction audit reached a locally authored revision, locally scored
transfer, apparent repair completion, and download CTAs under the replay
banner, despite Judge Mode promising “Read-only stored events. No new model
call, no new experiment.” That contradiction materially weakens the product's
central trust thesis. A state-changing live journey was outside this audit's
read-only production mandate; current exact-version end-to-end completion
therefore remains unproven.

## First-20-seconds answers

### Clean learner landing `/`

1. What is it? A claim/question tester that can read notebook evidence.
2. Who is it for? Only inferable from the low support note: people with
   Python/scikit-learn notebooks about leakage or imbalance.
3. What problem? Understanding a result; the costly misconception is not yet
   explicit.
4. First action? State a claim, optionally attach a notebook, click Test.
5. Difference from ChatGPT? The fixed-kernel/frozen-check sentence explains
   this, but with technical vocabulary.
6. Codex role? Not present on the landing screen.
7. Trusted evidence? Fixed kernels calculate; frozen checks verify the binding.
8. Mode? Sample and replay are in the side navigation; the primary question
   path is not explicitly labelled and visually implies a notebook is optional.

### Judge Mode `/judge`

1. What is it? A scientific notebook-claim tester that locks a prediction and
   lets fixed evidence decide.
2. Who is it for? Notebook/ML learners are implied, not directly named.
3. What problem? A high score can support the wrong deployment claim.
4. First action? Start sample.
5. Difference from a normal tutor? Fixed computation rather than prose.
6. Codex role? Clear only after the next section/scroll.
7. Trusted evidence? The above-fold 98.5/59.4 card says fixed-kernel evidence;
   the verifier role appears below.
8. Mode? Full separation is below the fold; above fold offers sample and replay.

## Strict score recommendation

The official current submission score is **0/100, not judgeable**, because no
submission exists. It should not be averaged with the latent product quality.
For planning, the shadow score below estimates what a strict judge might award
if forced to evaluate the current public app plus current repository today:

| Criterion | Shadow score | Evidence supporting | Evidence preventing a higher score | Likely objection |
| --- | ---: | --- | --- | --- |
| Technological Implementation | 17/25 | Runtime Codex plan compilation, fixed scorer/kernel/verifier, typed contracts, mutations, copied repair, strong Judge authority map | Exact-current public build not source-bound or end-to-end qualified; Codex work is mostly described rather than demonstrated in-product; replay semantics contradict copy | “Show me that this exact public run used Codex and passed independent verification.” |
| Design | 15/25 | Strong Judge Mode hero, hierarchy, concrete data, coherent six-stage vocabulary, responsive captures | Plain-question path leads to notebook setup; legacy replay permits local reenactment; full core journey unqualified; landing audience/authority ambiguity | “The dossier looks finished, but can a first-time learner actually complete the promised loop?” |
| Potential Impact | 7/25 | Narrow real audience and expensive misconception; transfer and repair are behaviorally meaningful | `NO_DATA`, zero learners, no completion/time/confusion/retention evidence; protocol has no comparison arm; only two fixed tasks | “Where is evidence that learners understand or transfer better than after a good explanation?” |
| Quality of the Idea | 18/25 | Memorable “scientific debugger for beliefs”; unusual authority separation and replayable proof; artifact-specific belief-to-repair loop | Inquiry labs, transfer tests, artifact-grounded tutors, and notebook agents already exist; two adjacent ML packs make system breadth look unproven | “Is this a reusable category or an excellent leakage/class-imbalance lesson engine?” |
| **Total** | **57/100** |  |  |  |

Suggested confidence intervals: Technology 15–20, Design 12–18, Impact 5–10,
Idea 16–21; shadow total 48–69. Technology is the first tie-break and should
receive the first minute of the video after the problem/result hook.

Planning states, subject to full red-team resolution:

- **Current public submission:** 0/100 official; 57/100 shadow product package.
- **After confirmed P0/P1 corrections:** about 81/100 (22 tech, 21 design,
  16 impact, 22 idea), provided the exact deployed build completes sample,
  live, replay, transfer, copied repair, and proof in captured evidence.
- **Realistic prize-one ceiling:** about 89/100 (23 tech, 23 design, 20 impact,
  23 idea), requiring a small credible learner comparison, a flawless public
  core path, and a submission/video that makes authority visible rather than
  merely described.

Largest single score action: freeze and qualify one exact public release, then
record the under-three-minute demo from that release around the sequence
**surprising claim → immutable prediction → runtime Codex bounded plan receipt
→ fixed/verifier release → surface-different transfer → copied repair → Proof
Capsule**. Populate and submit the Devpost fields in parallel; without that,
all other score work is worth zero.

## Current competitive scan

This was a targeted scan, not a claim to cover every product or hackathon
entry. All sources below returned HTTP 200 through authorized local Chromium at
2026-07-18 19:23 UTC. The extracted source record is
`market-primary-source-browser.json`.

| Comparable | Current primary evidence | What is table stakes | CounterLab distinction / risk |
| --- | --- | --- | --- |
| Khanmigo | [Khan Academy, May 2026](https://blog.khanacademy.org/how-khan-academy-is-building-a-better-ai-tutor-our-most-recent-learnings/) reports classroom/interview/chat evidence and measures next-item correctness as independent learning transfer plus cognitive engagement | Socratic tutoring, measured learner behavior, independent next-item performance, large-scale iterative evaluation | CounterLab's deterministic transfer gate is stronger in auditability, but transfer itself is not novel; zero learner data is a major competitive deficit |
| Gemini study notebooks | [Google, June 2026](https://blog.google/products-and-platforms/products/education/iste-students-2026/) supports uploaded class materials, diagnostic quizzes, adaptive bite-sized lessons, and progress-responsive planning | Artifact grounding, misconception/gap diagnosis, adaptive lessons, quizzes, multimodal study tools | CounterLab should not compete on personalization breadth; it must foreground authoritative experiments and proof |
| Gemini Guided Learning | [Google, August 2025](https://blog.google/products-and-platforms/products/education/guided-learning/) uses probing questions, step-by-step adaptation, rich media, and interactive quizzes | Conversational active learning and “not just answers” positioning | CounterLab's “chatbots explain” line alone is insufficient differentiation; generated-vs-fixed authority is the differentiator |
| Inq-ITS | [Inq-ITS](https://www.inqits.com/) provides virtual labs, hypotheses, controlled investigations, data analysis, claim-evidence-reasoning, automated assessment, and real-time tutoring | Scientific inquiry loops, control-variable checking, evidence-based claims, authentic performance assessment | Closest conceptual competitor. CounterLab is novel in testing a learner's own notebook artifact, immutable pre-result prediction, source-free runtime Codex, independent release gate, repair-to-copy, and portable proof; it is weaker in breadth and impact evidence |
| PhET | [University of Colorado PhET](https://phet.colorado.edu/) currently reports 173 research-based interactive simulations and more than 1.8B deliveries | High-quality exploratory simulation, concept breadth, delight, accessibility, teacher materials, demonstrated scale | Boundary exploration is not novel by itself; CounterLab must show why the experiment was selected to discriminate between the learner's two models |
| Jupyter AI | [Project Jupyter docs](https://jupyter-ai.readthedocs.io/en/latest/) connect Codex and other agents to notebooks and support writing, debugging, running, collaborative chat, and permission guardrails | Notebook-native AI agents, Codex integration, code debugging, agent permission prompts | “AI for notebooks” is derivative. CounterLab's narrow no-execution intake and generated-plan/fixed-authority boundary must be visible |
| JELAI | [AIED 2025 paper](https://arxiv.org/abs/2505.17593) integrates fine-grained notebook learning analytics with context-aware LLM tutoring and A/B-test infrastructure | Notebook-aware tutoring and fine-grained learner telemetry are active research areas | CounterLab lacks comparable learner analytics evidence but has a more explicit epistemic authority/replay artifact |
| AI Scientist-v2 | [2025 primary paper](https://arxiv.org/abs/2504.08066) autonomously formulates hypotheses, designs/executes experiments, analyzes results, and authors papers | Experiment-generating agents are established outside education | CounterLab must not claim experiment generation itself as novel; novelty is learner ownership plus fixed admissibility, independent verification, and bounded educational repair |

## Novelty conclusion

No exact match was found in this bounded scan for the full combination of:

`learner-owned artifact claim → two executable mental models → immutable
prediction → generated but non-authoritative discriminating plan → fixed
selection/computation → independent epistemic release → boundary map →
deterministic surface-different transfer → transfer-gated copied-artifact repair
→ replayable machine proof`.

That intersection is genuinely differentiated. Individual elements are not:
Socratic dialogue, notebook context, misconception diagnosis, simulations,
controlled investigations, transfer checks, AI-generated experiments, and AI
notebook repair are all represented by current products or research.

The memorable category should remain **“a scientific debugger for beliefs.”**
`CI for Understanding` sounds developer-centric, hides the learner, and is
weaker as a top-line category. A concise elaboration is: “It turns a learner's
notebook claim into a verified experiment, then makes them transfer the rule
before it unlocks a repair.”

The largest category-ownership gaps are:

1. exact-current end-to-end public proof is absent;
2. runtime Codex's artifact-specific contribution is described but not made
   visually undeniable in the learner's strongest moment;
3. only two adjacent ML packs ship, so reusability is architectural rather than
   experiential;
4. no learner has produced measured completion, confusion, transfer, or
   retention evidence;
5. replay semantics currently undermine the very authority distinction the
   category depends on.

## Impact: measured versus aspirational

Measured:

- zero pilot participants and zero completed sessions;
- deterministic software transfer tasks and mutation results, which measure
  system behavior, not learning;
- a prepared privacy-preserving descriptive pilot protocol;
- no learner quote, completion rate, time-on-task, abandonment map, comparison,
  delayed retention, or observed unassisted behavior.

Aspirational but credible:

- adult Python/scikit-learn learners who trust misleading evaluation metrics;
- replacing passive explanation with committed prediction, evidence
  interpretation, boundary exploration, and surface-different transfer;
- preserving privacy through sanitized evidence and narrow supported patterns;
- extending through reviewed Subject Packs after the core authority system is
  reliable.

The current pilot cannot support “better than explanations” because it has no
comparison arm. The smallest credible pre-deadline study is a five-to-eight
participant paired, counterbalanced comparison: one misconception gets a
concise explanation-only baseline and the other gets CounterLab; then both get
surface-different fixed transfer. Record consent, completion, unassisted first
transfer attempt, task time, confusion/abandonment point, and one structured
usefulness question; report every count and limitation. This is too small for a
causal effect claim but can supply honest feasibility and learner-behavior
evidence. If recruitment cannot finish safely, run a three-person usability
test and label it usability only; do not turn internal deterministic transfer
scores into learner impact.

## Highest-leverage submission corrections

1. Immediately populate the Devpost draft with a human-edited title, tagline,
   current-vocabulary description, Education category, live URL, repository,
   and `/feedback` ID; verify the final submitted timestamp before the deadline.
2. If the repository is private, share it with both required judging accounts;
   if public, verify anonymous access and retain MIT licensing.
3. Freeze one exact release candidate and bind commit, Worker deployment,
   Container digest, test receipt, screenshots, and video to it.
4. Capture a real under-three-minute public YouTube demo; do not splice sample
   or replay as live. Show Codex's bounded plan receipt and verifier release in
   the primary story, not only a diagram.
5. Replace stale `CI for Understanding`/Belief Test/Proof Bundle submission copy
   with the current learner vocabulary and scientific-debugger category.
6. Curate four current public screenshots: Judge proof/result; authority map;
   immutable prediction plus “Why this test?”; completed transfer, copied
   repair, and Proof Capsule. Include persistent mode labels.
7. Fix or explicitly narrow legacy replay copy so locally reenacted learner
   choices cannot be mistaken for immutable stored evidence.
8. Put the strongest current release/test evidence and a 60-second judge path
   at the README top; keep unsupported claims and known boundaries visible.
9. Report impact as `NO_DATA` unless the small study actually occurs.
10. In the video, name the audience in the first sentence: “ML learners who
    have a notebook result they do not know whether to trust.”

## Do-not-build before submission

- another chatbot/tutor surface;
- arbitrary subjects, arbitrary notebooks, arbitrary Python, or package
  installation;
- gamification, leaderboards, accounts, classroom/LMS dashboards, or a mastery
  graph;
- a third ML pack merely to claim breadth;
- a cross-domain physics pack before the exact core release is qualified;
- an agent cockpit or more technical telemetry on the learner's main canvas;
- fabricated learner quotes, inferred completion rates, or internal transfer
  outcomes relabelled as human impact.

## Evidence paths

- `docs/audits/counterlab-first-prize/evidence/test-results/devpost-official-baseline.md`
- `docs/audits/counterlab-first-prize/evidence/test-results/devpost-project-baseline.md`
- `docs/audits/counterlab-first-prize/evidence/test-results/live-chrome-public-routes-20260719.json`
- `docs/audits/counterlab-first-prize/evidence/screenshots/ux/judge-1440x900-first-fold.png`
- `docs/audits/counterlab-first-prize/evidence/screenshots/ux/judge-1440x900-full.png`
- `docs/audits/counterlab-first-prize/evidence/screenshots/live-chrome-replay-local-completion-1440x900.png`
- `docs/audits/counterlab-first-prize/evidence/test-results/market-primary-source-browser.json`
- `docs/audits/counterlab-first-prize/evidence/network/github-access-baseline.md`
- `README.md`, `docs/DEVPOST_COPY.md`, `docs/DEMO_SCRIPT.md`,
  `docs/SCREENSHOT_PLAN.md`, `docs/USER_STUDY_PROTOCOL.md`, and
  `docs/LEARNER_PILOT_RESULTS.json`

## Limitations

- The public application was kept read-only, so a new sample/live session was
  not created and exact-current state-changing completion was not tested here.
- Market inspection was deliberately bounded to eight representative primary
  sources; it does not cover every Build Week submission or every education
  product.
- The Devpost connector exposes live project fields but not whether a private
  GitHub repository has been shared with the two required accounts; that remains
  unverified.
- No public video exists to simulate directly; the video assessment is of the
  repository plan only.
