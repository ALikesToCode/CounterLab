export type StudioLocation =
  | { kind: "landing" }
  | { kind: "new" }
  | { kind: "session"; id: string }
  | { kind: "replay"; id: string }
  | { kind: "proof"; id: string };

export function parseStudioLocation(pathname: string): StudioLocation {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return { kind: "landing" };
  if (parts.length === 1 && parts[0] === "new") return { kind: "new" };
  if (
    parts.length === 2 &&
    (parts[0] === "session" || parts[0] === "replay" || parts[0] === "proof")
  ) {
    try {
      const id = decodeURIComponent(parts[1] ?? "");
      if (id.length > 0) return { kind: parts[0], id };
    } catch {
      return { kind: "landing" };
    }
  }
  return { kind: "landing" };
}

export function studioPath(input: {
  stage: string;
  mode: "instant" | "live" | "replay" | null;
  sessionId?: string;
  completed?: boolean;
}): string {
  if (input.stage === "landing" || input.mode === null) return "/";
  if (input.mode === "replay") return "/replay/leakage-01";
  if (input.stage === "live-setup" || input.sessionId === undefined)
    return "/new";
  if (input.completed) return `/proof/${encodeURIComponent(input.sessionId)}`;
  return `/session/${encodeURIComponent(input.sessionId)}`;
}
