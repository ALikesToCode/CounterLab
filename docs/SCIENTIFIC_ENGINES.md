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
- Source commit: `efe7fcfa6bfb5bb0115d4bd0bb1e1c1c628ef0b8`
- Image digest:
  `sha256:1b974af90901e818fc202fffca8702f7a48aa1bcfa54776af7cc67831b5e34da`
- Runtime user: `10001:10001`
- Authority hash:
  `aff2ea37372b647b887d1e088f5aac98ceb725246b760eb07ae21e1453e5e57e`
- Deterministic kernel hashes:
  - leakage: `a6ae7652e04e4d70196f991c63b8f7bcb3b76f8c4ab833d3ce2b626df0ab6c94`
  - imbalance: `5787e04aa59c2703336d35bf5e64935987b44029f47b833e9152dd7d5c97d0d4`

The image starts as a non-root user, runs with one-thread numeric pools, and the
verification probe uses a no-network, read-only container with bounded tmpfs.
Two clean Python builder executions produced the same kernel wheel SHA-256:
`38b1be0e3c6e1ca33b3a8f36b45fb3273a416b1c2bea099f25afec71e8ebb87b`.

## Inventory and vulnerability evidence

Three normalized CycloneDX 1.6 documents are committed:

| Inventory                  | Components | SHA-256                                                            |
| -------------------------- | ---------: | ------------------------------------------------------------------ |
| Production Node graph      |         19 | `80981d7969b467915c73c061b0ea701e02ac05e1dc8b6197025b4cd1cb5d2b19` |
| Runner Python requirements |         22 | `24f1d2cf673e8ac7c45289d3fbbc900f609ca53430b4166597b493fac8debc54` |
| Runner image filesystem    |      2,839 | `a3d072dddab55fafe92b09ffd56522fe62c9cfa96f89e3906bf137589496f92b` |

The Grype 0.112.0 scan is recorded in
`docs/sbom/vulnerability-report.json`. Its database was built at
`2026-07-16T06:59:07Z`. The unsuppressed scan contains 171 package findings:
7 Critical, 23 High, 51 Medium, 4 Low, 50 Negligible, and 36 Unknown. None of
the Critical findings has a published fix in this scan. The fixable set is 0
Critical, 1 High, and 3 Medium.

The one fixable High is `CVE-2026-15308` against CPython 3.13.14. CounterLab
records an exact-image OpenVEX `not_affected` statement backed by a bounded
reachability probe over both hosted run and patch entrypoints. The VEX
application proof changes Grype from 171 active findings to 170 active plus
exactly one ignored finding; a wrong-subcomponent negative control suppresses
zero findings. The CVE was not listed in the checked CISA KEV catalogue. This
exception expires on `2026-07-30T18:20:06Z` and must be requalified when the
image, source, SBOM, Python/module bytes, entrypoints, scanner database, or
vulnerability status changes.

The resulting local-candidate policy is
`PASSED_WITH_REVIEWED_EXCEPTION`. That is not a zero-vulnerability claim and
does not relabel the local snapshot as Cloudflare production authority.

## Production promotion

The current v5.1 candidate above has passed the complete local image gate but
has not yet been promoted or production-smoked. The previous qualified v2
release remains deployed as Cloudflare Container version 13 with registry
digest
`sha256:bdd65feebad10d4b0f232e945eb1bd1195b803d13fddf8eee558b2efdd5dc8c6`
and smoke-bound Worker `7c67c0f4-a4cb-4503-80b0-5a5bd491f3ab`. That historical
smoke records authority `d7677c79…`; it does not confer production authority on
the new `aff2ea37…` candidate. The committed historical report SHA-256 is
`cd5c0c05b2f007c577905630a61f7be84c71908a511ca9bffad68f76bd86431a`.

SBOM presence is inventory evidence, not proof that vulnerabilities are absent.
The container inventory excludes the host kernel and Cloudflare platform. The
Python requirements backend does not emit dependency edges. Scanner databases
change over time, so a release rerun may change findings without a source
change.

## Verification

The current full local-candidate gate is:

```bash
./scripts/verify-scientific-engines.sh \
  --image counterlab-runner:git-efe7fcfa6bfb5bb0115d4bd0bb1e1c1c628ef0b8
```

It validates schemas, evidence hashes, role and operation policy, exact locks,
licenses, SBOM bindings, raw-scan derivation, VEX application and negative
control, bounded reachability, image/source identity, the non-root runtime user,
installed distribution files, thread policy, repeated golden results, and the
Proof Bundle v2 authority link. It passes for the exact image and authority
hash above. Adding `--require-production` correctly rejects this snapshot while
its environment kind remains `local_candidate`.

## Non-claims

- Local image evidence describes the qualified OCI candidate. Production
  authority additionally requires the separately recorded Cloudflare digest,
  Worker version, and smoke; those identities are not interchangeable.
- The scan does not claim zero vulnerabilities.
- Byte-identical floating-point results are not claimed outside the recorded
  Linux/amd64 runtime and tolerance profile.
- A transitive SciPy installation does not make SciPy an admitted authority.
- No physics engine or physics Subject Pack is currently verified.
- Scientific-engine checks do not constitute formal sandbox proof.
