# 16 — EVIDENCE INDEX

Audit date 2026-07-19 · All paths relative to `counterlab-black-box-audit/`.

## Conventions
- Screenshots: `evidence/screenshots/agent<N>_*` (PNG, captured via download_screenshot_path at 1920×1080).
- Generated artifacts (proof records, repaired notebooks): `evidence/artifacts/` and `evidence/downloads/`.
- Per-agent raw reports + issue JSON: `work/`. Browser tooling captured no console/HAR; network observations are documented inside agent reports (see 09, 10).
- Secrets/tokens/session identifiers: none present in reports; session UUIDs in evidence filenames are test sessions created by the audit swarm with synthetic data only.

## Totals
- Screenshot files: **386**
- Artifact/download files: **8**

## Generated artifacts (verified by agents)
| File | Verified content |
|---|---|
| evidence/artifacts/agent2_proof_record_leakage-01.json | 12–14-event hash-chained HMAC-signed bundle; actor-attributed (system/learner/codex/verifier/kernel); fixture descriptor 'stored-approved-leakage-v1' |
| evidence/artifacts/agent3_proof_record_sample_session.json | 16-event signed bundle incl. dual result hashes (MB-009) |
| evidence/artifacts/agent3_repaired_notebook_sample.ipynb | valid nbformat; real GroupShuffleSplit patch |
| evidence/artifacts/agent4_proof_record.json | 12 hash-chained events, HMAC-signed |
| evidence/artifacts/agent4_repaired_notebook.ipynb | valid .ipynb, GroupShuffleSplit patch, zero-overlap assert |
| evidence/downloads/agent1_download_proof_record.bin | 34 KB signed JSON bundle; fileSha256 matches UI-displayed notebook hash |
| evidence/downloads/agent1_download_repaired_notebook.bin | valid .ipynb with patch + metadata |
| evidence/downloads/agent5_proof_record.json | 14-event chain; prediction sealed 77 s before kernel result; belief_test.proposed actor=system |

## Screenshot inventory by agent

- `agent0_*`: 1 files
- `agent1_*`: 56 files
- `agent10_*`: 34 files
- `agent12_*`: 33 files
- `agent16_*`: 33 files
- `agent2_*`: 39 files
- `agent3_*`: 35 files
- `agent4_*`: 54 files
- `agent5_*`: 29 files
- `agent6_*`: 59 files
- `agent9_*`: 13 files

## Console / network / storage / performance captures
- No console or HAR capture was possible with the available tooling (documented limitation, see 17). Network-shaped evidence lives in: 09_PUBLIC_API_RELIABILITY_PERFORMANCE.md (endpoint inventory, timings, error contracts) and 10_AI_CODEX_AND_VERIFICATION_EVIDENCE.md (event-log forensics via /api JSON).
- Performance timings (server-side event timestamps) are tabulated in 09; accessibility pixel-contrast measurements in 08 Part 3.

## Work files (raw agent reports)
- work/agent1_issues.json · agent2_issues.json · agent3_issues.json · agent4_issues.json · agent5_issues.json · agent6_issues.json + agent6_visual.md · agent7_issues.json + agent7_responsive.md · agent8_issues.json + agent8_accessibility.md · agent913_issues.json · agent1011_issues.json · agent12_issues.json · agent14_issues.json + agent14_devpost_rules.md · agent15_issues.json · agent16_issues.json + agent16_independent.md + agent16_challenge.md
- work/shots/ (auxiliary agent screenshots)