import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CapabilityHealth } from "../../api";
import { JudgeModeView } from "./JudgeModeView";

const repositoryRoot = resolve(import.meta.dirname, "../../../../..");

const configuredHealth: CapabilityHealth = {
  platform: "cloudflare-workers",
  sample: "available",
  replay: "available",
  liveGpt: "configured",
  liveCodex: "configured",
  liveKernel: "configured",
  readiness: "ready",
  sandbox: "credential-and-privilege-boundary",
  generationFilesystemReadIsolation: "PARTIAL",
  release: {
    status: "bound",
    workerVersionId: "11111111-2222-3333-4444-555555555555",
    workerVersionTag: `git-${"a".repeat(40)}`,
    workerEvidenceCommit: "a".repeat(40),
    runnerSourceCommit: "b".repeat(40),
    runnerImageDigest: `sha256:${"c".repeat(64)}`,
    generationIsolationEvidenceSha256: "5".repeat(64),
    generationIsolationProbeSha256: "6".repeat(64),
    releaseCheckGenerationIsolationEvidenceSha256: "7".repeat(64),
    releaseCheckGenerationIsolationProbeSha256: "6".repeat(64),
    releaseCheckGenerationIsolationVerifiedAt: "2026-07-19T05:31:00.000+05:30",
    timeoutCleanupReceiptSha256: "d".repeat(64),
    aggregateLimitEvidenceSha256: "9".repeat(64),
    runtimePolicySha256: "e".repeat(64),
    proofDependencyManifestSha256: "f".repeat(64),
    workerArtifactClassification: "PROCESS_BOUND_PARTIAL",
    workerArtifactManifestSha256: "1".repeat(64),
    workerBundleSha256: "2".repeat(64),
    clientAssetsSha256: "3".repeat(64),
    clientAssetCount: 27,
    clientPublicAssetsSha256: "4".repeat(64),
    clientPublicAssetCount: 25,
    viteVersion: "8.1.4",
    wranglerVersion: "4.110.0",
  },
  requestId: "request_judge_1",
};

const isolatedHealth: CapabilityHealth = {
  ...configuredHealth,
  generationFilesystemReadIsolation: "OS_ENFORCED",
};

describe("JudgeModeView", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the tightened first fold learner-facing with proof one action away", async () => {
    render(
      <JudgeModeView
        health={isolatedHealth}
        healthPending={false}
        healthError={null}
        onRetryHealth={vi.fn()}
        onStartSample={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "Seal a Prediction. Change one condition. Fixed evidence—not AI prose—releases one bounded result.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(/Question → Prediction → Test/u),
    ).not.toBeInTheDocument();

    const proof = screen.getByRole("complementary", {
      name: /fixed sample preview/i,
    });
    expect(proof).toHaveTextContent(
      /completed fixed sample.*not a live result/i,
    );
    expect(within(proof).getByText("Integrity checked")).toBeVisible();
    expect(proof).toHaveTextContent(
      /This score proves the model works for customers it has never seen/i,
    );
    expect(proof).not.toHaveTextContent(/\b[a-f0-9]{64}\b/iu);

    const proofLink = within(proof).getByRole("link", {
      name: /inspect verified sample proof/i,
    });
    const mechanism = within(proof).getByRole("region", {
      name: /verified sample belief-break mechanism/i,
    });
    expect(
      proofLink.compareDocumentPosition(mechanism) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(await within(mechanism).findByText("98.5%")).toBeVisible();
    expect(within(mechanism).getByText("59.4%")).toBeVisible();
    expect(within(mechanism).getByText("Boundary consequence")).toBeVisible();
    expect(within(mechanism).getByText("Learner benefit")).toBeVisible();
  });

  it("distinguishes sample, live, and legacy replay authority", async () => {
    render(
      <JudgeModeView
        health={isolatedHealth}
        healthPending={false}
        healthError={null}
        onRetryHealth={vi.fn()}
        onStartSample={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: /see a verified belief break in ten seconds/i,
      }),
    ).toBeInTheDocument();
    const proof = screen.getByRole("complementary", {
      name: /fixed sample preview/i,
    });
    expect(proof).toHaveTextContent(
      /a belief debugger—not a tutor or notebook linter/i,
    );
    expect(proof).toHaveTextContent(
      /completed fixed sample.*not a live result/i,
    );
    expect(proof).toHaveTextContent(
      /no gpt-5\.6, codex, or runner call occurs/i,
    );
    expect(await screen.findByText("98.5%")).toBeInTheDocument();
    const mechanism = screen.getByLabelText(
      /verified sample belief-break mechanism/i,
    );
    expect(mechanism).toHaveAttribute("data-presentation", "compact");
    expect(mechanism).toHaveTextContent("98.5%");
    expect(proof).toHaveTextContent("59.4%");
    expect(proof).toHaveTextContent("Boundary consequence");
    expect(proof).toHaveTextContent("Learner benefit");
    expect(screen.getByText("PROCESS_BOUND_PARTIAL")).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      /frozen client deploy tree files\s*27/i,
    );
    expect(document.body).toHaveTextContent(
      /fetchable public client files\s*25/i,
    );
    expect(document.body).toHaveTextContent(
      /vite\s*8\.1\.4.*wrangler\s*4\.110\.0/i,
    );
    expect(
      screen.getByRole("link", {
        name: /inspect verified sample proof/i,
      }),
    ).toHaveAttribute("href", "#sample-evidence");
    expect(screen.getByText("Sample lesson")).toBeInTheDocument();
    expect(screen.getByText("Live notebook analysis")).toBeInTheDocument();
    expect(screen.getByText("Verified replay")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /run an unprimed live test/i }),
    ).toHaveAttribute("href", "/new");
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
    expect(document.body).toHaveTextContent(
      /filesystem generation read isolation is OS-enforced/i,
    );
    expect(document.body).not.toHaveTextContent(
      /filesystem generation read isolation is explicitly PARTIAL/i,
    );
    expect(document.body).toHaveTextContent(
      /evidence-first learning for notebook users/i,
    );
    expect(document.body).toHaveTextContent(
      /seal a Prediction.*fixed evidence.*not AI prose/i,
    );
    expect(
      screen.getByRole("heading", {
        name: /what CounterLab builds on—and adds/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /Predict–Observe–Explain and Peer Instruction/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /LAMS Predict–Observe–Explain/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /NBLyzer and sklearn-diagnose/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /LAMS POE overview/i }),
    ).toHaveAttribute("href", "https://teach.lams.es/pedagogies/poe");
    expect(
      screen.getByRole("link", { name: /NBLyzer paper/i }),
    ).toHaveAttribute("href", "https://arxiv.org/html/2603.10742v3");
    expect(
      screen.getByRole("link", { name: /sklearn-diagnose repository/i }),
    ).toHaveAttribute("href", "https://github.com/leockl/sklearn-diagnose");
    expect(
      screen.getByRole("heading", { name: "Exact public build" }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent("a".repeat(40));
    expect(document.body).toHaveTextContent(
      "11111111-2222-3333-4444-555555555555",
    );
    expect(
      screen.getByRole("heading", { name: /source reproduction is gated/i }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      /commands are withheld until the repository and MIT license are anonymously accessible/i,
    );
    expect(
      screen.queryByLabelText("CounterLab reproduction commands"),
    ).not.toBeInTheDocument();
  });

  it("does not offer live authority for partial generation read isolation", () => {
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
      screen.queryByRole("link", { name: /run an unprimed live test/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /run live/i }),
    ).not.toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      /generation filesystem read isolation is partial.*live authority remains unavailable/i,
    );
  });

  it("labels the primed sample as a disclosed walkthrough", async () => {
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
    expect(document.body).toHaveTextContent(
      /not counted as an unassisted Prediction/i,
    );
    await user.click(
      screen.getByRole("button", { name: /open disclosed walkthrough/i }),
    );
    expect(onStartSample).toHaveBeenCalledTimes(1);
  });

  it("opens the verified Sample Proof Capsule from the first fold in one action", async () => {
    const capsuleBytes = await readFile(
      resolve(
        repositoryRoot,
        "fixtures/public/leakage_sample_proof_capsule_v1.counterlab",
      ),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(capsuleBytes, { status: 200 })),
    );
    const user = userEvent.setup();

    render(
      <JudgeModeView
        health={configuredHealth}
        healthPending={false}
        healthError={null}
        onRetryHealth={vi.fn()}
        onStartSample={vi.fn()}
      />,
    );

    await screen.findByText(/capsule bytes match the checked-in reference/iu);
    await user.click(
      screen.getByRole("link", {
        name: /inspect verified sample proof/iu,
      }),
    );

    const summary = screen.getByText("Inspect Sample Proof Capsule", {
      selector: "summary",
    });
    expect(summary.closest("details")).toHaveAttribute("open");
    expect(summary).toHaveFocus();
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
      screen.queryByRole("link", { name: /unprimed live/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /run live/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /check live readiness/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/live authority is unavailable/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /check live status/i }),
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("does not offer live authority when the public release identity is unbound", () => {
    render(
      <JudgeModeView
        health={{ ...configuredHealth, release: { status: "unbound" } }}
        healthPending={false}
        healthError={null}
        onRetryHealth={vi.fn()}
        onStartSample={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("link", { name: /run live/i }),
    ).not.toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      /release identity is unbound.*live qualification as unproven/i,
    );
    expect(document.body).toHaveTextContent(
      /no exact released filesystem generation read-isolation status is available/i,
    );
    expect(document.body).not.toHaveTextContent(
      /filesystem generation read isolation is OS-enforced/i,
    );
  });

  it("does not equate configured services with observed readiness", () => {
    render(
      <JudgeModeView
        health={{ ...isolatedHealth, readiness: "not-ready" }}
        healthPending={false}
        healthError={null}
        onRetryHealth={vi.fn()}
        onStartSample={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("link", { name: /run live/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/did not pass the latest readiness check/i),
    ).toBeInTheDocument();
  });

  it("does not deep-probe or expose live entry before readiness is checked", () => {
    render(
      <JudgeModeView
        health={{ ...isolatedHealth, readiness: "not-checked" }}
        healthPending={false}
        healthError={null}
        onRetryHealth={vi.fn()}
        onStartSample={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("link", { name: /run live/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/live readiness has not been checked/i),
    ).toBeInTheDocument();
  });
});
