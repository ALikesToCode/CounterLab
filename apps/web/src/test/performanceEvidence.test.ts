import type { Page } from "@playwright/test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BROWSER_PERFORMANCE_EVIDENCE_SCHEMA,
  initializeBrowserPerformanceEvidence,
  installBrowserPerformanceEvidence,
  snapshotBrowserPerformanceEvidence,
} from "../../e2e/performance-evidence";

type ObserverCallback = PerformanceObserverCallback;

const supportedEntryTypes = [
  "largest-contentful-paint",
  "layout-shift",
  "paint",
  "longtask",
  "navigation",
  "resource",
];

class FakePerformanceObserver implements PerformanceObserver {
  static readonly callbacks = new Map<string, ObserverCallback>();
  static readonly supportedEntryTypes = [...supportedEntryTypes];

  readonly callback: ObserverCallback;
  readonly observedTypes: string[] = [];

  constructor(callback: ObserverCallback) {
    this.callback = callback;
  }

  observe(options?: PerformanceObserverInit): void {
    const entryType = options?.type;
    if (entryType === undefined)
      throw new Error("A test entry type is required");
    this.observedTypes.push(entryType);
    FakePerformanceObserver.callbacks.set(entryType, this.callback);
  }

  disconnect(): void {}

  takeRecords(): PerformanceEntryList {
    return [];
  }

  static emit(entryType: string, entries: PerformanceEntry[]): void {
    const callback = FakePerformanceObserver.callbacks.get(entryType);
    if (callback === undefined) {
      throw new Error(`No observer registered for ${entryType}`);
    }
    callback(
      {
        getEntries: () => entries,
        getEntriesByName: () => [],
        getEntriesByType: () => entries,
      },
      {} as PerformanceObserver,
    );
  }
}

function performanceEntry(
  values: Partial<PerformanceEntry> & Record<string, unknown>,
): PerformanceEntry {
  return {
    duration: 0,
    entryType: "test",
    name: "test",
    startTime: 0,
    toJSON: () => ({}),
    ...values,
  } as PerformanceEntry;
}

function evaluatingPage(): Page {
  return {
    evaluate: async (pageFunction: () => unknown) => pageFunction(),
  } as unknown as Page;
}

const originalObserver = Object.getOwnPropertyDescriptor(
  globalThis,
  "PerformanceObserver",
);

beforeEach(() => {
  FakePerformanceObserver.callbacks.clear();
  FakePerformanceObserver.supportedEntryTypes.splice(
    0,
    FakePerformanceObserver.supportedEntryTypes.length,
    ...supportedEntryTypes,
  );
  Reflect.deleteProperty(window, "__counterlabBrowserPerformanceV1");
  Object.defineProperty(globalThis, "PerformanceObserver", {
    configurable: true,
    value: FakePerformanceObserver,
    writable: true,
  });
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  Reflect.deleteProperty(window, "__counterlabBrowserPerformanceV1");
  if (originalObserver === undefined) {
    Reflect.deleteProperty(globalThis, "PerformanceObserver");
  } else {
    Object.defineProperty(globalThis, "PerformanceObserver", originalObserver);
  }
  window.history.replaceState({}, "", "/");
});

describe("browser performance evidence", () => {
  it("collects raw native measurements without assigning thresholds", async () => {
    initializeBrowserPerformanceEvidence();

    FakePerformanceObserver.emit("largest-contentful-paint", [
      performanceEntry({ startTime: 410 }),
      performanceEntry({ startTime: 620 }),
    ]);
    FakePerformanceObserver.emit("layout-shift", [
      performanceEntry({ hadRecentInput: false, startTime: 100, value: 0.1 }),
      performanceEntry({ hadRecentInput: true, startTime: 150, value: 0.2 }),
      performanceEntry({ hadRecentInput: false, startTime: 200, value: 0.05 }),
      performanceEntry({
        hadRecentInput: false,
        startTime: 6_000,
        value: 0.02,
      }),
    ]);
    FakePerformanceObserver.emit("paint", [
      performanceEntry({ name: "first-paint", startTime: 80 }),
      performanceEntry({ name: "first-contentful-paint", startTime: 120 }),
    ]);
    FakePerformanceObserver.emit("longtask", [
      performanceEntry({ duration: 60 }),
      performanceEntry({ duration: 80 }),
    ]);
    FakePerformanceObserver.emit("navigation", [
      performanceEntry({ responseStart: 95, startTime: 5 }),
    ]);
    FakePerformanceObserver.emit("resource", [
      performanceEntry({
        name: "https://example.test/app.js",
        transferSize: 1_000,
      }),
      performanceEntry({
        name: "https://example.test/app.css",
        transferSize: 2_500,
      }),
    ]);

    const snapshot = await snapshotBrowserPerformanceEvidence(evaluatingPage());

    expect(snapshot).toEqual({
      schemaVersion: BROWSER_PERFORMANCE_EVIDENCE_SCHEMA,
      pathname: "/",
      support: {
        largestContentfulPaint: true,
        cumulativeLayoutShift: true,
        firstContentfulPaint: true,
        longTasks: true,
        navigationTiming: true,
        resourceTiming: true,
      },
      largestContentfulPaintMs: 620,
      cumulativeLayoutShift: 0.15000000000000002,
      firstContentfulPaintMs: 120,
      longTasks: {
        count: 2,
        totalDurationMs: 140,
        longestDurationMs: 80,
      },
      navigationTtfbMs: 90,
      resources: {
        count: 2,
        transferBytes: 3_500,
      },
    });
    expect(Object.keys(snapshot).join(" ")).not.toMatch(
      /budget|good|poor|pass|fail|threshold/i,
    );
  });

  it("returns only the pathname and omits URL query and fragment data", async () => {
    window.history.replaceState(
      {},
      "",
      "/judge/session-1?token=private-value#proof",
    );
    initializeBrowserPerformanceEvidence();

    const snapshot = await snapshotBrowserPerformanceEvidence(evaluatingPage());

    expect(snapshot.pathname).toBe("/judge/session-1");
    expect(JSON.stringify(snapshot)).not.toContain("private-value");
    expect(JSON.stringify(snapshot)).not.toContain("proof");
    expect(JSON.stringify(snapshot)).not.toContain(window.location.origin);
  });

  it("keeps unsupported metrics explicit instead of inventing zeroes", async () => {
    Object.defineProperty(globalThis, "PerformanceObserver", {
      configurable: true,
      value: undefined,
      writable: true,
    });
    initializeBrowserPerformanceEvidence();

    const snapshot = await snapshotBrowserPerformanceEvidence(evaluatingPage());

    expect(Object.values(snapshot.support)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(snapshot.largestContentfulPaintMs).toBeNull();
    expect(snapshot.cumulativeLayoutShift).toBeNull();
    expect(snapshot.firstContentfulPaintMs).toBeNull();
    expect(snapshot.longTasks).toBeNull();
    expect(snapshot.navigationTtfbMs).toBeNull();
    expect(snapshot.resources).toBeNull();
  });

  it("reports individual observer entry types as unsupported", async () => {
    FakePerformanceObserver.supportedEntryTypes.splice(
      0,
      FakePerformanceObserver.supportedEntryTypes.length,
      "paint",
    );
    initializeBrowserPerformanceEvidence();

    const snapshot = await snapshotBrowserPerformanceEvidence(evaluatingPage());

    expect(snapshot.support).toEqual({
      largestContentfulPaint: false,
      cumulativeLayoutShift: false,
      firstContentfulPaint: true,
      longTasks: false,
      navigationTiming: false,
      resourceTiming: false,
    });
  });

  it("installs the init script for both future and current documents", async () => {
    const calls: string[] = [];
    const page = {
      addInitScript: async (pageFunction: () => void) => {
        calls.push("future");
        expect(pageFunction).toBe(initializeBrowserPerformanceEvidence);
      },
      evaluate: async (pageFunction: () => void) => {
        calls.push("current");
        expect(pageFunction).toBe(initializeBrowserPerformanceEvidence);
      },
    } as unknown as Page;

    await installBrowserPerformanceEvidence(page);

    expect(calls).toEqual(["future", "current"]);
  });

  it("fails closed when a snapshot is requested before installation", async () => {
    await expect(
      snapshotBrowserPerformanceEvidence(evaluatingPage()),
    ).rejects.toThrow(/not installed/i);
  });
});
