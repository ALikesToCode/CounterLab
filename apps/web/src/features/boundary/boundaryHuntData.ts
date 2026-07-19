import type { BoundaryResponse } from "../../api";
import type { VerifiedBoundaryHuntData } from "./BoundaryHunt";

export function huntDataFor(
  boundary: BoundaryResponse,
): VerifiedBoundaryHuntData {
  const { result } = boundary;
  const reference = result.cells[0];
  if (reference === undefined) {
    throw new TypeError("Verified Boundary Map has no hunt reference cell");
  }
  const sameClassification = result.cells.find(
    (cell) =>
      cell.cellId !== reference.cellId &&
      cell.classificationId === reference.classificationId,
  );
  const changedClassification = result.cells.find(
    (cell) => cell.classificationId !== reference.classificationId,
  );
  const selectedCells = [
    reference,
    sameClassification,
    changedClassification,
    result.cells.at(-1),
    ...result.cells,
  ].reduce<(typeof result.cells)[number][]>((selected, cell) => {
    if (
      cell !== undefined &&
      selected.length < 4 &&
      !selected.some((candidate) => candidate.cellId === cell.cellId)
    ) {
      selected.push(cell);
    }
    return selected;
  }, []);
  const [firstAxis, secondAxis] = result.axes;

  return {
    resultHash: result.resultHash,
    referenceCellId: reference.cellId,
    axes: [
      {
        id: firstAxis.id,
        label: firstAxis.label,
        values: firstAxis.points.map((point) => ({
          id: point.id,
          label: point.label,
        })),
      },
      {
        id: secondAxis.id,
        label: secondAxis.label,
        values: secondAxis.points.map((point) => ({
          id: point.id,
          label: point.label,
        })),
      },
    ],
    cells: selectedCells.map((cell) => ({
      cellId: cell.cellId,
      coordinates: [
        {
          axisId: cell.coordinates[0].axisId,
          valueId: cell.coordinates[0].pointId,
        },
        {
          axisId: cell.coordinates[1].axisId,
          valueId: cell.coordinates[1].pointId,
        },
      ],
      expectedClassification:
        cell.classificationId === reference.classificationId
          ? "CONCLUSION_DOES_NOT_CHANGE"
          : "CONCLUSION_CHANGES",
    })),
  };
}
