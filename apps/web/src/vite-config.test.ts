// @vitest-environment node

import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cloudflare: vi.fn((options?: unknown) => ({
    name: "cloudflare:test",
    options,
  })),
  loadEnv: vi.fn(),
  react: vi.fn(() => ({ name: "react:test" })),
}));

vi.mock("@cloudflare/vite-plugin", () => ({
  cloudflare: mocks.cloudflare,
}));

vi.mock("@vitejs/plugin-react", () => ({
  default: mocks.react,
}));

vi.mock("vite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vite")>();
  return {
    ...actual,
    loadEnv: mocks.loadEnv,
  };
});

import config from "../vite.config";

const protectedKeys = [
  "COUNTERLAB_BROWSER_AUTHORITY",
  "COUNTERLAB_E2E_RUNTIME_ROOT",
  "COUNTERLAB_SIGNING_KEY",
  "COUNTERLAB_SIGNING_KEY_ID",
  "OPENAI_TIMEOUT_MS",
] as const;

const originalEnvironment = Object.fromEntries(
  protectedKeys.map((key) => [key, process.env[key]]),
);

function configure(command: "serve" | "build") {
  if (typeof config !== "function") {
    throw new Error("expected the Vite config to be a function");
  }
  return config({
    command,
    mode: "development",
    isSsrBuild: false,
    isPreview: false,
  });
}

describe("local Worker environment bindings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of protectedKeys) delete process.env[key];
    mocks.loadEnv.mockReturnValue({
      COUNTERLAB_SIGNING_KEY: "local-signing-secret",
      COUNTERLAB_SIGNING_KEY_ID: "local-key-v2",
      OPENAI_TIMEOUT_MS: "45000",
    });
  });

  afterEach(() => {
    for (const key of protectedKeys) {
      const value = originalEnvironment[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("passes signing authority and model timeout to the local Worker during serve", async () => {
    await configure("serve");

    const pluginOptions = mocks.cloudflare.mock.calls[0]?.[0] as
      | {
          config?: (worker: { vars?: Record<string, unknown> }) => {
            vars?: Record<string, unknown>;
          };
        }
      | undefined;
    expect(pluginOptions?.config).toBeTypeOf("function");

    const worker = pluginOptions?.config?.({ vars: { EXISTING: "kept" } });
    expect(worker?.vars).toEqual({
      EXISTING: "kept",
      COUNTERLAB_SIGNING_KEY: "local-signing-secret",
      COUNTERLAB_SIGNING_KEY_ID: "local-key-v2",
      OPENAI_TIMEOUT_MS: "45000",
    });
  });

  it("does not inject local secrets into the emitted build configuration", async () => {
    await configure("build");

    expect(mocks.cloudflare).toHaveBeenCalledTimes(1);
    expect(mocks.cloudflare).toHaveBeenCalledWith(undefined);
  });

  it("disables local Containers only for an explicitly labelled stock Chromium design review", async () => {
    mocks.loadEnv.mockReturnValue({});
    process.env.COUNTERLAB_BROWSER_AUTHORITY = "stock-chromium-design-review";
    process.env.COUNTERLAB_E2E_RUNTIME_ROOT = fileURLToPath(
      new URL("../test-results/runtime/vite-config-test", import.meta.url),
    );

    await configure("serve");

    const pluginOptions = mocks.cloudflare.mock.calls[0]?.[0] as
      | {
          config?: (worker: { dev?: Record<string, unknown> }) => {
            dev?: Record<string, unknown>;
          };
          persistState?: { path: string };
        }
      | undefined;
    const override = pluginOptions?.config?.({
      dev: { ip: "127.0.0.1", enable_containers: true },
    });
    expect(override?.dev).toEqual({
      ip: "127.0.0.1",
      enable_containers: false,
    });
    expect(pluginOptions?.persistState?.path).toMatch(
      /apps\/web\/test-results\/runtime\/vite-config-test\/wrangler-state$/u,
    );
  });

  it("rejects an E2E persistence path outside the contained runtime parent", () => {
    mocks.loadEnv.mockReturnValue({});
    process.env.COUNTERLAB_E2E_RUNTIME_ROOT = fileURLToPath(
      new URL("../../outside-e2e-runtime", import.meta.url),
    );

    expect(() => configure("serve")).toThrow(
      /must stay below apps\/web\/test-results\/runtime/i,
    );
  });
});
