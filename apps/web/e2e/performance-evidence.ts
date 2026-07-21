import type { Page } from "@playwright/test";

export const BROWSER_PERFORMANCE_EVIDENCE_SCHEMA =
  "counterlab.browser-performance.v2" as const;

export type InteractionToNextPaintStatus =
  | "measured"
  | "awaiting-interaction"
  | "unsupported"
  | "observation-limit-exceeded";

export interface BrowserPerformanceEvidence {
  schemaVersion: typeof BROWSER_PERFORMANCE_EVIDENCE_SCHEMA;
  pathname: string;
  support: {
    largestContentfulPaint: boolean;
    cumulativeLayoutShift: boolean;
    firstContentfulPaint: boolean;
    longTasks: boolean;
    navigationTiming: boolean;
    resourceTiming: boolean;
    interactionToNextPaint: boolean;
  };
  largestContentfulPaintMs: number | null;
  cumulativeLayoutShift: number | null;
  firstContentfulPaintMs: number | null;
  longTasks: {
    count: number;
    totalDurationMs: number;
    longestDurationMs: number;
  } | null;
  navigationTtfbMs: number | null;
  resources: {
    count: number;
    transferBytes: number;
  } | null;
  interactionToNextPaintMs: number | null;
  interactionToNextPaintStatus: InteractionToNextPaintStatus;
}

type ObservedMetric = keyof BrowserPerformanceEvidence["support"];

interface BrowserPerformanceState {
  schemaVersion: typeof BROWSER_PERFORMANCE_EVIDENCE_SCHEMA;
  support: BrowserPerformanceEvidence["support"];
  largestContentfulPaintMs: number | null;
  cumulativeLayoutShift: number;
  layoutShiftSessionValue: number;
  layoutShiftSessionStartMs: number | null;
  layoutShiftSessionLastMs: number | null;
  firstContentfulPaintMs: number | null;
  longTaskCount: number;
  longTaskTotalDurationMs: number;
  longestLongTaskDurationMs: number;
  navigationTtfbMs: number | null;
  resourceCount: number;
  resourceTransferBytes: number;
  interactionDurations: Map<number, number>;
  interactionObservationLimitExceeded: boolean;
  observers: PerformanceObserver[];
  drainObservers: Array<() => void>;
}

interface PerformanceEvidenceWindow extends Window {
  __counterlabBrowserPerformanceV2?: BrowserPerformanceState;
}

interface LayoutShiftPerformanceEntry extends PerformanceEntry {
  hadRecentInput?: boolean;
  value?: number;
}

interface InteractionPerformanceEntry extends PerformanceEntry {
  interactionId?: unknown;
}

/**
 * Runs inside the browser before application code. Keep this function
 * self-contained because Playwright serializes it into the target page.
 */
export function initializeBrowserPerformanceEvidence(): void {
  const browserWindow = window as PerformanceEvidenceWindow;
  if (
    browserWindow.__counterlabBrowserPerformanceV2?.schemaVersion ===
    "counterlab.browser-performance.v2"
  ) {
    return;
  }

  // A release-qualification journey should never approach this ceiling. The
  // bound prevents an unexpectedly long-lived page from retaining unbounded
  // interaction identifiers; crossing it invalidates INP instead of returning
  // a partial metric.
  const maximumObservedInteractions = 10_000;

  const state: BrowserPerformanceState = {
    schemaVersion: "counterlab.browser-performance.v2",
    support: {
      largestContentfulPaint: false,
      cumulativeLayoutShift: false,
      firstContentfulPaint: false,
      longTasks: false,
      navigationTiming: false,
      resourceTiming: false,
      interactionToNextPaint: false,
    },
    largestContentfulPaintMs: null,
    cumulativeLayoutShift: 0,
    layoutShiftSessionValue: 0,
    layoutShiftSessionStartMs: null,
    layoutShiftSessionLastMs: null,
    firstContentfulPaintMs: null,
    longTaskCount: 0,
    longTaskTotalDurationMs: 0,
    longestLongTaskDurationMs: 0,
    navigationTtfbMs: null,
    resourceCount: 0,
    resourceTransferBytes: 0,
    interactionDurations: new Map(),
    interactionObservationLimitExceeded: false,
    observers: [],
    drainObservers: [],
  };
  browserWindow.__counterlabBrowserPerformanceV2 = state;

  if (typeof PerformanceObserver === "undefined") return;

  const finiteNonNegative = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0;

  const observe = (
    entryType: string,
    metric: ObservedMetric,
    processEntries: (entries: PerformanceEntry[]) => void,
    options: { durationThreshold?: number } = {},
  ): void => {
    if (!PerformanceObserver.supportedEntryTypes.includes(entryType)) return;
    try {
      const observer = new PerformanceObserver((list) => {
        processEntries(list.getEntries());
      });
      observer.observe({ type: entryType, buffered: true, ...options });
      state.support[metric] = true;
      state.observers.push(observer);
      state.drainObservers.push(() => {
        processEntries(observer.takeRecords());
      });
    } catch {
      state.support[metric] = false;
    }
  };

  observe("largest-contentful-paint", "largestContentfulPaint", (entries) => {
    for (const entry of entries) {
      if (
        finiteNonNegative(entry.startTime) &&
        (state.largestContentfulPaintMs === null ||
          entry.startTime > state.largestContentfulPaintMs)
      ) {
        state.largestContentfulPaintMs = entry.startTime;
      }
    }
  });

  observe("layout-shift", "cumulativeLayoutShift", (entries) => {
    for (const entry of entries as LayoutShiftPerformanceEntry[]) {
      if (
        entry.hadRecentInput !== true &&
        finiteNonNegative(entry.value) &&
        finiteNonNegative(entry.startTime)
      ) {
        // CLS is the largest layout-shift session window: consecutive shifts
        // less than one second apart, capped at five seconds per window.
        const continuesSession =
          state.layoutShiftSessionStartMs !== null &&
          state.layoutShiftSessionLastMs !== null &&
          entry.startTime - state.layoutShiftSessionLastMs < 1_000 &&
          entry.startTime - state.layoutShiftSessionStartMs < 5_000;
        if (continuesSession) {
          state.layoutShiftSessionValue += entry.value;
        } else {
          state.layoutShiftSessionValue = entry.value;
          state.layoutShiftSessionStartMs = entry.startTime;
        }
        state.layoutShiftSessionLastMs = entry.startTime;
        state.cumulativeLayoutShift = Math.max(
          state.cumulativeLayoutShift,
          state.layoutShiftSessionValue,
        );
      }
    }
  });

  observe("paint", "firstContentfulPaint", (entries) => {
    for (const entry of entries) {
      if (
        entry.name === "first-contentful-paint" &&
        finiteNonNegative(entry.startTime) &&
        (state.firstContentfulPaintMs === null ||
          entry.startTime < state.firstContentfulPaintMs)
      ) {
        state.firstContentfulPaintMs = entry.startTime;
      }
    }
  });

  observe("longtask", "longTasks", (entries) => {
    for (const entry of entries) {
      if (!finiteNonNegative(entry.duration)) continue;
      state.longTaskCount += 1;
      state.longTaskTotalDurationMs += entry.duration;
      state.longestLongTaskDurationMs = Math.max(
        state.longestLongTaskDurationMs,
        entry.duration,
      );
    }
  });

  observe("navigation", "navigationTiming", (entries) => {
    for (const entry of entries as PerformanceNavigationTiming[]) {
      const ttfbMs = entry.responseStart - entry.startTime;
      if (
        finiteNonNegative(ttfbMs) &&
        (state.navigationTtfbMs === null || ttfbMs < state.navigationTtfbMs)
      ) {
        state.navigationTtfbMs = ttfbMs;
      }
    }
  });

  observe("resource", "resourceTiming", (entries) => {
    for (const entry of entries as PerformanceResourceTiming[]) {
      if (!finiteNonNegative(entry.transferSize)) continue;
      state.resourceCount += 1;
      state.resourceTransferBytes += entry.transferSize;
    }
  });

  const eventTimingConstructor = (
    globalThis as typeof globalThis & {
      PerformanceEventTiming?: { prototype?: object };
    }
  ).PerformanceEventTiming;
  if (
    eventTimingConstructor?.prototype !== undefined &&
    "interactionId" in eventTimingConstructor.prototype
  ) {
    observe(
      "event",
      "interactionToNextPaint",
      (entries) => {
        for (const entry of entries as InteractionPerformanceEntry[]) {
          const interactionId = entry.interactionId;
          if (
            typeof interactionId !== "number" ||
            !Number.isSafeInteger(interactionId) ||
            interactionId <= 0 ||
            !finiteNonNegative(entry.duration)
          ) {
            continue;
          }

          const normalizedInteractionId = interactionId;
          const previousDuration = state.interactionDurations.get(
            normalizedInteractionId,
          );
          if (previousDuration !== undefined) {
            state.interactionDurations.set(
              normalizedInteractionId,
              Math.max(previousDuration, entry.duration),
            );
            continue;
          }
          if (state.interactionDurations.size >= maximumObservedInteractions) {
            state.interactionObservationLimitExceeded = true;
            continue;
          }
          state.interactionDurations.set(
            normalizedInteractionId,
            entry.duration,
          );
        }
      },
      // Event Timing's lowest useful threshold is one frame. Capturing from
      // 16 ms gives the percentile estimator the broadest practical sample.
      { durationThreshold: 16 },
    );
  }
}

/** Installs collection for future navigations and the currently loaded page. */
export async function installBrowserPerformanceEvidence(
  page: Page,
): Promise<void> {
  await page.addInitScript(initializeBrowserPerformanceEvidence);
  await page.evaluate(initializeBrowserPerformanceEvidence);
}

function snapshotBrowserPerformanceEvidenceInPage(): BrowserPerformanceEvidence {
  const browserWindow = window as PerformanceEvidenceWindow;
  const state = browserWindow.__counterlabBrowserPerformanceV2;
  if (state?.schemaVersion !== "counterlab.browser-performance.v2") {
    throw new Error("Browser performance evidence collection is not installed");
  }

  for (const drainObserver of state.drainObservers) drainObserver();

  let interactionToNextPaintMs: number | null = null;
  let interactionToNextPaintStatus: InteractionToNextPaintStatus;
  if (!state.support.interactionToNextPaint) {
    interactionToNextPaintStatus = "unsupported";
  } else if (state.interactionObservationLimitExceeded) {
    interactionToNextPaintStatus = "observation-limit-exceeded";
  } else if (state.interactionDurations.size === 0) {
    interactionToNextPaintStatus = "awaiting-interaction";
  } else {
    const longestFirst = [...state.interactionDurations.values()].sort(
      (left, right) => right - left,
    );
    // INP approximates the 98th percentile by ignoring one high outlier for
    // every 50 interactions. Entries sharing an interactionId were already
    // collapsed to that interaction's maximum duration.
    const candidateIndex = Math.min(
      longestFirst.length - 1,
      Math.floor(longestFirst.length / 50),
    );
    interactionToNextPaintMs = longestFirst[candidateIndex] ?? null;
    interactionToNextPaintStatus =
      interactionToNextPaintMs === null ? "awaiting-interaction" : "measured";
  }

  return {
    schemaVersion: "counterlab.browser-performance.v2",
    // Never persist origin, credentials, query parameters, or fragments.
    pathname: window.location.pathname || "/",
    support: { ...state.support },
    largestContentfulPaintMs: state.support.largestContentfulPaint
      ? state.largestContentfulPaintMs
      : null,
    cumulativeLayoutShift: state.support.cumulativeLayoutShift
      ? state.cumulativeLayoutShift
      : null,
    firstContentfulPaintMs: state.support.firstContentfulPaint
      ? state.firstContentfulPaintMs
      : null,
    longTasks: state.support.longTasks
      ? {
          count: state.longTaskCount,
          totalDurationMs: state.longTaskTotalDurationMs,
          longestDurationMs: state.longestLongTaskDurationMs,
        }
      : null,
    navigationTtfbMs: state.support.navigationTiming
      ? state.navigationTtfbMs
      : null,
    resources: state.support.resourceTiming
      ? {
          count: state.resourceCount,
          transferBytes: state.resourceTransferBytes,
        }
      : null,
    interactionToNextPaintMs,
    interactionToNextPaintStatus,
  };
}

/** Returns raw measured values; callers own any release-specific budgets. */
export async function snapshotBrowserPerformanceEvidence(
  page: Page,
): Promise<BrowserPerformanceEvidence> {
  return page.evaluate(snapshotBrowserPerformanceEvidenceInPage);
}
