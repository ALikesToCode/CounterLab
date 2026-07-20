import { counterLabApi, type LearnerInteractionInput } from "../../api";

export type LearnerInteractionDraft<
  Event extends LearnerInteractionInput = LearnerInteractionInput,
> = Event extends LearnerInteractionInput
  ? Omit<Event, "schemaVersion" | "eventId">
  : never;

function interactionId(): string {
  if (typeof globalThis.crypto.randomUUID === "function") {
    return `interaction_${globalThis.crypto.randomUUID()}`;
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `interaction_${suffix}`;
}

async function stageInteractionId(
  sessionId: string,
  draft: LearnerInteractionDraft,
): Promise<string> {
  if (draft.kind !== "stage.entered" && draft.kind !== "stage.completed") {
    throw new Error(
      "Only stage interactions can use session-stage deduplication",
    );
  }
  const input = new TextEncoder().encode(
    `counterlab:learner-interaction:v1:${sessionId}:${draft.kind}:${draft.stage}`,
  );
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", input),
  );
  const suffix = Array.from(digest.slice(0, 16), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `interaction_${suffix}`;
}

export async function recordLearnerInteraction(
  sessionId: string,
  draft: LearnerInteractionDraft,
  options: Readonly<{ deduplicate?: "session-stage" }> = {},
): Promise<boolean> {
  try {
    const eventId =
      options.deduplicate === "session-stage"
        ? await stageInteractionId(sessionId, draft)
        : interactionId();
    await counterLabApi.recordLearnerInteraction(sessionId, {
      ...draft,
      schemaVersion: "1",
      eventId,
    } as LearnerInteractionInput);
    return true;
  } catch {
    // Interaction evidence is intentionally non-authoritative and must never
    // interrupt the scientific session or its download actions.
    return false;
  }
}
