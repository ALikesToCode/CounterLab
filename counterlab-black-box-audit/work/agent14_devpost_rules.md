# Agent 14 — Devpost Rules & Submission Audit (CounterLab / OpenAI Build Week)

**Auditor:** Agent 14 (RULES side of black-box swarm)
**Audit date:** 2026-07-19 (UTC; canonical per AUDIT_META.txt). Sandbox clock at audit: 2026-07-18T20:24Z = 2026-07-19 04:24 UTC+8 = 2026-07-18 13:24 PDT. All page facts below are cited as "accessed 2026-07-19".
**Environment constraint:** `web_open_url` + `web_search` only (no shell internet). Direct fetches of the CounterLab app were refused by the fetch layer on every attempt (see §1.3) — app-side statements are **"Could not test"** and rely on the architecture description supplied in the audit briefing (**Unverified**).

**Fact labels used:** **Documented publicly** (fetched from an official page on 2026-07-19) · **Documented publicly (third-party)** (non-official source) · **Unverified** (not confirmable from public pages) · **Could not test** (target unreachable / requires login or submission-form access).

---

## 1. Source register

### 1.1 Successfully fetched (official)
| URL | Content | Accessed |
|---|---|---|
| https://openai.devpost.com/ | Build Week overview, tracks, what-to-submit, prizes, judges, judging criteria | 2026-07-19 |
| https://openai.devpost.com/details/faqs | Full FAQ: Codex/GPT-5.6 mandates, /feedback Session ID, video rules, README rules, credits, plugin, tracks | 2026-07-19 |
| https://openai.devpost.com/details/dates | Schedule table (rendered in GMT+8) | 2026-07-19 |
| https://openai.com/build-week/ | OpenAI's own event page: key dates, judges (Authority: official OpenAI) | 2026-07-19 (via search extract) |

### 1.2 Fetched but STALE / mismatched (important finding)
| URL | Observation | Accessed |
|---|---|---|
| https://openai.devpost.com/rules | Returned **"OpenAI Open Model Hackathon"** Official Rules (gpt-oss hackathon; Submission Period Aug 5 – Sep 11, 2025) — **not** the Build Week rules — on two independent fetches. Search index lists the same URL under title *"OpenAI Build Week (the "Hackathon") Official Rules - Devpost"* while its snippet body is still the 2025 text. Either the rules document body was not swapped when the subdomain was reused, or every public cache serves the old body. **The Build Week Official Rules full text could not be retrieved.** | 2026-07-19 |
| https://openai.devpost.com/project-gallery | Shows the **2025 gpt-oss hackathon gallery** (488 projects, e.g. "RoboChef: GPT-OSS Powered Kitchen Assistant"), not Build Week submissions. CounterLab's Devpost page is therefore not publicly observable yet. | 2026-07-19 |

### 1.3 Failed / unreachable
| URL | Result |
|---|---|
| https://counterlab.cserules.workers.dev/ | "audit rejected" ×3 (https + http) |
| https://counterlab.cserules.workers.dev/judge | "audit rejected" ×2 |
| https://openai.devpost.com/details/eligibility, /details/judging, /details/resources | "internal error" (pages do not exist for this hackathon) |
| Forum topics 44367 / 44349, updates/45282 | login-gated / not fetchable / 404 |
| web.archive.org & timetravel.mementoweb.org (any target) | "audit rejected" / timeout |
| Search: `counterlab.cserules.workers.dev`, `site:openai.devpost.com CounterLab` | 0 results — app not indexed |

**Consequence:** every statement about CounterLab's live behaviour, Judge Mode, video, repo, README, Session ID, and Devpost page is **Could not test / Unverified** from this seat. The mission-critical rules facts (§2–§5) are fully documented from official pages.

---

## 2. Verified hackathon facts (Build Week)

### 2.1 Identity & sponsor
- Event: **OpenAI Build Week** — *"Join a global week of building with Codex."* — https://openai.devpost.com/ (accessed 2026-07-19). **Documented publicly.**
- Tagline context: *"GPT-5.6 is here, and Codex—the same powerful coding agent—is now available in ChatGPT."* (same URL). **Documented publicly.**
- Sponsor per rules template: OpenAI OpCo, LLC; Administrator: Devpost, Inc. — **Unverified for Build Week specifically** (the /rules page served the 2025 document; same sponsor there).

### 2.2 Deadline & timeline (verified, with timezone math)
- Homepage, twice: **"Submissions are due Tuesday, July 21 at 5:00 PM PT."** — https://openai.devpost.com/ (accessed 2026-07-19). **Documented publicly.** (2026-07-21 is indeed a Tuesday.)
- FAQ: *"No changes can be made to your submission after the Submission Period ends on July 21 at 5:00 PM PT."* — https://openai.devpost.com/details/faqs (accessed 2026-07-19). **Documented publicly.**
- Devpost forum header (search snippet): *"OpenAI Build Week Deadline: Jul 21, 2026 @ 5:00pm PDT"* — **Documented publicly (search snippet)**; confirms PT = **PDT = UTC−7** in July.
- Schedule page (https://openai.devpost.com/details/dates, accessed 2026-07-19; rendered in GMT+8, converted by me):
  - Submissions: **Jul 14 00:00 GMT+8 → Jul 22 08:00 GMT+8** = **Mon Jul 13 09:00 PDT → Tue Jul 21 17:00 PDT** (= 2026-07-22T00:00Z). Matches the homepage to the minute. **Documented publicly.**
  - Judging: Jul 23 00:00 GMT+8 → Aug 10 08:00 GMT+8 = **Wed Jul 22 09:00 PDT → Sun Aug 9 17:00 PDT**.
  - Winners announced: Aug 13 00:00 GMT+8 = **Wed Aug 12 09:00 PDT**.
- OpenAI's own page https://openai.com/build-week/ (accessed 2026-07-19): "July 13 Challenge opens · July 21 Submission deadline · July 22—August 7 Judging period · August 12 Winners announced." **Documented publicly.** Note the small discrepancy: Devpost table says judging ends Aug 9 17:00 PDT; openai.com says "July 22—August 7". Safe play: keep the app fully available through **Aug 13**.
- Free Codex credits ($100) request form closed **Friday, July 17 at 12:00 PM PT** — FAQ. Already passed at audit time. **Documented publicly.**
- Third-party blog (velonx.in, 2026-07-18) repeats Jul 21 5:00 PM PDT, judging Jul 22–Aug 7, winners Aug 12. **Documented publicly (third-party)** — consistent with openai.com.
- One inconsistency: Devpost update post 45282 (search snippet) says *"until Monday, July 21st at 5:00"* — Jul 21 2026 is a **Tuesday**; "Monday" is a typo. Deadline itself unchanged.

### 2.3 Eligibility
From the served /rules document (2025 Open Model Hackathon — **Unverified that Build Week's text is identical**, but the template is near-certainly reused; FAQ cross-references "the Official Rules" in the same style):
- Open to: individuals at least age of majority; residents of countries supporting OpenAI API access (https://platform.openai.com/docs/supported-countries); parents/guardians submitting on behalf of under-18 students; teams; organizations.
- Not open to: residents of sanctioned/embargoed jurisdictions (incl. Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea, Syria per 2025 text), Promotion Entities' employees/family/household, judges & their employers, conflicts of interest.
- Under-18 note (2025 text): *"A guardian must participate in the Hackathon on your behalf by submitting your project through their registered Devpost account."*
- FAQ (Build Week, Documented publicly): solo/team/org entry allowed; **no team-size limit** ("but note some prizes have their own team-size restrictions"); team members may be in different countries if each is individually eligible; *"The Education track in particular welcomes projects from students, educators, and learners."*
- Devpost account required; registration via "Join Hackathon" button or the Devpost Hackathons plugin (plugin optional, *"doesn't give you any advantage in judging and won't affect your eligibility"*). **Documented publicly.**

### 2.4 Required use of OpenAI models — EXACT demands
**GPT-5.6 (in the product):**
- Homepage: *"Create a project using Codex with GPT 5.6."* / *"Build something with Codex using GPT-5.6 that meets the challenge requirements."* **Documented publicly.**
- FAQ: **"Do I have to use GPT-5.6? Yes. Your project must use GPT-5.6. Judges will look for evidence of this in your demo video and code repository; make sure it's clearly referenced in your README."** **Documented publicly.**
- FAQ: *"You can use standard libraries, frameworks, and third-party SDKs as long as you're authorized to use them. But your project must meaningfully use both Codex and GPT-5.6 — they can't be incidental or decorative."* **Documented publicly.**

**Codex (in the BUILD — this is the exact distinction the rules draw):**
- FAQ: **"Do I have to use Codex? Yes. Codex usage is required and must be demonstrated in your submission including your text description, demo video and highlight where Codex accelerated your workflow, where you made key product, engineering, or design decisions in your README. You'll need to provide a /feedback Codex Session ID from the primary thread where you built your project, and specifically, your demo video must include audio explaining how you used Codex."** **Documented publicly.**
- FAQ: **"What counts as 'using Codex'? Building your project with Codex — whether through the ChatGPT app, the Codex CLI, the IDE extension, or the SDK. You'll verify this by submitting the /feedback Session ID from the main thread where you did the majority of your core development."** **Documented publicly.**
- FAQ quotes the (unfetchable) Build Week rules directly: *"Build any project with Codex and GPT 5.6 that fits into one of the following tracks"* and, for pre-existing projects, they *"must have been meaningfully extended using Codex and/or GPT-5.6 after the Submission Period start date."* **Documented publicly (as quoted in FAQ).**
- Multiple threads: submit the Session ID from the thread with the majority of core functionality; README should document Codex's contribution across the workflow. **Documented publicly.**

> **Audit conclusion on "must Codex be used in building the project? in the product?"** — **Building: YES, mandatory and verified via /feedback Session ID + video audio + README. In the product: NOT required** — the product must use **GPT-5.6**; Codex-in-product (as CounterLab claims with "Runtime Codex") is permitted but is **not** a substitute for build-time Codex proof. **Documented publicly.**

### 2.5 Submission fields & requirements (verbatim where possible)
Homepage "What to submit" (https://openai.devpost.com/, accessed 2026-07-19) — **all Documented publicly**:
1. *"**A working project.** Build something with Codex using GPT-5.6 that meets the challenge requirements."*
2. *"**A category.** Pick the category that fits best."* (FAQ: exactly **one** track; "each project can only be entered into one track".)
3. *"**A project description.** Tell us what you created and how it works."*
4. *"**A demo video.** Upload a <3-minute public YouTube video showing your project working, audio covering how you used Codex AND GPT-5.6"*
5. *"**Provide a URL to your code repository** for judging and testing. The repository must be either public (with relevant licensing) or private and shared with testing@devpost.com and build-week-event@openai.com."* plus:
   - *"Include a **README** with setup instructions, sample data (if needed), and clear guidance for running your project"*
   - *"Make sure to **highlight where Codex accelerated your workflow**, where key decisions were made and **how GPT-5.6 and Codex were used**. This is an important part of how judges evaluate technical implementation and quality of the idea."*
6. *"**/feedback Codex Session ID** where the majority of the core functionality where you built your Project, get the /feedback session ID and input it into your submission form"*
7. Plugin/devtool submissions only: installation instructions, supported platforms, and a no-rebuild testing path (demo instance, sandbox, or test account).

**Video requirements (FAQ, Documented publicly):** ≤3:00 ("judges are not required to watch beyond 3 minutes"); **public** YouTube; clear demo of the working project; **voiceover mandatory** ("A screencast with background music won't cut it… Judges need to hear, in your own words (or AI-assisted narration), what you built and how you built it."); must cover **what you built AND how you used Codex AND how you used GPT-5.6**; AI voice allowed; showing Codex UI not required but "a strong signal"; English or English translation.

**Judges' testing right (FAQ + 2025 rules template):** *"They may, but they're not required to. If they do, they'll use the demo link, sandbox, or test account you provide."* 2025 rules: *"Judges are not required to test the Project and may choose to judge based solely on the text description, images, and video provided in the Submission."* Project must remain available free of charge "until the Judging Period ends" (2025 template; Build Week wording Unverified but near-certainly same). Entrants may be required to give a **live demonstration** for verification (2025 template).

**Other template clauses (2025 doc — Unverified for Build Week, low risk of change):** functionality must match video/description; new-or-meaningfully-extended rule; third-party SDK/data must be authorized; multiple submissions allowed if substantially different; English language; original work/IP ownership; no Sponsor-funding conflicts; draft editing until deadline, no post-deadline edits (Build Week FAQ confirms both: "Can I edit my submission after I submit it? Yes." + "No changes… after the Submission Period ends on July 21 at 5:00 PM PT."); disqualification at Sponsor's sole discretion for tampering/unsportsmanlike conduct.

### 2.6 Tracks & Education-track-specific requirements
Tracks (Homepage, Documented publicly): Apps for Your Life · Work and Productivity · Developer Tools · **Education — "Projects that specifically push forward AI for education - either helping students, teachers, or educational organizations."**
No education-specific extra submission requirements are published; the only education-specific statement is FAQ: *"The Education track in particular welcomes projects from students, educators, and learners."* **Documented publicly.** Education-track entrants who are under 18 need a guardian-submitter (template rule, Unverified for Build Week).

### 2.7 Judging: criteria, weights, stages, tie-breaks, judges
**Criteria (Homepage, verbatim, Documented publicly — these are the ACTUAL current criteria):**
1. **Technological Implementation** — *"How thoroughly and skillfully does the project use Codex? Does the code reflect genuine effort and a working, non-trivial implementation?"*
2. **Design** — *"Does the project deliver a working or runnable project that has a complete, coherent product experience — not just a technical proof of concept?"*
3. **Potential Impact** — *"Does the project make a credible, specific case for solving a real problem for a real audience — and does the solution actually address that problem based on what's demonstrated?"*
4. **Quality of the Idea** — *"How creative and novel is the concept and does the project differ from existing concepts?"*

**Weights:** no numeric weights are published on the homepage/FAQ. The 2025 rules state "equally weighted criteria"; Devpost's platform default is 1–5 per criterion. **Unverified for Build Week; presumed equal weighting.**
**Stages:** 2025 template: Stage One pass/fail on baseline viability ("reasonably fits the theme and reasonably applies the required APIs/SDKs"); Stage Two scored on the criteria. **Unverified for Build Week (rules text unfetchable) but template-consistent.**
**Tie-break (2025 template, Unverified for Build Week):** tied submissions → highest score on the **first-listed** criterion wins; then next criterion; if tied on all, judges vote. If reused, that makes **Technological Implementation** the de-facto tiebreaker criterion for Build Week (it is listed first).
**Judges (Homepage + openai.com/build-week/, Documented publicly):** Thibault Sottiaux (Head of Product & Platform), Kath Korevec (Member of Product Staff), Tara Seshan (Member of Product Staff), **Leah Belsky (VP of Education)** — the education-relevant judge, Peter Steinberger (Member of Technical Staff, "Clawfather").

### 2.8 Prizes (Homepage, Documented publicly)
$100,000 total. Per track (×4): **1st $15,000 cash** + up to 2 DevDay/Exchange passes ($650 ea) + OpenAI Developers promotion + **meet the Codex Team** + 1-yr Pro account; **2nd $10,000 cash** + promotion + 1-yr Pro. CounterLab is competing for **1st Place | Education ($15,000)**.

---

## 3. CounterLab vs the ACTUAL judging criteria

Basis: briefing description (GPT-5.6 frames belief; Runtime Codex compiles bounded test plans; fixed deterministic kernels; frozen verifier; three evidence modes; notebook support for entity leakage/class imbalance) — **Unverified**; app **Could not test**. Criterion text: Documented publicly (§2.7).

### 3.1 Technological Implementation (also the likely tiebreaker)
- The criterion asks **first** about *Codex use in the build*. CounterLab's marketing leads with Codex as a **runtime product component** — a genuinely unusual, high-signal differentiator **if** evidenced, but it does not answer the criterion's question by itself. Score depends on: /feedback Session ID, README "Codex accelerated X / decided Y" narrative, video audio. **Unverified.**
- The four-layer architecture (LLM framing → bounded plans → deterministic kernels → frozen verifier) is a *non-trivial implementation* story that fits "genuine effort". Judges will probe whether determinism claims survive contact: GPT-5.6 output is stochastic, so the determinism claim must be visibly scoped to kernels/verifier or a hands-on judge can falsify it in two runs.
- GPT-5.6 evidence must be explicit (model identifier in UI/API calls/README) — FAQ: "Judges will look for evidence of this in your demo video and code repository."

### 3.2 Design
- "Complete, coherent product experience — not just a technical proof of concept": a live workers.dev URL + dedicated Judge Mode is the right shape. Risks: (a) if the learner-facing flow (upload notebook → chat → verdict) is rough while /judge is polished, it reads as PoC; (b) notebook upload + Python/sklearn analysis implies a real compute backend — a Cloudflare Worker alone cannot run scikit-learn; whatever serves "live analysis" must be reachable, fast (<~30 s for a demo), and free for judges.
- Education coherence: the UX must speak to students/teachers (coursework, grading, feedback), not only to ML engineers (CI jargon). Judge Leah Belsky (VP of Education) will notice.

### 3.3 Potential Impact
- "Credible, specific case… based on **what's demonstrated**": the submission must name the audience (ML students, TAs/instructors, bootcamps) and demonstrate a *real* catch (entity leakage or class imbalance in a real, documented notebook) with the evidence trail visible. Any claim shown only as text ("rejects confounded plans", "verified replay") without an artifact (screenshot, replay receipt, rejection transcript) scores weakly here because the criterion is explicitly demonstration-bound.

### 3.4 Quality of the Idea
- "CI for understanding — Ask like chat. Prove it like science." is a fresh framing; adjacent existing concepts: notebook auto-graders (nbgrader, otter-grader), LLM-as-judge graders, data-validation CI (Great Expectations), MOOC autograders. The novel delta = bounded plans + deterministic kernels + frozen verifier + evidence modes + replay — the submission should state this contrast explicitly, because the criterion asks "does the project differ from existing concepts?"

---

## 4. Judging simulation A — SUBMISSION-ONLY (judge never opens the app)

Given *"Judges are not required to test the Project and may choose to judge based solely on the text description, images, and video"* (template; FAQ confirms "They may, but they're not required to"), the modal judge sees: title, thumbnail, short description, screenshots, ≤3-min video, links. **What the page MUST communicate:**
1. One-sentence problem + audience (Education fit in the first 2 lines — Stage One theme check).
2. The three evidence modes and one concrete verdict story ("notebook X had entity leakage → CounterLab caught it, evidence: …").
3. GPT-5.6's role and Codex's dual role (build-time + runtime) — video voiceover must say both explicitly (hard requirement, §2.5).
4. Where to verify: live URL, **/judge** path with a 30-second scripted try-me, repo + README pointer, Session ID (form field).
5. Track justification sentence ("helps students/teachers …").

**Claims that NEED artifact proof on the page (else they read as marketing):**
| Claim | Minimum artifact |
|---|---|
| "fixed deterministic kernels" | side-by-side screenshot/GIF of two identical runs → identical results |
| "frozen verifier rejects confounded plans/unresolved bindings" | a visible rejection transcript with the reason code |
| "verified replay" | a replay receipt (hash/token) + what it proves |
| "supports documented notebooks (leakage, imbalance)" | the actual notebook names/datasets + verdicts |
| "Runtime Codex compiles bounded test plans" | a compiled plan excerpt with bounds visible |
| GPT-5.6 in product | model name in UI/README/API snippet |
| Codex in build | /feedback Session ID + README build narrative (cannot be screenshot-verified publicly — form field) |

## 5. Judging simulation B — HANDS-ON (judge opens the app unguided)
**Could not test** (app refused all fetches). Structural analysis of the risk surface:
- **Strongest-moment reachability:** the "wow" (a genuine leakage verdict with evidence) must be ≤3 clicks and <60 s from the landing page, with canned notebooks pre-loaded — a judge will not bring their own .ipynb. If /judge is that path, the landing page must visibly funnel to it.
- **Mismatch hunt (each is a live risk given the published claims):**
  1. *Determinism scope* — if the UI or copy implies end-to-end determinism while GPT-5.6 framing text varies between runs, a judge re-running sees drift → contradicts "Prove it like science".
  2. *Judge Mode divergence* — if /judge shows curated/golden outputs the main flow can't reproduce, video-vs-live consistency (a rules requirement: "must function as depicted in the video", template) is broken.
  3. *"Ask like chat"* — if there is no real conversational surface (only form fields), the chat claim is false-adjacent.
  4. *"live notebook analysis"* — Cloudflare Workers cannot run sklearn; if analysis actually posts to an external API/backend that is slow, keyed, or down, the mode fails in front of the judge. Any required API key = friction ≈ failure (judges won't supply one).
  5. *Evidence modes honesty* — "sample" vs "live" vs "verified replay" must be visually distinguishable; if a judge can't tell which mode produced a verdict, the epistemic claim (the whole product thesis) collapses.
  6. *Three-minute promise* — anything the video shows must exist at the same URL the judge opens.
- **Availability:** app must stay up, free, unauthenticated (or with provided test account) through end of judging (Aug 9 PDT per Devpost table; openai.com says Aug 7; keep until Aug 13). Live-demo verification may be requested (template rule).

---

## 6. Remaining time computation (verified deadline)
- Deadline: **Tuesday 2026-07-21 17:00 PDT** = 2026-07-22 00:00 UTC = 2026-07-22 08:00 GMT+8. (PDT = UTC−7 in July; weekday check: 2026-07-21 is a Tuesday ✓.)
- Canonical audit date 2026-07-19 (UTC):
  - From **2026-07-19 00:00 UTC** → **exactly 3 days 0 hours (72.0 h)**.
  - From actual audit moment 2026-07-18 20:24 UTC → **3 d 3 h 36 m (75.6 h)**.
  - In PT terms: from 2026-07-19 00:00 PDT → **2 d 17 h (65.0 h)**; from 2026-07-19 12:00 PDT → 2 d 5 h (53.0 h); from 2026-07-19 23:59 PDT → 1 d 17 h 1 m (~41.0 h).
- Working budget guidance: submission form + video upload + README finalization should be **done by 2026-07-21 12:00 PDT (≈T−5 h)**; the form allows editing until the deadline but nothing after (FAQ, Documented publicly).

---

## 7. Compliance risk register (P0 = DQ / failure-to-judge; P1 = material score damage; P2/P3 = minor)

**P0**
1. **/feedback Codex Session ID missing** — required form field; proves build-time Codex. (Could not test — form not public.)
2. **Video voiceover gap** — must audibly cover what was built AND Codex use AND GPT-5.6 use; screencast-with-music explicitly fails. (Could not test.)
3. **Codex-in-build vs Codex-in-product confusion** — "Runtime Codex" does not satisfy the build-time requirement; team must still document the build thread. (Documented-public requirement; team compliance Unverified.)
4. **GPT-5.6 not evidenced in repo/video/README** — eligibility-level requirement ("can't be incidental or decorative"). (Could not test.)
5. **Repo not public-or-shared** with testing@devpost.com + build-week-event@openai.com, or README missing setup/testing/sample data. (Could not test.)
6. **App down/broken for judges** or gated behind keys the judge doesn't have — functionality must match depiction; availability until judging ends. (Could not test.)
7. **Missing the deadline** — T−72 h from 2026-07-19 00:00 UTC; no post-deadline edits. (Documented publicly.)

**P1**
8. Submission page doesn't stand alone (§4) — default judging path is submission-only.
9. Track-fit ambiguity (Developer Tools flavor vs Education) — Stage One theme check; Education judge expectations.
10. README lacks "where Codex accelerated workflow / key decisions / how GPT-5.6 used" — explicitly feeds two criteria.
11. Video >3:00, unlisted-not-public, non-English w/o translation, third-party music/trademarks.
12. Pre-existing project without "what's new + timestamped evidence of Codex/GPT-5.6 during the period" (if CounterLab predates Jul 13).
13. Determinism over-claim falsifiable by re-running (§5.1).
14. Claims without artifacts (§4 table) — Potential Impact is demonstration-bound.

**P2**
15. No license file in public repo ("public (with relevant licensing)"; OSS/Apache "encouraged" per template).
16. /judge discoverability & divergence from main flow.
17. Multiple-track or duplicate submissions (one track only; uniqueness rule).
18. Team eligibility loose ends (guardian submission if <18; sanctioned-country residence; no judge/employee conflicts).
19. Judging-end date ambiguity (Aug 7 vs Aug 9) — keep app alive to Aug 13.

**P3**
20. Hackathon-side stale /rules + stale project-gallery (2025 content live at the canonical URLs on 2026-07-19) — not CounterLab's fault; rely on homepage + FAQ + dates pages; request written clarification for any ambiguity per the rules' clarification clause.
21. Codex-credit window closed (Jul 17) — prepaid credits just stop; disable auto top-up to avoid charges (FAQ).

---

## 8. Facts I could NOT verify
1. Build Week Official Rules **full text** (canonical /rules URL served the 2025 Open Model Hackathon document on 2026-07-19): exact Build Week wording for eligibility exclusions, functionality/testing clauses, IP, disqualification, tie-break, weighting ("equally weighted"), prize verification — inferred from the 2025 template + FAQ quotes, labeled per-item above.
2. Everything about the CounterLab app, /judge, its video, repo, README, Session ID, and its Devpost project page (all unreachable or not yet public).
3. Whether criteria carry explicit weights for Build Week (none published).
4. Whether Stage One/Stage Two and the criterion-order tie-break apply to Build Week (template inference only).
5. Exact submission-form field list (requires an entrant account; reconstructed from homepage + FAQ).
6. Team composition/eligibility of the CounterLab entrants.
