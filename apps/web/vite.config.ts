import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const SERVER_ONLY_ENV_KEYS = [
  "CODEX_AUTH_JSON",
  "CODEX_MODEL",
  "COUNTERLAB_ADMIN_DIAGNOSTIC_SECRET",
  "COUNTERLAB_ADMISSION_KEY",
  "COUNTERLAB_RUNNER_BASE_URL",
  "COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY",
  "COUNTERLAB_SIGNING_KEY",
  "COUNTERLAB_SIGNING_KEY_ID",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "OPENAI_REASONING_EFFORT",
  "OPENAI_TIMEOUT_MS",
] as const;

export default defineConfig(({ command, mode }) => {
  const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
  const runtimeParent = fileURLToPath(
    new URL("./test-results/runtime/", import.meta.url),
  );
  const rootEnvironment = loadEnv(mode, repositoryRoot, "");
  const localServerBindings = Object.fromEntries(
    SERVER_ONLY_ENV_KEYS.flatMap((key) => {
      const value = (process.env[key] ?? rootEnvironment[key])?.trim();
      return value === undefined || value.length === 0 ? [] : [[key, value]];
    }),
  );
  const stockChromiumDesignReview =
    command === "serve" &&
    process.env.COUNTERLAB_BROWSER_AUTHORITY?.trim() ===
      "stock-chromium-design-review";
  const configuredRuntimeRoot = process.env.COUNTERLAB_E2E_RUNTIME_ROOT;
  let persistencePath: string | undefined;
  if (
    command === "serve" &&
    configuredRuntimeRoot !== undefined &&
    configuredRuntimeRoot.trim() !== ""
  ) {
    const runtimeRoot = resolve(configuredRuntimeRoot);
    const pathFromParent = relative(runtimeParent, runtimeRoot);
    if (
      pathFromParent === "" ||
      pathFromParent === ".." ||
      pathFromParent.startsWith(`..${sep}`) ||
      isAbsolute(pathFromParent)
    ) {
      throw new Error(
        "COUNTERLAB_E2E_RUNTIME_ROOT must stay below apps/web/test-results/runtime",
      );
    }
    persistencePath = resolve(runtimeRoot, "wrangler-state");
  }
  const needsLocalOverrides =
    command === "serve" &&
    (Object.keys(localServerBindings).length > 0 || stockChromiumDesignReview);

  return {
    plugins: [
      react(),
      cloudflare(
        needsLocalOverrides || persistencePath !== undefined
          ? {
              ...(persistencePath === undefined
                ? {}
                : { persistState: { path: persistencePath } }),
              ...(needsLocalOverrides
                ? {
                    config: (worker) => ({
                      ...(Object.keys(localServerBindings).length === 0
                        ? {}
                        : {
                            vars: {
                              ...worker.vars,
                              ...localServerBindings,
                            },
                          }),
                      ...(stockChromiumDesignReview
                        ? {
                            dev: {
                              ...worker.dev,
                              enable_containers: false,
                            },
                          }
                        : {}),
                    }),
                  }
                : {}),
            }
          : undefined,
      ),
    ],
  };
});
