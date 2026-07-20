import { afterEach, describe, expect, it, vi } from "vitest";

import { saveAuthenticatedDownload } from "./saveDownload";

describe("saveAuthenticatedDownload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("saves fetched bytes under the server-approved name and revokes the URL", () => {
    const createObjectURL = vi.fn(() => "blob:counterlab-download");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const blob = new Blob(["verified bytes"]);

    saveAuthenticatedDownload({
      blob,
      fileName: "verified.counterlab",
    });

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledOnce();
    expect(
      (click.mock.contexts[0] as HTMLAnchorElement | undefined)?.download,
    ).toBe("verified.counterlab");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:counterlab-download");
  });

  it("revokes the temporary URL if the browser rejects the save action", () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:counterlab-download"),
      revokeObjectURL,
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("download blocked");
    });

    expect(() =>
      saveAuthenticatedDownload({
        blob: new Blob(["verified bytes"]),
        fileName: "verified.counterlab",
      }),
    ).toThrow("download blocked");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:counterlab-download");
  });
});
