import { useEffect, useId, useRef, useState } from "react";

import styles from "./BoundaryHunt.module.css";

export type BoundaryHuntExpectedClassification =
  "CONCLUSION_CHANGES" | "CONCLUSION_DOES_NOT_CHANGE";

export type BoundaryHuntAxisValue = {
  readonly id: string;
  readonly label: string;
};

export type BoundaryHuntAxis = {
  readonly id: string;
  readonly label: string;
  readonly values: readonly BoundaryHuntAxisValue[];
};

export type BoundaryHuntCoordinate = {
  readonly axisId: string;
  readonly valueId: string;
};

export type VerifiedBoundaryHuntCell = {
  readonly cellId: string;
  readonly coordinates: readonly [
    BoundaryHuntCoordinate,
    BoundaryHuntCoordinate,
  ];
  readonly expectedClassification: BoundaryHuntExpectedClassification;
};

export type VerifiedBoundaryHuntData = {
  readonly resultHash: string;
  readonly referenceCellId: string;
  readonly axes: readonly [BoundaryHuntAxis, BoundaryHuntAxis];
  readonly cells: readonly VerifiedBoundaryHuntCell[];
};

export type BoundaryHuntProps = {
  readonly boundary: VerifiedBoundaryHuntData;
  readonly onRevealMap: () => void;
  readonly onSkip: () => void;
  readonly onClassify?: (
    classification: "CONCLUSION_CHANGES" | "CONCLUSION_STABLE",
  ) => void;
};

type AttemptOutcome = "SUCCESS" | "TRY_AGAIN" | "MAP_READY";

function coordinateLabel(
  boundary: VerifiedBoundaryHuntData,
  coordinate: BoundaryHuntCoordinate,
): { axis: string; value: string } {
  const axis = boundary.axes.find(
    (candidate) => candidate.id === coordinate.axisId,
  );
  const value = axis?.values.find(
    (candidate) => candidate.id === coordinate.valueId,
  );
  return {
    axis: axis?.label ?? coordinate.axisId,
    value: value?.label ?? coordinate.valueId,
  };
}

export function BoundaryHunt({
  boundary,
  onRevealMap,
  onSkip,
  onClassify,
}: BoundaryHuntProps) {
  const groupName = useId();
  const titleId = useId();
  const instructionsId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [attemptedCellIds, setAttemptedCellIds] = useState<readonly string[]>(
    [],
  );
  const [outcome, setOutcome] = useState<AttemptOutcome | null>(null);
  const [revealRequested, setRevealRequested] = useState(false);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const requestReveal = () => {
    if (revealRequested) return;
    setRevealRequested(true);
    onRevealMap();
  };

  const checkCondition = () => {
    const selectedCell = boundary.cells.find(
      (cell) => cell.cellId === selectedCellId,
    );
    if (
      selectedCell === undefined ||
      attemptedCellIds.includes(selectedCell.cellId) ||
      outcome === "SUCCESS"
    )
      return;

    const nextAttemptedCellIds = [...attemptedCellIds, selectedCell.cellId];
    const successful =
      selectedCell.expectedClassification === "CONCLUSION_CHANGES";

    onClassify?.(successful ? "CONCLUSION_CHANGES" : "CONCLUSION_STABLE");

    setAttemptedCellIds(nextAttemptedCellIds);

    if (successful) {
      setOutcome("SUCCESS");
      requestReveal();
      return;
    }

    if (nextAttemptedCellIds.length >= 2) {
      setOutcome("MAP_READY");
      requestReveal();
      return;
    }

    setOutcome("TRY_AGAIN");
  };

  return (
    <section
      className={`${styles.hunt} ${styles.reducedMotionSafe}`}
      aria-labelledby={titleId}
      data-boundary-result-hash={boundary.resultHash}
    >
      <header className={styles.header}>
        <span>Boundary · One verified point</span>
        <h2 id={titleId} ref={titleRef} tabIndex={-1}>
          Can you find a condition where the conclusion changes?
        </h2>
        <p id={instructionsId}>
          The first card is the reference condition. Choose one existing cell
          whose verified classification you think changes from that reference.
          CounterLab will not run a model or calculate a new result.
        </p>
        <p className={styles.evidenceLinkTarget}>
          These choices are bound to verified Boundary Map result{" "}
          {boundary.resultHash.slice(0, 12)}…
        </p>
      </header>

      <fieldset className={styles.options} aria-describedby={instructionsId}>
        <legend>Choose one condition</legend>
        <div className={styles.optionGrid}>
          {boundary.cells.map((cell) => {
            const [first, second] = cell.coordinates.map((coordinate) =>
              coordinateLabel(boundary, coordinate),
            );
            const selected = selectedCellId === cell.cellId;
            const attempted = attemptedCellIds.includes(cell.cellId);
            const reference = boundary.referenceCellId === cell.cellId;

            return (
              <label
                className={`${styles.option} ${selected ? styles.selected : ""} ${attempted ? styles.attempted : ""}`}
                data-attempted={attempted ? "true" : "false"}
                key={cell.cellId}
              >
                <input
                  type="radio"
                  name={groupName}
                  value={cell.cellId}
                  aria-label={`${first?.axis ?? "First condition"} ${first?.value ?? ""}; ${second?.axis ?? "Second condition"} ${second?.value ?? ""}`}
                  checked={selected}
                  onChange={() => setSelectedCellId(cell.cellId)}
                />
                <span className={styles.coordinate}>
                  <small>{first?.axis}</small>
                  <strong>{first?.value}</strong>
                </span>
                <span aria-hidden="true" className={styles.separator}>
                  ×
                </span>
                <span className={styles.coordinate}>
                  <small>{second?.axis}</small>
                  <strong>{second?.value}</strong>
                </span>
                {attempted ? (
                  <span className={styles.attemptedMark}>
                    <span aria-hidden="true">◆</span> Tried
                  </span>
                ) : reference ? (
                  <span className={styles.referenceMark}>Reference</span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className={styles.actions}>
        <button
          className={styles.primaryAction}
          type="button"
          disabled={
            selectedCellId === null ||
            attemptedCellIds.includes(selectedCellId) ||
            outcome === "SUCCESS"
          }
          onClick={checkCondition}
        >
          Check this condition
        </button>
        <button
          className={styles.secondaryAction}
          type="button"
          disabled={revealRequested}
          onClick={requestReveal}
        >
          Reveal the map
        </button>
        <button
          className={styles.skipAction}
          type="button"
          disabled={revealRequested}
          onClick={onSkip}
        >
          Skip the hunt
        </button>
      </div>

      {outcome === null ? null : (
        <div className={styles.feedback} role="status" aria-live="polite">
          {outcome === "SUCCESS" ? (
            <>
              <strong>
                <span aria-hidden="true">◆</span> You found a changing
                condition.
              </strong>
              <p>The full verified map is ready to compare.</p>
            </>
          ) : outcome === "MAP_READY" ? (
            <>
              <strong>
                <span aria-hidden="true">○</span> This condition keeps the
                conclusion stable.
              </strong>
              <p>Two conditions are enough—the full verified map is ready.</p>
              <p>You can still classify a changing condition to continue.</p>
            </>
          ) : (
            <>
              <strong>
                <span aria-hidden="true">○</span> This condition keeps the
                conclusion stable.
              </strong>
              <p>Try one more condition, or reveal the map.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
