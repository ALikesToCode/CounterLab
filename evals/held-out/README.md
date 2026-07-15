# Held-out notebook benchmark

This benchmark executes CounterLab's safe notebook parser against ten generated-but-untouched notebook files:

- four entity-leakage variations;
- four class-imbalance variations; and
- two unsupported/refusal cases.

“Untouched” means the benchmark runner reads the generated notebook bytes as held-out inputs and does not rewrite them, execute their cells, or inject expected answers. `scripts/generate-held-out-notebooks.py` computes every stored metric from fixed synthetic data before writing the corpus. Its determinism test regenerates the corpus twice and compares bytes.

`review-labels.json` contains deterministic case-spec labels plus a separate human-review state. All human-review states begin at `PENDING`; automated success never changes them. Independent reviewers may fill reviewer IDs, timestamps, and notes under `schemas/review-label.schema.json`, then adjudicate disagreements without changing the notebooks.

Run:

```bash
PYTHONPATH=services/kernel/src .venv/bin/python scripts/generate-held-out-notebooks.py
pnpm exec tsx scripts/run-held-out.ts
```

The second command writes `docs/HELD_OUT_RESULTS.json` and the human-readable `docs/HELD_OUT_MATRIX.md` from actual parser execution. It exits nonzero if any required support, refusal, evidence, or stability check fails.

The benchmark measures only the documented parser/evidence subset. It does not execute notebooks, call a model, verify a generated lab, or measure learning.
