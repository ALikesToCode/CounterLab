# Scientific engines

CounterLab reuses mature scientific libraries for bounded calculations, then
independently decides whether those calculations form a fair, discriminating
learning experiment. A library result is not, by itself, a verified educational
conclusion.

## Current admitted authority

The v1 registry admits only the engines already required by the two released ML
Subject Packs.

| Engine                     | Exact version | Declared role        | Current scope                                                |
| -------------------------- | ------------: | -------------------- | ------------------------------------------------------------ |
| CounterLab fixed ML kernel |         0.1.0 | authoritative solver | Ten registered leakage and imbalance operations              |
| NumPy                      |         2.4.6 | authoritative solver | Bounded numeric array operations used by the fixed kernel    |
| pandas                     |         2.3.3 | authoritative solver | Fixed tabular preparation inside the kernel                  |
| scikit-learn               |         1.9.0 | authoritative solver | Fixed estimator, split, preprocessing, and metric operations |

The internal fixture/oracle, renderer-binding, and mutation authorities are
integrity-bound separately. SciPy 1.18.0 is installed transitively by
scikit-learn, but it is not an admitted CounterLab authority. Pint, SymPy,
Hypothesis, Vega-Lite, Rapier, Pyodide, NetworkX, and all chemistry candidates
remain unadmitted until a reviewed Subject Pack requires them.

The canonical registry and Subject Pack bindings live in
`scientific-engines/registry.json` and
`scientific-engines/subject-pack-bindings.json`. Unknown engines, roles,
operations, fields, versions, evidence IDs, or tolerance profiles fail closed.

## Current candidate evidence

The recorded candidate is intentionally not labelled as production authority.

- Environment: `counterlab-runner-linux-amd64-v2`
- Source commit: `6e27bd021ce39ea5d65b8d921825c7964c157fde`
- Image digest:
  `sha256:67682290a02e8b94e4522511242a3196f1a4f116eb187e22274abece2740b7a2`
- Runtime user: `10001:10001`
- Authority hash:
  `e7953ed4bd523864608473602bac614467fbfd504203e6d9c0721e428f2417d9`
- Deterministic kernel hashes:
  - leakage: `2501654264b9aa85b39fca944e585ff9b04263b83e182bc186d1f16464fee3b0`
  - imbalance: `90723d4dd1b73d42133646cf937f05befc731a8e4dbf0ff4c68ad51ddffdd0ef`

The image starts as a non-root user, runs with one-thread numeric pools, and the
verification probe uses a no-network, read-only container with bounded tmpfs.
Two clean Python builder executions produced the same kernel wheel SHA-256:
`a2a9cb3b5068a1e8c29fcb210b96b63879ad6c2c2255dc8734e4de1bc2426f61`.

## Inventory and vulnerability evidence

Three normalized CycloneDX 1.6 documents are committed:

| Inventory                  | Components | SHA-256                                                            |
| -------------------------- | ---------: | ------------------------------------------------------------------ |
| Production Node graph      |         19 | `1614dafa5aac250b33824e14666fa49441a4bb5f548dbbd4bb2e6a679be801e1` |
| Runner Python requirements |         22 | `24f1d2cf673e8ac7c45289d3fbbc900f609ca53430b4166597b493fac8debc54` |
| Runner image filesystem    |      3,433 | `9e88e173c3f15bfebf785717948b8356a8ea547391557b844296cdc67d1e671b` |

The Grype 0.112.0 scan is recorded in
`docs/sbom/vulnerability-report.json`. It found no fixable Critical finding, but
it did find eight fixable High findings attributed to CPython 3.12.13. Those
findings block production promotion. No VEX suppression or risk exception has
been applied.

SBOM presence is inventory evidence, not proof that vulnerabilities are absent.
The container inventory excludes the host kernel and Cloudflare platform. The
Python requirements backend does not emit dependency edges. Scanner databases
change over time, so a release rerun may change findings without a source
change.

## Verification

The earlier registry gate is:

```bash
./scripts/verify-scientific-engines.sh \
  --registry-only \
  --image counterlab-runner:engine-registry-v3
```

It validates schemas, evidence hashes, role and operation policy, exact locks,
licenses, SBOM bindings, image/source identity, the non-root runtime user,
installed distribution files, thread policy, and repeated golden results.

The full command intentionally remains red until Proof Capsule v2 validates the
scientific authority hash:

```bash
./scripts/verify-scientific-engines.sh \
  --image counterlab-runner:engine-registry-v3
```

Current typed blocker: `PROOF_CAPSULE_ENGINE_LINK_MISSING`.

## Non-claims

- This evidence describes a local candidate, not the deployed Cloudflare
  runner.
- The scan does not claim zero vulnerabilities.
- Byte-identical floating-point results are not claimed outside the recorded
  Linux/amd64 runtime and tolerance profile.
- A transitive SciPy installation does not make SciPy an admitted authority.
- No physics engine or physics Subject Pack is currently verified.
- Scientific-engine checks do not constitute formal sandbox proof.
