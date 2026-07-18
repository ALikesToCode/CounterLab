import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import styles from "./ExperimentTheater.module.css";

export const theaterViews = [
  { id: "observe", label: "Observe" },
  { id: "explore", label: "Explore" },
  { id: "boundary", label: "Boundary" },
  { id: "apply", label: "Apply" },
] as const;

export type TheaterViewId = (typeof theaterViews)[number]["id"];

export type TheaterView = Readonly<{
  heading: string;
  content: ReactNode;
  available: boolean;
  completed: boolean;
}>;

export type ExperimentTheaterVerifiedPayload = Readonly<{
  comparison: Readonly<{
    title: string;
    accessibleSummary: string;
    first: Readonly<{ label: string; value: string; detail?: string }>;
    second: Readonly<{ label: string; value: string; detail?: string }>;
  }>;
  finding: string;
  controlledVariables: string;
  views: Readonly<Record<TheaterViewId, TheaterView>>;
}>;

function viewEnabled(view: TheaterView): boolean {
  return view.available || view.completed;
}

function firstEnabledView(
  payload: ExperimentTheaterVerifiedPayload | undefined,
  preferred: TheaterViewId,
): TheaterViewId {
  if (payload === undefined) return preferred;
  if (viewEnabled(payload.views[preferred])) return preferred;
  return (
    theaterViews.find(({ id }) => viewEnabled(payload.views[id]))?.id ??
    "observe"
  );
}

export function ExperimentTheater({
  prediction,
  verifiedPayload,
  initialView = "observe",
}: {
  prediction: string;
  verifiedPayload?: ExperimentTheaterVerifiedPayload;
  initialView?: TheaterViewId;
}) {
  const [activeView, setActiveView] = useState<TheaterViewId>(() =>
    firstEnabledView(verifiedPayload, initialView),
  );
  const tabButtons = useRef(new Map<TheaterViewId, HTMLButtonElement>());

  useEffect(() => {
    if (
      verifiedPayload !== undefined &&
      !viewEnabled(verifiedPayload.views[activeView])
    ) {
      setActiveView(firstEnabledView(verifiedPayload, initialView));
    }
  }, [activeView, initialView, verifiedPayload]);

  const activateView = (view: TheaterViewId) => {
    if (
      verifiedPayload === undefined ||
      !viewEnabled(verifiedPayload.views[view])
    ) {
      return;
    }
    setActiveView(view);
  };

  const moveView = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    current: TheaterViewId,
  ) => {
    if (verifiedPayload === undefined) return;
    const enabled = theaterViews
      .map(({ id }) => id)
      .filter((id) => viewEnabled(verifiedPayload.views[id]));
    const currentIndex = enabled.indexOf(current);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % enabled.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + enabled.length) % enabled.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = enabled.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const next = enabled[nextIndex];
    if (next === undefined) return;
    tabButtons.current.get(next)?.focus();
    activateView(next);
  };

  return (
    <section
      className={styles.theater}
      aria-labelledby="experiment-theater-title"
      data-motion="reduced-safe"
    >
      <header className={styles.header}>
        <div>
          <span>Experiment Theater</span>
          <h2 id="experiment-theater-title">Let the verified test answer.</h2>
        </div>
        <strong className={styles.verification}>
          {verifiedPayload === undefined ? "Result locked" : "Verified result"}
        </strong>
      </header>

      <aside className={styles.prediction} aria-label="Pinned prediction">
        <span>Locked Prediction</span>
        <p>{prediction}</p>
      </aside>

      {verifiedPayload === undefined ? (
        <div className={styles.locked} role="status" aria-live="polite">
          <strong>Waiting for a verified result.</strong>
          <p>
            The comparison and local views stay hidden until the signed payload
            arrives.
          </p>
        </div>
      ) : (
        <div className={styles.verifiedContent}>
          <section
            className={styles.comparison}
            role="img"
            aria-label={verifiedPayload.comparison.accessibleSummary}
          >
            <h3>{verifiedPayload.comparison.title}</h3>
            <div>
              <article>
                <span>{verifiedPayload.comparison.first.label}</span>
                <strong>{verifiedPayload.comparison.first.value}</strong>
                {verifiedPayload.comparison.first.detail ===
                undefined ? null : (
                  <small>{verifiedPayload.comparison.first.detail}</small>
                )}
              </article>
              <span aria-hidden="true">→</span>
              <article>
                <span>{verifiedPayload.comparison.second.label}</span>
                <strong>{verifiedPayload.comparison.second.value}</strong>
                {verifiedPayload.comparison.second.detail ===
                undefined ? null : (
                  <small>{verifiedPayload.comparison.second.detail}</small>
                )}
              </article>
            </div>
          </section>

          <div className={styles.finding}>
            <p>{verifiedPayload.finding}</p>
            <p>
              <strong>Held fixed:</strong> {verifiedPayload.controlledVariables}
            </p>
          </div>

          <div
            className={styles.viewTabs}
            role="tablist"
            aria-label="Experiment views"
          >
            {theaterViews.map(({ id, label }) => {
              const view = verifiedPayload.views[id];
              const enabled = viewEnabled(view);
              return (
                <button
                  ref={(node) => {
                    if (node === null) tabButtons.current.delete(id);
                    else tabButtons.current.set(id, node);
                  }}
                  id={`theater-tab-${id}`}
                  role="tab"
                  type="button"
                  aria-selected={activeView === id}
                  aria-controls={`theater-panel-${id}`}
                  disabled={!enabled}
                  tabIndex={activeView === id ? 0 : -1}
                  onClick={() => activateView(id)}
                  onKeyDown={(event) => moveView(event, id)}
                  key={id}
                >
                  <span>{label}</span>
                  {view.completed ? <small>Completed</small> : null}
                </button>
              );
            })}
          </div>

          <section
            id={`theater-panel-${activeView}`}
            className={styles.viewPanel}
            role="tabpanel"
            aria-labelledby={`theater-tab-${activeView}`}
          >
            <h3>{verifiedPayload.views[activeView].heading}</h3>
            <div>{verifiedPayload.views[activeView].content}</div>
          </section>
        </div>
      )}
    </section>
  );
}
