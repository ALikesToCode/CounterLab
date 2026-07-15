import { canonicalizeExperimentIR } from "./canonicalize.js";

export async function hashExperimentIR(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeExperimentIR(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
