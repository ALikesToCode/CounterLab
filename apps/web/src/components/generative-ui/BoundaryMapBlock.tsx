import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type { BoundaryMapCellV1 } from "@counterlab/contracts";

import type { BoundaryResponse } from "../../api";
import styles from "./BoundaryMapBlock.module.css";

const percentage = new Intl.NumberFormat("en", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function classificationSymbol(index: number): string {
  return ["○", "◐", "◆"][Math.min(index, 2)] ?? "○";
}

function cellObservable(cell: BoundaryMapCellV1): {
  label: string;
  value: string;
  detail: string;
} {
  if (cell.concept === "entity_leakage") {
    return {
      label: "Optimism gap",
      value: `${(cell.optimismGap * 100).toFixed(1)} percentage points`,
      detail: `${percentage.format(cell.randomAccuracy)} random-row accuracy versus ${percentage.format(cell.groupAccuracy)} group-holdout accuracy; ${cell.groupEntityOverlap.count} shared entities; n=${cell.sampleSizes.groupTest}.`,
    };
  }
  return {
    label: "F1",
    value: percentage.format(cell.metrics.f1),
    detail: `${percentage.format(cell.metrics.recall)} recall, ${percentage.format(cell.metrics.precision)} precision, threshold ${cell.threshold.toFixed(2)}, prevalence ${percentage.format(cell.prevalence)}, n=${cell.sampleSize}.`,
  };
}

export function BoundaryMapBlock({
  boundary,
  prediction,
}: {
  boundary: BoundaryResponse;
  prediction?: string;
}) {
  const { result, report, receipt } = boundary;
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const classificationById = useMemo(
    () => new Map(result.classifications.map((item) => [item.id, item])),
    [result.classifications],
  );
  const classificationIndex = useMemo(
    () =>
      new Map(result.classifications.map((item, index) => [item.id, index])),
    [result.classifications],
  );
  const [columnAxis, rowAxis] = result.axes;
  const cellByCoordinate = useMemo(
    () =>
      new Map(
        result.cells.map((cell) => [
          `${cell.coordinates[0].pointId}:${cell.coordinates[1].pointId}`,
          cell,
        ]),
      ),
    [result.cells],
  );
  const firstCell = cellByCoordinate.get(
    `${columnAxis.points[0]?.id}:${rowAxis.points[0]?.id}`,
  );
  const [selectedCellId, setSelectedCellId] = useState(
    firstCell?.cellId ?? result.cells[0]?.cellId ?? "",
  );
  const selectedCell =
    result.cells.find((cell) => cell.cellId === selectedCellId) ?? firstCell;

  if (report.status !== "VERIFIED") {
    const counterexample = report.invariants.find(
      (invariant) => !invariant.passed,
    )?.counterexample;
    return (
      <section className={styles.rejected} role="alert">
        <span>Boundary · Rejected</span>
        <h2>Boundary evidence withheld.</h2>
        <p>
          The independent verifier did not authorize this map, so CounterLab
          released no computed cells.
        </p>
        {counterexample === undefined ? null : <p>{counterexample}</p>}
      </section>
    );
  }

  const selectCell = (cell: BoundaryMapCellV1) => {
    setSelectedCellId(cell.cellId);
  };

  const moveSelection = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    rowIndex: number,
    columnIndex: number,
  ) => {
    let nextRow = rowIndex;
    let nextColumn = columnIndex;
    if (event.key === "ArrowRight") nextColumn += 1;
    else if (event.key === "ArrowLeft") nextColumn -= 1;
    else if (event.key === "ArrowDown") nextRow += 1;
    else if (event.key === "ArrowUp") nextRow -= 1;
    else if (event.key === "Home") nextColumn = 0;
    else if (event.key === "End") nextColumn = columnAxis.points.length - 1;
    else return;

    event.preventDefault();
    nextRow = Math.max(0, Math.min(rowAxis.points.length - 1, nextRow));
    nextColumn = Math.max(
      0,
      Math.min(columnAxis.points.length - 1, nextColumn),
    );
    const target = cellByCoordinate.get(
      `${columnAxis.points[nextColumn]?.id}:${rowAxis.points[nextRow]?.id}`,
    );
    if (target === undefined) return;
    selectCell(target);
    buttons.current.get(target.cellId)?.focus();
  };

  const selectedClassification =
    selectedCell === undefined
      ? undefined
      : classificationById.get(selectedCell.classificationId);
  const selectedObservable =
    selectedCell === undefined ? undefined : cellObservable(selectedCell);
  const selectedCoordinates = selectedCell?.coordinates.map((coordinate) => {
    const axis = result.axes.find(
      (candidate) => candidate.id === coordinate.axisId,
    );
    const point = axis?.points.find(
      (candidate) => candidate.id === coordinate.pointId,
    );
    return { axis, point };
  });
  const integrityLabel =
    receipt.integrity.mode === "hmac-signed"
      ? "HMAC-signed"
      : "Integrity-hashed";

  return (
    <section
      className={styles.boundaryMap}
      aria-labelledby="boundary-map-title"
    >
      <header className={styles.header}>
        <div>
          <span>Boundary · Verified Test</span>
          <h2 id="boundary-map-title" tabIndex={-1}>
            Where does the result change?
          </h2>
          <p>
            Fixed code swept two approved conditions while the registered
            experiment controls stayed fixed.
          </p>
        </div>
        <div className={styles.integrity}>
          <strong>{integrityLabel}</strong>
          <span>{receipt.receiptHash.slice(0, 12)}…</span>
        </div>
      </header>

      {prediction === undefined ? null : (
        <aside className={styles.prediction} aria-label="Locked prediction">
          <span>Locked prediction</span>
          <p>{prediction}</p>
        </aside>
      )}

      <div className={styles.layout}>
        <div className={styles.gridWrap}>
          <table
            className={styles.grid}
            aria-label="Verified Boundary Map values"
          >
            <caption>
              {rowAxis.label} by {columnAxis.label}. Select a cell to inspect
              its exact verified value.
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <span>{rowAxis.label}</span>
                  <small>{columnAxis.label} →</small>
                </th>
                {columnAxis.points.map((point) => (
                  <th scope="col" key={point.id}>
                    {point.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowAxis.points.map((rowPoint, rowIndex) => (
                <tr key={rowPoint.id}>
                  <th scope="row">{rowPoint.label}</th>
                  {columnAxis.points.map((columnPoint, columnIndex) => {
                    const cell = cellByCoordinate.get(
                      `${columnPoint.id}:${rowPoint.id}`,
                    );
                    if (cell === undefined)
                      return <td key={columnPoint.id}>—</td>;
                    const classification = classificationById.get(
                      cell.classificationId,
                    );
                    const index =
                      classificationIndex.get(cell.classificationId) ?? 0;
                    const observable = cellObservable(cell);
                    const selected = cell.cellId === selectedCell?.cellId;
                    return (
                      <td key={columnPoint.id}>
                        <button
                          ref={(node) => {
                            if (node === null)
                              buttons.current.delete(cell.cellId);
                            else buttons.current.set(cell.cellId, node);
                          }}
                          className={styles[`tone${Math.min(index, 2)}`]}
                          type="button"
                          aria-label={`${columnAxis.label} ${columnPoint.label}; ${rowAxis.label} ${rowPoint.label}; ${classification?.label ?? cell.classificationId}; ${observable.label} ${observable.value}`}
                          aria-pressed={selected}
                          tabIndex={selected ? 0 : -1}
                          onClick={() => selectCell(cell)}
                          onKeyDown={(event) =>
                            moveSelection(event, rowIndex, columnIndex)
                          }
                        >
                          <span aria-hidden="true">
                            {classificationSymbol(index)}
                          </span>
                          <small>{observable.value}</small>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className={styles.inspector} aria-live="polite">
          <span>Selected condition</span>
          {selectedCell === undefined || selectedObservable === undefined ? (
            <p>No verified cell is available.</p>
          ) : (
            <>
              <h3>
                {selectedClassification?.label ?? selectedCell.classificationId}
              </h3>
              <dl>
                {selectedCoordinates?.map(({ axis, point }) => (
                  <div key={axis?.id ?? point?.id}>
                    <dt>{axis?.label}</dt>
                    <dd>{point?.label}</dd>
                  </div>
                ))}
                <div>
                  <dt>{selectedObservable.label}</dt>
                  <dd>{selectedObservable.value}</dd>
                </div>
              </dl>
              <p>{selectedObservable.detail}</p>
              <p>{selectedClassification?.description}</p>
            </>
          )}
        </aside>
      </div>

      <ul className={styles.legend} aria-label="Boundary classifications">
        {result.classifications.map((classification, index) => (
          <li key={classification.id}>
            <span aria-hidden="true">{classificationSymbol(index)}</span>
            <strong>{classification.label}</strong>
          </li>
        ))}
      </ul>

      <details className={styles.evidence} open>
        <summary>Assumptions and evidence scope</summary>
        <div>
          <section>
            <h3>Held fixed</h3>
            <ul>
              {result.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Not claimed</h3>
            <ul>
              {result.nonClaims.map((nonClaim) => (
                <li key={nonClaim}>{nonClaim}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Provenance</h3>
            <p>
              Kernel {result.kernelVersion} · seed {result.seed} ·{" "}
              {result.cells.length} cells
            </p>
            {receipt.integrity.mode === "hmac-signed" ? (
              <p>Signing key ID {receipt.integrity.keyId}</p>
            ) : (
              <p>SHA-256 content integrity; no signature is claimed.</p>
            )}
          </section>
        </div>
      </details>
    </section>
  );
}
