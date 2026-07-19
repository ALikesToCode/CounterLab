# Backend, reliability, and performance

## Verdict

The backend is considerably more production-minded than the public evidence currently proves. D1 state, private R2 objects, signed one-job runner tokens, optimistic transitions, append-only events, cursor reconnect, cancellation, callback idempotency, immutable result authority, fixed transfer, and exact-byte proof/patch binding are implemented and well tested.

The largest reliability problem is release evidence: Worker #82 is healthy, but cannot be bound to the audited source/container or to a completed exact-version live matrix. The largest operational architecture risk is unauthenticated cost-bearing API access with no repository-visible caller rate/budget control. Do not interpret either as a confirmed public outage.

## Public baseline

- Worker: `bef5edb7-6a76-4c72-94be-fcb2b94e668d` (#82), deployment `dad4cd71-3dcd-4b00-a1b6-d16068d53c81`, 100% traffic, created 2026-07-18 18:12:53 UTC.
- `GET /ready`: 200; analyst, persistence, private storage, runner, signing all `true`.
- `GET /api/health`: 200; sample/replay available; GPT/Codex/kernel/sandbox configured.
- Five sequential health requests: 0.3852–0.4158 s total, median approximately 0.4075 s from the audit region.
- Public GET route browser audit: no unexpected console/page/request failures.

These results show readiness, not a completed notebook run.

## API inventory

| Area                 | Endpoints/capability                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| Readiness/operations | `/ready`, `/api/health`, secret-protected `/api/admin/diagnostics`                                             |
| Artifact intake      | create/retrieve artifact, multipart notebook validation and private storage                                    |
| Sessions             | sample/live/replay creation, get state, evidence events                                                        |
| Belief/Prediction    | proposal preview, create/confirm Belief Spec, immutable Prediction                                             |
| Compile/runner       | compile, input/source/start/events/candidate/outputs/resume/callback, public SSE/result/cancel                 |
| Experiment           | fixed run, bounded interactive run, Boundary run/read                                                          |
| Learning             | revision, deterministic transfer, interaction events                                                           |
| Repair/proof         | patch compile/download, Reasoning Diff, Proof Bundle compatibility, Proof Capsule, replay publication/download |

Runner-only routes authenticate a purpose-specific P-256 token. Learner routes intentionally require no account and use opaque session IDs as bearer capabilities.

## Reliability controls verified in source/tests

- D1 repositories for sessions, runner jobs, and append-only compiler/evidence events.
- Private R2 for raw artifacts, immutable authority, patched copies, and Proof Capsules.
- Signed tokens bind job, purpose, input/output lineage, callback origin, state version, and expiry.
- Callback conflicts and duplicates fail closed; retries distinguish ambiguous from definitive failures.
- Cursor-addressable event streams sanitize public payloads and support reconnect.
- Cancellation terminalizes authority before best-effort process cleanup.
- Worker reconstructs stored compile/run/boundary/patch authority and re-hashes outputs before state advance.
- Prediction is immutable; illegal transitions, stale inputs, mismatched bindings, duplicate submissions, and partial authority are rejected.
- Failed/rejected compile releases no result; failed transfer cannot create patch authority.
- Patch applies to a copy and verifies scope, dependencies, recomputed results, reproducibility, and unrelated bytes.

## Production risks

### Exact-release qualification

The current deployment metadata exposes no source commit. Repository smoke evidence names older Workers: a full seven-stage smoke for `7c67c0f4…` and a later recorded failure for `89db95bc…`. Neither qualifies #82. README/Progress also say the best local v6.1 branch and public release are distinct. Freeze one build, record Worker/source/container identities, then run both untouched supported notebooks plus sample, replay, reconnect/cancel, downloads, proof, and no-secret checks without redeploying between them.

### Abuse and denial-of-wallet

Artifact, live-session, GPT preview/proposal, compile, run, Boundary, transfer, and patch routes have no app-level authentication. No Cloudflare rate-limit binding/middleware, Turnstile, per-IP/session quota, or global cost circuit breaker appears in repository configuration. `max_instances: 10` is a Container concurrency ceiling, not a caller quota. External zone rules were not inspectable, so the finding is “no repository-visible control,” not proof that no edge rule exists.

Smallest acceptable protection: low-friction burst/sustained quotas on upload and expensive transitions, typed 429/Retry-After, idempotent retry accounting, and a global daily runner/model circuit breaker that leaves sample/replay available.

### Multipart buffering

`POST /api/artifacts` optionally rejects an excessive declared content length, then calls `formData()` before checking `file.size`. A chunked/absent-length body can therefore be materialized before the authoritative notebook limit. Platform request caps mitigate the maximum; no oversized traffic was sent. Require a safe declared length or a bounded streaming parser.

### Session lifecycle

`Start over` clears local checkpoints without invoking the dedicated job-cancel endpoint. During active compile/patch this can orphan work and discard the learner’s recovery handle. Cancel first or preserve a resumable background-job reference.

Opaque UUID session URLs provide low guessability, but possession grants session/proof/mutation/download capability and the privacy model is not explained. Treat the URL explicitly as a private bearer link, define retention/revocation, or add a second HttpOnly action secret.

## Failure-state assessment

| Failure                           | Implementation                                                             | Public audit                                                         |
| --------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Missing model key/runner          | Capability health and typed unavailable state; sample/replay remain honest | Ready state only observed                                            |
| Invalid model output              | Zod/schema/binding rejection; bounded retry                                | Verified in tests                                                    |
| Codex invalid/tool output         | Protocol error; no authoritative materialization                           | Verified in source/tests; managed child-process slice partly blocked |
| Runner timeout/disconnect         | Timeout, cursor reconnect, result fetch, bounded retry                     | Source/tests; not induced publicly                                   |
| Duplicate compile/cancel/callback | Idempotency and conflict checks                                            | API tests passed                                                     |
| Partial R2/D1 authority           | Reconstruction/hashes fail closed                                          | API/authority tests passed                                           |
| Transfer fail                     | Deterministic feedback and patch lock                                      | Source/tests                                                         |
| Proof/patch mismatch              | Exact bytes and hash-bound provenance rejected                             | Source/tests                                                         |
| Missing session/deep link         | API 404 plus transient landing toast                                       | Observed live; recovery is weak                                      |

## Performance and caching

Measured browser performance is good: normal cold LCP 1.0–1.6 s on landing, 1.064 s on Judge, 1.144 s on replay; throttled landing/Judge LCP under 1.9 s; low CLS. Initial transfer is roughly 297 KiB. The single app JavaScript is approximately 599 KiB decoded, and every route pays for it, but it did not cause poor observed LCP.

Hashed assets use `max-age=0, must-revalidate`, and the warm run transferred essentially the same bytes. Give content-hashed JS/CSS/fonts long immutable caching while keeping HTML revalidated. Route-level splitting is optional only after the exact release is stable.

## Observability and rollback

Strengths include request IDs, append-only public events, sanitized operational diagnostics behind a constant-time bearer secret, release receipts, source/image labels in the runner Dockerfile, SBOM/VEX evidence, and historical smoke JSON.

Gaps:

- Current Wrangler deployment metadata did not expose source/image identity.
- No hosted CI workflow was found; clean release checks depend on manual execution.
- Current documentation was not updated for Worker #82.
- Container application/version metadata could not be read with the available Cloudflare authorization, so exact rollback pairing was not verified.

## Measured verification

- Authority slice: 13 files, 106/106 tests passed.
- Worker/API/UI slice: 4 files, 124/124 passed.
- Python kernel/runner: 227/231 passed; four failures were managed-sandbox loopback/permission-mode limitations, not classified as regressions.
- Root, web, and Worker TypeScript checks: passed.
- Secret scan: 1,085 repository files passed.
- Exact commands and failure text: `evidence/test-results/agent-repo-technical.md`.

## Limitations

No load, quota exhaustion, denial-of-service, oversized upload, production write, live runner interruption, D1/R2 fault injection, or rollback was attempted. External Cloudflare rate rules and current Container version/digest remain unverified.
