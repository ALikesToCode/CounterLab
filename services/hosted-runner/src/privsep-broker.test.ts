import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PRIVSEP_CREDENTIAL_READ_PROBE } from "./privsep-broker.js";

const PROBE_HARNESS = String.raw`
set -uo pipefail
probe_fail() {
  exit 1
}
probe_require() {
  stage="$1"
  shift
  "$@" || probe_fail "$stage"
}
credential="$1"
${PRIVSEP_CREDENTIAL_READ_PROBE}
`;

describe("privsep credential-read probe", () => {
  it("performs a real non-empty read instead of relying on an access preflight", () => {
    const readableFixture = fileURLToPath(import.meta.url);
    const result = spawnSync(
      "/usr/bin/bash",
      [
        "--noprofile",
        "--norc",
        "-c",
        PROBE_HARNESS,
        "counterlab-credential-probe-test",
        readableFixture,
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(PRIVSEP_CREDENTIAL_READ_PROBE).toContain('wc -c < "$1"');
    expect(PRIVSEP_CREDENTIAL_READ_PROBE).not.toContain("test -r");
  });

  it("fails closed when the credential cannot be opened", () => {
    const missingCredential = join(
      dirname(fileURLToPath(import.meta.url)),
      "not-present",
      "auth.json",
    );
    const result = spawnSync(
      "/usr/bin/bash",
      [
        "--noprofile",
        "--norc",
        "-c",
        PROBE_HARNESS,
        "counterlab-credential-probe-test",
        missingCredential,
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
  });
});
