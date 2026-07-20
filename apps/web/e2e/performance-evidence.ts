import type { Page } from "@playwright/test";

export const BROWSER_PERFORMANCE_EVIDENCE_SCHEMA =
  "counterlab.browser-performance.v1" as const;

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
  observers: PerformanceObserver[];
  drainObservers: Array<() => void>;
}

interface PerformanceEvidenceWindow extends Window {
  __counterlabBrowserPerformanceV1?: BrowserPerformanceState;
}

interface LayoutShiftPerformanceEntry extends PerformanceEntry {
  hadRecentInput?: boolean;
  value?: number;
}

/**
 * Runs inside the browser before application code. Keep this function
 * self-contained because Playwright serializes it into the target page.
 */
export function initializeBrowserPerformanceEvidence(): void {
  const browserWindow = window as PerformanceEvidenceWindow;
  if (
    browserWindow.__counterlabBrowserPerformanceV1?.schemaVersion ===
    "counterlab.browser-performance.v1"
  ) {
    return;
  }

  const state: BrowserPerformanceState = {
    schemaVersion: "counterlab.browser-performance.v1",
    support: {
      largestContentfulPaint: false,
      cumulativeLayoutShift: false,
      firstContentfulPaint: false,
      longTasks: false,
      navigationTiming: false,
      resourceTiming: false,
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
    observers: [],
    drainObservers: [],
  };
  browserWindow.__counterlabBrowserPerformanceV1 = state;

  if (typeof PerformanceObserver === "undefined") return;

  const finiteNonNegative = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0;

  const observe = (
    entryType: string,
    metric: ObservedMetric,
    processEntries: (entries: PerformanceEntry[]) => void,
  ): void => {
    if (!PerformanceObserver.supportedEntryTypes.includes(entryType)) return;
    try {
      const observer = new PerformanceObserver((list) => {
        processEntries(list.getEntries());
      });
      observer.observe({ type: entryType, buffered: true });
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
  const state = browserWindow.__counterlabBrowserPerformanceV1;
  if (state?.schemaVersion !== "counterlab.browser-performance.v1") {
    throw new Error("Browser performance evidence collection is not installed");
  }

  for (const drainObserver of state.drainObservers) drainObserver();

  return {
    schemaVersion: "counterlab.browser-performance.v1",
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
  };
}

/** Returns raw measured values; callers own any release-specific budgets. */
export async function snapshotBrowserPerformanceEvidence(
  page: Page,
): Promise<BrowserPerformanceEvidence> {
  return page.evaluate(snapshotBrowserPerformanceEvidenceInPage);
}
