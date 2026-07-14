import { Hono } from "hono";

import verifiedResult from "../../../fixtures/public/leakage_verified_result.json";

type AppBindings = {
  Variables: {
    requestId: string;
  };
};

export const api = new Hono<AppBindings>();

api.use("/api/*", async (context, next) => {
  const requestId = context.req.header("cf-ray") ?? crypto.randomUUID();
  context.set("requestId", requestId);
  context.header("cache-control", "no-store");
  context.header("x-content-type-options", "nosniff");
  context.header("x-frame-options", "DENY");
  await next();
});

api.get("/api/health", (context) =>
  context.json({
    ok: true as const,
    data: {
      platform: "cloudflare-workers" as const,
      sample: "available" as const,
      replay: "available" as const,
      liveGpt: "server-key-required" as const,
      liveCodex: "local-runner-required" as const,
      liveKernel: "local-runner-required" as const,
      sandbox: "local-runner-required" as const,
      requestId: context.get("requestId"),
    },
  }),
);

api.get("/api/replays/:replayId", (context) => {
  const replayId = context.req.param("replayId");
  if (replayId !== "leakage-01") {
    return context.json(
      {
        ok: false as const,
        error: {
          code: "REPLAY_NOT_FOUND" as const,
          message: `Replay ${replayId} was not found`,
          status: 404 as const,
        },
      },
      404,
    );
  }

  return context.json({
    ok: true as const,
    data: {
      schemaVersion: "1" as const,
      replayId,
      replay: true as const,
      recordedAt: "2026-07-14T09:05:00.000Z",
      modelId: "stored-codex-app-server-trace",
      fixtureId: "customer-churn-public-v1",
      verifierVersion: "leakage-verifier-v1",
      templateCommit: "template-leakage-v1",
      result: verifiedResult,
    },
  });
});

api.notFound((context) =>
  context.json(
    {
      ok: false as const,
      error: {
        code: "ROUTE_NOT_FOUND" as const,
        message: `No CounterLab API route matches ${context.req.method} ${context.req.path}`,
        status: 404 as const,
      },
    },
    404,
  ),
);

api.onError((error, context) => {
  console.error("CounterLab Worker request failed", {
    requestId: context.get("requestId"),
    name: error.name,
    message: error.message,
  });
  return context.json(
    {
      ok: false as const,
      error: {
        code: "INTERNAL_ERROR" as const,
        message: "The request could not be completed",
        status: 500 as const,
      },
    },
    500,
  );
});
