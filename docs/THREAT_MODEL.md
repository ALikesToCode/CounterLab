# Threat model

## Assets

Server credentials, uploaded notebook bytes, Artifact Manifests, learner
claims/predictions, generated code, hidden verifier/mutations, held-out fixtures,
canonical results, patches, event chain, and Proof Bundles.

## Trust boundaries

1. Browser to Worker API.
2. Untrusted notebook bytes to parser.
3. Sanitized evidence to GPT.
4. Approved contract to Codex App Server.
5. Generated files to host policy and Docker.
6. Candidate declaration to fixed kernel/verifier.
7. Worker-issued job capability to the process-capable runner.
8. Stored events to replay/browser.

## Enforced controls

- File extension, MIME, and central size limits; bounded JSON bodies.
- No notebook execution at intake; active outputs omitted.
- Random server IDs, safe basenames, path containment, private R2 objects.
- Server-only API key and optional Responses base URL; neither is returned to
  the browser, stored in evidence, or forwarded to Codex. GPT receives no raw
  rows, secrets, or client paths.
- Zod validation and evidence-reference resolution for model output.
- Hash-bound learner preview/approval before a live analyst call, with an extra
  confirmation for sensitive-looking excerpts.
- Legal server-side state transitions and immutable prediction hash.
- Exact generated file set, regular-file/symlink checks, JSON depth/size limits.
- Adapter AST denial of filesystem/environment/dynamic import/eval/exec,
  subprocess, sockets/HTTP, reflection escape, and metric implementations.
- Candidate Docker: no network, non-root, read-only root/workspace, dropped
  capabilities, no-new-privileges, bounded tmpfs, CPU/memory/process/wall/file
  and output limits, no credentials.
- Hidden verifier, mutation catalogue, held-out fixtures, and host kernel are not
  candidate mounts.
- Browser compiler events are schema-validated, bounded, secret-redacted, and
  stripped of local paths; reasoning and raw agent prose are dropped.
- Append-only D1 event table and canonical hash chain; optional HMAC.
- Release secret-pattern scan.
- Secret-protected, identifier-free aggregate operational diagnostics; the
  route is absent when its secret is not configured.

The custom Responses base URL is operator-controlled configuration. CounterLab
requires HTTPS except for loopback development, rejects embedded credentials,
query strings, and fragments, and canonicalizes only host-root, `/v1`, or full
`/v1/responses` forms. This prevents accidental path ambiguity but does not
establish trust in an endpoint selected by the operator.

## Verified attacks

The published mutation suite attacks overlap, stale/hardcoded metrics,
intervention drift, retained identity, row-order sensitivity, forged hashes,
stale chart series, escaped network/resource evidence, nondiscriminating plans,
hidden mounts, and unsupported-case acceptance. All 12 are detected.

## Known limitations

The authenticated host App Server run inspected global skill files outside the
generation directory. A prompt and `workspace-write` policy do not prove read
isolation. Therefore generation-time hidden-verifier unreadability is `PARTIAL`.
Post-generation candidate execution is separately OS-constrained and verified;
that does not retroactively prove generation isolation.

Current code prevents another unisolated launch. A real Bubblewrap probe creates
a root containing only `/usr` and the exact generation workspace and verifies
that repository, held-out, and hidden-verifier host paths resolve as missing.
This proves the mount shape, not authenticated end-to-end generation: stable
Codex authentication is file-backed and would be readable to model-invoked
commands if mounted into that namespace.

Hosted source-free Plans remove arbitrary model-authored Python from the public
critical path, but the Container runtime, Codex CLI, configured model endpoint,
and Cloudflare control plane remain operational dependencies. Short-lived runner
tokens narrow authority; they do not make the system formally capability-secure.

Runner capabilities are signed with a Worker-held P-256 private key and verified
with a public key in the Container. Tokens bind job, purpose, input/output
lineage, callback, state version, origin, and expiry. Ambiguous dispatches may
redeliver only the same job authority; definitive 4xx rejections are not retried.
Cancellation terminalizes authority before best-effort process cleanup, and
callbacks/events remain idempotent and cursor-addressable.

The sensitive-looking excerpt detector is deliberately conservative and cannot
guarantee data classification. Learners remain responsible for reviewing the
exact sanitized preview before approving a live request.

Docker controls for the advanced local proof are not a formal sandbox proof and
inherit host kernel/runtime risk. Cloudflare account security, local machine
compromise, denial of service beyond configured limits, and side channels are
outside the hackathon guarantee. An unsigned Proof Bundle detects internal
inconsistency but is not a third-party signature. Notebook source shapes or
estimators outside a concept pack's registered patch transformation receive an
honest patch refusal even when intake and the fixed lab are supported.

## Highest-priority hardening

Keep the historical local replay labelled `PARTIAL`; do not spend the release
critical path pretending it is the hosted runner. For hosted execution, add and
test phase-specific outbound filtering after model compilation, non-root fixed
children with process/file/CPU limits, deterministic single-thread numeric
settings, pinned base images and hash-locked Python artifacts, and scientific
engine/SBOM/license drift gates. Requalify staged-auth revocation after every
Codex CLI protocol change. Until those checks execute, no formal sandbox or
fully no-network hosted-process claim is made.
