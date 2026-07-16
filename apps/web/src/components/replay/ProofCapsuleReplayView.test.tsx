import { render, screen, within } from "@testing-library/react";
import { ProofCapsuleReplayV2Schema } from "@counterlab/contracts";
import { describe, expect, it } from "vitest";

import { ProofCapsuleReplayView } from "./ProofCapsuleReplayView";
import { replayFixture } from "./ProofCapsuleReplayView.fixture";

describe("ProofCapsuleReplayView", () => {
  it.each(["entity_leakage", "class_imbalance"] as const)(
    "keeps the %s replay fixture valid against the public Capsule schema",
    (concept) => {
      expect(() =>
        ProofCapsuleReplayV2Schema.parse(replayFixture(concept)),
      ).not.toThrow();
    },
  );

  it("renders a dynamic live-artifact replay without mutable lesson controls", () => {
    const replay = replayFixture("class_imbalance");
    render(
      <ProofCapsuleReplayView
        replay={replay}
        proofCapsuleDownloadUrl="/api/replays/replay_merchant_402/proof-capsule"
        patchedNotebookDownloadUrl="/api/replays/replay_merchant_402/patched-notebook"
      />,
    );

    expect(
      screen.getByRole("complementary", { name: "Verified replay mode" }),
    ).toHaveTextContent(
      "Read-only playback · no new model call or experiment run",
    );
    expect(
      screen.getByText("Completed live notebook analysis"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("merchant_risk_audit_live.ipynb"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/our merchant detector is production-ready/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("merchant holdout accuracy: 0.987"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("98.7%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("17.0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0.412").length).toBeGreaterThan(0);
    expect(
      screen.getByLabelText("Evidence Verdict: SUPPORTS"),
    ).toHaveTextContent("Class rarity hides missed fraud cases");
    expect(
      screen.getByText(/for rare events, i will compare/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/prioritize minority recall/i)).toBeInTheDocument();
    expect(screen.getByText(/classification_report/)).toBeInTheDocument();

    for (const sectionId of [
      "replay-question",
      "replay-prediction",
      "replay-test",
      "replay-boundary",
      "replay-apply",
      "replay-repair",
      "replay-proof",
    ]) {
      expect(document.getElementById(sectionId)).toBeInTheDocument();
    }

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/customer_churn_leakage/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/run fair test/i)).not.toBeInTheDocument();
  });

  it("renders leakage authority and exposes only the two replay-scoped downloads", () => {
    const replay = replayFixture("entity_leakage");
    render(
      <ProofCapsuleReplayView
        replay={replay}
        proofCapsuleDownloadUrl="/api/replays/replay_retention_913/proof-capsule"
        patchedNotebookDownloadUrl="/api/replays/replay_retention_913/patched-notebook"
      />,
    );

    expect(
      screen.getByText("account_retention_live.ipynb"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/this account-retention model will generalize/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("96.0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("58.0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0 shared entities/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Material gap")).toHaveLength(2);

    const capsule = screen.getByRole("link", {
      name: "Download Proof Capsule",
    });
    const notebook = screen.getByRole("link", {
      name: "Download repaired notebook copy",
    });
    expect(capsule).toHaveAttribute(
      "href",
      "/api/replays/replay_retention_913/proof-capsule",
    );
    expect(notebook).toHaveAttribute(
      "href",
      "/api/replays/replay_retention_913/patched-notebook",
    );
    expect(capsule).toHaveAttribute("download");
    expect(notebook).toHaveAttribute("download");
    expect(screen.getAllByRole("link")).toEqual([notebook, capsule]);

    const proof = document.getElementById("replay-proof");
    expect(proof).not.toBeNull();
    expect(within(proof!).getByText("Integrity-hashed")).toBeInTheDocument();
    expect(screen.getByText("replay_retention_913")).toBeInTheDocument();
    expect(screen.getByText("session_live_retention_913")).toBeInTheDocument();
    expect(screen.getByText("external-verifier-v3")).toBeInTheDocument();
    expect(screen.getByText(/gpt-5\.6-sol/)).toBeInTheDocument();
    expect(screen.getByText(/not model quality outside/i)).toBeInTheDocument();
  });
});
