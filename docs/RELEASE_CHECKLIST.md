# Release checklist

## Evidence spine

- [x] Public fixture/notebook regenerate without diff.
- [x] Sample manifest hash and cell/output references match the committed values.
- [x] Random/group/ablation ordering and broad ranges pass.
- [x] Group overlap is zero and canonical hash reproduces.
- [x] `./scripts/run-mutations.sh leakage` reports 12/12.

## Learning loop

- [x] No result before Prediction Contract.
- [x] Prediction overwrite returns typed 409.
- [x] Rejected lab cannot create a result.
- [x] Transfer failure keeps patch locked; pass unlocks it.
- [x] Original notebook is unchanged; unrelated source hashes match.
- [x] Reasoning Diff and Proof Bundle validate after refresh.

## Live and replay

- [x] Missing GPT/Codex capability is explicit.
- [x] Replay banner remains visible across every replay screen.
- [x] Rejected run, repair cap, and separate verified run are labelled honestly.
- [x] No private reasoning, secrets, or machine-local paths appear.
- [x] Custom Responses routing is normalized, server-only, and absent from
      browser-visible health/evidence.
- [ ] Configured live Responses credential completes a schema-valid Belief Test.
- [x] Generation isolation remains labelled `PARTIAL` until OS proof exists.
- [x] Unisolated App Server launch fails closed and a real Bubblewrap probe
      proves repository/verifier/held-out paths are absent.
- [ ] Credential-safe isolated App Server launch completes a live turn.

## Security and quality

- [x] Upload size/type/extension and unsupported cases are exercised.
- [x] AST and real Docker smoke pass.
- [x] Candidate network/user/mount/resource evidence is present.
- [x] Keyboard path, focus, contrast, reduced motion and responsive layout checked.
- [x] Secret scan passes; `.env.example` contains no credential.
- [x] `docs/ACHIEVED_METRICS.json` is regenerated from code.

## Commands

```bash
./scripts/test-all.sh
./scripts/run-mutations.sh leakage
./scripts/clean-demo.sh
./scripts/reproduce-session.sh leakage-01
./scripts/replay-patch.sh leakage-01
./scripts/release-check.sh
```

## Cloudflare

- [x] Remote D1 migrations applied.
- [x] Worker/assets deployed with locked Wrangler.
- [x] `/api/health`, Try Instantly, upload refusal, and Replay verified live.
- [x] Production URL and Worker version recorded in `docs/PROGRESS.md`.
