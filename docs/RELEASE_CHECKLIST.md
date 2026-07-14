# Release checklist

## Evidence spine

- [ ] Public fixture/notebook regenerate without diff.
- [ ] Sample manifest hash and cell/output references match the committed values.
- [ ] Random/group/ablation ordering and broad ranges pass.
- [ ] Group overlap is zero and canonical hash reproduces.
- [ ] `./scripts/run-mutations.sh leakage` reports 12/12.

## Learning loop

- [ ] No result before Prediction Contract.
- [ ] Prediction overwrite returns typed 409.
- [ ] Rejected lab cannot create a result.
- [ ] Transfer failure keeps patch locked; pass unlocks it.
- [ ] Original notebook is unchanged; unrelated source hashes match.
- [ ] Reasoning Diff and Proof Bundle validate after refresh.

## Live and replay

- [ ] Missing GPT/Codex capability is explicit.
- [ ] Replay banner remains visible across every replay screen.
- [ ] Rejected run, repair cap, and separate verified run are labelled honestly.
- [ ] No private reasoning, secrets, or machine-local paths appear.
- [ ] Generation isolation remains labelled `PARTIAL` until OS proof exists.

## Security and quality

- [ ] Upload size/type/extension and unsupported cases are exercised.
- [ ] AST and real Docker smoke pass.
- [ ] Candidate network/user/mount/resource evidence is present.
- [ ] Keyboard path, focus, contrast, reduced motion and responsive layout checked.
- [ ] Secret scan passes; `.env.example` contains no credential.
- [ ] `docs/ACHIEVED_METRICS.json` is regenerated from code.

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

- [ ] Remote D1 migrations applied.
- [ ] Worker/assets deployed with locked Wrangler.
- [ ] `/api/health`, Try Instantly, upload refusal, and Replay verified live.
- [ ] Production URL and commit recorded in `docs/PROGRESS.md`.
