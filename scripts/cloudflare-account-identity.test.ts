import { describe, expect, it } from "vitest";

import { verifiedCloudflareAccountId } from "./cloudflare-account-identity.js";

const expectedAccount = "1".repeat(32);
const anotherAccount = "2".repeat(32);

function whoami() {
  return {
    loggedIn: true,
    authType: "OAuth Token",
    email: "owner@example.test",
    accounts: [
      { id: expectedAccount, name: "CounterLab" },
      { id: anotherAccount, name: "Other" },
    ],
    tokenPermissions: ["account:read", "workers:write"],
  };
}

describe("verifiedCloudflareAccountId", () => {
  it("returns only the configured authenticated account ID", () => {
    expect(
      verifiedCloudflareAccountId(whoami(), { account_id: expectedAccount }),
    ).toBe(expectedAccount);
  });

  it("fails closed on logged-out, malformed, missing, duplicate, or wrong accounts", () => {
    for (const [identity, config] of [
      [{ ...whoami(), loggedIn: false }, { account_id: expectedAccount }],
      [{ ...whoami(), unexpected: true }, { account_id: expectedAccount }],
      [{ ...whoami(), accounts: [] }, { account_id: expectedAccount }],
      [
        {
          ...whoami(),
          accounts: [{ id: expectedAccount }, { id: expectedAccount }],
        },
        { account_id: expectedAccount },
      ],
      [whoami(), { account_id: "3".repeat(32) }],
      [whoami(), { account_id: "not-an-account" }],
    ] as const) {
      expect(() => verifiedCloudflareAccountId(identity, config)).toThrow();
    }
  });
});
