import { basename } from "node:path";

import { z } from "zod";

import { CompilerSetupError, type CompilerEvent } from "./types.js";

const ThreadCoordinatesSchema = z.object({
  threadId: z.string().min(1).max(256),
  turnId: z.string().min(1).max(256),
});

const PlanDeltaSchema = ThreadCoordinatesSchema.extend({
  itemId: z.string().min(1).max(256),
  delta: z.string(),
}).strict();

const TurnPlanSchema = ThreadCoordinatesSchema.extend({
  explanation: z.string().nullable(),
  plan: z.array(
    z.object({
      step: z.string(),
      status: z.string(),
    }),
  ),
}).strict();

const FileChangeSchema = z.object({
  path: z.string().min(1),
  kind: z.union([
    z.object({ type: z.literal("add") }).passthrough(),
    z.object({ type: z.literal("delete") }).passthrough(),
    z.object({ type: z.literal("update") }).passthrough(),
  ]),
  diff: z.string(),
});

const FilePatchSchema = ThreadCoordinatesSchema.extend({
  itemId: z.string().min(1).max(256),
  changes: z.array(FileChangeSchema),
}).strict();

const TurnDiffSchema = ThreadCoordinatesSchema.extend({
  diff: z.string(),
}).strict();

const CommandItemSchema = z
  .object({
    type: z.literal("commandExecution"),
    id: z.string(),
    command: z.string(),
    cwd: z.string(),
    processId: z.string().nullable(),
    source: z.string(),
    status: z.enum(["inProgress", "completed", "failed", "declined"]),
    commandActions: z.array(z.unknown()),
    aggregatedOutput: z.string().nullable(),
    exitCode: z.number().int().nullable(),
    durationMs: z.number().int().nonnegative().nullable(),
  })
  .passthrough();

const PlanItemSchema = z
  .object({ type: z.literal("plan"), id: z.string(), text: z.string() })
  .passthrough();

const FileItemSchema = z
  .object({
    type: z.literal("fileChange"),
    id: z.string(),
    changes: z.array(FileChangeSchema),
    status: z.enum(["inProgress", "completed", "failed", "declined"]),
  })
  .passthrough();

const ItemNotificationSchema = ThreadCoordinatesSchema.extend({
  item: z.unknown(),
}).passthrough();

const ItemDiscriminatorSchema = z.object({ type: z.string() }).passthrough();

const TurnCompletedSchema = z
  .object({
    threadId: z.string().min(1).max(256),
    turn: z
      .object({
        id: z.string().min(1).max(256),
        status: z.enum(["completed", "interrupted", "failed", "inProgress"]),
        durationMs: z.number().int().nonnegative().nullable(),
        error: z
          .object({ message: z.string() })
          .passthrough()
          .nullable()
          .optional(),
      })
      .passthrough(),
  })
  .strict();

const ErrorNotificationSchema = ThreadCoordinatesSchema.extend({
  error: z.object({ message: z.string() }).passthrough(),
  willRetry: z.boolean(),
}).strict();

const NotificationEnvelopeSchema = z
  .object({
    method: z.string().min(1).max(256),
    params: z.unknown().optional(),
  })
  .passthrough();

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
  /\b(?:OPENAI_API_KEY|COUNTERLAB_SIGNING_KEY)\s*[=:]\s*[^\s]+/gi,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
];

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, "[REDACTED]"),
    value,
  );
}

function excerpt(value: string | null, limit = 4_000): string {
  const redacted = redactSecrets(value ?? "");
  return redacted.length <= limit ? redacted : `${redacted.slice(0, limit)}…`;
}

function safeFileName(path: string): string {
  return basename(path.replaceAll("\\", "/"));
}

function sanitizeDiff(diff: string): string {
  const pathSanitized = redactSecrets(diff).replace(
    /^(---|\+\+\+)\s+([^\t\n]+)(.*)$/gm,
    (_match, prefix: string, path: string, suffix: string) =>
      `${prefix} ${safeFileName(path)}${suffix}`,
  );
  return pathSanitized.length <= 64_000
    ? pathSanitized
    : `${pathSanitized.slice(0, 63_999)}…`;
}

function invalid(cause: unknown): never {
  throw new CompilerSetupError(
    "CODEX_PROTOCOL_ERROR",
    "Invalid app-server message received.",
    { cause },
  );
}

function parse<T>(schema: z.ZodType<T>, params: unknown): T {
  const result = schema.safeParse(params);
  if (!result.success) invalid(result.error);
  return result.data;
}

function fileEvent(
  changes: Array<z.infer<typeof FileChangeSchema>>,
  status: "started" | "updated" | "completed" | "failed",
): CompilerEvent[] {
  if (changes.length === 0) return [];
  return [
    {
      type: "file_change",
      files: [...new Set(changes.map((change) => safeFileName(change.path)))],
      unifiedDiff: sanitizeDiff(
        changes.map((change) => change.diff).join("\n"),
      ),
      status,
    },
  ];
}

/**
 * Converts one installed app-server notification into the narrow event set that
 * may be streamed to a browser. Reasoning, raw agent prose, tool arguments,
 * arbitrary paths, and unknown notification bodies never cross this boundary.
 */
export function sanitizeAppServerMessage(message: unknown): CompilerEvent[] {
  const envelopeResult = NotificationEnvelopeSchema.safeParse(message);
  if (!envelopeResult.success) invalid(envelopeResult.error);
  const { method, params } = envelopeResult.data;

  if (
    method.startsWith("item/reasoning/") ||
    method.startsWith("rawResponseItem/") ||
    method.startsWith("item/agentMessage/")
  ) {
    return [];
  }

  switch (method) {
    case "item/plan/delta": {
      const notification = parse(PlanDeltaSchema, params);
      return [
        { type: "plan_summary", summary: excerpt(notification.delta, 4_000) },
      ];
    }
    case "turn/plan/updated": {
      const notification = parse(TurnPlanSchema, params);
      const parts = [
        notification.explanation,
        ...notification.plan.map((step) => `${step.status}: ${step.step}`),
      ].filter((part): part is string => Boolean(part));
      return parts.length === 0
        ? []
        : [{ type: "plan_summary", summary: excerpt(parts.join("\n"), 4_000) }];
    }
    case "item/fileChange/patchUpdated": {
      const notification = parse(FilePatchSchema, params);
      return fileEvent(notification.changes, "updated");
    }
    case "turn/diff/updated": {
      const notification = parse(TurnDiffSchema, params);
      const files = [
        ...notification.diff.matchAll(/^\+\+\+\s+([^\t\n]+)/gm),
      ].map((match) => safeFileName(match[1] ?? "changed-file"));
      return [
        {
          type: "file_change",
          files: [...new Set(files)],
          unifiedDiff: sanitizeDiff(notification.diff),
          status: "updated",
        },
      ];
    }
    case "item/started":
    case "item/completed": {
      const notification = parse(ItemNotificationSchema, params);
      const discriminator = parse(ItemDiscriminatorSchema, notification.item);
      if (discriminator.type === "commandExecution") {
        const item = parse(CommandItemSchema, notification.item);
        return [
          {
            type: "command",
            command: excerpt(item.command, 1_024),
            outputExcerpt: excerpt(item.aggregatedOutput),
            durationMs: item.durationMs,
            exitCode: item.exitCode,
            status: item.status,
          },
        ];
      }
      if (discriminator.type === "plan") {
        const item = parse(PlanItemSchema, notification.item);
        return [{ type: "plan_summary", summary: excerpt(item.text, 4_000) }];
      }
      if (discriminator.type === "fileChange") {
        const item = parse(FileItemSchema, notification.item);
        const status =
          item.status === "completed"
            ? "completed"
            : item.status === "failed" || item.status === "declined"
              ? "failed"
              : "started";
        return fileEvent(item.changes, status);
      }
      return [];
    }
    case "turn/completed": {
      const notification = parse(TurnCompletedSchema, params);
      const status =
        notification.turn.status === "inProgress"
          ? "failed"
          : notification.turn.status;
      return [
        {
          type: "final_status",
          status,
          threadId: notification.threadId,
          turnId: notification.turn.id,
          ...(notification.turn.durationMs === null
            ? {}
            : { durationMs: notification.turn.durationMs }),
          ...(notification.turn.error?.message
            ? { error: excerpt(notification.turn.error.message, 1_000) }
            : {}),
        },
      ];
    }
    case "error": {
      const notification = parse(ErrorNotificationSchema, params);
      if (notification.willRetry) return [];
      return [
        {
          type: "final_status",
          status: "failed",
          threadId: notification.threadId,
          turnId: notification.turnId,
          error: excerpt(notification.error.message, 1_000),
        },
      ];
    }
    default:
      return [];
  }
}
