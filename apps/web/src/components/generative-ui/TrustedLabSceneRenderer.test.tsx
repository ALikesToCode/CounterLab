import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  LabSceneV2Schema,
  type LabSceneV2,
} from "@counterlab/generative-ui-contracts";

import {
  TrustedLabSceneRenderer,
  resolveTrustedLabSceneBinding,
  type TrustedLabSceneResultEnvelope,
} from "./TrustedLabSceneRenderer";

const digest = (character: string) => character.repeat(64);
const sceneHash = digest("c");
const resultHash = digest("d");

function scene(
  blocks: LabSceneV2["blocks"] = [
    {
      id: "hypotheses",
      type: "Hypothesis",
      current: "The row score generalizes to new customers.",
      competing: "Repeated customer identity inflates the row score.",
    },
    {
      id: "prediction",
      type: "Prediction",
      prompt: "What did you expect before the result?",
      immutableBinding: "/prediction/choice",
    },
    {
      id: "why",
      type: "WhyThisTest",
      text: "Change only the customer boundary and hold the model fixed.",
    },
    {
      id: "groupMetric",
      type: "Metric",
      label: "Whole-customer accuracy",
      resultBinding: "/runs/byId/group_holdout/metrics/accuracy",
      unit: "proportion",
    },
    {
      id: "comparison",
      type: "BarChart",
      label: "Evaluation comparison",
      resultBinding: "/presentation/comparison",
      xLabel: "Evaluation boundary",
      yLabel: "Accuracy",
      xUnit: "category",
      yUnit: "proportion",
      accessibleLabel:
        "Accuracy under random-row and whole-customer evaluation",
    },
    {
      id: "proof",
      type: "ProofBadge",
      label: "Independent verifier",
      proofBinding: "/proof/verdict",
    },
  ],
): LabSceneV2 {
  return LabSceneV2Schema.parse({
    schemaVersion: "2",
    sceneId: "scene_trusted_1",
    sessionId: "session_trusted_1",
    concept: "entity_leakage",
    supportLabel: "GUIDED_VISUAL",
    title: "Does the score survive a whole-customer holdout?",
    blocks,
    assumptions: ["The model, seed, fixture, and preprocessing stay fixed."],
    limitations: [
      "This test does not establish performance for every customer.",
    ],
    provenance: {
      experimentIrHash: digest("a"),
      discriminationContractHash: digest("b"),
    },
  });
}

function signedResult(
  overrides: Partial<TrustedLabSceneResultEnvelope> = {},
): TrustedLabSceneResultEnvelope {
  return {
    schemaVersion: "1",
    verificationStatus: "VERIFIED",
    sceneHash,
    sceneId: "scene_trusted_1",
    sessionId: "session_trusted_1",
    concept: "entity_leakage",
    experimentIrHash: digest("a"),
    discriminationContractHash: digest("b"),
    resultHash,
    integrity: {
      mode: "integrity-hashed",
      contentHash: resultHash,
    },
    result: {
      resultHash,
      prediction: {
        choice: "The accuracy will remain high for unseen customers.",
      },
      runs: [
        { id: "random_rows", metrics: { accuracy: 0.985 } },
        { id: "group_holdout", metrics: { accuracy: 0.594 } },
      ],
      presentation: {
        comparison: [
          { x: "Random rows", y: 0.985 },
          { x: "Whole customers", y: 0.594 },
        ],
      },
      proof: { verdict: "SUPPORTS" },
      privateReasoning:
        "This field is intentionally not bound and must never be displayed.",
    },
    ...overrides,
  };
}

function mediaQuery(matches: boolean): MediaQueryList {
  return {
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  };
}

describe("TrustedLabSceneRenderer", () => {
  it("renders exact signed values through numeric and by-id bindings", () => {
    render(
      <TrustedLabSceneRenderer
        scene={scene()}
        verifiedSceneHash={sceneHash}
        signedResult={signedResult()}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Does the score survive a whole-customer holdout?",
      }),
    ).toBeVisible();
    expect(screen.getAllByText("0.594")).toHaveLength(2);
    expect(screen.getByText("Integrity-hashed")).toBeVisible();
    expect(
      screen.getByRole("img", {
        name: "Accuracy under random-row and whole-customer evaluation",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("table", { name: "Evaluation comparison exact values" }),
    ).toHaveTextContent("Random rows0.985");
    expect(screen.getByLabelText("Sealed prediction")).toHaveTextContent(
      "The accuracy will remain high for unseen customers.",
    );
    expect(
      screen.queryByText(/intentionally not bound and must never/i),
    ).not.toBeInTheDocument();
  });

  it("withholds the entire scene when a binding is unresolved", () => {
    const unresolved = scene().blocks.map((block) =>
      block.type === "Metric"
        ? { ...block, resultBinding: "/runs/byId/missing/metrics/accuracy" }
        : block,
    );
    render(
      <TrustedLabSceneRenderer
        scene={scene(unresolved)}
        verifiedSceneHash={sceneHash}
        signedResult={signedResult()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /verified scene unavailable/i,
    );
    expect(screen.queryByText("0.594")).not.toBeInTheDocument();
    expect(
      screen.queryByText("The row score generalizes to new customers."),
    ).not.toBeInTheDocument();
  });

  it("labels hash-only integrity without claiming a signature", () => {
    render(
      <TrustedLabSceneRenderer
        scene={scene()}
        verifiedSceneHash={sceneHash}
        signedResult={signedResult({
          integrity: {
            mode: "integrity-hashed",
            contentHash: resultHash,
          },
        })}
      />,
    );
    expect(screen.getByText("Integrity-hashed")).toBeVisible();
    expect(screen.queryByText("HMAC-signed")).not.toBeInTheDocument();
  });

  it("fails closed on stale authority, unknown blocks, and prototype paths", () => {
    const { rerender } = render(
      <TrustedLabSceneRenderer
        scene={scene()}
        verifiedSceneHash={sceneHash}
        signedResult={signedResult({ sceneHash: digest("9") })}
      />,
    );
    expect(screen.getByRole("alert")).toBeVisible();

    rerender(
      <TrustedLabSceneRenderer
        scene={scene()}
        verifiedSceneHash={sceneHash}
        signedResult={signedResult({
          integrity: {
            mode: "hmac-signed",
            contentHash: resultHash,
            signature: digest("f"),
            keyId: "counterlab-result-v1",
          },
        } as unknown as Partial<TrustedLabSceneResultEnvelope>)}
      />,
    );
    expect(screen.getByRole("alert")).toBeVisible();

    rerender(
      <TrustedLabSceneRenderer
        scene={scene()}
        verifiedSceneHash={sceneHash}
        signedResult={signedResult({
          integrity: {
            mode: "integrity-hashed",
            contentHash: digest("8"),
          },
        })}
      />,
    );
    expect(screen.getByRole("alert")).toBeVisible();

    const unknownScene = {
      ...scene(),
      blocks: [{ id: "rawHtml", type: "Html", html: "<script>bad()</script>" }],
    } as unknown as LabSceneV2;
    rerender(
      <TrustedLabSceneRenderer
        scene={unknownScene}
        verifiedSceneHash={sceneHash}
        signedResult={signedResult()}
      />,
    );
    expect(screen.getByRole("alert")).toBeVisible();
    expect(
      screen.queryByText("bad()", { exact: false }),
    ).not.toBeInTheDocument();

    const unsafeBindingScene = scene([
      {
        id: "metric",
        type: "Metric",
        label: "Unsafe metric",
        resultBinding: "/__proto__/polluted",
        unit: "proportion",
      },
    ]);
    rerender(
      <TrustedLabSceneRenderer
        scene={unsafeBindingScene}
        verifiedSceneHash={sceneHash}
        signedResult={signedResult()}
      />,
    );
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("rejects ambiguous by-id lookups rather than choosing a duplicate", () => {
    const result = signedResult();
    render(
      <TrustedLabSceneRenderer
        scene={scene()}
        verifiedSceneHash={sceneHash}
        signedResult={{
          ...result,
          result: {
            ...result.result,
            runs: [
              { id: "group_holdout", metrics: { accuracy: 0.594 } },
              { id: "group_holdout", metrics: { accuracy: 0.985 } },
            ],
          },
        }}
      />,
    );
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("replaces motion with the signed reduced-motion summary and keeps exact values", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => mediaQuery(true)),
    });
    const motionScene = scene([
      {
        id: "motion",
        type: "MotionCanvas",
        label: "Verified fall trajectory",
        resultBinding: "/motion/path",
        accessibleTableBinding: "/motion/table",
        reducedMotionBinding: "/motion/summary",
      },
    ]);
    const result = signedResult();
    render(
      <TrustedLabSceneRenderer
        scene={motionScene}
        verifiedSceneHash={sceneHash}
        signedResult={{
          ...result,
          result: {
            resultHash,
            motion: {
              path: [
                { t: 0, position: 10, velocity: 0 },
                { t: 1, position: 5.095, velocity: -9.81 },
              ],
              summary:
                "The signed path moves from 10 metres to 5.095 metres in one second.",
              table: {
                columns: [
                  { key: "t", label: "Time", unit: "s" },
                  { key: "position", label: "Position", unit: "m" },
                  { key: "velocity", label: "Velocity", unit: "m/s" },
                ],
                rows: [
                  { t: 0, position: 10, velocity: 0 },
                  { t: 1, position: 5.095, velocity: -9.81 },
                ],
              },
            },
          },
        }}
      />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /moves from 10 metres to 5\.095 metres/i,
    );
    expect(
      screen.getByRole("table", {
        name: "Verified fall trajectory exact values",
      }),
    ).toContainElement(screen.getByText("5.095"));
  });

  it("withholds a signed visual whose exact table is stale", () => {
    const boundaryScene = scene([
      {
        id: "boundary",
        type: "BoundaryMap",
        label: "Verified boundary",
        resultBinding: "/boundary/points",
        accessibleTableBinding: "/boundary/table",
      },
    ]);
    const result = signedResult();
    render(
      <TrustedLabSceneRenderer
        scene={boundaryScene}
        verifiedSceneHash={sceneHash}
        signedResult={{
          ...result,
          result: {
            resultHash,
            boundary: {
              points: [
                {
                  x: "20%",
                  y: "2 observations",
                  value: 0.08,
                  classification: "Little gap",
                },
              ],
              table: {
                columns: [
                  { key: "x", label: "Test fraction" },
                  { key: "y", label: "Observations" },
                  { key: "value", label: "Optimism gap" },
                  { key: "classification", label: "Classification" },
                ],
                rows: [
                  {
                    x: "20%",
                    y: "2 observations",
                    value: 0.34,
                    classification: "Material gap",
                  },
                ],
              },
            },
          },
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/evidence withheld/i);
    expect(screen.queryByText("0.08")).not.toBeInTheDocument();
  });

  it("emits bounded local control intents without creating a result", async () => {
    const user = userEvent.setup();
    const onControlChange = vi.fn();
    const controls = scene([
      {
        id: "threshold",
        type: "Slider",
        label: "Decision threshold",
        operationId: "imbalance.threshold_sweep",
        parameterId: "threshold",
        min: 0.1,
        max: 0.9,
        step: 0.1,
        defaultValue: 0.5,
        unit: "proportion",
      },
      {
        id: "identity",
        type: "Toggle",
        label: "Keep identity",
        operationId: "leakage.identity_ablation",
        parameterId: "keepIdentity",
        defaultValue: true,
      },
      {
        id: "split",
        type: "SegmentedControl",
        label: "Evaluation boundary",
        operationId: "leakage.controlled_comparison",
        parameterId: "splitStrategy",
        options: [
          { value: "random", label: "Random rows" },
          { value: "group", label: "Whole customers" },
        ],
        defaultValue: "random",
      },
    ]);
    render(
      <TrustedLabSceneRenderer
        scene={controls}
        verifiedSceneHash={sceneHash}
        onControlChange={onControlChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Decision threshold"), {
      target: { value: "0.7" },
    });
    await user.click(screen.getByLabelText("Keep identity"));
    await user.click(screen.getByLabelText("Whole customers"));

    expect(onControlChange).toHaveBeenNthCalledWith(1, {
      blockId: "threshold",
      operationId: "imbalance.threshold_sweep",
      parameterId: "threshold",
      value: 0.7,
    });
    expect(onControlChange).toHaveBeenNthCalledWith(2, {
      blockId: "identity",
      operationId: "leakage.identity_ablation",
      parameterId: "keepIdentity",
      value: false,
    });
    expect(onControlChange).toHaveBeenNthCalledWith(3, {
      blockId: "split",
      operationId: "leakage.controlled_comparison",
      parameterId: "splitStrategy",
      value: "group",
    });
    expect(screen.queryByText(/verified result/i)).not.toBeInTheDocument();
  });

  it("exports a resolver that never traverses inherited or ambiguous values", () => {
    const root = {
      runs: [
        { id: "first", metrics: { accuracy: 0.75 } },
        { id: "second", metrics: { accuracy: 0.625 } },
      ],
    };
    expect(
      resolveTrustedLabSceneBinding(root, "/runs/byId/second/metrics/accuracy"),
    ).toBe(0.625);
    expect(resolveTrustedLabSceneBinding(root, "/runs/0/id")).toBe("first");
    expect(
      resolveTrustedLabSceneBinding(root, "/constructor/name"),
    ).toBeUndefined();
    expect(
      resolveTrustedLabSceneBinding(root, "/runs/byId/missing"),
    ).toBeUndefined();
  });
});
