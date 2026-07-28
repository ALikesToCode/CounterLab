import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const buildScript = readFileSync(
  resolve(root, "scripts/build-source-bound-runner.sh"),
  "utf8",
);
const runnerDockerfile = readFileSync(
  resolve(root, "Dockerfile.runner"),
  "utf8",
);

describe("source-bound runner package transport", () => {
  it("permits only reviewed HTTPS indexes while preserving hash enforcement", () => {
    expect(buildScript).toContain(
      'PYPI_INDEX_URL="${COUNTERLAB_PYPI_INDEX_URL:-https://pypi.org/simple}"',
    );
    expect(buildScript).toContain("https://pypi.org/simple");
    expect(buildScript).toContain("https://mirrors.aliyun.com/pypi/simple");
    expect(buildScript).toContain(
      "https://repo.huaweicloud.com/repository/pypi/simple",
    );
    expect(buildScript).toContain(
      "https://mirrors.cloud.tencent.com/pypi/simple",
    );
    expect(buildScript).toContain(
      "COUNTERLAB_PYPI_INDEX_URL is not an approved HTTPS package index",
    );
    expect(buildScript).toContain(
      '--opt "build-arg:COUNTERLAB_PYPI_INDEX_URL=${PYPI_INDEX_URL}"',
    );

    expect(
      runnerDockerfile.match(
        /ARG COUNTERLAB_PYPI_INDEX_URL=https:\/\/pypi\.org\/simple/gu,
      ),
    ).toHaveLength(2);
    expect(
      runnerDockerfile.match(/--index-url "\$\{COUNTERLAB_PYPI_INDEX_URL\}"/gu),
    ).toHaveLength(2);
    expect(runnerDockerfile.match(/--require-hashes/gu)).toHaveLength(2);
    expect(runnerDockerfile).not.toContain("--trusted-host");
  });
});
