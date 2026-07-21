import type { RecentProject, StudioContext } from "./types";

export function ProjectSidebar({
  context,
  recentProjects,
  onNewAnalysis,
  newAnalysisDisabled = false,
  onShowEvidence,
  onOpenRecent,
  onOpenCommands,
  onClose,
}: {
  context: StudioContext;
  recentProjects: readonly RecentProject[];
  onNewAnalysis: () => void;
  newAnalysisDisabled?: boolean;
  onShowEvidence: () => void;
  onOpenRecent: (project: RecentProject) => void;
  onOpenCommands: () => void;
  onClose: () => void;
}) {
  const expectedSessionMode =
    context.mode === "instant"
      ? "sample_lesson"
      : context.mode === "replay"
        ? "verified_replay"
        : "live_notebook";
  const modeMatchesSession =
    context.session === null ||
    context.session.mode.kind === expectedSessionMode;
  const artifactCopy = !modeMatchesSession
    ? {
        heading: "Evidence context",
        fallbackName: "Mode mismatch",
        empty: "Artifact details withheld",
      }
    : context.mode === "instant"
      ? {
          heading: "Bundled sample artifact",
          fallbackName: "Sample artifact unavailable",
          empty: "No fixed sample loaded",
        }
      : context.mode === "replay"
        ? {
            heading: "Replay artifact",
            fallbackName: "Stored replay evidence",
            empty: "Replay artifact unavailable",
          }
        : {
            heading: "Uploaded notebook",
            fallbackName: "Attach a notebook",
            empty: "No notebook uploaded",
          };
  const evidenceCells =
    context.artifact?.cells
      .filter(
        (cell) =>
          cell.metricCandidates.length > 0 ||
          cell.outputHashes.length > 0 ||
          cell.symbols.length > 0,
      )
      .slice(0, 5) ?? [];

  return (
    <aside
      className="studio-sidebar"
      id="studio-project-tools"
      role="dialog"
      aria-modal="true"
      aria-label="Project and evidence tools"
    >
      <button
        className="studio-sidebar-close"
        type="button"
        autoFocus
        onClick={onClose}
      >
        Close project tools
      </button>
      <div className="studio-side-brand">
        <span>C</span>
        <div>
          <strong>CounterLab</strong>
          <small>Studio</small>
        </div>
      </div>
      <button
        className="studio-new-button"
        type="button"
        disabled={newAnalysisDisabled}
        onClick={onNewAnalysis}
      >
        <span aria-hidden="true">＋</span> New analysis
      </button>

      <section className="studio-side-section current-project">
        <p>{artifactCopy.heading}</p>
        <button
          type="button"
          disabled={!modeMatchesSession}
          onClick={onShowEvidence}
        >
          <span className="notebook-glyph" aria-hidden="true">
            NB
          </span>
          <span>
            <strong>
              {context.artifact?.fileName ?? artifactCopy.fallbackName}
            </strong>
            <small>
              {context.artifact === null
                ? artifactCopy.empty
                : `${context.artifact.cells.length} cells · ${context.artifact.support.status.toLowerCase()}`}
            </small>
          </span>
        </button>
      </section>

      {evidenceCells.length > 0 && (
        <section className="studio-side-section evidence-nav">
          <p>Evidence navigator</p>
          {evidenceCells.map((cell) => (
            <button type="button" key={cell.index} onClick={onShowEvidence}>
              <span>Cell {cell.index}</span>
              <strong>{cell.sourceExcerpt || "Notebook evidence"}</strong>
            </button>
          ))}
        </section>
      )}

      <section className="studio-side-section recent-projects">
        <p>Recent sessions</p>
        {recentProjects.length === 0 ? (
          <span className="studio-empty">Your work will appear here.</span>
        ) : (
          recentProjects.slice(0, 3).map((project) => (
            <button
              type="button"
              key={project.sessionId}
              onClick={() => onOpenRecent(project)}
            >
              <span className={`recent-mode ${project.mode}`} />
              <span>
                <strong>{project.fileName}</strong>
                <small>{project.state.replaceAll("_", " ")}</small>
              </span>
            </button>
          ))
        )}
      </section>

      <button
        className="studio-command-trigger"
        type="button"
        aria-label="Open commands"
        onClick={onOpenCommands}
      >
        <span aria-hidden="true">⌘</span> Commands{" "}
        <kbd aria-hidden="true">Ctrl K</kbd>
      </button>
    </aside>
  );
}
