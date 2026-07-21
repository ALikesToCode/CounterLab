import { render, screen, within } from "@testing-library/react";
import {
  ProofCapsuleReplayV2Schema,
  PublicReplayProjectionV1Schema,
} from "@counterlab/contracts";
import {
  createPublicReplayProjectionV1,
  validatePublicReplayProjectionV1,
} from "@counterlab/proof-capsule";
import { describe, expect, it } from "vitest";

import { ProofCapsuleReplayView } from "./ProofCapsuleReplayView";
import {
  publicReplayFixture,
  replayFixture,
} from "./ProofCapsuleReplayView.fixture";

describe("ProofCapsuleReplayView", () => {
  it.each(["entity_leakage", "class_imbalance"] as const)(
    "keeps the %s replay fixture valid against private and public schemas",
    (concept) => {
      expect(() =>
        ProofCapsuleReplayV2Schema.parse(replayFixture(concept)),
      ).not.toThrow();
      expect(() =>
        PublicReplayProjectionV1Schema.parse(publicReplayFixture(concept)),
      ).not.toThrow();
    },
  );

  it("exposes the six replay stages as keyboard-accessible in-page links", () => {
    render(
      <ProofCapsuleReplayView replay={publicReplayFixture("entity_leakage")} />,
    );

    const stages = screen.getByRole("navigation", {
      name: "Replay evidence stages",
    });
    const links = within(stages).getAllByRole("link");
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      "01Question",
      "02Prediction",
      "03Test",
      "04Boundary",
      "05Apply",
      "06Repair",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#replay-question",
      "#replay-prediction",
      "#replay-test",
      "#replay-boundary",
      "#replay-apply",
      "#replay-repair",
    ]);
  });

  it("renders a dynamic live-artifact replay without mutable lesson controls", () => {
    const replay = publicReplayFixture("class_imbalance");
    render(<ProofCapsuleReplayView replay={replay} />);

    expect(
      screen.getByRole("complementary", { name: "Verified replay mode" }),
    ).toHaveTextContent(
      "Read-only playback · no new model call or experiment run",
    );
    expect(
      screen.getByText("Completed live notebook analysis"),
    ).toBeInTheDocument();
    expect(screen.getByText("Private notebook withheld")).toBeInTheDocument();
    expect(
      screen.getByText(/our merchant detector is production-ready/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/metric evidence · hash/i)).toBeInTheDocument();
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
    expect(document.body).not.toHaveTextContent(/classification_report/);

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

  it("labels its optional exit as home navigation rather than a new run", () => {
    render(
      <ProofCapsuleReplayView
        replay={publicReplayFixture("entity_leakage")}
        onStartOver={() => undefined}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Return to CounterLab home" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /start|run.*test|new analysis/i }),
    ).not.toBeInTheDocument();
  });

  it("renders leakage authority without exposing private downloads or identifiers", () => {
    const replay = publicReplayFixture("entity_leakage");
    render(<ProofCapsuleReplayView replay={replay} />);

    expect(screen.getByText("Private notebook withheld")).toBeInTheDocument();
    expect(
      screen.getByText(/this account-retention model will generalize/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("96.0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("58.0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0 shared entities/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Material gap")).toHaveLength(2);

    expect(
      screen
        .getAllByRole("link")
        .filter((link) => link.hasAttribute("download")),
    ).toEqual([]);

    const proof = document.getElementById("replay-proof");
    expect(proof).not.toBeNull();
    expect(within(proof!).getByText("Integrity-hashed")).toBeInTheDocument();
    expect(screen.getByText("replay_retention_913")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("session_live_retention_913");
    expect(document.body).not.toHaveTextContent("account_retention_live.ipynb");
    expect(document.body).not.toHaveTextContent("account retention accuracy");
    expect(document.body).not.toHaveTextContent(/train_test_split/);
    expect(screen.getByText("external-verifier-v3")).toBeInTheDocument();
    expect(screen.getByText(/gpt-5\.6-sol/)).toBeInTheDocument();
    expect(
      screen.getAllByText(/does not establish global model quality/i).length,
    ).toBeGreaterThan(0);
  });

  it("groups share-safe replay activity without publishing private event detail", () => {
    const replay = structuredClone(publicReplayFixture("entity_leakage"));
    const view = render(<ProofCapsuleReplayView replay={replay} />);

    const disclosure = screen
      .getByText("Evidence & proof · provenance, activity, and limitations")
      .closest("details");
    expect(disclosure).not.toBeNull();

    for (const group of ["Activity", "Plan", "Diff", "Tests", "Verifier"]) {
      expect(
        within(disclosure!).getByRole("heading", { name: group, level: 3 }),
      ).toBeInTheDocument();
    }
    expect(
      within(disclosure!).getAllByText(
        "No share-safe events are published in this group.",
      ),
    ).toHaveLength(3);

    const baseEvent = replay.activity[0]!;
    replay.activity = [
      { ...baseEvent, sequence: 1, kind: "session.created" },
      { ...baseEvent, sequence: 2, kind: "lab.compilation_started" },
      { ...baseEvent, sequence: 3, kind: "patch.verified" },
      { ...baseEvent, sequence: 4, kind: "transfer.passed" },
      {
        ...baseEvent,
        sequence: 5,
        actor: "verifier",
        kind: "experiment.evidence_verified",
      },
    ];
    view.rerender(<ProofCapsuleReplayView replay={replay} />);

    const expectedKinds = [
      ["Activity", "session.created"],
      ["Plan", "lab.compilation_started"],
      ["Diff", "patch.verified"],
      ["Tests", "transfer.passed"],
      ["Verifier", "experiment.evidence_verified"],
    ] as const;
    for (const [group, kind] of expectedKinds) {
      const groupSection = within(disclosure!)
        .getByRole("heading", { name: group, level: 3 })
        .closest("section");
      expect(groupSection).not.toBeNull();
      expect(within(groupSection!).getByText(kind)).toBeInTheDocument();
    }

    expect(disclosure).toHaveTextContent(
      "This public replay publishes sequence, actor, and allowlisted event kind only.",
    );
    expect(disclosure).toHaveTextContent(
      "Job IDs, event IDs, timestamps, source excerpts, and patch diffs are not published.",
    );
    expect(disclosure).not.toHaveTextContent("job_live_1");
    expect(disclosure).not.toHaveTextContent("compiler_event_1");
    expect(disclosure).not.toHaveTextContent("2026-07-16T12:45:00.000Z");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("produces a deterministic, tamper-evident projection with forbidden fields absent", () => {
    const source = replayFixture("entity_leakage");
    const first = createPublicReplayProjectionV1(source, {
      signing: { keyId: "replay-test-key", signingKey: "test-signing-key" },
    });
    const second = createPublicReplayProjectionV1(source, {
      signing: { keyId: "replay-test-key", signingKey: "test-signing-key" },
    });

    expect(first).toEqual(second);
    expect(() =>
      validatePublicReplayProjectionV1(first, {
        expectedIntegrityMode: "hmac-signed",
        signingKeys: { "replay-test-key": "test-signing-key" },
      }),
    ).not.toThrow();

    const serialized = JSON.stringify(first);
    const keys = new Set<string>();
    const collectKeys = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(collectKeys);
        return;
      }
      if (value === null || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        keys.add(key);
        collectKeys(child);
      }
    };
    collectKeys(first);
    for (const forbiddenKey of [
      "sourceSessionId",
      "sessionId",
      "artifactId",
      "fileName",
      "sourceExcerpt",
      "diff",
      "unifiedDiff",
      "objectKey",
      "jobId",
      "eventId",
      "reasoning",
      "identifiedRisks",
      "generatedAt",
      "timestamp",
      "fixtureViewHash",
      "randomPipelineFingerprint",
      "groupPipelineFingerprint",
      "scoreFingerprint",
      "pipelineFingerprint",
    ]) {
      expect(keys).not.toContain(forbiddenKey);
    }
    for (const forbiddenValue of [
      "account_retention_live.ipynb",
      "train_test_split",
      "classification_report",
      "session_live_retention_913",
    ]) {
      expect(serialized).not.toContain(forbiddenValue);
    }

    const tampered = structuredClone(first);
    tampered.test.result.runs[0]!.seed += 1;
    expect(() =>
      validatePublicReplayProjectionV1(tampered, {
        signingKeys: { "replay-test-key": "test-signing-key" },
      }),
    ).toThrow(/projection hash/i);
  });
});
