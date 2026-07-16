import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CapabilityHealth } from "../../api";
import { JudgeModeView } from "./JudgeModeView";

const configuredHealth: CapabilityHealth = {
  platform: "cloudflare-workers",
  sample: "available",
  replay: "available",
  liveGpt: "configured",
  liveCodex: "configured",
  liveKernel: "configured",
  sandbox: "configured",
  requestId: "request_judge_1",
};

describe("JudgeModeView", () => {
  it("distinguishes sample, live, and legacy replay authority", () => {
    render(
      <JudgeModeView
        health={configuredHealth}
        healthPending={false}
        healthError={null}
        onRetryHealth={vi.fn()}
        onStartSample={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: /see a belief break in twenty seconds/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sample lesson")).toBeInTheDocument();
    expect(screen.getByText("Live notebook analysis")).toBeInTheDocument();
    expect(screen.getByText("Verified replay")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /run live/i })).toHaveAttribute(
      "href",
      "/new",
    );
    expect(screen.getByRole("link", { name: /watch replay/i })).toHaveAttribute(
      "href",
      "/replay/leakage-01",
    );
    expect(document.body).toHaveTextContent(
      /legacy v1 replay.*does not offer a proof capsule download/i,
    );
    expect(document.body).not.toHaveTextContent(/download proof capsule/i);
    expect(screen.getByText("GPT-5.6")).toBeInTheDocument();
    expect(screen.getByText("Runtime Codex")).toBeInTheDocument();
    expect(screen.getByText("Fixed kernel")).toBeInTheDocument();
    expect(screen.getByText("Frozen verifier")).toBeInTheDocument();
  });

  it("starts the sample only after an explicit action", async () => {
    const user = userEvent.setup();
    const onStartSample = vi.fn();
    render(
      <JudgeModeView
        health={configuredHealth}
        healthPending={false}
        healthError={null}
        onRetryHealth={vi.fn()}
        onStartSample={onStartSample}
      />,
    );

    expect(onStartSample).not.toHaveBeenCalled();
    await user.click(
      screen.getAllByRole("button", { name: /start sample/i })[0]!,
    );
    expect(onStartSample).toHaveBeenCalledTimes(1);
  });

  it("does not offer a live link when deployed authority is unavailable", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(
      <JudgeModeView
        health={null}
        healthPending={false}
        healthError="Capability response unavailable"
        onRetryHealth={retry}
        onStartSample={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("link", { name: /run live/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/live authority is unavailable/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /check live status/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
