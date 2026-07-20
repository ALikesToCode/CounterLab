export const INTERNAL_SCIENTIFIC_INTEGRITY_EVIDENCE_IDS = [
  "internal-oracle-integrity-v2",
  "internal-renderer-integrity-v2",
  "internal-mutations-integrity-v2",
] as const;

export type InternalScientificIntegrityEvidenceId =
  (typeof INTERNAL_SCIENTIFIC_INTEGRITY_EVIDENCE_IDS)[number];

const INTERNAL_SCIENTIFIC_INTEGRITY_PATHS = {
  "internal-oracle-integrity-v2": [
    "apps/web/shared/sample-boundary-authority.ts",
    "packages/boundary-map/src/index.ts",
    "packages/concept-registry/src/index.ts",
    "packages/experiment-ir/src/canonicalize.ts",
    "packages/experiment-ir/src/hash.ts",
    "packages/experiment-ir/src/policy.ts",
    "packages/experiment-ir/src/runner-bundle.ts",
    "packages/experiment-ir/src/schema.ts",
    "packages/experiment-scorer/src/scorer.ts",
    "packages/plan-verifier/src/epistemic.ts",
    "packages/plan-verifier/src/scientific-candidate.ts",
    "packages/proof-capsule/src/sample-boundary-authority.ts",
    "scripts/bind-source-bound-scientific-evidence.ts",
    "scripts/internal-scientific-integrity-scope.ts",
    "scripts/refresh-scientific-engine-bindings.ts",
    "services/kernel/src/counterlab_kernel/boundary_map.py",
    "services/kernel/src/counterlab_kernel/imbalance_transfer.py",
    "services/kernel/src/counterlab_kernel/imbalance_verifier.py",
    "services/kernel/src/counterlab_kernel/transfer.py",
    "services/kernel/src/counterlab_kernel/verifier.py",
  ],
  "internal-renderer-integrity-v2": [
    "apps/web/src/App.tsx",
    "apps/web/src/components/generative-ui/BoundaryMapBlock.tsx",
    "apps/web/src/components/generative-ui/TrustedLabSceneRenderer.tsx",
    "apps/web/src/components/generative-ui/VerifiedLabScenePanel.tsx",
    "apps/web/src/components/learner/ExperimentTheater.tsx",
    "apps/web/src/components/learner/VerifiedBeliefBreakTheater.tsx",
    "apps/web/src/components/lesson/InteractiveImbalanceLab.tsx",
    "apps/web/src/components/proof/ProofCapsuleView.tsx",
    "apps/web/src/components/proof/ReasoningDiffView.tsx",
    "apps/web/src/components/studio/GeneratedProofView.tsx",
    "apps/web/src/features/boundary/BoundaryStage.tsx",
    "packages/generative-ui-contracts/src/index.ts",
  ],
  "internal-mutations-integrity-v2": [
    "apps/web/src/App.test.tsx",
    "apps/web/src/api.test.ts",
    "apps/web/src/components/generative-ui/BoundaryMapBlock.test.tsx",
    "apps/web/src/components/generative-ui/TrustedLabSceneRenderer.test.tsx",
    "apps/web/src/components/generative-ui/VerifiedLabScenePanel.test.tsx",
    "apps/web/src/components/learner/ExperimentTheater.test.tsx",
    "apps/web/src/components/learner/VerifiedBeliefBreakTheater.test.tsx",
    "apps/web/src/components/lesson/InteractiveImbalanceLab.test.tsx",
    "apps/web/src/components/proof/ReasoningDiffView.test.tsx",
    "apps/web/src/components/studio/GeneratedProofView.test.tsx",
    "apps/web/src/features/boundary/BoundaryStage.test.tsx",
    "apps/web/src/features/boundary/sampleBoundaryFixture.test.ts",
    "apps/web/src/sample.test.ts",
    "apps/web/worker/api.test.ts",
    "packages/boundary-map/src/index.ts",
    "packages/boundary-map/test/verifier.test.ts",
    "packages/codex-client/src/prompts.ts",
    "packages/codex-client/src/scientific-method.test.ts",
    "packages/concept-registry/src/index.test.ts",
    "packages/concept-registry/src/index.ts",
    "packages/experiment-ir/test/experiment-ir.test.ts",
    "packages/experiment-ir/test/runner-bundle.test.ts",
    "packages/experiment-scorer/src/scorer.ts",
    "packages/experiment-scorer/test/scorer.test.ts",
    "packages/generative-ui-contracts/test/lab-scene.test.ts",
    "packages/plan-verifier/src/epistemic-imbalance.test.ts",
    "packages/plan-verifier/src/epistemic.test.ts",
    "packages/plan-verifier/src/epistemic.ts",
    "packages/plan-verifier/src/scientific-candidate-v5.test.ts",
    "packages/plan-verifier/src/scientific-candidate.ts",
    "scripts/internal-scientific-integrity-scope.test.ts",
    "services/kernel/src/counterlab_kernel/boundary_map.py",
    "services/kernel/src/counterlab_kernel/imbalance_verifier.py",
    "services/kernel/src/counterlab_kernel/verifier.py",
    "services/kernel/tests/test_boundary_map.py",
    "services/kernel/tests/test_hosted_boundary.py",
    "services/kernel/tests/test_imbalance_plan.py",
    "services/kernel/tests/test_imbalance_transfer.py",
    "services/kernel/tests/test_transfer.py",
    "services/kernel/tests/test_verifier.py",
  ],
} as const satisfies Record<
  InternalScientificIntegrityEvidenceId,
  readonly string[]
>;

export const SIGNED_RESULT_BINDING_V2_SCOPE = {
  contractPath: "packages/generative-ui-contracts/src/index.ts",
  codePaths: [
    "apps/web/src/App.tsx",
    "apps/web/src/components/generative-ui/BoundaryMapBlock.tsx",
    "apps/web/src/components/generative-ui/TrustedLabSceneRenderer.tsx",
    "apps/web/src/components/generative-ui/VerifiedLabScenePanel.tsx",
    "apps/web/src/components/learner/ExperimentTheater.tsx",
    "apps/web/src/components/learner/VerifiedBeliefBreakTheater.tsx",
    "apps/web/src/components/lesson/InteractiveImbalanceLab.tsx",
    "apps/web/src/components/proof/ProofCapsuleView.tsx",
    "apps/web/src/components/proof/ReasoningDiffView.tsx",
    "apps/web/src/components/studio/GeneratedProofView.tsx",
    "apps/web/src/features/boundary/BoundaryStage.tsx",
  ],
  tests: [
    "apps/web/src/App.test.tsx",
    "apps/web/src/api.test.ts",
    "apps/web/src/components/generative-ui/BoundaryMapBlock.test.tsx",
    "apps/web/src/components/generative-ui/TrustedLabSceneRenderer.test.tsx",
    "apps/web/src/components/generative-ui/VerifiedLabScenePanel.test.tsx",
    "apps/web/src/components/learner/ExperimentTheater.test.tsx",
    "apps/web/src/components/learner/VerifiedBeliefBreakTheater.test.tsx",
    "apps/web/src/components/lesson/InteractiveImbalanceLab.test.tsx",
    "apps/web/src/components/proof/ReasoningDiffView.test.tsx",
    "apps/web/src/components/studio/GeneratedProofView.test.tsx",
    "apps/web/src/features/boundary/BoundaryStage.test.tsx",
    "apps/web/src/features/boundary/sampleBoundaryFixture.test.ts",
    "apps/web/src/sample.test.ts",
    "apps/web/worker/api.test.ts",
    "packages/generative-ui-contracts/test/lab-scene.test.ts",
  ],
} as const;

function assertCanonicalPathList(
  label: string,
  paths: readonly string[],
): void {
  const seen = new Set<string>();
  for (const path of paths) {
    if (
      path.length === 0 ||
      path.startsWith("/") ||
      path.includes("\\") ||
      path
        .split("/")
        .some(
          (segment) => segment === "" || segment === "." || segment === "..",
        )
    ) {
      throw new Error(
        `${label} contains a non-canonical repository path: ${path}`,
      );
    }
    if (seen.has(path))
      throw new Error(`${label} contains a duplicate path: ${path}`);
    seen.add(path);
  }
  const sorted = [...paths].sort();
  if (paths.some((path, index) => path !== sorted[index])) {
    throw new Error(`${label} must be sorted`);
  }
}

function assertExactPaths(
  label: string,
  actual: readonly string[],
  expected: readonly string[],
): void {
  assertCanonicalPathList(label, actual);
  assertCanonicalPathList(`${label} expected scope`, expected);
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((path) => !actualSet.has(path));
  const unexpected = actual.filter((path) => !expectedSet.has(path));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `${label} scope mismatch: missing=[${missing.join(", ")}] unexpected=[${unexpected.join(", ")}]`,
    );
  }
}

export function internalScientificIntegrityPaths(
  evidenceId: InternalScientificIntegrityEvidenceId,
): readonly string[] {
  const paths = INTERNAL_SCIENTIFIC_INTEGRITY_PATHS[evidenceId];
  assertCanonicalPathList(evidenceId, paths);
  return paths;
}

export function assertInternalScientificIntegrityScope(
  evidenceId: InternalScientificIntegrityEvidenceId,
  declaredPaths: readonly string[],
): void {
  assertExactPaths(
    evidenceId,
    declaredPaths,
    internalScientificIntegrityPaths(evidenceId),
  );
}

export function assertSignedResultBindingV2Scope(input: {
  contractPath: string;
  codePaths: readonly string[];
  tests: readonly string[];
}): void {
  assertExactPaths(
    "signed-result-binding-v2 codePaths",
    input.codePaths,
    SIGNED_RESULT_BINDING_V2_SCOPE.codePaths,
  );
  assertExactPaths(
    "signed-result-binding-v2 tests",
    input.tests,
    SIGNED_RESULT_BINDING_V2_SCOPE.tests,
  );
  if (input.contractPath !== SIGNED_RESULT_BINDING_V2_SCOPE.contractPath) {
    throw new Error("signed-result-binding-v2 contractPath scope mismatch");
  }
}

export function assertScientificIntegrityScopeRelationships(): void {
  for (const evidenceId of INTERNAL_SCIENTIFIC_INTEGRITY_EVIDENCE_IDS) {
    internalScientificIntegrityPaths(evidenceId);
  }
  const rendererPaths = new Set([
    ...internalScientificIntegrityPaths("internal-renderer-integrity-v2"),
  ]);
  const mutationPaths = new Set([
    ...internalScientificIntegrityPaths("internal-mutations-integrity-v2"),
  ]);
  for (const path of [
    SIGNED_RESULT_BINDING_V2_SCOPE.contractPath,
    ...SIGNED_RESULT_BINDING_V2_SCOPE.codePaths,
  ]) {
    if (!rendererPaths.has(path)) {
      throw new Error(
        `signed-result-binding-v2 renderer path is unbound: ${path}`,
      );
    }
  }
  for (const path of SIGNED_RESULT_BINDING_V2_SCOPE.tests) {
    if (!mutationPaths.has(path)) {
      throw new Error(`signed-result-binding-v2 test path is unbound: ${path}`);
    }
  }
}
