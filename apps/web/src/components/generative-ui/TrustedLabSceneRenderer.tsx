import {
  useEffect,
  useId,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";

import type {
  LabSceneBlockV2,
  LabSceneV2,
  TrustedLabSceneResultEnvelopeV1,
} from "@counterlab/generative-ui-contracts";

import styles from "./TrustedLabSceneRenderer.module.css";

const SHA_256 = /^[a-f0-9]{64}$/u;
const SAFE_BINDING = /^\/[A-Za-z0-9_-][A-Za-z0-9_/-]*$/u;
const SAFE_TABLE_KEY = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const FORBIDDEN_PATH_TOKENS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);
const ALLOWLISTED_BLOCK_TYPES = new Set<LabSceneBlockV2["type"]>([
  "Hypothesis",
  "Prediction",
  "WhyThisTest",
  "Slider",
  "Toggle",
  "SegmentedControl",
  "Metric",
  "BarChart",
  "LineChart",
  "Scatter",
  "BoundaryMap",
  "MotionCanvas",
  "NotebookCell",
  "NotebookDiff",
  "Transfer",
  "ReasoningDiff",
  "ProofBadge",
  "Limitation",
]);
const BOUND_BLOCK_TYPES = new Set<LabSceneBlockV2["type"]>([
  "Prediction",
  "Metric",
  "BarChart",
  "LineChart",
  "Scatter",
  "BoundaryMap",
  "MotionCanvas",
  "NotebookCell",
  "NotebookDiff",
  "ReasoningDiff",
  "ProofBadge",
]);

type BoundBlockType =
  | "Prediction"
  | "Metric"
  | "BarChart"
  | "LineChart"
  | "Scatter"
  | "BoundaryMap"
  | "MotionCanvas"
  | "NotebookCell"
  | "NotebookDiff"
  | "ReasoningDiff"
  | "ProofBadge";
type BoundBlock = Extract<LabSceneBlockV2, { type: BoundBlockType }>;

type DisplayScalar = string | number | boolean;

export type TrustedLabSceneResultEnvelope = TrustedLabSceneResultEnvelopeV1;

export type LabSceneControlChange = Readonly<{
  blockId: string;
  operationId: string;
  parameterId: string;
  value: string | number | boolean;
}>;

export type TrustedLabSceneRendererProps = Readonly<{
  scene: LabSceneV2;
  verifiedSceneHash: string;
  signedResult?: TrustedLabSceneResultEnvelope;
  onControlChange?: (change: LabSceneControlChange) => void;
}>;

type ChartPoint = Readonly<{ x: string | number; y: number }>;
type BoundaryPoint = Readonly<{
  x: string | number;
  y: string | number;
  value: DisplayScalar;
  classification: string;
}>;
type MotionPoint = Readonly<{
  t: number;
  position: number;
  velocity?: number;
}>;
type TrustedTable = Readonly<{
  columns: readonly Readonly<{
    key: string;
    label: string;
    unit?: string;
  }>[];
  rows: readonly Readonly<Record<string, DisplayScalar>>[];
}>;
type NotebookEvidence = Readonly<{ reference: string; excerpt: string }>;
type ReasoningDiff = Readonly<{ before: string; after: string }>;

type SceneResolution =
  | Readonly<{
      status: "ready";
      values: ReadonlyMap<string, unknown>;
    }>
  | Readonly<{ status: "withheld" }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isDisplayScalar(value: unknown): value is DisplayScalar {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function resolveArrayMemberById(
  values: readonly unknown[],
  requestedId: string,
): unknown {
  const matches = values.filter(
    (candidate) =>
      isRecord(candidate) &&
      hasOwn(candidate, "id") &&
      candidate.id === requestedId,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Resolve the bounded Lab Scene path dialect. Arrays support a numeric index or
 * the contract's read-only `byId/<id>` view. No object prototype is traversed.
 */
export function resolveTrustedLabSceneBinding(
  root: Readonly<Record<string, unknown>>,
  binding: string,
): unknown {
  if (!SAFE_BINDING.test(binding)) return undefined;
  const tokens = binding.slice(1).split("/");
  if (tokens.some((token) => FORBIDDEN_PATH_TOKENS.has(token))) {
    return undefined;
  }

  let cursor: unknown = root;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) return undefined;

    if (Array.isArray(cursor)) {
      if (token === "byId") {
        const requestedId = tokens[index + 1];
        if (requestedId === undefined) return undefined;
        cursor = resolveArrayMemberById(cursor, requestedId);
        index += 1;
      } else if (/^(?:0|[1-9][0-9]*)$/u.test(token)) {
        const itemIndex = Number(token);
        if (!Number.isSafeInteger(itemIndex) || itemIndex >= cursor.length) {
          return undefined;
        }
        cursor = cursor[itemIndex];
      } else {
        return undefined;
      }
      continue;
    }

    if (!isRecord(cursor) || !hasOwn(cursor, token)) return undefined;
    cursor = cursor[token];
  }
  return cursor;
}

function isChartPoints(value: unknown): value is readonly ChartPoint[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 256 &&
    value.every(
      (point) =>
        isRecord(point) &&
        (typeof point.x === "string" ||
          (typeof point.x === "number" && Number.isFinite(point.x))) &&
        typeof point.y === "number" &&
        Number.isFinite(point.y),
    )
  );
}

function isBoundaryPoints(value: unknown): value is readonly BoundaryPoint[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 400 &&
    value.every(
      (point) =>
        isRecord(point) &&
        (typeof point.x === "string" ||
          (typeof point.x === "number" && Number.isFinite(point.x))) &&
        (typeof point.y === "string" ||
          (typeof point.y === "number" && Number.isFinite(point.y))) &&
        isDisplayScalar(point.value) &&
        typeof point.classification === "string" &&
        point.classification.length > 0,
    )
  );
}

function isMotionPoints(value: unknown): value is readonly MotionPoint[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 5_000 &&
    value.every(
      (point) =>
        isRecord(point) &&
        typeof point.t === "number" &&
        Number.isFinite(point.t) &&
        typeof point.position === "number" &&
        Number.isFinite(point.position) &&
        (point.velocity === undefined ||
          (typeof point.velocity === "number" &&
            Number.isFinite(point.velocity))),
    )
  );
}

function isTrustedTable(value: unknown): value is TrustedTable {
  if (
    !isRecord(value) ||
    !Array.isArray(value.columns) ||
    !Array.isArray(value.rows)
  ) {
    return false;
  }
  if (
    value.columns.length === 0 ||
    value.columns.length > 24 ||
    value.rows.length > 5_000
  ) {
    return false;
  }
  const keys = new Set<string>();
  for (const column of value.columns) {
    if (
      !isRecord(column) ||
      typeof column.key !== "string" ||
      !SAFE_TABLE_KEY.test(column.key) ||
      typeof column.label !== "string" ||
      column.label.length === 0 ||
      (column.unit !== undefined && typeof column.unit !== "string") ||
      keys.has(column.key)
    ) {
      return false;
    }
    keys.add(column.key);
  }
  return value.rows.every(
    (row) =>
      isRecord(row) &&
      [...keys].every((key) => hasOwn(row, key) && isDisplayScalar(row[key])),
  );
}

function tableHasExactlyColumns(
  table: TrustedTable,
  expectedKeys: readonly string[],
): boolean {
  return (
    table.columns.length === expectedKeys.length &&
    table.columns.every((column, index) => column.key === expectedKeys[index])
  );
}

function boundaryTableMatches(
  points: readonly BoundaryPoint[],
  table: TrustedTable,
): boolean {
  return (
    tableHasExactlyColumns(table, ["x", "y", "value", "classification"]) &&
    table.rows.length === points.length &&
    table.rows.every(
      (row, index) =>
        row.x === points[index]?.x &&
        row.y === points[index]?.y &&
        row.value === points[index]?.value &&
        row.classification === points[index]?.classification,
    )
  );
}

function motionTableMatches(
  points: readonly MotionPoint[],
  table: TrustedTable,
): boolean {
  const hasVelocity = points.some((point) => point.velocity !== undefined);
  const expectedKeys = hasVelocity
    ? ["t", "position", "velocity"]
    : ["t", "position"];
  return (
    tableHasExactlyColumns(table, expectedKeys) &&
    table.rows.length === points.length &&
    table.rows.every((row, index) => {
      const point = points[index];
      return (
        point !== undefined &&
        row.t === point.t &&
        row.position === point.position &&
        (!hasVelocity || row.velocity === point.velocity)
      );
    })
  );
}

function isNotebookEvidence(value: unknown): value is NotebookEvidence {
  return (
    isRecord(value) &&
    typeof value.reference === "string" &&
    value.reference.length > 0 &&
    typeof value.excerpt === "string" &&
    value.excerpt.length > 0 &&
    value.excerpt.length <= 20_000
  );
}

function isNotebookDiff(value: unknown): value is string | readonly string[] {
  return (
    (typeof value === "string" && value.length <= 50_000) ||
    (Array.isArray(value) &&
      value.length <= 1_000 &&
      value.every((line) => typeof line === "string"))
  );
}

function isReasoningDiff(value: unknown): value is ReasoningDiff {
  return (
    isRecord(value) &&
    typeof value.before === "string" &&
    value.before.length > 0 &&
    typeof value.after === "string" &&
    value.after.length > 0
  );
}

function isKnownBlock(block: unknown): block is LabSceneBlockV2 {
  return (
    isRecord(block) &&
    typeof block.type === "string" &&
    ALLOWLISTED_BLOCK_TYPES.has(block.type as LabSceneBlockV2["type"])
  );
}

function isBoundBlock(block: LabSceneBlockV2): block is BoundBlock {
  return BOUND_BLOCK_TYPES.has(block.type);
}

function bindingKey(blockId: string, slot = "primary"): string {
  return `${blockId}:${slot}`;
}

function boundValueIsSafe(block: LabSceneBlockV2, value: unknown): boolean {
  switch (block.type) {
    case "Prediction":
    case "Metric":
    case "ProofBadge":
      return isDisplayScalar(value);
    case "BarChart":
    case "LineChart":
    case "Scatter":
      return isChartPoints(value);
    case "BoundaryMap":
      return isBoundaryPoints(value);
    case "MotionCanvas":
      return isMotionPoints(value);
    case "NotebookCell":
      return isNotebookEvidence(value);
    case "NotebookDiff":
      return isNotebookDiff(value);
    case "ReasoningDiff":
      return isReasoningDiff(value);
    case "Hypothesis":
    case "WhyThisTest":
    case "Slider":
    case "Toggle":
    case "SegmentedControl":
    case "Transfer":
    case "Limitation":
      return true;
  }
}

function validateEnvelope(
  scene: LabSceneV2,
  verifiedSceneHash: string,
  envelope: TrustedLabSceneResultEnvelope,
): boolean {
  const integrity: unknown = envelope.integrity;
  if (
    envelope.schemaVersion !== "1" ||
    envelope.verificationStatus !== "VERIFIED" ||
    !SHA_256.test(verifiedSceneHash) ||
    !SHA_256.test(envelope.sceneHash) ||
    !SHA_256.test(envelope.resultHash) ||
    !isRecord(integrity) ||
    typeof integrity.contentHash !== "string" ||
    !SHA_256.test(integrity.contentHash) ||
    integrity.contentHash !== envelope.resultHash ||
    envelope.sceneHash !== verifiedSceneHash ||
    envelope.sceneId !== scene.sceneId ||
    envelope.sessionId !== scene.sessionId ||
    envelope.concept !== scene.concept ||
    envelope.experimentIrHash !== scene.provenance.experimentIrHash ||
    envelope.discriminationContractHash !==
      scene.provenance.discriminationContractHash ||
    !isRecord(envelope.result) ||
    !hasOwn(envelope.result, "resultHash") ||
    envelope.result.resultHash !== envelope.resultHash
  ) {
    return false;
  }
  return integrity.mode === "integrity-hashed";
}

function resolveScene(
  scene: LabSceneV2,
  verifiedSceneHash: string,
  signedResult: TrustedLabSceneResultEnvelope | undefined,
): SceneResolution {
  if (!SHA_256.test(verifiedSceneHash)) return { status: "withheld" };
  const rawBlocks: readonly unknown[] = scene.blocks;
  if (!rawBlocks.every(isKnownBlock)) return { status: "withheld" };

  const boundBlocks = scene.blocks.filter(isBoundBlock);
  if (boundBlocks.length === 0 && signedResult === undefined) {
    return { status: "ready", values: new Map() };
  }
  if (
    signedResult === undefined ||
    !validateEnvelope(scene, verifiedSceneHash, signedResult)
  ) {
    return { status: "withheld" };
  }

  const values = new Map<string, unknown>();
  for (const block of boundBlocks) {
    let primaryBinding: string;
    switch (block.type) {
      case "Prediction":
        primaryBinding = block.immutableBinding;
        break;
      case "NotebookCell":
        primaryBinding = block.evidenceBinding;
        break;
      case "NotebookDiff":
        primaryBinding = block.diffBinding;
        break;
      case "ProofBadge":
        primaryBinding = block.proofBinding;
        break;
      case "Metric":
      case "BarChart":
      case "LineChart":
      case "Scatter":
      case "BoundaryMap":
      case "MotionCanvas":
      case "ReasoningDiff":
        primaryBinding = block.resultBinding;
        break;
    }
    const primary = resolveTrustedLabSceneBinding(
      signedResult.result,
      primaryBinding,
    );
    if (primary === undefined || !boundValueIsSafe(block, primary)) {
      return { status: "withheld" };
    }
    values.set(bindingKey(block.id), primary);

    if (block.type === "BoundaryMap" || block.type === "MotionCanvas") {
      const table = resolveTrustedLabSceneBinding(
        signedResult.result,
        block.accessibleTableBinding,
      );
      if (!isTrustedTable(table)) return { status: "withheld" };
      if (
        (block.type === "BoundaryMap" &&
          !boundaryTableMatches(primary as readonly BoundaryPoint[], table)) ||
        (block.type === "MotionCanvas" &&
          !motionTableMatches(primary as readonly MotionPoint[], table))
      ) {
        return { status: "withheld" };
      }
      values.set(bindingKey(block.id, "table"), table);
    }
    if (block.type === "MotionCanvas") {
      const reducedMotion = resolveTrustedLabSceneBinding(
        signedResult.result,
        block.reducedMotionBinding,
      );
      if (!isDisplayScalar(reducedMotion)) return { status: "withheld" };
      values.set(bindingKey(block.id, "reduced-motion"), reducedMotion);
    }
  }
  return { status: "ready", values };
}

function supportLabel(value: LabSceneV2["supportLabel"]): string {
  switch (value) {
    case "VERIFIED_TEST":
      return "Verified test";
    case "GUIDED_VISUAL":
      return "Guided visual";
    case "EXPLANATION_ONLY":
      return "Explanation only";
  }
}

function displayScalar(value: DisplayScalar): string {
  return typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined"
      ? false
      : (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false),
  );
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia === undefined) {
      return undefined;
    }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

function ExactTable({ table, label }: { table: TrustedTable; label: string }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} aria-label={label}>
        <thead>
          <tr>
            {table.columns.map((column) => (
              <th scope="col" key={column.key}>
                {column.label}
                {column.unit === undefined ? null : ` (${column.unit})`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {table.columns.map((column) => (
                <td key={column.key}>{displayScalar(row[column.key]!)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Chart({
  block,
  points,
}: {
  block: Extract<
    LabSceneBlockV2,
    { type: "BarChart" | "LineChart" | "Scatter" }
  >;
  points: readonly ChartPoint[];
}) {
  const width = 640;
  const height = 280;
  const pad = 32;
  const yValues = points.map((point) => point.y);
  const minimum = Math.min(...yValues);
  const maximum = Math.max(...yValues);
  const domainMinimum = minimum > 0 ? 0 : minimum;
  const domainMaximum = maximum < 0 ? 0 : maximum;
  const span =
    domainMaximum === domainMinimum ? 1 : domainMaximum - domainMinimum;
  const barWidth = Math.min(80, (width - pad * 2) / points.length / 1.5);
  const horizontalInset = block.type === "BarChart" ? pad + barWidth / 2 : pad;
  const xAt = (index: number) =>
    points.length === 1
      ? width / 2
      : horizontalInset +
        (index / (points.length - 1)) * (width - horizontalInset * 2);
  const yAt = (value: number) =>
    height - pad - ((value - domainMinimum) / span) * (height - pad * 2);
  const linePoints = points
    .map((point, index) => `${xAt(index)},${yAt(point.y)}`)
    .join(" ");

  return (
    <article className={`${styles.block} ${styles.chartBlock}`}>
      <h3>{block.label}</h3>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={block.accessibleLabel}
      >
        <line
          className={styles.chartAxis}
          x1={pad}
          x2={width - pad}
          y1={height - pad}
          y2={height - pad}
        />
        {block.type === "BarChart"
          ? points.map((point, index) => {
              const y = yAt(point.y);
              return (
                <rect
                  className={styles.chartMark}
                  key={index}
                  x={xAt(index) - barWidth / 2}
                  y={y}
                  width={barWidth}
                  height={Math.max(2, height - pad - y)}
                />
              );
            })
          : null}
        {block.type === "LineChart" ? (
          <polyline className={styles.chartLine} points={linePoints} />
        ) : null}
        {block.type !== "BarChart"
          ? points.map((point, index) => (
              <circle
                className={styles.chartPoint}
                key={index}
                cx={xAt(index)}
                cy={yAt(point.y)}
                r={block.type === "Scatter" ? 7 : 5}
              />
            ))
          : null}
      </svg>
      <dl className={styles.axisLabels}>
        <div>
          <dt>Horizontal</dt>
          <dd>
            {block.xLabel} ({block.xUnit})
          </dd>
        </div>
        <div>
          <dt>Vertical</dt>
          <dd>
            {block.yLabel} ({block.yUnit})
          </dd>
        </div>
      </dl>
      <details className={styles.exactValues} open>
        <summary>Exact verified values</summary>
        <div className={styles.tableWrap}>
          <table
            className={styles.table}
            aria-label={`${block.label} exact values`}
          >
            <thead>
              <tr>
                <th scope="col">
                  {block.xLabel} ({block.xUnit})
                </th>
                <th scope="col">
                  {block.yLabel} ({block.yUnit})
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point, index) => (
                <tr key={index}>
                  <td>{String(point.x)}</td>
                  <td>{String(point.y)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </article>
  );
}

function MotionCanvas({
  block,
  points,
  table,
  reducedMotionSummary,
}: {
  block: Extract<LabSceneBlockV2, { type: "MotionCanvas" }>;
  points: readonly MotionPoint[];
  table: TrustedTable;
  reducedMotionSummary: DisplayScalar;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const width = 640;
  const height = 220;
  const pad = 24;
  const positions = points.map((point) => point.position);
  const minimum = Math.min(...positions);
  const maximum = Math.max(...positions);
  const span = maximum === minimum ? 1 : maximum - minimum;
  const path = points
    .map((point, index) => {
      const x =
        points.length === 1
          ? width / 2
          : pad + (index / (points.length - 1)) * (width - pad * 2);
      const y =
        height - pad - ((point.position - minimum) / span) * (height - pad * 2);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <article className={`${styles.block} ${styles.motionBlock}`}>
      <h3>{block.label}</h3>
      {prefersReducedMotion ? (
        <p className={styles.reducedMotion} role="status">
          {displayScalar(reducedMotionSummary)}
        </p>
      ) : (
        <svg
          className={styles.motion}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={block.label}
        >
          <path className={styles.motionPath} d={path} />
        </svg>
      )}
      <ExactTable table={table} label={`${block.label} exact values`} />
    </article>
  );
}

function SliderControl({
  block,
  onControlChange,
}: {
  block: Extract<LabSceneBlockV2, { type: "Slider" }>;
  onControlChange?: TrustedLabSceneRendererProps["onControlChange"];
}) {
  const inputId = useId();
  const [value, setValue] = useState(block.defaultValue);
  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.currentTarget.value);
    if (!Number.isFinite(nextValue)) return;
    setValue(nextValue);
    onControlChange?.({
      blockId: block.id,
      operationId: block.operationId,
      parameterId: block.parameterId,
      value: nextValue,
    });
  };
  return (
    <article className={`${styles.block} ${styles.controlBlock}`}>
      <label htmlFor={inputId}>{block.label}</label>
      <output htmlFor={inputId}>
        {String(value)} {block.unit}
      </output>
      <input
        id={inputId}
        type="range"
        min={block.min}
        max={block.max}
        step={block.step}
        value={value}
        onChange={change}
      />
    </article>
  );
}

function ToggleControl({
  block,
  onControlChange,
}: {
  block: Extract<LabSceneBlockV2, { type: "Toggle" }>;
  onControlChange?: TrustedLabSceneRendererProps["onControlChange"];
}) {
  const inputId = useId();
  const [value, setValue] = useState(block.defaultValue);
  return (
    <article className={`${styles.block} ${styles.controlBlock}`}>
      <label htmlFor={inputId}>{block.label}</label>
      <input
        id={inputId}
        type="checkbox"
        checked={value}
        onChange={(event) => {
          const nextValue = event.currentTarget.checked;
          setValue(nextValue);
          onControlChange?.({
            blockId: block.id,
            operationId: block.operationId,
            parameterId: block.parameterId,
            value: nextValue,
          });
        }}
      />
    </article>
  );
}

function SegmentedControl({
  block,
  onControlChange,
}: {
  block: Extract<LabSceneBlockV2, { type: "SegmentedControl" }>;
  onControlChange?: TrustedLabSceneRendererProps["onControlChange"];
}) {
  const groupName = useId();
  const [value, setValue] = useState(block.defaultValue);
  return (
    <fieldset className={`${styles.block} ${styles.segmented}`}>
      <legend>{block.label}</legend>
      <div>
        {block.options.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={value === option.value}
              onChange={() => {
                setValue(option.value);
                onControlChange?.({
                  blockId: block.id,
                  operationId: block.operationId,
                  parameterId: block.parameterId,
                  value: option.value,
                });
              }}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function blockValue<T>(
  values: ReadonlyMap<string, unknown>,
  blockId: string,
  slot = "primary",
): T {
  return values.get(bindingKey(blockId, slot)) as T;
}

function renderBlock(
  block: LabSceneBlockV2,
  values: ReadonlyMap<string, unknown>,
  onControlChange: TrustedLabSceneRendererProps["onControlChange"],
): ReactNode {
  switch (block.type) {
    case "Hypothesis":
      return (
        <article className={`${styles.block} ${styles.hypotheses}`}>
          <h3>Two explanations, one fair test</h3>
          <div>
            <section>
              <span>Your current explanation</span>
              <p>{block.current}</p>
            </section>
            <section>
              <span>Alternative under test</span>
              <p>{block.competing}</p>
            </section>
          </div>
        </article>
      );
    case "Prediction":
      return (
        <aside
          className={`${styles.block} ${styles.prediction}`}
          aria-label="Sealed prediction"
        >
          <span>Sealed prediction</span>
          <h3>{block.prompt}</h3>
          <p>{displayScalar(blockValue<DisplayScalar>(values, block.id))}</p>
        </aside>
      );
    case "WhyThisTest":
      return (
        <article className={`${styles.block} ${styles.why}`}>
          <span>Why this test?</span>
          <p>{block.text}</p>
        </article>
      );
    case "Slider":
      return <SliderControl block={block} onControlChange={onControlChange} />;
    case "Toggle":
      return <ToggleControl block={block} onControlChange={onControlChange} />;
    case "SegmentedControl":
      return (
        <SegmentedControl block={block} onControlChange={onControlChange} />
      );
    case "Metric":
      return (
        <article className={`${styles.block} ${styles.metric}`}>
          <span>{block.label}</span>
          <strong>
            {displayScalar(blockValue<DisplayScalar>(values, block.id))}
          </strong>
          <small>{block.unit}</small>
        </article>
      );
    case "BarChart":
    case "LineChart":
    case "Scatter":
      return (
        <Chart
          block={block}
          points={blockValue<readonly ChartPoint[]>(values, block.id)}
        />
      );
    case "BoundaryMap": {
      const points = blockValue<readonly BoundaryPoint[]>(values, block.id);
      return (
        <article className={`${styles.block} ${styles.boundary}`}>
          <h3>{block.label}</h3>
          <ul aria-label={`${block.label} verified conditions`}>
            {points.map((point, index) => (
              <li key={index}>
                <span aria-hidden="true">◆</span>
                <strong>{point.classification}</strong>
                <span>
                  {String(point.x)} · {String(point.y)}
                </span>
                <small>{displayScalar(point.value)}</small>
              </li>
            ))}
          </ul>
          <ExactTable
            table={blockValue<TrustedTable>(values, block.id, "table")}
            label={`${block.label} exact values`}
          />
        </article>
      );
    }
    case "MotionCanvas":
      return (
        <MotionCanvas
          block={block}
          points={blockValue<readonly MotionPoint[]>(values, block.id)}
          table={blockValue<TrustedTable>(values, block.id, "table")}
          reducedMotionSummary={blockValue<DisplayScalar>(
            values,
            block.id,
            "reduced-motion",
          )}
        />
      );
    case "NotebookCell": {
      const evidence = blockValue<NotebookEvidence>(values, block.id);
      return (
        <article className={`${styles.block} ${styles.notebook}`}>
          <h3>{block.label}</h3>
          <span>{evidence.reference}</span>
          <pre>{evidence.excerpt}</pre>
        </article>
      );
    }
    case "NotebookDiff": {
      const diff = blockValue<string | readonly string[]>(values, block.id);
      return (
        <article className={`${styles.block} ${styles.notebook}`}>
          <h3>{block.label}</h3>
          <pre>{Array.isArray(diff) ? diff.join("\n") : diff}</pre>
        </article>
      );
    }
    case "Transfer":
      return (
        <article className={`${styles.block} ${styles.transfer}`}>
          <span>Apply</span>
          <h3>{block.prompt}</h3>
        </article>
      );
    case "ReasoningDiff": {
      const diff = blockValue<ReasoningDiff>(values, block.id);
      return (
        <article className={`${styles.block} ${styles.reasoningDiff}`}>
          <h3>Reasoning change</h3>
          <div>
            <section>
              <span>Before</span>
              <p>{diff.before}</p>
            </section>
            <section>
              <span>After</span>
              <p>{diff.after}</p>
            </section>
          </div>
        </article>
      );
    }
    case "ProofBadge":
      return (
        <aside
          className={`${styles.block} ${styles.proof}`}
          aria-label="Evidence status"
        >
          <span aria-hidden="true">✓</span>
          <div>
            <strong>{block.label}</strong>
            <small>
              {displayScalar(blockValue<DisplayScalar>(values, block.id))}
            </small>
          </div>
        </aside>
      );
    case "Limitation":
      return (
        <article className={`${styles.block} ${styles.limitation}`}>
          <span>Evidence limit</span>
          <p>{block.text}</p>
        </article>
      );
  }
}

export function TrustedLabSceneRenderer({
  scene,
  verifiedSceneHash,
  signedResult,
  onControlChange,
}: TrustedLabSceneRendererProps) {
  const headingId = useId();
  const resolution = useMemo(
    () => resolveScene(scene, verifiedSceneHash, signedResult),
    [scene, signedResult, verifiedSceneHash],
  );

  if (resolution.status === "withheld") {
    return (
      <section
        className={styles.withheld}
        role="alert"
        data-lab-scene-state="withheld"
      >
        <span>Evidence withheld</span>
        <h2>Verified scene unavailable.</h2>
        <p>
          A scene authority or result binding did not match the verified
          evidence. CounterLab released no result-bearing visual.
        </p>
      </section>
    );
  }

  return (
    <section
      className={styles.scene}
      aria-labelledby={headingId}
      data-lab-scene-state="ready"
      data-lab-scene-hash={verifiedSceneHash}
      data-result-hash={signedResult?.resultHash}
    >
      <header className={styles.header}>
        <div>
          <span>Verified Belief Break Theater</span>
          <h2 id={headingId}>{scene.title}</h2>
          <p>
            {supportLabel(scene.supportLabel)} · fixed evidence, bounded
            presentation
          </p>
        </div>
        {signedResult === undefined ? null : (
          <aside className={styles.integrity} aria-label="Result integrity">
            <strong>Integrity-hashed</strong>
            <span>{signedResult.resultHash.slice(0, 12)}…</span>
          </aside>
        )}
      </header>

      <div className={styles.blocks}>
        {scene.blocks.map((block) => (
          <div
            className={styles.blockSlot}
            key={block.id}
            data-block-type={block.type}
          >
            {renderBlock(block, resolution.values, onControlChange)}
          </div>
        ))}
      </div>

      <details className={styles.scope}>
        <summary>Evidence scope</summary>
        <div>
          <section>
            <h3>Assumptions</h3>
            <ul>
              {scene.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Limitations</h3>
            <ul>
              {scene.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </section>
        </div>
      </details>
    </section>
  );
}
