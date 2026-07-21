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
  "event",
];

class FakePerformanceObserver implements PerformanceObserver {
  static readonly callbacks = new Map<string, ObserverCallback>();
  static readonly failedTypes = new Set<string>();
  static readonly observeOptions = new Map<string, PerformanceObserverInit>();
  static readonly supportedEntryTypes = [...supportedEntryTypes];

  readonly callback: ObserverCallback;
  readonly observedTypes: string[] = [];

  constructor(callback: ObserverCallback) {
    this.callback = callback;
  }

  observe(options?: PerformanceObserverInit): void {
    if (options?.type === undefined)
      throw new Error("A test entry type is required");
    const entryType = options.type;
    if (FakePerformanceObserver.failedTypes.has(entryType)) {
      throw new Error(`Observer registration failed for ${entryType}`);
    }
    this.observedTypes.push(entryType);
    FakePerformanceObserver.callbacks.set(entryType, this.callback);
    FakePerformanceObserver.observeOptions.set(entryType, options);
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
const originalEventTiming = Object.getOwnPropertyDescriptor(
  globalThis,
  "PerformanceEventTiming",
);

class FakePerformanceEventTiming {}
Object.defineProperty(FakePerformanceEventTiming.prototype, "interactionId", {
  configurable: true,
  value: 0,
});

beforeEach(() => {
  FakePerformanceObserver.callbacks.clear();
  FakePerformanceObserver.failedTypes.clear();
  FakePerformanceObserver.observeOptions.clear();
  FakePerformanceObserver.supportedEntryTypes.splice(
    0,
    FakePerformanceObserver.supportedEntryTypes.length,
    ...supportedEntryTypes,
  );
  Reflect.deleteProperty(window, "__counterlabBrowserPerformanceV2");
  Object.defineProperty(globalThis, "PerformanceObserver", {
    configurable: true,
    value: FakePerformanceObserver,
    writable: true,
  });
  Object.defineProperty(globalThis, "PerformanceEventTiming", {
    configurable: true,
    value: FakePerformanceEventTiming,
    writable: true,
  });
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  Reflect.deleteProperty(window, "__counterlabBrowserPerformanceV2");
  if (originalObserver === undefined) {
    Reflect.deleteProperty(globalThis, "PerformanceObserver");
  } else {
    Object.defineProperty(globalThis, "PerformanceObserver", originalObserver);
  }
  if (originalEventTiming === undefined) {
    Reflect.deleteProperty(globalThis, "PerformanceEventTiming");
  } else {
    Object.defineProperty(
      globalThis,
      "PerformanceEventTiming",
      originalEventTiming,
    );
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
    FakePerformanceObserver.emit("event", [
      performanceEntry({ duration: 144, interactionId: 7 }),
      performanceEntry({ duration: 176, interactionId: 7 }),
      performanceEntry({ duration: 96, interactionId: 14 }),
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
        interactionToNextPaint: true,
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
      interactionToNextPaintMs: 176,
      interactionToNextPaintStatus: "measured",
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
      false,
    ]);
    expect(snapshot.largestContentfulPaintMs).toBeNull();
    expect(snapshot.cumulativeLayoutShift).toBeNull();
    expect(snapshot.firstContentfulPaintMs).toBeNull();
    expect(snapshot.longTasks).toBeNull();
    expect(snapshot.navigationTtfbMs).toBeNull();
    expect(snapshot.resources).toBeNull();
    expect(snapshot.interactionToNextPaintMs).toBeNull();
    expect(snapshot.interactionToNextPaintStatus).toBe("unsupported");
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
      interactionToNextPaint: false,
    });
  });

  it("groups Event Timing entries by interaction and applies the INP outlier rule", async () => {
    initializeBrowserPerformanceEvidence();

    const entries = Array.from({ length: 50 }, (_, index) =>
      performanceEntry({
        duration: index === 0 ? 1_000 : index === 1 ? 800 : 40 + index,
        interactionId: index + 1,
      }),
    );
    entries.push(performanceEntry({ duration: 900, interactionId: 2 }));
    FakePerformanceObserver.emit("event", entries);

    const snapshot = await snapshotBrowserPerformanceEvidence(evaluatingPage());

    // At 50 interactions, INP discards one high outlier. The duplicate event
    // for interaction 2 contributes only that interaction's maximum duration.
    expect(snapshot.interactionToNextPaintMs).toBe(900);
    expect(snapshot.interactionToNextPaintStatus).toBe("measured");
    expect(FakePerformanceObserver.observeOptions.get("event")).toMatchObject({
      buffered: true,
      durationThreshold: 16,
      type: "event",
    });
  });

  it("retains the worst interaction until the first 50-interaction outlier boundary", async () => {
    initializeBrowserPerformanceEvidence();
    FakePerformanceObserver.emit(
      "event",
      Array.from({ length: 49 }, (_, index) =>
        performanceEntry({
          duration: index === 0 ? 1_000 : 40 + index,
          interactionId: index + 1,
        }),
      ),
    );

    const snapshot = await snapshotBrowserPerformanceEvidence(evaluatingPage());

    expect(snapshot.interactionToNextPaintMs).toBe(1_000);
  });

  it("does not retain Event Timing targets, names, URLs, or text", async () => {
    initializeBrowserPerformanceEvidence();
    FakePerformanceObserver.emit("event", [
      performanceEntry({
        duration: 128,
        interactionId: 1,
        name: "https://secret.example/private?token=do-not-record",
        target: { textContent: "learner private answer" },
      }),
    ]);

    const snapshot = await snapshotBrowserPerformanceEvidence(evaluatingPage());
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.interactionToNextPaintMs).toBe(128);
    expect(serialized).not.toContain("secret.example");
    expect(serialized).not.toContain("do-not-record");
    expect(serialized).not.toContain("learner private answer");
  });

  it("ignores invalid and non-interaction Event Timing entries", async () => {
    initializeBrowserPerformanceEvidence();
    FakePerformanceObserver.emit("event", [
      performanceEntry({ duration: 500, interactionId: 0 }),
      performanceEntry({ duration: 500, interactionId: -1 }),
      performanceEntry({
        duration: Number.POSITIVE_INFINITY,
        interactionId: 1,
      }),
      performanceEntry({ duration: -1, interactionId: 2 }),
      performanceEntry({ duration: 120, interactionId: 3.5 }),
    ]);

    const snapshot = await snapshotBrowserPerformanceEvidence(evaluatingPage());

    expect(snapshot.support.interactionToNextPaint).toBe(true);
    expect(snapshot.interactionToNextPaintMs).toBeNull();
    expect(snapshot.interactionToNextPaintStatus).toBe("awaiting-interaction");
  });

  it("marks Event Timing unsupported when interaction IDs are unavailable", async () => {
    Object.defineProperty(globalThis, "PerformanceEventTiming", {
      configurable: true,
      value: undefined,
      writable: true,
    });
    initializeBrowserPerformanceEvidence();

    const snapshot = await snapshotBrowserPerformanceEvidence(evaluatingPage());

    expect(snapshot.support.interactionToNextPaint).toBe(false);
    expect(snapshot.interactionToNextPaintMs).toBeNull();
    expect(snapshot.interactionToNextPaintStatus).toBe("unsupported");
  });

  it("fails the INP metric closed when Event Timing observation cannot start", async () => {
    FakePerformanceObserver.failedTypes.add("event");
    initializeBrowserPerformanceEvidence();

    const snapshot = await snapshotBrowserPerformanceEvidence(evaluatingPage());

    expect(snapshot.support.interactionToNextPaint).toBe(false);
    expect(snapshot.interactionToNextPaintMs).toBeNull();
    expect(snapshot.interactionToNextPaintStatus).toBe("unsupported");
  });

  it("fails closed after the bounded per-page interaction observation limit", async () => {
    initializeBrowserPerformanceEvidence();
    FakePerformanceObserver.emit(
      "event",
      Array.from({ length: 10_001 }, (_, index) =>
        performanceEntry({ duration: 80, interactionId: index + 1 }),
      ),
    );

    const snapshot = await snapshotBrowserPerformanceEvidence(evaluatingPage());

    expect(snapshot.support.interactionToNextPaint).toBe(true);
    expect(snapshot.interactionToNextPaintMs).toBeNull();
    expect(snapshot.interactionToNextPaintStatus).toBe(
      "observation-limit-exceeded",
    );
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
