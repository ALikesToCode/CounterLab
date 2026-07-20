import { render, screen } from "@testing-library/react";
import type { EvidenceEvent, PublicCompilerEvent } from "@counterlab/contracts";
import { describe, expect, it } from "vitest";

import { ProvenanceLedger } from "./ProvenanceLedger";
import type { StudioContext } from "./types";

const digest = (character: string): string => character.repeat(64);

function event(
  sequence: number,
  actor: EvidenceEvent["actor"],
  kind: string,
  overrides: Partial<EvidenceEvent> = {},
): EvidenceEvent {
  return {
    schemaVersion: "1",
    eventId: `event_${sequence}`,
    sessionId: "session_1",
    sequence,
    timestamp: `2026-07-19T10:00:0${sequence}.000Z`,
    actor,
    kind,
    inputHashes: [],
    outputHashes: [],
    payload: {},
    ...(sequence === 1 ? {} : { previousEventHash: digest("a") }),
    eventHash: digest(sequence.toString(16)),
    ...overrides,
  };
}

function context(overrides: Partial<StudioContext> = {}): StudioContext {
  return {
    mode: "live",
    stage: "live-compile",
    artifact: null,
    session: null,
    events: [],
    evidenceEvents: [],
    ...overrides,
  };
}

function verifiedCompilerPayload() {
  return {
    schemaVersion: "5",
    status: "VERIFIED",
    source: "hosted-experiment-ir-v5",
    jobId: "job_1",
    inputBundleHash: digest("1"),
    artifactManifestHash: digest("2"),
    beliefSpecHash: digest("3"),
    predictionHash: digest("4"),
    compilerOutputFileHashes: {
      "discrimination-contract.json": digest("5"),
      "experiment-ir.json": digest("6"),
      "lab-scene.json": digest("7"),
      "public-rationale.md": digest("8"),
    },
    discriminationContractHash: digest("9"),
    rawExperimentIrCanonicalHash: digest("a"),
    labSceneHash: digest("b"),
    candidateVerificationReportHash: digest("e"),
    scientificVerifierVersion: "scientific-candidate-verifier-v3",
    selectionHash: digest("c"),
    selectedExperimentIrHash: digest("d"),
    projectedPlanHash: digest("f"),
    scorerVersion: "fixed-candidate-scorer-v1",
    projectionAdapterVersion: "experiment-ir-v5-to-plan-v2-v1",
  } as const;
}

describe("ProvenanceLedger", () => {
  it("labels fixed sample content without manufacturing model or Codex calls", () => {
    render(
      <ProvenanceLedger
        context={context({
          mode: "instant",
          evidenceEvents: [
            event(1, "system", "belief_test.proposed", {
              modelId: "approved-sample-v1",
            }),
            event(2, "system", "lab.compilation_started", {
              payload: { authority: "fixed-approved-sample" },
            }),
            event(3, "verifier", "lab.verified", {
              payload: {
                planHash: digest("c"),
                verifiedOperationSummary: {
                  schemaVersion: "1",
                  authority: "fixed-approved-sample",
                  authorityHash: digest("c"),
                  selectionRef: "stored-approved-leakage-v1",
                  operationIds: [
                    "leakage.random_row_split",
                    "leakage.group_holdout",
                    "leakage.identity_ablation",
                  ],
                },
              },
            }),
          ],
        })}
      />,
    );

    expect(
      screen.getByText(/fixed approved sample framing/i),
    ).toHaveTextContent(/no GPT-5\.6 call recorded/i);
    expect(screen.getByText(/fixed approved sample plans/i)).toHaveTextContent(
      /no Runtime Codex call recorded/i,
    );
    expect(
      screen.getByText(/no hosted compiler artifact claim/i),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Recorded call/i);
    expect(screen.getByText(/leakage\.random_row_split/i)).toHaveTextContent(
      /leakage\.group_holdout.*leakage\.identity_ablation/i,
    );
    expect(screen.getByText(/stored-approved-leakage-v1/i)).toHaveTextContent(
      /fixed-approved-sample/i,
    );
  });

  it("shows only genuinely recorded model, compiler, plan, and repair provenance", () => {
    const compilerEvents: PublicCompilerEvent[] = [
      {
        schemaVersion: "1",
        eventId: "compiler_plan",
        jobId: "job_1",
        cursor: 1,
        at: "2026-07-19T10:00:04.000Z",
        kind: "plan.summary",
        title: "One-variable evaluation plan",
        steps: ["Hold model fixed", "Change evaluation unit"],
      },
      {
        schemaVersion: "1",
        eventId: "compiler_rejection",
        jobId: "job_1",
        cursor: 2,
        at: "2026-07-19T10:00:05.000Z",
        kind: "verifier.rejected",
        invariant: "one_variable_change",
        observed: "model and split changed",
        expected: "only split changes",
        counterexample: "The first plan also changed the model.",
      },
    ];
    render(
      <ProvenanceLedger
        context={context({
          events: compilerEvents,
          evidenceEvents: [
            event(1, "gpt-5.6", "belief_spec.proposed", {
              modelId: "gpt-5.6",
              promptHash: digest("b"),
            }),
            event(2, "system", "lab.compilation_started", {
              payload: { authority: "runtime-codex-requested" },
            }),
            event(3, "verifier", "lab.verified", {
              payload: {
                ...verifiedCompilerPayload(),
                verifiedOperationSummary: {
                  schemaVersion: "1",
                  authority: "verified-selected-experiment-ir",
                  authorityHash: digest("d"),
                  selectionRef: "group-holdout-plus-ablation",
                  operationIds: [
                    "leakage.random_row_split",
                    "leakage.group_holdout",
                  ],
                },
              },
            }),
          ],
        })}
      />,
    );

    expect(
      screen.getByText(/Recorded call · model gpt-5\.6/i),
    ).toHaveTextContent(digest("b"));
    expect(
      screen.getByText(/Verifier-bound hosted compiler artifacts/i),
    ).toHaveTextContent(/job_1.*experiment-ir\.json.*lab-scene\.json/i);
    expect(
      screen.getByText(/no authenticated Runtime Codex invocation receipt/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/One-variable evaluation plan/i)).toHaveTextContent(
      /Hold model fixed · Change evaluation unit/i,
    );
    expect(screen.getByText(/one_variable_change/i)).toHaveTextContent(
      /first plan also changed the model/i,
    );
    expect(screen.getAllByText(digest("d"))).toHaveLength(2);
    expect(screen.getByText(digest("e"))).toBeInTheDocument();
    expect(screen.getByText(/leakage\.random_row_split/i)).toHaveTextContent(
      /leakage\.group_holdout/i,
    );
    expect(screen.getByText(/group-holdout-plus-ablation/i)).toHaveTextContent(
      /verified-selected-experiment-ir/i,
    );
  });

  it("does not treat a request marker or legacy Codex actor label as successful compilation", () => {
    render(
      <ProvenanceLedger
        context={context({
          evidenceEvents: [
            event(1, "system", "lab.compilation_started", {
              payload: { authority: "runtime-codex-requested" },
            }),
            event(2, "codex", "patch.compilation_started"),
          ],
        })}
      />,
    );

    expect(
      screen.getByText(
        /requested.*no authenticated Runtime Codex invocation receipt/i,
      ),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /hosted compiler artifacts · job/i,
    );
  });

  it("ignores operation claims that are not bound by the verifier event", () => {
    render(
      <ProvenanceLedger
        context={context({
          evidenceEvents: [
            event(1, "codex", "lab.verified", {
              payload: {
                selectedExperimentIrHash: digest("a"),
                verifiedOperationSummary: {
                  schemaVersion: "1",
                  authority: "verified-selected-experiment-ir",
                  authorityHash: digest("a"),
                  selectionRef: "untrusted-selection",
                  operationIds: ["leakage.group_holdout"],
                },
              },
            }),
            event(2, "verifier", "lab.verified", {
              payload: {
                selectedExperimentIrHash: digest("b"),
                verifiedOperationSummary: {
                  schemaVersion: "1",
                  authority: "verified-selected-experiment-ir",
                  authorityHash: digest("c"),
                  selectionRef: "stale-selection",
                  operationIds: ["leakage.identity_ablation"],
                },
              },
            }),
          ],
        })}
      />,
    );

    expect(
      screen.getByText(/unavailable in the verified public event chain/i),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("untrusted-selection");
    expect(document.body).not.toHaveTextContent("stale-selection");
  });

  it("names each hash domain and says when live provenance is unavailable", () => {
    render(<ProvenanceLedger context={context()} />);

    for (const label of [
      "Artifact file SHA-256",
      "Operation authority SHA-256",
      "Selected Experiment IR SHA-256",
      "Candidate verifier report SHA-256",
      "Epistemic verifier report SHA-256",
      "Fixed-kernel result SHA-256",
      "Boundary result SHA-256",
      "Recorded event-chain head SHA-256",
      "Proof Capsule root SHA-256",
      "Recorded generator/template commit",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(
      screen.getByText(/no GPT-5\.6 call event recorded/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no authenticated Runtime Codex invocation receipt/i),
    ).toBeInTheDocument();
  });
});
