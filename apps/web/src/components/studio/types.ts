import type {
  ArtifactView,
  EvidenceEvent,
  PublicCompilerEvent,
  SessionView,
} from "../../api";
import type { ProofEventMergeIssue } from "../../features/proof/mergeProofEvents";

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

export type ProofEventLoadStatus = "idle" | "loading" | "ready" | "failed";

export type StudioContext = {
  mode: StudioMode;
  stage: StudioStage;
  artifact: ArtifactView | null;
  session: SessionView | null;
  events: readonly PublicCompilerEvent[];
  evidenceEvents?: readonly EvidenceEvent[];
  proofEventIssues?: readonly ProofEventMergeIssue[];
  proofEventStatus?: ProofEventLoadStatus;
};
