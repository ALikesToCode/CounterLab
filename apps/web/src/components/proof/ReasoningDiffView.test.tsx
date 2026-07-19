import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  CANONICAL_JSON_PROFILE,
  PatchResultSchema,
  PublicProofCapsuleRefV2Schema,
  ReasoningDiffV2Schema,
} from "@counterlab/contracts";

import type { PublishReplayResponse, RevokeReplayResponse } from "../../api";
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

function replayPublication(
  replayId: string,
  reused = false,
): PublishReplayResponse {
  return {
    reused,
    replay: {
      schemaVersion: "1",
      replayId,
      replay: true,
      label: "Verified replay",
      concept: "entity_leakage",
      recordedAt: capsule.createdAt,
      retention: {
        policy: "available_until_revoked",
        revocable: true,
      },
    },
  };
}

const publicTextPreview = {
  claim: diff.dimensions.belief.before,
  hypotheses: [
    "Random-row accuracy proves new-customer generalization.",
    "Entity holdout will reveal identity leakage.",
  ],
  prediction: "group_score_remains_high",
  revision: diff.dimensions.belief.after,
} as const;

describe("ReasoningDiffView", () => {
  it("renders all six authoritative dimensions and artifact-specific patch scope", () => {
    render(
      <ReasoningDiffView
        diff={diff}
        capsule={capsule}
        patch={patch}
        patchDownloadUrl="/api/sessions/session_1/patch/download"
        proofCapsuleDownloadUrl="/api/sessions/session_1/proof-capsule"
        publicTextPreview={publicTextPreview}
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
    expect(
      screen.getByText(/3 unrelated cells proven unchanged/i),
    ).toBeInTheDocument();
  });

  it("offers the repaired copy and safe Proof Capsule without an internal object key", () => {
    render(
      <ReasoningDiffView
        diff={diff}
        capsule={capsule}
        patch={patch}
        patchDownloadUrl="/patch.ipynb"
        proofCapsuleDownloadUrl="/proof.counterlab"
        publicTextPreview={publicTextPreview}
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
    expect(
      screen.queryByRole("button", { name: /publish read-only replay/i }),
    ).not.toBeInTheDocument();
  });

  it("embeds technical evidence without duplicating completion downloads or disclosures", () => {
    render(
      <ReasoningDiffView
        presentation="completion-evidence"
        diff={diff}
        capsule={capsule}
        patch={patch}
        patchDownloadUrl="/patch.ipynb"
        proofCapsuleDownloadUrl="/proof.counterlab"
        publicTextPreview={publicTextPreview}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Detailed Reasoning Diff" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Authority hashes")).toBeInTheDocument();
    expect(screen.getByText(capsule.rootHash)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /download repaired notebook/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /export proof capsule/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Evidence & proof")).not.toBeInTheDocument();
  });

  it("publishes a live Capsule only after the learner explicitly asks", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    const publishReplay = vi
      .fn()
      .mockResolvedValue(replayPublication("replay:live.session_1"));

    render(
      <ReasoningDiffView
        diff={diff}
        capsule={capsule}
        patch={patch}
        patchDownloadUrl="/patch.ipynb"
        proofCapsuleDownloadUrl="/proof.counterlab"
        publishReplay={publishReplay}
        publicTextPreview={publicTextPreview}
      />,
    );

    expect(publishReplay).not.toHaveBeenCalled();
    expect(screen.getByText(/share-safe projection/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(publicTextPreview.hypotheses[0]).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(publicTextPreview.hypotheses[1]),
    ).toBeInTheDocument();
    const publishButton = screen.getByRole("button", {
      name: /confirm and publish read-only replay/i,
    });
    expect(publishButton).toBeDisabled();
    await user.click(
      screen.getByRole("checkbox", {
        name: /listed evidence and learner-authored text become public/i,
      }),
    );

    await user.click(publishButton);

    expect(publishReplay).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("link", { name: /open verified replay/i }),
    ).toHaveAttribute("href", "/replay/replay%3Alive.session_1");
    expect(
      screen.getByText(/published from this proof capsule/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /copy replay link/i }));
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/replay/replay%3Alive.session_1`,
    );
    expect(screen.getByText(/replay link copied/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /confirm and publish read-only replay/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("revokes public playback without removing private completion evidence", async () => {
    const user = userEvent.setup();
    const publishReplay = vi
      .fn()
      .mockResolvedValue(replayPublication("replay_revocable_1"));
    const revokeReplay = vi
      .fn<() => Promise<RevokeReplayResponse>>()
      .mockResolvedValue({
        replayId: "replay_revocable_1",
        revoked: true,
        alreadyRevoked: false,
      });

    render(
      <ReasoningDiffView
        diff={diff}
        capsule={capsule}
        patch={patch}
        patchDownloadUrl="/patch.ipynb"
        proofCapsuleDownloadUrl="/proof.counterlab"
        publishReplay={publishReplay}
        revokeReplay={revokeReplay}
        publicTextPreview={publicTextPreview}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: /listed evidence and learner-authored text become public/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /confirm and publish read-only replay/i,
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: /revoke public replay/i }),
    );

    expect(revokeReplay).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("heading", {
        name: /this public replay is revoked/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /open verified replay/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /download repaired notebook/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /export proof capsule/i }),
    ).toBeInTheDocument();
  });

  it("restores an active public replay after refresh without republishing", async () => {
    const publishReplay = vi.fn<() => Promise<PublishReplayResponse>>();
    const restored = replayPublication("replay_restored_1", true);

    render(
      <ReasoningDiffView
        diff={diff}
        capsule={capsule}
        patch={patch}
        patchDownloadUrl="/patch.ipynb"
        proofCapsuleDownloadUrl="/proof.counterlab"
        publishReplay={publishReplay}
        loadReplayStatus={() =>
          Promise.resolve({ status: "active", replay: restored.replay })
        }
        publicTextPreview={publicTextPreview}
      />,
    );

    expect(
      await screen.findByRole("link", { name: /open verified replay/i }),
    ).toHaveAttribute("href", "/replay/replay_restored_1");
    expect(publishReplay).not.toHaveBeenCalled();
  });

  it("restores permanent revocation after refresh", async () => {
    const restored = replayPublication("replay_revoked_1", true);

    render(
      <ReasoningDiffView
        diff={diff}
        capsule={capsule}
        patch={patch}
        patchDownloadUrl="/patch.ipynb"
        proofCapsuleDownloadUrl="/proof.counterlab"
        publishReplay={() => Promise.resolve(restored)}
        loadReplayStatus={() =>
          Promise.resolve({ status: "revoked", replay: restored.replay })
        }
        publicTextPreview={publicTextPreview}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: /this public replay is revoked/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /confirm and publish read-only replay/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps a failed publication honest and lets the learner retry", async () => {
    const user = userEvent.setup();
    const publishReplay = vi
      .fn()
      .mockRejectedValueOnce(new Error("Replay storage is unavailable."))
      .mockResolvedValueOnce(replayPublication("replay_existing_1", true));

    render(
      <ReasoningDiffView
        diff={diff}
        capsule={capsule}
        patch={patch}
        patchDownloadUrl="/patch.ipynb"
        proofCapsuleDownloadUrl="/proof.counterlab"
        publishReplay={publishReplay}
        publicTextPreview={publicTextPreview}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: /listed evidence and learner-authored text become public/i,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: /confirm and publish read-only replay/i,
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Replay storage is unavailable.",
    );

    await user.click(
      screen.getByRole("button", { name: /retry replay publication/i }),
    );

    expect(publishReplay).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByText(/existing verified replay was returned/i),
    ).toBeInTheDocument();
  });

  it("prevents duplicate replay publication while the first request is pending", async () => {
    const user = userEvent.setup();
    let resolvePublication!: (value: PublishReplayResponse) => void;
    const publishReplay = vi.fn(
      () =>
        new Promise<PublishReplayResponse>((resolve) => {
          resolvePublication = resolve;
        }),
    );

    render(
      <ReasoningDiffView
        diff={diff}
        capsule={capsule}
        patch={patch}
        patchDownloadUrl="/patch.ipynb"
        proofCapsuleDownloadUrl="/proof.counterlab"
        publishReplay={publishReplay}
        publicTextPreview={publicTextPreview}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: /listed evidence and learner-authored text become public/i,
      }),
    );

    const publishButton = screen.getByRole("button", {
      name: /confirm and publish read-only replay/i,
    });
    await user.click(publishButton);
    expect(
      screen.getByRole("button", { name: /publishing replay/i }),
    ).toBeDisabled();
    await user.click(publishButton);
    expect(publishReplay).toHaveBeenCalledTimes(1);

    resolvePublication(replayPublication("replay_pending_1"));
    expect(
      await screen.findByRole("link", { name: /open verified replay/i }),
    ).toHaveAttribute("href", "/replay/replay_pending_1");
  });
});
