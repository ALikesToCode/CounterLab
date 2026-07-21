import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("contained runtime command server", () => {
  it("keeps the response side open after a client finishes its request", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/contained-runtime-server.mjs"),
      "utf8",
    );

    expect(source).toContain(
      "const server = createServer({ allowHalfOpen: true }, (socket) => {",
    );
  });
});
