import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_JSON_PROFILE,
  PatchResultSchema,
  PublicProofCapsuleRefV2Schema,
  ReasoningDiffV2Schema,
} from "@counterlab/contracts";

import { ReasoningDiffView } from "./ReasoningDiffView";

const digest = (character: string) => character.repeat(64);

const diff = ReasoningDiffV2Schema.parse({
  schemaVersion: "2",
  id: "reasoning_1",
  sessionId: "session_1",
  concept: "entity_leakage",
  dimensions: {
    belief: {
      before: "Random-row accuracy proves new-customer generalization.",
      after: "Evaluation units must match deployment units.",
    },
    prediction: {
      before: "The group score will remain high.",
      after: "The score fell after whole customers were held out.",
    },
    evidence: {
      before: "Repeated customers appeared on both sides.",
      after: "Group holdout produced zero entity overlap.",
    },
    boundary: {
      before: "No applicability boundary was named.",
      after: "The optimism gap grows with repeated identity signal.",
    },
    behavior: {
      before: "Use random rows for the forecasting transfer.",
      after: "Use a time-ordered holdout and remove future data.",
    },
    code: {
      before: "train_test_split(rows)",
      after: "group_holdout(customer_id)",
    },
  },
  authority: {
    artifactManifestHash: digest("0"),
    beliefSpecHash: digest("1"),
    predictionHash: digest("2"),
    experimentIrHash: digest("3"),
    selectionHash: digest("4"),
    authoritativeResultHash: digest("5"),
    evidenceVerdictHash: digest("6"),
    epistemicReportHash: digest("7"),
    boundaryMapHash: digest("8"),
    boundaryReceiptHash: digest("9"),
    transferResultHash: digest("a"),
    patchPlanHash: digest("b"),
    patchResultHash: digest("c"),
    patchedArtifactHash: digest("d"),
  },
  evidenceEventHashes: [
    digest("0"),
    digest("1"),
    digest("2"),
    digest("3"),
    digest("4"),
    digest("5"),
    digest("6"),
    digest("7"),
  ],
  limitations: [
    "This verifies the documented notebook pattern, not global mastery.",
  ],
  issuedAt: "2026-07-16T13:00:00.000Z",
});

const capsule = PublicProofCapsuleRefV2Schema.parse({
  schemaVersion: "2",
  capsuleId: "capsule_1",
  sessionId: "session_1",
  mode: "live_notebook",
  replayId: null,
  mediaType: "application/vnd.counterlab.capsule+json",
  canonicalProfile: CANONICAL_JSON_PROFILE,
  rootHash: digest("e"),
  bytesHash: digest("f"),
  byteLength: 8192,
  reasoningDiffHash: digest("a"),
  eventChainHead: digest("b"),
  createdAt: "2026-07-16T13:01:00.000Z",
  integrity: { mode: "integrity-hashed", algorithm: "sha256" },
});

const patch = PatchResultSchema.parse({
  schemaVersion: "1",
  id: "patch_1",
  sessionId: "session_1",
  status: "VERIFIED",
  sourceArtifactHash: digest("1"),
  patchedArtifactHash: digest("d"),
  patchHash: digest("e"),
  modifiedCells: [3, 5],
  diff: "@@ cell 3 @@\n- random rows\n+ group holdout",
  verification: {
    passed: true,
    invariants: ["GROUP_OVERLAP_ZERO", "UNRELATED_CELLS_UNCHANGED"],
    unchangedCellHashes: [digest("2"), digest("3"), digest("4")],
  },
  generatedAt: "2026-07-16T13:00:30.000Z",
  resultHash: digest("5"),
});

describe("ReasoningDiffView", () => {
  it("renders all six authoritative dimensions and artifact-specific patch scope", () => {
    render(
      <ReasoningDiffView
        diff={diff}
        capsule={capsule}
        patch={patch}
        patchDownloadUrl="/api/sessions/session_1/patch/download"
        proofCapsuleDownloadUrl="/api/sessions/session_1/proof-capsule"
      />,
    );

    for (const label of [
      "Belief",
      "Prediction",
      "Evidence",
      "Boundary",
      "Apply",
      "Repair",
    ]) {
      expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
    }
    for (const dimension of Object.values(diff.dimensions)) {
      expect(screen.getByText(dimension.before)).toBeInTheDocument();
      expect(screen.getByText(dimension.after)).toBeInTheDocument();
    }
    expect(screen.getByText(/cells 3, 5 changed/i)).toBeInTheDocument();
    expect(screen.getByText(/3 unrelated cells proven unchanged/i)).toBeInTheDocument();
  });

  it("offers the repaired copy and safe Proof Capsule without an internal object key", () => {
    render(
      <ReasoningDiffView
        diff={diff}
        capsule={capsule}
        patch={patch}
        patchDownloadUrl="/patch.ipynb"
        proofCapsuleDownloadUrl="/proof.counterlab"
      />,
    );

    expect(
      screen.getByRole("link", { name: /download repaired notebook/i }),
    ).toHaveAttribute("href", "/patch.ipynb");
    expect(
      screen.getByRole("link", { name: /export proof capsule/i }),
    ).toHaveAttribute("href", "/proof.counterlab");
    expect(screen.getByText("Integrity-hashed")).toBeInTheDocument();
    expect(screen.queryByText("HMAC-signed")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/proof-capsules\//i);
    expect(
      screen.getByText(/documented notebook pattern, not global mastery/i),
    ).toBeInTheDocument();
  });
});
