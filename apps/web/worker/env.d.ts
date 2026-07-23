interface __CounterLabWorkerBindings {
  ARTIFACTS: R2Bucket;
  DB: D1Database;
  CF_VERSION_METADATA: WorkerVersionMetadata;
  OPENAI_MODEL: "gpt-5.6";
  OPENAI_REASONING_EFFORT: "medium";
  OPENAI_TIMEOUT_MS: "180000";
  COUNTERLAB_MAX_NOTEBOOK_BYTES: "10485760";
  COUNTERLAB_SIGNING_KEY_ID: "counterlab-boundary-v1";
  COUNTERLAB_MAINTENANCE_MODE: "false";
  RUNNER: DurableObjectNamespace<import("./index").CounterLabRunner>;
  ADMISSION: DurableObjectNamespace<import("./index").CounterLabAdmission>;
}

declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("./index");
    durableNamespaces: "CounterLabRunner" | "CounterLabAdmission";
  }

  interface Env extends __CounterLabWorkerBindings {}
}

interface Env extends __CounterLabWorkerBindings {}
