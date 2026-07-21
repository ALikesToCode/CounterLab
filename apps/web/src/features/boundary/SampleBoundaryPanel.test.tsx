import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SampleBoundaryPanel } from "./SampleBoundaryPanel";

const verifier = vi.hoisted(() => vi.fn());
const experience = vi.hoisted(() => vi.fn());

vi.mock("./sampleBoundaryFixture", () => ({
  sampleBoundaryFixture: { schemaVersion: "malformed-test-input" },
  verifySampleBoundaryFixtureIntegrity: verifier,
}));

vi.mock("./SampleBoundaryExperience", () => ({
  SampleBoundaryExperience: (props: unknown) => {
    experience(props);
    return <div>Verified Boundary rendered</div>;
  },
}));

describe("SampleBoundaryPanel", () => {
  afterEach(() => {
    verifier.mockReset();
    experience.mockReset();
  });

  it("keeps a stable status while fixture verification is pending", () => {
    verifier.mockReturnValue(new Promise(() => undefined));
    render(
      <SampleBoundaryPanel
        sessionId="session-1"
        prediction="Random rows will look optimistic"
        onComplete={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("status", {
        name: /checking verified sample evidence/i,
      }),
    ).toBeInTheDocument();
    expect(experience).not.toHaveBeenCalled();
  });

  it("renders a fail-closed alert when structural or hash verification rejects", async () => {
    verifier.mockRejectedValue(new Error("invalid fixture"));
    render(<SampleBoundaryPanel sessionId="session-1" onComplete={vi.fn()} />);

    expect(
      await screen.findByRole("alert", {
        name: /sample boundary unavailable/i,
      }),
    ).toHaveTextContent(/refused to present this Boundary/i);
    expect(experience).not.toHaveBeenCalled();
  });

  it("renders the verified experience only after verification resolves", async () => {
    verifier.mockResolvedValue({
      boundary: { report: { status: "VERIFIED" } },
    });
    render(<SampleBoundaryPanel sessionId="session-1" onComplete={vi.fn()} />);

    expect(await screen.findByText("Verified Boundary rendered")).toBeVisible();
    expect(experience).toHaveBeenCalledWith(
      expect.objectContaining({ integrityVerified: true }),
    );
  });

  it("completes only after an explicit changing-condition classification", async () => {
    const onComplete = vi.fn();
    verifier.mockResolvedValue({
      boundary: { report: { status: "VERIFIED" } },
    });
    render(
      <SampleBoundaryPanel sessionId="session-1" onComplete={onComplete} />,
    );
    await screen.findByText("Verified Boundary rendered");

    const props = experience.mock.lastCall?.[0] as {
      onReveal?: () => void;
      onClassify: (classification: string) => void;
    };
    props.onReveal?.();
    props.onClassify("CONCLUSION_STABLE");
    expect(onComplete).not.toHaveBeenCalled();

    props.onClassify("CONCLUSION_CHANGES");
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("does not render after an in-flight verification resolves post-unmount", async () => {
    let resolveVerification: ((value: unknown) => void) | undefined;
    verifier.mockReturnValue(
      new Promise((resolve) => {
        resolveVerification = resolve;
      }),
    );
    const rendered = render(
      <SampleBoundaryPanel sessionId="session-1" onComplete={vi.fn()} />,
    );
    rendered.unmount();
    resolveVerification?.({ boundary: { report: { status: "VERIFIED" } } });
    await Promise.resolve();

    expect(experience).not.toHaveBeenCalled();
  });
});
