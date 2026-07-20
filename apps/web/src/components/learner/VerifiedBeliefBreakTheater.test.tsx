import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requireBundledSampleResult } from "../../sample";
import {
  VerifiedBeliefBreakMechanism,
  VerifiedBeliefBreakTheater,
} from "./VerifiedBeliefBreakTheater";

const verifier = vi.hoisted(() => vi.fn());
const sampleResult = requireBundledSampleResult();

vi.mock("../../features/boundary/sampleBoundaryFixture", () => ({
  sampleBoundaryFixture: { fixtureId: "test-boundary-fixture" },
  verifySampleBoundaryFixtureIntegrity: verifier,
}));

const fixtureIntegrityHash = "f".repeat(64);
const primaryResultFileHash =
  "e2c1cad1e6d774d45671760602e236643bd41ce328df18ff61f1c60344f76170";

describe("VerifiedBeliefBreakTheater", () => {
  beforeEach(() => {
    verifier.mockResolvedValue({
      source: {
        primaryResultFileHash,
        primaryResultHash: sampleResult.resultHash,
      },
      fixtureIntegrityHash,
    });
  });

  afterEach(() => {
    verifier.mockReset();
    vi.unstubAllGlobals();
  });

  it("keeps values hidden while full fixture integrity is pending", () => {
    verifier.mockReturnValue(new Promise(() => undefined));
    render(<VerifiedBeliefBreakTheater presentation="preview" />);

    expect(screen.getByText("Verified sample exploration")).toBeVisible();
    expect(
      screen.getByRole("status", {
        name: /checking verified belief-break evidence/i,
      }),
    ).toHaveTextContent(/values stay hidden/i);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("98.5%")).not.toBeInTheDocument();
    expect(screen.queryByText("389")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", {
        name: /changed variable: evaluation unit/i,
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Boundary consequence")).not.toBeInTheDocument();
    expect(screen.queryByText("Learner benefit")).not.toBeInTheDocument();
  });

  it("uses an explicit stable preview presentation instead of compressing the full Theater", () => {
    verifier.mockReturnValue(new Promise(() => undefined));
    render(<VerifiedBeliefBreakTheater presentation="preview" />);

    const theater = screen.getByRole("region", {
      name: /one fair test changed what the score means/i,
    });
    expect(theater).toHaveAttribute("data-presentation", "preview");
    expect(theater.className).toContain("preview");
    expect(
      theater.querySelector('[data-layout="stable-preview"]'),
    ).toBeInTheDocument();
    expect(theater.className).not.toContain("compact");
  });

  it("gives the preview one dominant fixed-evidence comparison", async () => {
    render(<VerifiedBeliefBreakTheater presentation="preview" />);

    const theater = screen.getByRole("region", {
      name: /one fair test changed what the score means/i,
    });
    const comparison = await within(theater).findByRole("group", {
      name: /customer overlap falls from 389 to 0/i,
    });
    const splitMechanism = within(theater).getByRole("group", {
      name: /why random rows and whole-customer holdout answer different questions/i,
    });

    expect(theater.querySelectorAll("figure")).toHaveLength(1);
    expect(comparison).toHaveAccessibleName(/98.5% to 59.4%/i);
    expect(within(theater).getByText("Fixed-kernel evidence")).toBeVisible();
    expect(
      within(theater).getByText("Only the evaluation unit changed"),
    ).toBeVisible();
    expect(within(theater).getByText("Random-row test")).toBeVisible();
    expect(within(theater).getByText("New-customer test")).toBeVisible();
    expect(
      within(theater).getByText(
        "Model, features, preprocessing, sample sizes, and seed stayed fixed.",
      ),
    ).toBeVisible();
    expect(
      within(theater).getByText(/did not mean the model generalized/i),
    ).toBeVisible();
    expect(within(theater).getByText("Boundary consequence")).toBeVisible();
    expect(within(theater).getByText("Learner benefit")).toBeVisible();
    expect(
      within(splitMechanism).getByRole("article", {
        name: /customer a appears in both training and test/i,
      }),
    ).toBeVisible();
    expect(
      within(splitMechanism).getByRole("article", {
        name: /training contains customers a, b, and c while test contains d and e/i,
      }),
    ).toBeVisible();
    expect(
      within(splitMechanism).getByText("Customer A appears on both sides"),
    ).toBeVisible();
    expect(
      within(splitMechanism).getByText(
        "Train and test identities are disjoint",
      ),
    ).toBeVisible();
    expect(splitMechanism).toHaveTextContent("↔");
    expect(splitMechanism).toHaveTextContent("∅");
  });

  it("reveals the bounded mechanism, exact values, and hash evidence after verification", async () => {
    const user = userEvent.setup();
    render(<VerifiedBeliefBreakTheater />);

    const comparison = await screen.findByRole("group", {
      name: /customer overlap falls from 389 to 0/i,
    });
    expect(comparison).toHaveAccessibleName(/98.5% to 59.4%/i);
    expect(
      screen.getByText(/lettered tokens illustrate repeated customers/i),
    ).toBeVisible();
    expect(screen.getByText("Repeated customers")).toBeVisible();
    expect(screen.getByText("No shared customers")).toBeVisible();
    expect(screen.getByText("Same customers cross the split")).toBeVisible();
    expect(screen.getByText("New customers stay separate")).toBeVisible();
    expect(
      screen.getByText(/did not demonstrate generalization/i),
    ).toBeVisible();

    await user.click(
      screen.getByText("Exact values and integrity", { selector: "summary" }),
    );

    const table = screen.getByRole("table", {
      name: "Exact fixed-kernel evidence",
    });
    expect(
      within(table).getByRole("cell", { name: "0.984722222222" }),
    ).toBeVisible();
    expect(
      within(table).getByRole("cell", { name: "0.594444444444" }),
    ).toBeVisible();
    expect(within(table).getByRole("cell", { name: "389" })).toBeVisible();
    expect(within(table).getByRole("cell", { name: "0" })).toBeVisible();
    expect(screen.getByText(sampleResult.resultHash)).toBeVisible();
    expect(screen.getByText(fixtureIntegrityHash)).toBeVisible();
  });

  it("fails closed without values when fixture verification rejects", async () => {
    verifier.mockRejectedValue(new Error("fixture hash mismatch"));
    render(<VerifiedBeliefBreakTheater presentation="preview" />);

    const alert = await screen.findByRole("alert", {
      name: /verified belief-break evidence unavailable/i,
    });
    expect(alert).toHaveTextContent(/refused to present values/i);
    expect(screen.getByText("Verified sample exploration")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("98.5%")).not.toBeInTheDocument();
    expect(screen.queryByText("389")).not.toBeInTheDocument();
    expect(screen.queryByText("Boundary consequence")).not.toBeInTheDocument();
    expect(screen.queryByText("Learner benefit")).not.toBeInTheDocument();
  });

  it("exports the verified mechanism as a reusable integrity-bound body", async () => {
    render(<VerifiedBeliefBreakMechanism presentation="preview" />);

    const mechanism = screen.getByRole("region", {
      name: /verified sample belief-break mechanism/i,
    });
    expect(mechanism).toHaveAttribute("data-presentation", "preview");
    expect(mechanism.className).toContain("preview");
    expect(screen.getByText("Verified sample exploration")).toBeVisible();
    expect(
      screen.queryByRole("heading", {
        name: /watch one fair test change the conclusion/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("group", {
        name: /customer overlap falls from 389 to 0/i,
      }),
    ).toHaveAccessibleName(/98.5% to 59.4%/i);
  });

  it("keeps the compact causal mechanism explicit without relying on color", async () => {
    render(<VerifiedBeliefBreakMechanism presentation="compact" />);

    const mechanism = screen.getByRole("region", {
      name: /verified sample belief-break mechanism/i,
    });
    expect(mechanism).toHaveAttribute("data-presentation", "compact");

    const causalDesign = await within(mechanism).findByRole("group", {
      name: /changed variable: evaluation unit/i,
    });
    expect(causalDesign).toHaveAccessibleName(/familiar-row test/i);
    expect(causalDesign).toHaveAccessibleName(/whole-customer holdout/i);
    expect(causalDesign).toHaveAccessibleName(/every test identity unseen/i);
    expect(causalDesign).toHaveAccessibleName(
      /sample sizes, and seed stay fixed/i,
    );
    expect(
      within(causalDesign).getByText(/Familiar rows · identities repeat/i),
    ).toBeVisible();
    expect(within(causalDesign).getByText("Evaluation unit")).toBeVisible();
    expect(
      within(causalDesign).getByText(
        /Unseen customers · identities stay apart/i,
      ),
    ).toBeVisible();

    expect(
      within(mechanism).getByText(
        "Model, features, preprocessing, sample sizes, and seed stayed fixed.",
      ),
    ).toBeVisible();
    expect(
      within(mechanism).getByText(
        /98\.5% became 59\.4% when test identities were new/i,
      ),
    ).toBeVisible();
    expect(within(mechanism).getByText("Boundary consequence")).toBeVisible();
    expect(within(mechanism).getByText("Learner benefit")).toBeVisible();
    expect(
      within(mechanism).queryByText("Exact values and integrity"),
    ).not.toBeInTheDocument();
    expect(within(mechanism).queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.getByRole("status", {
        name: /fixed sample evidence integrity verified/i,
      }),
    ).toBeInTheDocument();
  });

  it("reuses the compact mechanism without loading or revealing result values before Prediction", () => {
    render(
      <VerifiedBeliefBreakMechanism
        presentation="compact"
        resultVisibility="locked"
      />,
    );

    const mechanism = screen.getByRole("region", {
      name: /fair-test mechanism with result locked/i,
    });
    expect(mechanism).toHaveAttribute("data-result-visibility", "locked");
    expect(mechanism).toHaveTextContent(
      /familiar-row test.*unseen-entity test/i,
    );
    expect(mechanism).toHaveTextContent(/result locked until Prediction/i);
    expect(mechanism).toHaveTextContent(/model.*metric.*seed stay fixed/i);
    expect(mechanism).toHaveTextContent(
      /stays similar when only the evaluation unit changes/i,
    );
    expect(mechanism).not.toHaveTextContent(/fairer|proves|verified result/i);
    expect(within(mechanism).queryByText(/98\.5%|59\.4%/i)).toBeNull();
    expect(verifier).not.toHaveBeenCalled();
  });

  it("fails closed when the Boundary fixture points at a different primary result", async () => {
    verifier.mockResolvedValue({
      source: {
        primaryResultFileHash,
        primaryResultHash: "0".repeat(64),
      },
      fixtureIntegrityHash,
    });
    render(<VerifiedBeliefBreakTheater />);

    await screen.findByRole("alert", {
      name: /verified belief-break evidence unavailable/i,
    });
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("hides previously verified values immediately when the expected result binding changes", async () => {
    const { rerender } = render(
      <VerifiedBeliefBreakMechanism
        presentation="preview"
        expectedResultHash={sampleResult.resultHash}
      />,
    );

    expect(await screen.findByText("98.5%")).toBeVisible();
    verifier.mockReturnValueOnce(new Promise(() => undefined));

    rerender(
      <VerifiedBeliefBreakMechanism
        presentation="preview"
        expectedResultHash={"0".repeat(64)}
      />,
    );

    expect(screen.queryByText("98.5%")).not.toBeInTheDocument();
    expect(screen.queryByText("59.4%")).not.toBeInTheDocument();
    expect(
      screen.getByRole("status", {
        name: /checking verified belief-break evidence/i,
      }),
    ).toHaveTextContent(/values stay hidden/i);
  });

  it("fails closed when the checked-in result bytes do not match the fixture", async () => {
    verifier.mockResolvedValue({
      source: {
        primaryResultFileHash: "0".repeat(64),
        primaryResultHash: sampleResult.resultHash,
      },
      fixtureIntegrityHash,
    });
    render(<VerifiedBeliefBreakTheater />);

    await screen.findByRole("alert", {
      name: /verified belief-break evidence unavailable/i,
    });
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("does not call a network, model, or runner surface while revealing local evidence", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<VerifiedBeliefBreakTheater />);

    await waitFor(() => {
      expect(
        screen.getByRole("group", {
          name: /customer overlap falls from 389 to 0/i,
        }),
      ).toBeVisible();
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
