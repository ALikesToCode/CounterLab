import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
  newAnalysisDisabled?: boolean;
  showEvidence: () => void;
  lockPrediction?: () => void;
  runFairTest?: () => void;
  reviewPatch?: () => void;
  downloadPatch?: () => void;
  exportProof?: () => void;
  revokeSessionAccess?: () => void;
  revokeSessionAccessDisabled?: boolean;
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
  const [projectToolsOpen, setProjectToolsOpen] = useState(false);
  const [proofOpen, setProofOpen] = useState(context.stage === "live-compile");
  const [proofTab, setProofTab] = useState<ProofTab>("Activity");
  const proofOpenOrigin = useRef<"automatic" | "manual" | null>(
    context.stage === "live-compile" ? "automatic" : null,
  );
  const previousStage = useRef(context.stage);
  const projectToolsTrigger = useRef<HTMLButtonElement>(null);
  const recentProjects = useRecentProjects(
    context.session,
    context.artifact,
    context.mode,
  );

  useEffect(() => {
    const wasCompiling = previousStage.current === "live-compile";
    const isCompiling = context.stage === "live-compile";

    if (!wasCompiling && isCompiling) {
      setProofOpen((current) => {
        if (!current) proofOpenOrigin.current = "automatic";
        return true;
      });
    } else if (
      wasCompiling &&
      !isCompiling &&
      proofOpenOrigin.current === "automatic"
    ) {
      proofOpenOrigin.current = null;
      setProofOpen(false);
    }

    previousStage.current = context.stage;
  }, [context.stage]);

  useEffect(() => {
    const openPalette = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setProjectToolsOpen(false);
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", openPalette);
    return () => window.removeEventListener("keydown", openPalette);
  }, []);

  useEffect(() => {
    if (!projectToolsOpen) return;
    const containProjectToolsFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setProjectToolsOpen(false);
        projectToolsTrigger.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.getElementById("studio-project-tools");
      if (dialog === null) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", containProjectToolsFocus);
    return () =>
      window.removeEventListener("keydown", containProjectToolsFocus);
  }, [projectToolsOpen]);

  const closeProjectTools = () => {
    setProjectToolsOpen(false);
    projectToolsTrigger.current?.focus();
  };

  const runFromProjectTools = (action: () => void) => {
    closeProjectTools();
    action();
  };

  const showProof = (tab: ProofTab) => {
    setProofTab(tab);
    proofOpenOrigin.current = "manual";
    setProofOpen(true);
  };

  const toggleProof = () => {
    setProofOpen((current) => {
      proofOpenOrigin.current = current ? null : "manual";
      return !current;
    });
  };

  const commands = useMemo<StudioCommand[]>(
    () => [
      {
        id: "analyze",
        label: "Analyze notebook",
        hint: "Start a new live notebook session.",
        shortcut: "N",
        disabled: actions.newAnalysisDisabled ?? false,
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
    <div
      className={`studio-frame proof-${proofOpen ? "open" : "closed"} tools-${projectToolsOpen ? "open" : "closed"}`}
    >
      {projectToolsOpen ? (
        <>
          <button
            className="studio-sidebar-scrim"
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={closeProjectTools}
          />
          <ProjectSidebar
            context={context}
            recentProjects={recentProjects}
            onNewAnalysis={() => runFromProjectTools(actions.newAnalysis)}
            newAnalysisDisabled={actions.newAnalysisDisabled ?? false}
            onShowEvidence={() => runFromProjectTools(actions.showEvidence)}
            onOpenRecent={(project) =>
              runFromProjectTools(() => actions.openRecent(project))
            }
            onOpenCommands={() =>
              runFromProjectTools(() => setPaletteOpen(true))
            }
            onClose={closeProjectTools}
          />
        </>
      ) : null}
      <div className="studio-canvas">
        <div className="studio-utility-bar">
          <button
            ref={projectToolsTrigger}
            type="button"
            aria-expanded={projectToolsOpen}
            aria-controls="studio-project-tools"
            onClick={() => setProjectToolsOpen(true)}
          >
            Project &amp; evidence
          </button>
        </div>
        {children}
      </div>
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
        onToggle={toggleProof}
        onTab={setProofTab}
        {...(actions.revokeSessionAccess === undefined
          ? {}
          : {
              onRevokeSessionAccess: actions.revokeSessionAccess,
              revokeSessionAccessDisabled:
                actions.revokeSessionAccessDisabled ?? false,
            })}
      />
      <CommandPalette
        open={paletteOpen}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}
