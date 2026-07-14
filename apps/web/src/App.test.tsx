import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { sampleArtifact, sampleResult } from "./sample";

const artifact = {
  artifactId: "artifact_sample",
  fileName: sampleArtifact.fileName,
  fileSha256: sampleArtifact.fileSha256,
  nbformat: 4,
  support: { status: "SUPPORTED", reasons: [] },
  cells: [],
  schemaSummary: {
    fields: [],
    rowCount: sampleArtifact.rows,
    entityCandidates: ["customer_id"],
    targetCandidates: ["churned"],
  },
  packageHints: ["sklearn"],
  createdAt: "2026-07-14T09:00:00.000Z",
};

function session(
  state: string,
  version: number,
  extra: Record<string, unknown> = {},
) {
  return {
    sessionId: "session_ui",
    artifactId: artifact.artifactId,
    mode: "instant",
    state,
    version,
    createdAt: "2026-07-14T09:01:00.000Z",
    updatedAt: "2026-07-14T09:01:00.000Z",
    ...extra,
  };
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/artifacts") return response(artifact, 201);
      if (path === "/api/sessions")
        return response(session("INGESTED", 1), 201);
      if (path.endsWith("/belief-test")) {
        return response(session("BELIEF_TEST_PROPOSED", 2));
      }
      if (path.endsWith("/belief-test/confirm")) {
        return response(session("BELIEF_TEST_CONFIRMED", 3));
      }
      if (path.endsWith("/prediction")) {
        return response(session("PREDICTION_COMMITTED", 4), 201);
      }
      if (path.endsWith("/lab/compile")) {
        return response(session("LAB_VERIFIED", 6));
      }
      if (path.endsWith("/lab/run")) {
        return response(
          session("EXPERIMENT_COMPLETED", 7, { verifiedResult: sampleResult }),
        );
      }
      if (path === "/api/replays/leakage-01") {
        return response({
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
            trace: [{ stage: "external_verifier", status: "VERIFIED" }],
          },
          result: sampleResult,
          patch: { status: "VERIFIED" },
        });
      }
      throw new Error(
        `Unexpected UI test request: ${init?.method ?? "GET"} ${path}`,
      );
    }),
  );
}

const storageValues = new Map<string, string>();
const testStorage: Storage = {
  get length() {
    return storageValues.size;
  },
  clear: () => storageValues.clear(),
  getItem: (key) => storageValues.get(key) ?? null,
  key: (index) => [...storageValues.keys()][index] ?? null,
  removeItem: (key) => {
    storageValues.delete(key);
  },
  setItem: (key, value) => {
    storageValues.set(key, value);
  },
};

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: testStorage,
  });
  window.localStorage.clear();
  installApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CounterLab judged flow", () => {
  it("offers three honest Judge Mode paths", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "CounterLab" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Chatbots explain. CounterLab lets reality answer."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try instantly/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /generate live/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /replay verified session/i }),
    ).toBeEnabled();
  });

  it("keeps computed results hidden until an immutable prediction is committed", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /try instantly/i }));
    expect(
      await screen.findByRole("heading", {
        name: /what does this result prove/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/cell 3 · output 0/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /verified result/i }),
    ).not.toBeInTheDocument();

    const continueButton = screen.getByRole("button", {
      name: /create belief test/i,
    });
    expect(continueButton).toBeDisabled();
    await user.type(
      screen.getByLabelText(/your claim/i),
      "The 98.5% test accuracy proves the model generalizes to new customers.",
    );
    await user.click(continueButton);

    expect(
      await screen.findByRole("heading", { name: "Belief Test" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/same customer.s identity/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /verified result/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /confirm belief test/i }),
    );
    await user.click(screen.getByRole("radio", { name: /remain near 98/i }));
    await user.click(
      screen.getByRole("button", { name: /commit prediction/i }),
    );

    expect(await screen.findByText(/prediction locked/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /build and verify/i }),
    ).toBeInTheDocument();
  });

  it("keeps the replay label persistent across the judged flow", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /replay verified session/i }),
    );
    expect(await screen.findByText(/verified replay/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /continue replay/i }));
    expect(screen.getByText(/verified replay/i)).toBeInTheDocument();
  });
});
