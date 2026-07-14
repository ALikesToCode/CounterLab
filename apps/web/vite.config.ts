import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const SERVER_ONLY_ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "OPENAI_REASONING_EFFORT",
] as const;

export default defineConfig(({ command, mode }) => {
  const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
  const rootEnvironment = loadEnv(mode, repositoryRoot, "");
  const localServerBindings = Object.fromEntries(
    SERVER_ONLY_ENV_KEYS.flatMap((key) => {
      const value = rootEnvironment[key]?.trim();
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
