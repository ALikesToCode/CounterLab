# Supported notebook contract

## Released accepted input

- Jupyter `nbformat` 4 JSON in a file ending `.ipynb`.
- Maximum 10,485,760 bytes, controlled by
  `COUNTERLAB_MAX_NOTEBOOK_BYTES`.
- Python/scikit-learn classification patterns needed by the public
  customer-churn and rare-event notebooks and documented variants.
- Code, markdown, raw cells, and inert text/JSON outputs.
- A learner-supplied text claim.

The intake parser treats the notebook as untrusted data. It does not import the
notebook, run a kernel, evaluate an output, resolve a client path, or fetch a
dependency. It uses a safe basename and server-generated object key.

## Evidence extracted

The Artifact Manifest records the original file hash, `nbformat`, support
status/reasons, each cell's source hash and bounded excerpt, accepted output
hashes, execution count, recognized symbols, numeric metric candidates, schema
summary, entity/target candidates, package hints, and creation time.

Evidence references are exact cell/output indexes plus hashes. A Belief Test is
rejected if a model-supplied reference does not resolve to the manifest.

## Sanitized or omitted outputs

Active HTML, JavaScript, SVG, widget state, binary blobs, and unknown MIME
payloads are not accepted as evidence. Displayed metric text is evidence of what
the notebook claimed, not experimental truth. Only a verified kernel payload may
drive result charts.

## Typed refusal

Inputs become `PARTIAL` or `UNSUPPORTED` for unsupported magics, network or
unknown dependencies, active content, old `nbformat`, corrupt JSON, size limit,
ambiguous schema, or missing evidence. The UI shows reasons and disables
progress for non-`SUPPORTED` artifacts.

The released concept registry supports two bounded families:

- **Entity leakage:** repeated entity rows, a detectable entity field, a
  row-wise evaluation split, and stored classification evidence. The fixed lab
  can compare random-row, group-holdout, and identity-ablation runs.
- **Class imbalance and metric choice:** a rare binary target, a supported
  classification split, and stored accuracy, prevalence, or class-specific
  evidence. The fixed lab can compute the majority baseline, confusion matrix,
  precision, recall, F1, PR-AUC, ROC-AUC context, and bounded threshold and
  prevalence sweeps.

Patch verification is intentionally narrower than intake. A patch is released
only when the notebook's evaluation cells match the selected concept pack's
registered source transformation, the Patch Plan targets only resolved cells,
the fixed engine recomputes its outputs, and the external verifier accepts the
changed-cell allowlist and result lineage. A supported intake can still receive
an honest patch refusal when its source shape is outside that patch contract.

## Explicit non-support

Generic `.py` upload, arbitrary datasets, arbitrary packages, package install,
voice/screenshot intake, non-Python kernels, remote data access, custom binary
outputs, and “works for any notebook” claims are outside the submission scope.

## Learner language and current contract versions

The v5.1 learner journey uses one vocabulary: **Question, Prediction, Test,
Boundary, Apply, Repair**. Existing persisted Belief Test, Experiment Plan, and
Proof Bundle artifacts remain valid legacy-compatible contracts until their
versioned Belief Spec v2, Experiment IR v5, and Proof Capsule v2 adapters ship.
This vocabulary update does not enlarge the supported notebook family or turn
an explanation into verified evidence.
