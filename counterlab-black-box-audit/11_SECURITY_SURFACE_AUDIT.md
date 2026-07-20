# 11 — Public Security-Surface Audit (Agent 12)

Target: https://counterlab.cserules.workers.dev/ (Cloudflare Workers)
Scope: non-destructive black-box only; inert strings; no auth bypass, no flooding, no payload execution.
Method: browser-driven journey (2 full sessions created), unauthenticated GET API reads, 2 artifact downloads inspected locally, 12 error probes.
Test sessions created (evidence):
- `session_522276e6-975b-4c54-aa65-266545b035db` (full loop → proof page + downloads)
- `session_3cae09ab-31a2-4afe-9933-aefcaf787ae3` (traversal/long-string claim)

---

## 1. Executive verdict

**No exploitable vulnerability was demonstrated.** Output escaping is correct on every observed surface; no secrets, keys, or stack traces leak; identifiers are UUIDv4. The substantive findings are architectural/disclosure issues a security-minded judge would flag: (a) the entire product runs on **unauthenticated bearer-capability URLs** with no expiry/revocation observed, (b) **arbitrary learner text is stored verbatim and embedded into HMAC-signed proof bundles** with no length/content limits (currently safe only because rendering escapes), (c) **/api/health and the replay API disclose backend configuration and toolchain versions**, and (d) **proof timestamps are future-dated (server clock reads 2026)**, which weakens the evidentiary value of the product's core "proof" claims.

---

## 2. Checklist table

| # | Check | Result | Risk |
|---|-------|--------|------|
| 1.1 | HTML injection in claim (`<b>`, `<em>`, `<u>`, `<img onerror>`, `<svg/onload>`) | Stored verbatim; rendered as literal text everywhere observed | P3 (latent stored-XSS if a future render path changes) |
| 1.2 | `<script>alert(1)</script>` as literal claim text | Stored verbatim; never executed; displayed as text | P3 |
| 1.3 | Markdown (`**bold**`, `[link](url)`, `# h1`) | Not rendered; shown literally (product has no markdown renderer) | Informational |
| 1.4 | URL text (`https://example.com/...`) | Shown as text; no auto-linkification observed | Informational |
| 1.5 | `javascript:void(0)` as text | Shown as text; never became a live link | Informational |
| 1.6 | Template-ish strings (`{{7*7}}`, `${7*7}`, `<%= 7*7 %>`) | Not evaluated; shown literally | Informational |
| 1.7 | Very long claim (~1500 chars) | **Partially tested** — 296–360 chars accepted with no visible cap; browser_input tooling capped further input (~300 chars/call). No maxlength observed up to 360 chars | P3 (no length limit found so far) |
| 1.8 | Traversal/HTML chars in claim (`../../etc/passwd`, `<html><body>`) | Accepted, stored verbatim, rendered as text; downloads unaffected | P3 |
| 1.9 | Mental-model ("Your rule") free-text injection | Same behaviour as claim: stored verbatim, rendered literal in Apply + Reasoning Diff | P3 |
| 1.10 | Injection into Studio history names | History uses notebook filename, not claim text → no vector | OK |
| 2.1 | Error text on bogus IDs | Generic ("Session not found: X", "Replay X was not found"); ID echoed as escaped text | OK (minor terminology bugs) |
| 2.2 | Stack traces / framework fingerprints | None observed in any reachable error | OK |
| 2.3 | Internal state names | Exposed in API data (`state: BELIEF_TEST_PROPOSED`, event kinds, invariant names) — by-design transparency | P3 |
| 3.1 | UUID predictability | `session_<UUIDv4>`; version/variant bits correct; qualitatively random | OK |
| 3.2 | Bearer-capability URLs | Confirmed: no auth anywhere; URL holder reads claim, confidence, artifacts, signed bundle | **P2** |
| 3.3 | Session expiry | None observable in-session (reported ≥6h server-side) — Could not test | Unverified |
| 3.4 | /judge auth | None required; public | By design (P3 disclosure notes) |
| 4.1 | API keys/secrets/tokens in responses | None observed in any API/page/artifact | OK |
| 4.2 | HMAC key material | Absent; only `signature` + `contentHash` present in bundle | OK (positive) |
| 4.3 | Internal hostnames/paths | `/workspace/public_tests.py`, `replays/leakage-01/patch/...`, `Path('../public/customer_churn.csv')` in sample cell | P3 |
| 4.4 | Commit hashes / versions | `gpt-5.6-sol`, `codex-cli 0.144.4`, kernel `0.1.0`, verifier `leakage-verifier-v1`, commits `4f2f6472…`, `1050fa76…` | P3 |
| 4.5 | /api/health verbosity | `platform`, `liveGpt/liveCodex/liveKernel/sandbox: configured`, `requestId` | P3 |
| 5.1 | PII collection | None requested; claim text is the only user data (free text could contain PII; no warning) | P3 |
| 5.2 | Cookies | Could not test (no header/DevTools tooling) | Could not test |
| 5.3 | Client-side storage (Recent sessions) | Unverified (presumed localStorage) | Unverified |
| 6.1 | Proof-record download | Valid JSON (34.8 KB), schemaVersion 1, full event chain + HMAC signature; opens/downloads normally | OK |
| 6.2 | Repaired-notebook download | Valid nbformat 4.5 JSON; **contains no learner text** (grep-verified) | OK (positive) |
| 6.3 | Filename control via claim | Claim with `../../` + `<html>` did not affect download behaviour; suggested filename not observable (Playwright GUID); Content-Disposition Could not test | Unverified (no indication of control) |
| 7.1 | /judge extra disclosure | "Deployed live authority is configured"; model names; reproduction script names | P3 |
| 8.1 | CSP / CORS / security headers | Could not test (no header tooling); no behaviour implying permissive CORS observed | Unverified |

---

## 3. Injection-rendering results (per surface)

Payload battery submitted as learner claim (session 1) and mental-model revision (session 1), and traversal/long claim (session 2):

`<b>test123</b> <em>x</em> <u>under</u> **boldmd** [linktext](https://example.com) # heading1 <script>alert(1)</script> <img src=x onerror=void(0)> <svg/onload=void(0)> https://example.com/path?q=1 javascript:void(0) {{7*7}} ${7*7} <%= 7*7 %> \`backtick\` "quote" 'apos' &amp; &lt;tag&gt;` — and separately `LONGSTR-START ../../etc/passwd <html><body>…</body></html>`.

| Surface | Verdict | Evidence |
|---------|---------|----------|
| Session page — Question step echo | **Escaped** (literal text) | agent12_claim_submitted_11.png |
| Session page — Prediction step "Your claim" | **Escaped** | agent12_prediction_locked_14.png |
| Session page — Apply step "Your rule" | **Escaped** | agent12_transfer_checked_19.png |
| Proof page — "Before and after reasoning" | **Escaped** (visually confirmed tags render as text) | agent12_proof_full_21.png |
| Reasoning Diff table (Belief dimension) | **Escaped** | agent12_proof_full_21.png |
| API JSON `/api/sessions/<id>` | Raw verbatim string (expected; JSON-encoded) | agent12_api_session_12.png |
| Proof bundle JSON (downloaded) | Verbatim in `beliefTest.learnerClaim`, `learnerRevision.text`, `reasoningDiff.dimensions.belief.before` | /tmp artifact inspection (Step 44) |
| Repaired notebook (.ipynb) | **Payload absent** — no learner text propagates into the executable artifact | grep-verified (Step 48) |
| Studio "Recent sessions" names | Uses notebook filename; claim never appears | agent12_studio_history_33.png |
| Error echoes (`Session not found: <id>`) | Echoed as escaped text | agent12_err_session_bogus_23.png |

**What renders:** nothing — no HTML, no markdown, no links, no template evaluation. Everything is literal text.
**What is stored:** everything — verbatim, unsanitized, unbounded (tested to 360 chars).
**Residual risk:** the defence is a single layer (framework default escaping). Any future `dangerouslySetInnerHTML`/markdown export/PDF generator ingest path becomes stored XSS. Signed bundles permanently carry arbitrary learner HTML-like content (content-integrity and moderation gap, not an exploit today).

---

## 4. Error-leakage catalog

| Probe | Status | Body / behaviour | Leakage |
|-------|--------|------------------|---------|
| `/session/bogus` | 200 (SPA) | "Session not found: bogus" over homepage | None (ID echoed, escaped) |
| `/session/123` | 200 (SPA) | "Session not found: 123" | None |
| `/session/%3Cb%3Einj-test%3C%2Fb%3E` | 200 | Silent redirect to `/` | None |
| `/session/..%2F..%2Fetc` | **400** | Body not observable via tool | Server-side rejection of encoded traversal — good |
| `/proof/bogus` | 200 (SPA) | "Session not found: bogus" | Terminology mismatch (says Session on Proof route) — P3 UX |
| `/replay/bogus` | 200 (SPA) | "Replay bogus was not found"; stale "Step 3 of 6" progress shown | Minor UI inconsistency — P3 |
| `/api/sessions/bogus` | **404** | Body not observable; no stack trace rendered | None observed |
| `/api/sessions/session_00000000-0000-0000-0000-000000000000` | **404** | Same | None |
| `/api/replays/bogus` | **404** | Same | None |
| `/api/nonexistent-endpoint` | **404** | Same | None |
| `/nonexistent-page-xyz` | 200 | Redirect to `/` (SPA fallback) | None |
| State-transition save (twice) | — | "We could not save that step. CounterLab could not reach the API" | Generic; transient reliability issue — P3 |

Internal state names visible **in data** (not errors): `INGESTED`, `BELIEF_TEST_PROPOSED`, event kinds (`belief_test.proposed`, `patch.verified`), verifier invariants (`forged-canonical-hash`, `network-probe-escaped`, …), `modelId: leakage-customer-churn-belief-v1`. No request IDs except `/api/health` `requestId` (16-hex). **No stack traces, no Worker/Hono/itty-router fingerprints observed.**

---

## 5. Session & identifier security model

- **ID format:** `session_<uuidv4>` — both observed sessions have version-4 and correct variant bits; 122 bits entropy; not predictable. Proof page reuses the same session ID (`/proof/<sessionId>`); replay IDs are human-readable slugs (`leakage-01`) for curated content only.
- **Bearer-capability model (confirmed):** zero authentication on any route or API. Anyone holding a session URL can read the learner's claim, sealed prediction + confidence, belief-test structure, artifact hashes, full event chain, and download the signed proof bundle and repaired notebook. There is no logout/revoke/expire affordance in the UI.
- **Impact framing:** this is a no-account education demo, so the realistic exposure is low — but the *product's own trust story* ("your learning, proven") means a shared proof link also shares the learner's raw (possibly embarrassing) "before" reasoning verbatim. A learner who types anything identifying into the claim box publishes it to anyone with the link, permanently (no deletion path observed).
- **Cross-tab/confusion:** sessions are URL-scoped; multiple sessions coexist without isolation indicators beyond the Studio list. Risk of a learner pasting the wrong link is inherent to capability URLs.
- **Expiry:** none observable; reported server-side ≥6h. Could not test.

---

## 6. Client-side exposure scan

| Item | Where | Assessment |
|------|-------|------------|
| `platform: cloudflare-workers`, `liveGpt/liveCodex/liveKernel/sandbox: configured`, `requestId` | `/api/health` | Confirms live LLM credentials exist server-side; fingerprinting aid — P3 |
| `modelId: gpt-5.6-sol`, `codexVersion: codex-cli 0.144.4`, `repositoryCommitAtRun`, `publicSdkDocumentationHash` | `/api/replays/leakage-01`, /judge, replay UI | Version/commit fingerprinting; mostly intentional transparency — P3 |
| Kernel `0.1.0`, verifier `leakage-verifier-v1`, template commit `1050fa76…` | proof bundle `versions` | P3 |
| Internal paths `/workspace/public_tests.py`, `replays/leakage-01/patch/*.json` | bundle, replay API | P3 |
| `generationIsolation: PARTIAL — "host App Server process read global skill files…"` | replay API | **Honest security limitation disclosure** (positive transparency; also admits generation-time isolation is unproven) |
| HMAC signing key | — | **Not present anywhere**; bundle carries only `signature`, `contentHash`, `eventChainHead` — positive |
| API keys / tokens / secrets | — | **None observed** in any page, API response, or artifact |
| Source maps / env dumps | — | Could not test (no source/header tooling) |
| Server clock | all timestamps `2026-07-*`; replay "Recorded 2026/7/14" | Future-dated timestamps inside **signed** bundles weaken timestamp evidentiary value — P3 |

---

## 7. Storage & privacy

- Server-side persists: session, claim text, sealed prediction + confidence, mental-model revision, event chain, artifact hashes, signed bundle — all readable by URL holder, no account, no deletion affordance observed.
- The only learner-identifying datum is whatever the learner types into free-text fields; there is no warning that claim text becomes part of a downloadable, signed, shareable artifact.
- Client-side: Studio "Recent sessions" survives navigation → presumed localStorage (Unverified). Cookies: Could not test. Clipboard/referrer behaviours: Could not test.

---

## 8. Download integrity

- Proof record: JSON, 34,841 bytes, parses cleanly, `integrity.signature` present (hmac-sha256), no key material.
- Repaired notebook: valid nbformat 4.5, 5 cells, counterlab metadata (fixtureSeed, resultHash, privacyClass schema annotations), **no learner-controlled strings** — the patch pipeline does not carry claim text into executable artifacts (verified by grep: `SEC-TEST`, `<script>`, `<b>`, `onerror`, `javascript:`, `{{7`, `mm-bold` all absent).
- Claim containing `../../etc/passwd` and `<html><body>` did not alter download behaviour. Suggested filenames/Content-Disposition/MIME headers: **Could not test** (browser downloads surfaced as Playwright GUID files; content sniffed as JSON via `file(1)`).

---

## 9. Judge-mode exposure

`/judge` is public without auth (expected — it is the evaluator dossier). Beyond marketing it discloses: "Deployed live authority is configured" (live-credential status), model/tool names, replay commit hash, reproduction script paths, and the honest "Recorded 2026/7/14 … legacy v1 replay" note. Disclosure value to an attacker is low; to a judge it is useful transparency. P3.

---

## 10. Remediation list (priority order)

1. **P2 — Capability-URL hygiene:** document the bearer-link model in-product ("anyone with this link can read this session"); add a delete/expire affordance; consider short TTL + separate, non-reused proof IDs; warn learners not to paste secrets/PII into claim fields.
2. **P2 — Bound and normalize learner text at ingest:** enforce a length cap (e.g., 500–1000 chars) and reject/control C0 control chars; keep storing raw text but add a server-side allowlist-neutral normalization step so safety does not rest solely on client-side escaping; treat the signed bundle as a public document (embed a content disclaimer or hash-only learner text).
3. **P3 — Trim /api/health:** return `{ok:true}` (and requestId) publicly; move `liveGpt/liveCodex/sandbox` config status behind an authenticated ops route.
4. **P3 — Fix the clock or label it:** future-dated (2026) timestamps in signed artifacts should be corrected, or the demo should label timestamps as simulated; a proof product's timestamps are part of its evidence.
5. **P3 — Fix evidence-panel consistency:** "0 events"/"No activity evidence yet" and "Boundary: Locked until verification" shown on a completed proof page contradict the product's core claim; replay-not-found shows stale step progress; `/proof` errors say "Session not found".
6. **P3 — Version/commit disclosure:** acceptable for a transparency-first demo; if hardened, pin disclosures to the replay dossier and drop commit hashes from per-session bundles.
7. **P3 — Reliability:** two transient "could not reach the API" save failures in one journey; add client retry with backoff.
8. **Unverified — headers:** set and verify CSP (`default-src 'self'`, no `unsafe-inline`), `X-Content-Type-Options: nosniff`, restrictive `Content-Disposition` filenames on downloads, and deny-all CORS unless needed.

---

## 11. Could-not-test register

CSP/CORS/all response headers; cookies; suggested download filenames & Content-Disposition; MIME via headers (content verified as JSON only); upload validation (file inputs not settable); ~1500-char claim (tooling capped input ≈300 chars/call — tested to 360 chars); session expiry ≥6h; cross-tab storage mechanics; rate limiting (no flooding permitted); POST/PATCH API surface beyond UI-driven journey (read-only GETs + UI actions only).
