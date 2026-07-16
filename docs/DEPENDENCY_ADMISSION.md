# Dependency admission

Scientific dependencies enter CounterLab through a human-reviewed registry
change. GPT-5.6 and Codex may not select, install, import, or upgrade a runtime
dependency.

## Admission checklist

Every proposed engine must record and verify:

1. official project and package source;
2. exact version, package integrity, and pinned container or asset digest;
3. license classification, preserved license text, and attribution;
4. release and maintenance status;
5. supported operating systems, architectures, and runtime;
6. transitive dependency and image/bundle-size impact;
7. current vulnerability scan and any known-exploited status;
8. declared role and the exact allowed operation IDs;
9. network policy, bounded inputs, and resource limits;
10. deterministic seed, thread, locale, timezone, and tolerance profile;
11. an independent validation path;
12. golden, metamorphic, mutation, and upgrade-drift fixtures;
13. SBOM inclusion and Proof Capsule provenance;
14. rollback plan and owners for future requalification.

Preferred validation order is analytic/exact oracle, dimensional analysis,
conservation or invariant, convergence, metamorphic/property tests, golden
benchmarks, and finally cross-implementation comparison. Cross-library
agreement alone is supporting evidence, not proof.

## Version and supply-chain policy

- Production package versions are exact; `*`, `latest`, ranges, floating Git
  references, and runtime CDNs are rejected.
- Container bases are pinned by digest. Browser JavaScript/WASM used by a
  verified pack must be self-hosted and integrity-bound.
- Lockfiles, installed metadata/RECORD hashes, licenses, SBOMs, image identity,
  and the engine registry are one evidence set. Drift in any member fails the
  gate.
- Heavy engines are loaded only on routes for packs that require them. The
  sample and replay paths must not wait for optional engines.
- A dependency upgrade invalidates affected goldens and requires the pack's
  oracle, convergence, mutations, Boundary Map, transfer, replay, performance,
  and browser checks to be rerun.

## Vulnerability policy

Production promotion rejects every fixable Critical and every unreviewed
fixable High finding. The current local candidate has no fixable Critical and
one fixable High finding. That High is covered by a one-to-one, exact-image,
expiring OpenVEX review and bounded reachability evidence, so the local policy
is `PASSED_WITH_REVIEWED_EXCEPTION`.

An exception must be an image-digest-bound VEX/risk record naming the CVE,
component, status, justification, reachability evidence, owner, expiry, and
revalidation trigger. CounterLab additionally preserves raw, VEX-applied, and
wrong-subcomponent negative-control scans and verifies that only the intended
finding moves from active to ignored. Known-exploited findings fail unless
evidence establishes that the exact image is not affected. The current review
expires on `2026-08-14T05:30:00Z` and does not carry authority to another image
or environment kind.

Findings without a published fix are recorded and remain visible for release
review; `--only-fixed` is not a zero-risk claim. Database age and validity are
part of every scan record.

## Candidate roadmap

SciPy, Pint, SymPy, and Hypothesis may be evaluated for the bounded physics
free-fall pack only after the ML scientific-method core and public runner gates
are green. Vega-Lite or Rapier may serve as renderers, never as the scientific
oracle. RDKit, 3Dmol.js, Cantera, NetworkX, Pyodide, and math.js remain roadmap
items rather than production dependencies.

Chemistry packs require a separate safety review and may not provide synthesis
planning, dangerous laboratory procedures, unrestricted reaction search, or
operational handling advice.
