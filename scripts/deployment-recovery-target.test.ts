import { describe, expect, it } from "vitest";

import { selectDeploymentRecoveryTarget } from "./deployment-recovery-target";

describe("qualified deployment recovery target", () => {
  const previousVersionId = "11111111-2222-3333-4444-555555555555";
  const maintenanceVersionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  it("uses the prior Worker only before irreversible mutation starts", () => {
    expect(
      selectDeploymentRecoveryTarget({
        migrationsStarted: "0",
        containerRolloutStarted: "0",
        previousVersionId,
        maintenanceVersionId: "",
      }),
    ).toEqual({ mode: "previous", versionId: previousVersionId });
  });

  it.each([
    ["1", "0"],
    ["0", "1"],
    ["1", "1"],
  ])(
    "uses maintenance after migration=%s or Container=%s mutation",
    (migrationsStarted, containerRolloutStarted) => {
      expect(
        selectDeploymentRecoveryTarget({
          migrationsStarted,
          containerRolloutStarted,
          previousVersionId,
          maintenanceVersionId,
        }),
      ).toEqual({ mode: "maintenance", versionId: maintenanceVersionId });
    },
  );

  it("fails closed when the selected recovery version is unavailable", () => {
    expect(() =>
      selectDeploymentRecoveryTarget({
        migrationsStarted: "1",
        containerRolloutStarted: "0",
        previousVersionId,
        maintenanceVersionId: "",
      }),
    ).toThrow(/exact maintenance Worker version is unavailable/u);
  });

  it("rejects ambiguous phase flags", () => {
    expect(() =>
      selectDeploymentRecoveryTarget({
        migrationsStarted: "true",
        containerRolloutStarted: "0",
        previousVersionId,
        maintenanceVersionId,
      }),
    ).toThrow(/must be 0 or 1/u);
  });
});
