# 13 — Novelty & Competitive Position (Agent 15: Competitive and Novelty Auditor)

- **Target:** CounterLab — https://counterlab.cserules.workers.dev/ (+ `/judge`) — OpenAI Build Week (Devpost), Education track
- **Audit date:** 2026-07-19 (UTC) · **Seat:** web-research only (`web_search`, `web_open_url`); direct fetch of the target is egress-blocked from this seat ("audit rejected" ×5)
- **Product facts:** taken from the shared black-box route map (`02_PUBLIC_ROUTE_AND_STATE_MAP.md`, Agent 1, browser-observed 2026-07-19) and the Devpost rules audit (`work/agent14_devpost_rules.md`). Product-surface statements are labelled **Inferred from behaviour (via Agent 1 browser observation)** unless noted.
- **Evidence labels:** Documented publicly (URL + access date 2026-07-19) / Inferred from behaviour / Unverified / Could not test.
- **Scope honesty:** this is a *targeted* public scan (~12 search batches, ~30 sources). It does **not** cover every hackathon submission, paywalled product, or non-English market. Absence of prior art below means "not found in this scan", not "does not exist".

---

## 1. Product essence (as publicly presented)

CounterLab: *"CI for understanding. Ask like chat. Prove it like science."* A learner states a claim about their own Python/scikit-learn notebook; GPT-5.6 frames two competing explanations; Runtime Codex compiles a bounded test plan; a **frozen verifier** gates the plan; **fixed deterministic kernels compute every number** (the notebook cells are never re-executed); the learner **seals a prediction + confidence before results are released**; an "Experiment Theater" maps the **boundary** where the claim stops being true (sample: 98.5% → 59.4% when row-split → customer-group split, 389 → 0 shared customers); a **transfer quiz in a changed context** must pass before a repair patch unlocks; outputs are a **"Reasoning Diff"** (for people) and an HMAC-signed **"Proof Capsule"** (for machines); evidence modes (sample / live / replay) are explicitly labelled. *(Inferred from behaviour via Agent 1 route map, 2026-07-19.)*

---

## 2. Landscape table (all entries Documented publicly; accessed 2026-07-19)

### 2.1 AI tutoring / Socratic learning modes (the crowded center)

| # | Product / work | One-line description | URL | Overlap with CounterLab |
|---|---|---|---|---|
| L1 | **ChatGPT Study Mode** (OpenAI, Jul 2025) | In-chat mode: guiding questions, scaffolding, knowledge checks instead of direct answers; powered by custom system instructions | https://m.economictimes.com/tech/artificial-intelligence/openai-rolls-out-study-mode-in-chatgpt/articleshow/122980921.cms | High on "ask like chat"; **zero** on computed evidence, sealed prediction, artifacts. The comparison judges will make first. |
| L2 | **Claude Learning Mode** (Anthropic; Edu Apr 2025 → all users ~Sep 2025) | Socratic questioning; Claude Code "Learning" style leaves `#TODO` gaps the learner fills; "Explanatory" narrates decisions | https://opentools.ai/news/anthropics-claude-ai-breaks-new-ground-with-socratic-learning-mode · https://www.inc.com/ben-sherry/anthropic-is-making-it-even-easier-to-learn-how-to-code/91227443 | High on guided discovery + coding-education adjacency; no verified computation about the learner's artifact. |
| L3 | **Khanmigo** (Khan Academy, 2023–) | GPT-4 Socratic tutor + teacher tools (lesson plans, rubrics); refuses to hand out answers | https://www.rankncompare.com/tools/khanmigo | Medium-high on Socratic stance; K-12 content-bound; no evidence engine. |
| L4 | **Gemini Guided Learning / LearnLM** (Google, 2025) | LearnLM family tuned for learning; step-by-step guidance, open-ended questions; India's #1 Gemini use case | https://educationworld.in/over-2-million-students-in-india-gain-free-access-to-googles-advanced-ai-tools/ | Medium-high on guided learning; no artifact-level verification. |
| L5 | **NotebookLM → "Gemini Notebook"** (Google; renamed 2026-07-16) | Source-grounded AI notebook: quizzes, flashcards, overviews; new update gives every notebook a cloud computer to **write and execute code** | https://www.dawan.africa/news/google-renames-notebooklm-to-gemini-notebook · https://blog.google/products-and-platforms/products/education/ai-tools-programs-educators/ | Medium; mainly a **name/category collision** ("notebook" + learning + now code execution) that muddies CounterLab's noun choice. |
| L6 | **Eedi** (UK; RCT 2025) | 60,000+ diagnostic MCQs whose distractors map to named misconceptions; LLM tutoring trialled in UK classrooms; teacher analytics | https://arxiv.org/html/2512.23633v1 | Medium-high on misconception diagnosis + measured learning outcomes; maths MCQ domain, not learner artifacts. |
| L7 | **Misconception diagnosis from dialogue** (Eedi/Google DeepMind-adjacent research, 2026) | Generate-Retrieve-Rerank pipeline identifies student misconceptions from tutor dialogue | https://arxiv.org/html/2602.02414v1 | Medium; research-grade misconception ID without experiments. |
| L8 | **Socratic Playground ITS** (GCCCE 2025) | Socratic-style LLM intelligent tutoring inside a flipped classroom | https://nlt.gcsce.net/ojs/index.php/GCCCE/article/view/582 | Medium; more of the same Socratic pattern. |
| L9 | Publisher Socratic chatbots (Cengage Student Assistant, Macmillan) | Courseware-bound chat tutors that "don't give direct answers" | https://www.mdpi.com/1999-4893/19/6/492 | Low-medium; table stakes. |

### 2.2 Prediction-first pedagogy (the pedagogical prior art — this is the important block)

| # | Product / work | One-line description | URL | Overlap |
|---|---|---|---|---|
| P1 | **Predict-Observe-Explain (POE)** — White & Gunstone 1992, from Champagne/Klopfer/Anderson 1979 "Demonstrate-Observe-Explain" | Students **predict an experiment's outcome, observe the real result, then explain the discrepancy**; the canonical misconception-attacking science strategy | https://bioresscientia.com/article/the-taxonomy-of-predict-observe-explain-poe-as-a-teaching-strategy-and-thinking-process-of-chemistry-stakeholders | **Very high structurally.** CounterLab's Prediction→Test→Boundary→Repair loop *is* POE, mechanised. The difference: POE never sealed the prediction cryptographically, never computed on the learner's own artifact, never issued a machine-checkable record. |
| P2 | **LAMS POE implementation** | POE lesson template that already includes **prediction + confidence level + explanation** steps and reflection | https://teach.lams.es/pedagogies/poe | High; even the confidence slider has direct precedent. |
| P3 | **Peer Instruction** (Mazur 1997) + classroom response systems ("clickers") | Students **commit to an answer individually before** discussion and re-poll; ConcepTests target known misconceptions; commitment-before-reveal is the active ingredient | https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2018.00033/full · https://cft.vanderbilt.edu/guides-sub-pages/clickers/ | **Very high** on "lock your answer before the reveal"; CounterLab's sealed prediction is this, with a hash instead of a clicker. |
| P4 | PhET-style inquiry + POE lesson plans | Free sims used in POE sequences (predict → manipulate → explain) | https://educationforproblemsolving.net/design-thinking/dp-po.htm | Medium-high; same arc on canned sims. |

### 2.3 Simulations / interactive experiments / boundary exploration

| # | Product / work | One-line description | URL | Overlap |
|---|---|---|---|---|
| S1 | **PhET Interactive Simulations** (CU Boulder, 2002) | Free research-based math/science sims; ~250M runs/yr; implicit-scaffolding inquiry design | https://www.idealist.org/en/nonprofit/7de9e27ebb49456698e2d026332cca2a-phet-interactive-simulations-university-of-colorado-boulder-boulder | Medium-high on "Experiment Theater" feel; sims are content-canned, not about the learner's own code. |
| S2 | **TensorFlow Playground** (Smilkov & Carter) | Browser NN lab: tweak architecture/learning rate/noise/**train-test ratio** and *watch decision boundaries and overfitting form* | https://www.educba.com/tensorflow-playground/ (canonical: playground.tensorflow.org) | **High — closest experiential prior art** to the Experiment Theater, including split-ratio manipulation; but nothing is sealed, verified, or about your notebook. |
| S3 | **Labster** | 300+ gamified virtual science labs with embedded quizzes | https://www.businesswire.com/news/home/20230417005135/en/ | Medium; virtual-lab category owner. |
| S4 | **Google What-If Tool** (PAIR) | Interactive, no-code exploration of ML model predictions, counterfactuals, fairness slices | https://github.com/alexandrainst/responsible-ai | Medium-high on boundary/counterfactual probing of models; practitioner tool, no pedagogy loop. |
| S5 | Go-Lab / ChemCollective / Gizmos / BioInteractive | Virtual-lab and interactive-science libraries | http://www.newtonproject.eu/wp-content/uploads/2019/06/2019_CSEDU_IG.pdf | Low-medium. |

### 2.4 Notebook/coding education & notebook AI

| # | Product / work | One-line description | URL | Overlap |
|---|---|---|---|---|
| C1 | **Kaggle Learn — Intermediate ML, "Data Leakage" lesson** | The canonical free lesson on **target leakage + train-test contamination** with exercises (the same pathology family and even the same "looks accurate until deployed" framing as CounterLab's sample) | https://github.com/gabboraron/Intermediate-Machine-Learning-Kaggle · https://www.kaggle.com/discussions/general/532001 | **High on subject matter.** An informed judge can say "Kaggle already teaches exactly this." CounterLab's delta is experiential (sealed prediction, computed boundary, verified repair), not topical. |
| C2 | **Jupyter AI** (Project Jupyter) | In-notebook chat to generate/debug/explain cells | https://www.deeplearning.ai/courses/jupyter-ai-coding-in-notebooks | Medium; assists *inside* the notebook, explains rather than tests claims. |
| C3 | **Runcell** | Jupyter-native agent: writes/debugs code, runs cells, reads outputs, project memory | https://www.runcell.dev/ | Medium; agentic execution — the opposite philosophy (CounterLab never runs the notebook). |
| C4 | JetBrains AI Assistant in Jupyter; JupyterLab Magic Wand | Cell explanation, error fixing, codegen | https://www.jetbrains.com/help/ai-assistant/ai-in-jupyter-notebooks.html | Low-medium. |
| C5 | **DataCamp (DataLab AI) / Codecademy (AI assistant) / Coddy / Dataquest** | Browser coding-ed platforms with AI help, auto-graded exercises | https://www.datacamp.com/blog/datacamp-vs-codecademy | Medium on category gravity ("interactive coding education"); exercises are pre-authored, not claims about your own artifact. |

### 2.5 ML leakage detection / correctness tooling (technical prior art)

| # | Product / work | One-line description | URL | Overlap |
|---|---|---|---|---|
| T1 | **NBLyzer** (Drobnjaković, Subotić, Urban) | Abstract-interpretation **leakage detector for Jupyter notebooks**; propagates Train/Test labels, flags test→fit flows; 93% precision on 2,111 Kaggle notebooks | https://arxiv.org/html/2603.10742v3 (§6.3) | **High technically.** It already "finds leakage in notebooks" — but it is a static-analysis post-mortem for practitioners, with no learning loop. |
| T2 | **LeakageDetector** (arXiv 2503.14723) | PyCharm plugin detecting leakage across sklearn/Keras calls with **plain-language explanations and proposed fixes** | https://arxiv.org/html/2503.14723v1 | High technically; detect+explain+fix minus prediction/transfer/proof. |
| T3 | **sklearn-diagnose** (GitHub, 2026-01) | LLM-powered diagnosis of fitted sklearn estimators: **overfitting, data leakage, class imbalance** + confidence-scored hypotheses + web chatbot | https://github.com/leockl/sklearn-diagnose | **Highest single overlap found** on scope (leakage + imbalance + chat). Still: it *diagnoses and tells*; it never makes the learner predict, never seals anything, never maps a boundary, never gates a repair. |
| T4 | "A Grammar of ML Workflows" (arXiv 2603.10742) | Typed API that **rejects leaky workflows at call time** | https://arxiv.org/html/2603.10742v4 | Medium-high; prevention-by-design, not education. |
| T5 | **CML** (Continuous Machine Learning) / Great Expectations / whylogs | CI/CD + data-validation testing for ML pipelines | https://mlops-guide.github.io/CICD/cml_testing/ · https://docs.zenml.io/stacks/stack-components/data-validators/whylogs | Medium; this is the literal "CI for ML" CounterLab's tagline puns on — practitioner testing, no learner, no pedagogy. |
| T6 | Fairlearn / AIF360 / Dalex | Fairness & explainability toolkits | https://github.com/alexandrainst/responsible-ai | Low-medium. |

### 2.6 Eval harnesses & verifiable/proof-carrying computation (the "Proof Capsule" prior art)

| # | Product / work | One-line description | URL | Overlap |
|---|---|---|---|---|
| V1 | **OpenAI Evals / lm-eval-harness / HELM / promptfoo** | Fixed evaluation harnesses that compute metrics deterministically over tasks | https://arxiv.org/html/2312.07910v3 (comparison table) | Medium-high conceptually: CounterLab's "fixed kernels compute results" is an eval harness pointed at one learner claim. Harnesses don't teach or seal predictions. |
| V2 | **Verifiable evaluations of ML models using zkSNARKs** (+ zkML: EZKL, zkLLM, Modulus) | Cryptographic proofs that an evaluation/inference was computed as claimed — the strong form of a "proof capsule" | https://pdf.arxiv.org/pdf/2402.02675 · https://kudelskisecurity.com/modern-ciso-blog/zkml-verifiable-machine-learning-using-zero-knowledge-proof | Medium-high conceptually: CounterLab's capsule is a *weak, self-signed* form (HMAC JSON) of this idea, aimed at learning evidence rather than model benchmarking. |
| V3 | ERC-7992 Verifiable ML inference (draft, 2025) | On-chain registry for model commitments + ZK proof verification | https://eips.ethereum.org/EIPS/eip-7992 | Low-medium; shows "verifiable ML claims" is an active, crowded idea space. |

### 2.7 OpenAI-hackathon submissions (publicly findable — labelled; **not** a coverage claim)

| # | Finding | URL | Note |
|---|---|---|---|
| H1 | **Build Week submissions are NOT publicly observable yet.** `openai.devpost.com/project-gallery` currently serves the **2025 Open Model (gpt-oss) Hackathon gallery (488 projects)**, not Build Week entries (submission window still open at audit date). CounterLab's own Devpost page is likewise not indexed (0 search hits). | https://openai.devpost.com/project-gallery | Documented publicly (fetched 2026-07-19; cross-confirmed by Agent 14). **No claim about the Build Week gallery is possible.** |
| H2 | In the publicly findable 2025 gpt-oss gallery (different hackathon, same sponsor): **"RefactorAI — a private, offline AI that asks better questions instead of giving easy answers"**; **"canvasTutor"** (system-design tutor with AI chatbot); **"ALAIN — Applied Learning AI Notebooks"** ("AI manuals for AI models") | https://openai.devpost.com/project-gallery | Labelled: 2025 Open Model Hackathon, **not Build Week**. Signal: "Socratic-withholding" and "AI + notebooks + education" are already common hackathon patterns — expect them in the Build Week Education track too. |

---

## 3. What is genuinely distinctive about CounterLab

Ranked by distance-to-nearest-public-prior-art (nearest in brackets):

1. **The closed loop, not any component.** No public product or research system found in this scan combines all four of: (a) a **sealed, timestamped prediction with confidence** about the learner's *own* artifact, (b) **fixed-kernel computed evidence** (LLM never writes a number; notebook never re-run), (c) a **frozen verifier** that rejects confounded plans before execution, and (d) a **signed machine-checkable record** of the belief change (Reasoning Diff + Proof Capsule). Each component has public precedent (P1/P3, V1, T1, V2); the *composition* appears unoccupied. *(Confidence: high for the scanned landscape; "no public equivalent found", not "none exists".)*
2. **Commitment device bound to a machine-checked outcome on your own code.** Peer Instruction/POE make students commit (P1–P3), but the "reveal" is a teacher/demo; CounterLab's reveal is a seeded re-computation bound to the learner's sealed text. That binding — *your words* vs *your data's answer* — is the memorable delta. *(Inferred from behaviour via route map.)*
3. **Transfer-gated repair.** The fix literally stays locked until the learner passes a transfer quiz in a changed context ("New problem · No notebook hints" → "Transfer passed · Patch unlocked"). Mastery gating is common in ITS; gating a *concrete code patch* on *demonstrated transfer* was not found elsewhere publicly.
4. **Boundary mapping as a first-class learning object** ("the conclusion changes at the entity boundary: 389 → 0 shared customers"). TF Playground (S2) maps decision boundaries of models; CounterLab maps validity boundaries of *claims*. Same instinct, different object, and CounterLab's is computed from the learner's artifact under a verified plan.
5. **Labelled evidence modes (sample/live/replay) with honest limits.** "A Proof Capsule proves integrity and scoped verification — not global mastery." This is rare hygiene among demos generally and hackathon entries specifically; it is a trust differentiator, though not a category definer.
6. **"Reasoning Diff" as a named artifact.** Belief before/after rendered as a diff table. Conceptually adjacent to git-diff culture and knowledge-tracing research, but as a learner-facing *deliverable* it reads fresh.

## 4. What is common / table stakes (do not oversell these)

- **Socratic, answer-withholding chat** — Study Mode, Claude Learning Mode, Khanmigo, Guided Learning, Cengage, Eedi tutoring, Socratic Playground (L1–L9). Judges will treat "asks questions instead of answering" as 2025 table stakes.
- **Hypothesis framing by an LLM** ("two competing explanations") — standard in diagnosis tooling (T3 ships "evidence-based hypotheses with confidence scores") and misconception research (L7).
- **Interactive experiment theater with sliders** — PhET, Labster, TF Playground (S1–S3).
- **Confidence ratings next to predictions** — already in LAMS POE (P2).
- **Notebook attach/chat** — Jupyter AI, Runcell, NotebookLM/Gemini Notebook code execution (C2, C3, L5).
- **Determinism/seed pinning/reproduce scripts** — eval harnesses and CI-for-ML norms (V1, T5).
- **"Locked until you earn it" gating** — standard mastery/Duolingo pattern.

## 5. What judges will compare it against (predicted mental model)

1. **OpenAI Study Mode** (L1) — *"Why isn't this just Study Mode with a notebook upload?"* Judges are OpenAI staff; this comparison is unavoidable and must be pre-empted on the surface, not left to the demo video.
2. **Kaggle's Data Leakage lesson** (C1) — *"The learning objective is Kaggle's canonical lesson, including the same 'accurate until deployed' framing."*
3. **sklearn-diagnose / NBLyzer / LeakageDetector** (T1–T3) — technical judges (e.g., dev-tools track judges crossing over): *"leakage detection in notebooks exists; what's new?"*
4. **TF Playground / PhET** (S1, S2) — education judges: *"interactive experimentation existed; PhET did 250M runs last year."*
5. **Peer Instruction / POE literature** (P1–P3) — any judge with an education background (the judge list includes OpenAI's VP of Education): *"predict-before-reveal is Mazur 1997."*
6. **Eval harnesses / CI-for-ML** (V1, T5) — *"'CI for understanding' = an eval harness with a chat front-end."*

Every one of these comparisons has a good answer (see §7–§8); the risk is that **the public surface never states the answer**, so a judge who stops at the first screen may file CounterLab under "Socratic tutor #47".

## 6. What appears derivative (be specific, so the team can pre-empt it)

- **The pedagogy skeleton is 30–45 years old and well documented.** Prediction→observation→explanation is POE (White & Gunstone 1992, from Champagne et al. 1979); commit-before-reveal is Peer Instruction (Mazur 1997); confidence annotation is in LAMS POE. *CounterLab does not publicly acknowledge this lineage* (nothing observed on `/` or `/judge` via the route map). A judge who knows the literature will notice the omission; citing it would convert "derivative" into "stands on documented science" (see §9, R1).
- **The two showcased pathologies (entity leakage, class imbalance) are the exact feature list of sklearn-diagnose** (T3) and the curriculum of Kaggle's lesson (C1). Subject matter is *not* the novelty.
- **"Proof Capsule" is, cryptographically, a self-signed log bundle** (12 hash-chained events, HMAC-SHA256, self-reported `externalVerifier.status: VERIFIED` — Agent 1's downloaded record). Against zkML verifiable-evaluation work (V2), the word "proof" is strong; the independence of the HMAC key is **Unverified** and no public verification endpoint/spec was observed.
- **"GPT-5.6 frames competing hypotheses"** is the same LLM-hypothesis pattern as misconception-diagnosis research (L7) and sklearn-diagnose's chatbot (T3).

## 7. What the category should be called — and the one phrase a judge remembers

**Category naming options (assessed):**
- "CI for understanding" — clever for developers; **opaque to educators**; zero public search presence (verified: the phrase returned no relevant hits on 2026-07-19), which means the team *can* own it — but only with a plain-language gloss attached. Also literally collides with CML/"CI for ML" (T5), which judges from dev-tools may read first.
- "AI tutor" / "Socratic tutor" — crowded; abandons the delta.
- "Eval harness" — developer-tool framing; loses Education.
- **Recommended: own "evidence-first learning" (or "evidence-first tutoring")** — plain-language, unclaimed in the scanned landscape, and true to the mechanism: the evidence is computed, sealed against, and signed. Keep "CI for understanding" as the engineer's subtitle.

**The one phrase a judge is likely to remember:** the surface already has it — **"Ask like chat. Prove it like science."** (home hero, via Agent 1). That line is stronger than the mission-statement alternative because it states the *contrast*. Keep it; make sure every judge-facing surface (`/judge` hero, video first 10 s, Devpost tagline) repeats it verbatim.

## 8. Is "chatbots explain, CounterLab lets reality answer" defensible? — NOVELTY VERDICT

**Verdict: Defensible as positioning, with one required correction and one required proof.**

- **Defensible:** In the scanned landscape, chat-based learning products (L1–L9) *explain*; their claims about a learner's work are LLM-authored text. CounterLab is the only public entry found where the answer to the learner's claim is **computed by a fixed kernel from the learner's own evidence, under a plan a frozen verifier accepted, against a prediction the learner sealed beforehand**. "Reality answers" = the data/computation answers, not the model's eloquence. That contrast is real.
- **Required correction:** "Reality" overclaims. What answers is a **bounded, seeded re-computation under held-fixed conditions** on two reviewed subject packs — CounterLab's own limits text concedes "scoped verification — not global mastery" (route map, `/judge`). If "reality answers" is stated without the scope clause, an epistemically literate judge can puncture it ("your kernel is not reality; it's one re-split of one synthetic dataset"). Keep the word only where the scope clause travels with it.
- **Required proof:** The phrase is only *demonstrated* in live mode (the learner's **own** notebook). Sample and replay are canned. At audit time the live path was a dead end without an upload from the black-box seat (Agent 1, Reproduced 2×), so the single piece of evidence that would own the category is exactly the one a judge may fail to produce. **That asymmetry is the biggest novelty risk** (issue A15-02).
- **Closest prior art, specifically:** (1) **POE + Peer Instruction** for the commit-then-reveal loop (P1–P3); (2) **TensorFlow Playground** for the interactive boundary/experiment theater on ML (S2); (3) **NBLyzer / LeakageDetector / sklearn-diagnose** for leakage-aware notebook diagnosis (T1–T3); (4) **OpenAI Evals / lm-eval-harness** for fixed-harness computed metrics (V1); (5) **zkML verifiable evaluations** for "proof" of computed ML claims (V2). None of them seals a learner's prediction and issues a learning artifact; CounterLab does not compute anything zkML would call a proof.

**Bottom line (novelty):** Components: derivative, well-precedented. Composition: **genuinely distinctive within the scanned public landscape** — an empty intersection of tutoring × eval-harness × commitment pedagogy × signed artifacts. The novelty is *architectural and epistemic*, not topical, and it is currently **under-claimed** on the public surface (no lineage, no vs-comparison, no one-sentence invariant).

---

## 9. What visible proof is required to own the category

To own "evidence-first learning" a skeptical judge must be able to *check*, not just be told. Required, in order:

1. **A working live-mode path** (arbitrary supported notebook → sealed prediction → computed boundary → capsule). One public live trace on a *reviewer-supplied* notebook would end all "scripted demo" doubt. *(Currently Could not test; sample/replay only — see A15-02.)*
2. **An independently checkable capsule**: a public verifier spec, endpoint, or reproduce script whose output any third party can match against the signed record (the `/judge` dossier lists reproduce scripts — good — but they are not fetchable/executable from the public page; the HMAC key's independence is unestablished).
3. **The one-sentence invariant, printed on the surface**: e.g., *"No number on this page was written by an AI. Every number was recomputed by a pinned kernel (hash shown) from evidence you can download."* The 4-authority diagram on `/judge` implies it; it is never stated as a checkable claim.
4. **A "What CounterLab is not" block** (not a chatbot tutor, not a linter, not a simulation library) with the three named contrasts (Study Mode, Kaggle lesson, leakage linters). Naming the comparison yourself reads confident; leaving it to the judge reads naive.
5. **Lineage citation** (POE; Mazur; PhET-style inquiry) — one line: *"Predict-Observe-Explain gave science class the loop; CounterLab makes the loop machine-checked."* This *increases* perceived novelty by showing the team knows exactly which 10% is new.

## 10. Gaps that weaken novelty (severity per audit model; full detail in `work/agent15_issues.json`)

| ID | Sev | Gap (one line) |
|---|---|---|
| A15-01 | **P1** | The distinctive delta is never stated in one sentence anywhere public; judge must reconstruct it (novelty-comprehension failure = first-prize blocker per audit model). |
| A15-02 | **P1** | Category-owning proof lives only in live mode, which is the one path a judge may be unable to run; sample+replay are canned. |
| A15-03 | P2 | The category manifesto ("How proof works" / "supported evidence boundary" links) is dead on the home surface (Reproduced 2× by Agent 1). |
| A15-04 | P2 | "Proof Capsule" is self-signed with no independent verification path; "proof" overclaims vs zkML-grade prior art. |
| A15-05 | P2 | Category name absent/jargon-only ("CI for understanding" has no public presence; "notebook" collides with Google's renamed Gemini Notebook, 2026-07-16). |
| A15-06 | P2 | No public framing separating CounterLab from leakage linters/dev-tools (NBLyzer, LeakageDetector, sklearn-diagnose). |
| A15-07 | P2 | Learning objective overlaps Kaggle's canonical leakage lesson; only one subject pack is publicly visible, so "category" reads as "one lesson". |
| A15-08 | P3 | "Reality answers"/98.5→59.4 hero claims lack an attached scope clause on learner-facing surfaces (scope exists only on `/judge`). |
| A15-09 | P3 | No visible learning-outcome metric (calibration of sealed predictions, aggregate transfer pass rates) — the one number that would prove the category's value. |
| A15-10 | P3 | Build Week gallery not yet public (verified); 2025 gpt-oss gallery shows "Socratic-withholding" is a known hackathon pattern — expect copy-pattern entries; differentiation must lean on computed evidence + artifacts. |
| A15-11 | P3 | Replay evidence is a single "legacy v1" replay with no capsule download — the strongest trust artifact is unavailable on the only deterministic judge path. |

## 11. Additions that create real differentiation vs feature bloat

**Real differentiation (do these):**
- **R1. Lineage + invariant statement on `/judge` and the Devpost page** (see §9.3, §9.5). Cheapest, highest-leverage novelty fix; pure copy.
- **R2. Public capsule verifier** (one command or endpoint; publish verifier id/hash next to every capsule). Converts "trust us" into "check it" — the entire brand promise.
- **R3. Second subject pack made visible** (class imbalance is claimed in scope; ship its sample+replay). Two packs = a method; one pack = a demo.
- **R4. Calibration scoring of sealed predictions** (Brier score / overconfidence delta before-vs-after, shown in the Reasoning Diff). Turns the sealed prediction from theatre into *measurement* — publishable, memorable, and no competitor surfaces it.
- **R5. Teacher/aggregate view later**: class-level Reasoning Diffs and most-failed claims (Eedi proved judges love misconception analytics — L6).
- **R6. Optional: pin the dataset + kernel hashes of the sample lesson publicly** so 98.5→59.4 is third-party reproducible.

**Feature bloat (do NOT do these before R1–R3):**
- More chat personalities, voice, avatars, mobile app, badges/streaks, LMS/Canvas integrations, more model families (deep learning), multi-language notebooks, marketplace of lessons. None of these widen the moat (computed, sealed, signed evidence); all of them burn the remaining pre-deadline hours.

## 12. Could not test / limitations of this audit seat

- Direct fetch of counterlab.cserules.workers.dev refused ("audit rejected" ×5); all product-surface statements rely on Agent 1's browser observations (2026-07-19) — labelled **Inferred from behaviour**.
- Live notebook upload path untestable from this seat (also untestable for Agent 1: browser tools cannot set file inputs).
- Independence of the Proof Capsule HMAC key, existence of a public verifier, and the content of the `/judge` reproduce scripts: **Unverified**.
- Build Week submission gallery: **not public at audit date** (verified); no inter-submission comparison for Build Week is possible. 2025 gpt-oss gallery used only as a labelled, same-sponsor signal.
- This scan ran ~12 search batches; long-tail products (regional, paywalled, or unindexed) may exist that this scan did not surface.

## 13. Source register (all accessed 2026-07-19)

Primary fetched sources are inline in §2 tables. Additional context: OpenAI Build Week official page + FAQ (https://openai.devpost.com/, /details/faqs) via Agent 14's rules audit (`work/agent14_devpost_rules.md`); judging criteria quoted there — *Technological Implementation, Design, Potential Impact, Quality of the Idea ("How creative and novel is the concept and does the project differ from existing concepts?")* — are the criteria this document maps to. Product observations: `02_PUBLIC_ROUTE_AND_STATE_MAP.md` (Agent 1).
