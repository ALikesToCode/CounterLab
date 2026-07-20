# 17 — BLACK-BOX LIMITATIONS (honest scope statement)

This audit was strictly black-box: no repository, source, Cloudflare dashboard, logs, secrets, databases, fixtures, or unpublished submission materials. Every claim in this audit is labelled with an evidence class, and inferences are never presented as facts. The following constraints bound what could be established on 2026-07-19.

## 1. Tooling-imposed limits (environment)
- **No file-upload capability in the automation browser.** Consequence: the entire genuinely-live leg — notebook upload, live GPT-5.6 framing, live Codex plan compilation, live kernel runs, unsupported-notebook refusal, file-type validation — is **Could not test**. MB-002's P0 applies to the *no-upload* live entry, which is verified; post-upload behaviour is unknown. All conclusions about 'decorative Codex' (MB-004) and 'templated framing' (MB-003) are scoped to **publicly reachable paths**; a working live path could exist behind the file input we could not operate. This is the audit's single largest blind spot.
- **No DevTools/console/HAR.** Network evidence was gathered from visible page states, raw `/api/*` JSON readable in the browser, and server-side event timestamps. HTTP headers, exact status codes, CORS/CSP, cookies, cache behaviour, POST/PUT shapes: **Unverified/Could not test** (not assumed bad — simply unknown).
- **No direct outbound HTTP from the audit shell** (egress firewall); fetches went through the browser or the web-reading gateway, which intermittently refused the target domain ('audit rejected').
- **Fixed 1920×1080 viewport.** All responsive findings (MB-032) are structural inferences from pixel measurements, clearly labelled as such; no real mobile viewport was tested. **No screen reader, keyboard-event tooling, or axe** — accessibility findings rest on element-list semantics and pixel-measured contrast; live regions, focus traps, reduced motion remain Unverified.
- **Single browser context** — no true multi-tab/concurrency testing; rapid double-click limited by tool latency (~30 s/click); input strings capped (~1.8k chars).

## 2. Target-imposed limits
- **Submission materials are not public**: Devpost page, video, repository, README, /feedback Session ID. All compliance findings (MB-C01…C13) are requirement-side facts (documented rules) × unverified product-side status. They are risks, not established violations.
- **Devpost /rules and /project-gallery served stale 2025 content** at audit time (upstream defect, MB-C13); Build Week eligibility/tie-break wording was reconstructed from the 2025 template + FAQ and is labelled per-item.
- **No second Subject Pack (class imbalance) was reachable** without an upload; only entity-leakage evidence was exercised.
- **The 'Build Week field' is unknowable** until the gallery opens after the deadline — novelty claims are vs public products/prior art, not vs fellow submissions.

## 3. Methodological limits
- **Timing figures** from browser tooling are upper bounds (tool overhead ~30–40 s/call); server-side phase timings come from event timestamps inside the app's own event log and are trustworthy as orders of magnitude, not benchmarks.
- **HMAC signatures are declared, not verified** — no public key/verification endpoint exists; chain integrity and artifact hashes WERE recomputed locally and match. 'Signed' throughout means 'declared HMAC-signed; unverifiable black-box'.
- **Security findings are surface-level by design** (inert strings only, no exploitation, no flooding). Absence of a finding is not absence of vulnerability.
- **Score numbers are judgment, not measurement** — mitigated by three independent scorers converging at 73/100 (Agent 3, Agent 16 blind, Commander synthesis), but ±3 points of subjectivity remains.
- **Single-day audit** — behaviour may change under judging load; transient failures (2 observed save errors) may be load-sensitive.

## 4. What we deliberately did NOT do
No auth bypass, no credential testing, no brute force beyond 2–3 obviously-invalid IDs, no payload execution, no DoS/rate testing, no upload of real/private data, no Devpost modification. All test claims were synthetic.

## 5. Highest-value verifications that require source access (handoff to implementation swarm)
1. Whether live uploaded-notebook sessions produce genuinely input-sensitive GPT-5.6 framing and real Codex compilation (falsifies or confirms MB-003/MB-004 at full severity).
2. Root cause of the dual result_hash domains (MB-009) and the empty evidence drawer (MB-005).
3. The intended semantics of the transfer gate vs its UI glyphs (MB-006).
4. HMAC key custody and the verifier's trust-domain separation (MB-036).
5. Build-time Codex usage evidence for the Devpost requirement (MB-C01/C04).
