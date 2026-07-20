import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  LegacyReplayResult,
  type LegacyVerifiedReplay,
} from "./LegacyReplayResult";

const digest = (character: string) => character.repeat(64);

function legacyReplayFixture(): LegacyVerifiedReplay {
  return {
    schemaVersion: "1",
    replayId: "leakage-01",
    replay: true,
    recordedAt: "2026-07-14T11:50:37.947Z",
    modelId: "gpt-5.6-sol",
    fixtureId: "customer-churn-public-v1",
    verifierVersion: "leakage-verifier-v1",
    templateCommit: "4f2f647228304d63ac8b9cba8cdca1dc7a07e192",
    compilerTrace: {
      schemaVersion: "1",
      replayId: "leakage-01",
      label: "Verified replay",
      modelId: "gpt-5.6-sol",
      codexVersion: "codex-cli 0.144.4",
      repositoryCommitAtRun: "4f2f647228304d63ac8b9cba8cdca1dc7a07e192",
      publicSdkDocumentationHash: digest("9"),
      recordedAt: "2026-07-14T11:50:37.947Z",
      generationIsolation: {
        status: "PARTIAL",
        limitation: "Generation-time hidden-verifier isolation is partial.",
      },
      candidateExecutionIsolation: {
        status: "VERIFIED",
        properties: ["hidden verifier not mounted", "network denied"],
      },
      trace: [
        {
          stage: "generate",
          status: "COMPLETED",
          run: "rejected-live-run",
          durationMs: 141_218,
          files: [
            "experiment-plan.json",
            "artifact-adapter.py",
            "public_tests.py",
          ],
        },
        {
          stage: "external_verifier",
          status: "REJECTED",
          run: "rejected-live-run",
          invariant: "candidate_execution",
          counterexample: "The first bounded candidate did not execute.",
        },
        {
          stage: "repair_1",
          status: "REJECTED",
          run: "rejected-live-run",
          durationMs: 69_166,
          invariant: "generated_workspace_policy",
          counterexample: "The first repair left an unexpected file.",
        },
        {
          stage: "later_generate",
          status: "COMPLETED",
          run: "verified-live-run",
          durationMs: 79_355,
          note: "A separate later run used corrected public documentation.",
        },
        {
          stage: "external_verifier",
          status: "VERIFIED",
          run: "verified-live-run",
          invariants: 18,
          mutationsDetected: 12,
          mutationsTotal: 12,
          resultHash: digest("f"),
        },
      ],
    },
    result: {
      schemaVersion: "1",
      concept: "entity_leakage",
      fixture: {
        customers: 480,
        rows: 2_880,
        sha256: digest("a"),
        targetRate: 0.49,
      },
      kernelVersion: "leakage-kernel-v1",
      seed: 1_729,
      runs: [
        {
          id: "random_rows",
          splitStrategy: "random",
          groupBy: null,
          dropFeatures: [],
          model: "logistic_regression",
          seed: 1_729,
          inputFingerprint: digest("b"),
          featureSetFingerprint: digest("c"),
          metrics: { accuracy: 0.96, rocAuc: 0.97 },
          sampleSizes: { train: 2_160, test: 720 },
          entityCounts: { train: 479, test: 374 },
          entityOverlap: { count: 373, rate: 0.997 },
        },
        {
          id: "whole_customers",
          splitStrategy: "group",
          groupBy: "customer_id",
          dropFeatures: ["customer_id"],
          model: "logistic_regression",
          seed: 1_729,
          inputFingerprint: digest("d"),
          featureSetFingerprint: digest("e"),
          metrics: { accuracy: 0.58, rocAuc: 0.61 },
          sampleSizes: { train: 2_160, test: 720 },
          entityCounts: { train: 360, test: 120 },
          entityOverlap: { count: 0, rate: 0 },
        },
      ],
      chartData: [
        {
          runId: "random_rows",
          splitStrategy: "random",
          accuracy: 0.96,
          rocAuc: 0.97,
          sampleSize: 720,
          seed: 1_729,
        },
        {
          runId: "whole_customers",
          splitStrategy: "group",
          accuracy: 0.58,
          rocAuc: 0.61,
          sampleSize: 720,
          seed: 1_729,
        },
      ],
      resultHash: digest("f"),
    },
    patch: { status: "VERIFIED" },
  };
}

describe("LegacyReplayResult", () => {
  it("labels legacy evidence as read-only and exposes its stored provenance", () => {
    const replay = legacyReplayFixture();

    render(
      <LegacyReplayResult
        replay={replay}
        onStartSample={vi.fn()}
        onStartOver={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("complementary", { name: "Legacy replay status" }),
    ).toHaveTextContent("Verified replay · read-only stored evidence");
    expect(screen.getByText("leakage-01")).toBeInTheDocument();
    expect(screen.getByText("gpt-5.6-sol")).toBeInTheDocument();
    expect(screen.getByText("codex-cli 0.144.4")).toBeInTheDocument();
    expect(screen.getByText("leakage-verifier-v1")).toBeInTheDocument();
    expect(screen.getByText(replay.templateCommit)).toBeInTheDocument();
    expect(screen.getByText("customer-churn-public-v1")).toBeInTheDocument();
    expect(screen.getByText(/not a live model run/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /what codex proposed and the verifier decided/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/external verifier rejected the candidate/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/repair 1 rejected/i)).toBeInTheDocument();
    expect(
      screen.getByText(/external verifier verified the later run/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/makes no new model or codex call/i),
    ).toBeInTheDocument();
  });

  it("renders only stored comparison values and integrity metadata", () => {
    const replay = legacyReplayFixture();

    render(
      <LegacyReplayResult
        replay={replay}
        onStartSample={vi.fn()}
        onStartOver={vi.fn()}
      />,
    );

    const table = screen.getByRole("table", {
      name: /stored fixed-kernel comparison/i,
    });
    expect(within(table).getByText("Random Rows")).toBeInTheDocument();
    expect(within(table).getByText("Whole Customers")).toBeInTheDocument();
    expect(within(table).getByText("96.0%")).toBeInTheDocument();
    expect(within(table).getByText("58.0%")).toBeInTheDocument();
    expect(within(table).getByText("373 (99.7%)")).toBeInTheDocument();
    expect(within(table).getByText("0 (0.0%)")).toBeInTheDocument();
    expect(screen.getAllByText(replay.result.resultHash)).toHaveLength(2);
    expect(
      screen.getByText("Legacy v1 fixed-kernel result hash"),
    ).toBeInTheDocument();
    expect(screen.getByText("leakage-kernel-v1")).toBeInTheDocument();
    expect(screen.getByText("1729")).toBeInTheDocument();
  });

  it("offers only safe exits and never exposes mutable or authoritative controls", async () => {
    const user = userEvent.setup();
    const onStartSample = vi.fn();
    const onStartOver = vi.fn();

    render(
      <LegacyReplayResult
        replay={legacyReplayFixture()}
        onStartSample={onStartSample}
        onStartOver={onStartOver}
      />,
    );

    const actions = screen.getByRole("group", { name: "Replay exit actions" });
    expect(within(actions).getAllByRole("button")).toHaveLength(2);
    await user.click(
      within(actions).getByRole("button", { name: "Start verified sample" }),
    );
    await user.click(
      within(actions).getByRole("button", { name: "Start over" }),
    );
    expect(onStartSample).toHaveBeenCalledOnce();
    expect(onStartOver).toHaveBeenCalledOnce();

    for (const forbiddenAction of [
      /record revision/i,
      /check transfer/i,
      /compile repair/i,
      /apply patch/i,
      /download repaired/i,
      /download proof/i,
    ]) {
      expect(
        screen.queryByRole("button", { name: forbiddenAction }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: forbiddenAction }),
      ).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });
});
