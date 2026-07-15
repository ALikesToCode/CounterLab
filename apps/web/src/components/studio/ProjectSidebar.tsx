import type { RecentProject, StudioContext } from "./types";

const stages = [
  ["claim", "Claim"],
  ["belief", "Belief Test"],
  ["build", "Verified Lab"],
  ["reality", "Transfer & patch"],
] as const;

function stagePosition(stage: StudioContext["stage"]): number {
  if (stage === "live-setup" || stage === "claim") return 0;
  if (stage === "belief") return 1;
  if (stage === "build" || stage === "live-compile") return 2;
  return 3;
}

export function ProjectSidebar({
  context,
  recentProjects,
  onNewAnalysis,
  onShowEvidence,
  onNavigateStage,
  onOpenRecent,
  onOpenCommands,
}: {
  context: StudioContext;
  recentProjects: readonly RecentProject[];
  onNewAnalysis: () => void;
  onShowEvidence: () => void;
  onNavigateStage: (stage: (typeof stages)[number][0]) => void;
  onOpenRecent: (project: RecentProject) => void;
  onOpenCommands: () => void;
}) {
  const currentPosition = stagePosition(context.stage);
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
    <aside className="studio-sidebar" aria-label="Project and evidence">
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
        onClick={onNewAnalysis}
      >
        <span aria-hidden="true">＋</span> New analysis
      </button>

      <section className="studio-side-section current-project">
        <p>Current notebook</p>
        <button type="button" onClick={onShowEvidence}>
          <span className="notebook-glyph" aria-hidden="true">
            NB
          </span>
          <span>
            <strong>{context.artifact?.fileName ?? "Choose a notebook"}</strong>
            <small>
              {context.artifact === null
                ? "No artifact selected"
                : `${context.artifact.cells.length} cells · ${context.artifact.support.status.toLowerCase()}`}
            </small>
          </span>
        </button>
      </section>

      <nav className="studio-stage-nav" aria-label="Session stages">
        <p>Learning path</p>
        <ol>
          {stages.map(([key, label], index) => (
            <li
              className={`${index === currentPosition ? "current" : ""} ${index < currentPosition ? "complete" : ""}`}
              key={key}
            >
              <span>{index < currentPosition ? "✓" : index + 1}</span>
              {index < currentPosition ? (
                <button
                  type="button"
                  aria-label={`Review ${label}`}
                  onClick={() => onNavigateStage(key)}
                >
                  {label}
                </button>
              ) : (
                <strong>{label}</strong>
              )}
            </li>
          ))}
        </ol>
      </nav>

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
        onClick={onOpenCommands}
      >
        <span>⌘</span> Commands <kbd>Ctrl K</kbd>
      </button>
    </aside>
  );
}
