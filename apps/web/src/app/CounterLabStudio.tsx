import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useRecentProjects } from "../hooks/useRecentProjects";
import { CommandPalette } from "../components/studio/CommandPalette";
import { ProjectSidebar } from "../components/studio/ProjectSidebar";
import { ProofConsole, type ProofTab } from "../components/studio/ProofConsole";
import type {
  RecentProject,
  StudioCommand,
  StudioContext,
} from "../components/studio/types";

export type StudioActions = {
  newAnalysis: () => void;
  showEvidence: () => void;
  navigateStage: (stage: "claim" | "belief" | "build" | "reality") => void;
  lockPrediction?: () => void;
  runFairTest?: () => void;
  reviewPatch?: () => void;
  downloadPatch?: () => void;
  exportProof?: () => void;
  startOver: () => void;
  openRecent: (project: RecentProject) => void;
};

export function CounterLabStudio({
  context,
  actions,
  children,
}: {
  context: StudioContext;
  actions: StudioActions;
  children: ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [proofOpen, setProofOpen] = useState(context.stage === "live-compile");
  const [proofTab, setProofTab] = useState<ProofTab>("Activity");
  const recentProjects = useRecentProjects(
    context.session,
    context.artifact,
    context.mode,
  );

  useEffect(() => {
    if (context.stage === "live-compile") setProofOpen(true);
  }, [context.stage]);

  useEffect(() => {
    const openPalette = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", openPalette);
    return () => window.removeEventListener("keydown", openPalette);
  }, []);

  const showProof = (tab: ProofTab) => {
    setProofTab(tab);
    setProofOpen(true);
  };

  const commands = useMemo<StudioCommand[]>(
    () => [
      {
        id: "analyze",
        label: "Analyze notebook",
        hint: "Start a new live notebook session.",
        shortcut: "N",
        run: actions.newAnalysis,
      },
      {
        id: "evidence",
        label: "Show evidence",
        hint: "Open the artifact and exact notebook cell references.",
        shortcut: "E",
        run: actions.showEvidence,
      },
      {
        id: "prediction",
        label: "Lock prediction",
        hint: "Commit the current pre-result answer.",
        disabled: actions.lockPrediction === undefined,
        run: actions.lockPrediction ?? (() => undefined),
      },
      {
        id: "run",
        label: "Run fair test",
        hint: "Reveal only an independently verified result.",
        disabled: actions.runFairTest === undefined,
        run: actions.runFairTest ?? (() => undefined),
      },
      {
        id: "verifier",
        label: "Show verifier",
        hint: "Inspect accepted invariants and concrete rejections.",
        shortcut: "V",
        run: () => showProof("Verifier"),
      },
      {
        id: "patch",
        label: "Review patch",
        hint: "Inspect the verified notebook-cell correction.",
        disabled: actions.reviewPatch === undefined,
        run: actions.reviewPatch ?? (() => undefined),
      },
      {
        id: "download",
        label: "Download patched notebook",
        hint: "Download the verified copy; never overwrite the upload.",
        disabled: actions.downloadPatch === undefined,
        run: actions.downloadPatch ?? (() => undefined),
      },
      {
        id: "proof",
        label: "Export proof",
        hint: "Download the machine-readable Proof Capsule.",
        disabled: actions.exportProof === undefined,
        run: actions.exportProof ?? (() => undefined),
      },
      {
        id: "reset",
        label: "Start over",
        hint: "Return home and clear this browser's active session.",
        run: actions.startOver,
      },
    ],
    [actions],
  );

  return (
    <div className={`studio-frame proof-${proofOpen ? "open" : "closed"}`}>
      <ProjectSidebar
        context={context}
        recentProjects={recentProjects}
        onNewAnalysis={actions.newAnalysis}
        onShowEvidence={actions.showEvidence}
        onNavigateStage={actions.navigateStage}
        onOpenRecent={actions.openRecent}
        onOpenCommands={() => setPaletteOpen(true)}
      />
      <div className="studio-canvas">{children}</div>
      <button
        className="studio-mobile-command"
        type="button"
        aria-label="Open commands"
        onClick={() => setPaletteOpen(true)}
      >
        ⌘K
      </button>
      <ProofConsole
        context={context}
        open={proofOpen}
        activeTab={proofTab}
        onToggle={() => setProofOpen((current) => !current)}
        onTab={setProofTab}
      />
      <CommandPalette
        open={paletteOpen}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}
