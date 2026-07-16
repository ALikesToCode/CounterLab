import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const SERVER_ONLY_ENV_KEYS = [
  "CODEX_AUTH_JSON",
  "CODEX_MODEL",
  "COUNTERLAB_ADMIN_DIAGNOSTIC_SECRET",
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
  const rootEnvironment = loadEnv(mode, repositoryRoot, "");
  const localServerBindings = Object.fromEntries(
    SERVER_ONLY_ENV_KEYS.flatMap((key) => {
      const value = (process.env[key] ?? rootEnvironment[key])?.trim();
      return value === undefined || value.length === 0 ? [] : [[key, value]];
    }),
  );

  return {
    plugins: [
      react(),
      cloudflare(
        command === "serve" && Object.keys(localServerBindings).length > 0
          ? {
              config: (worker) => ({
                vars: { ...worker.vars, ...localServerBindings },
              }),
            }
          : undefined,
      ),
    ],
  };
});
