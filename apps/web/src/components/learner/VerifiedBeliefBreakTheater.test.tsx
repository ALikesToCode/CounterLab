import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sampleResult } from "../../sample";
import {
  VerifiedBeliefBreakMechanism,
  VerifiedBeliefBreakTheater,
} from "./VerifiedBeliefBreakTheater";

const verifier = vi.hoisted(() => vi.fn());

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
  });

  it("uses an explicit stable preview presentation instead of compressing the full Theater", () => {
    verifier.mockReturnValue(new Promise(() => undefined));
    render(<VerifiedBeliefBreakTheater presentation="preview" />);

    const theater = screen.getByRole("region", {
      name: /watch one fair test change the conclusion/i,
    });
    expect(theater).toHaveAttribute("data-presentation", "preview");
    expect(theater.className).toContain("preview");
    expect(
      theater.querySelector('[data-layout="stable-preview"]'),
    ).toBeInTheDocument();
    expect(theater.className).not.toContain("compact");
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
