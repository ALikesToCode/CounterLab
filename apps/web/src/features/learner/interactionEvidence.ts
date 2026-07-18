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

export async function recordLearnerInteraction(
  sessionId: string,
  draft: LearnerInteractionDraft,
): Promise<boolean> {
  try {
    await counterLabApi.recordLearnerInteraction(sessionId, {
      ...draft,
      schemaVersion: "1",
      eventId: interactionId(),
    } as LearnerInteractionInput);
    return true;
  } catch {
    // Interaction evidence is intentionally non-authoritative and must never
    // interrupt the scientific session or its download actions.
    return false;
  }
}
