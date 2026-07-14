# Supported notebook contract

## P0 accepted input

- Jupyter `nbformat` 4 JSON in a file ending `.ipynb`.
- Maximum 10,485,760 bytes, controlled by
  `COUNTERLAB_MAX_NOTEBOOK_BYTES`.
- Python/scikit-learn classification patterns needed by the public
  customer-churn notebook and documented variants.
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

P0 patch verification is narrower than intake. Only the exact public sample
contract receives a `VERIFIED` patch. Other uploaded notebooks may be parsed and
used for a supported Belief Test, but patch suggestions remain `UNVERIFIED`
until a specific patch contract exists.

## Explicit non-support

Generic `.py` upload, arbitrary datasets, arbitrary packages, package install,
voice/screenshot intake, non-Python kernels, remote data access, custom binary
outputs, and “works for any notebook” claims are outside the submission scope.
