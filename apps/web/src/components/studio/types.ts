import type { ArtifactView, PublicCompilerEvent, SessionView } from "../../api";

export type StudioMode = "instant" | "live" | "replay";
export type StudioStage =
  | "question-path"
  | "claim"
  | "belief"
  | "build"
  | "reality"
  | "live-setup"
  | "live-compile";

export type RecentProject = {
  sessionId: string;
  artifactId: string;
  fileName: string;
  mode: StudioMode;
  state: SessionView["state"];
  updatedAt: string;
};

export type StudioCommand = {
  id: string;
  label: string;
  hint: string;
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
};

export type StudioContext = {
  mode: StudioMode;
  stage: StudioStage;
  artifact: ArtifactView | null;
  session: SessionView | null;
  events: readonly PublicCompilerEvent[];
};
