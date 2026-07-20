import { describe, expect, it } from "vitest";

import {
  resolveBrowserAuthority,
  STOCK_CHROMIUM_DESIGN_REVIEW,
} from "../../e2e/browser-authority";

describe("browser evidence authority", () => {
  it("uses CloakBrowser when an explicit CDP endpoint exists", () => {
    expect(
      resolveBrowserAuthority({
        CLOAK_CDP_ENDPOINT: "http://127.0.0.1:9222",
      }),
    ).toEqual({
      kind: "cloak",
      evidenceLabel: "CLOAK_CDP_ENDPOINT",
      endpoint: "http://127.0.0.1:9222",
    });
  });

  it("permits the separately labelled stock Chromium design review", () => {
    expect(
      resolveBrowserAuthority({
        COUNTERLAB_BROWSER_AUTHORITY: STOCK_CHROMIUM_DESIGN_REVIEW,
      }),
    ).toEqual({
      kind: STOCK_CHROMIUM_DESIGN_REVIEW,
      evidenceLabel: STOCK_CHROMIUM_DESIGN_REVIEW,
      executablePath: "/usr/bin/chromium",
    });
  });

  it("fails closed when no browser authority is configured", () => {
    expect(() => resolveBrowserAuthority({})).toThrow(
      /CLOAK_CDP_ENDPOINT is required/i,
    );
  });

  it("rejects ambiguous Cloak and stock authority", () => {
    expect(() =>
      resolveBrowserAuthority({
        CLOAK_CDP_ENDPOINT: "http://127.0.0.1:9222",
        COUNTERLAB_BROWSER_AUTHORITY: STOCK_CHROMIUM_DESIGN_REVIEW,
      }),
    ).toThrow(/cannot be combined/i);
  });

  it("rejects arbitrary browser executable paths", () => {
    expect(() =>
      resolveBrowserAuthority({
        COUNTERLAB_BROWSER_AUTHORITY: STOCK_CHROMIUM_DESIGN_REVIEW,
        COUNTERLAB_STOCK_CHROMIUM_EXECUTABLE: "/another/browser",
      }),
    ).toThrow(/permits only \/usr\/bin\/chromium/i);
  });
});
