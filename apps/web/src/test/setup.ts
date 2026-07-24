import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Vite transforms route-split modules on first use in Vitest. Keep async
// assertions bounded without treating that transform time as product behavior.
configure({ asyncUtilTimeout: 5_000 });

if (typeof window !== "undefined") {
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: () => undefined,
    writable: true,
  });
}

afterEach(() => {
  cleanup();
});
