import { describe, expect, it } from "vitest";

import {
  AGGREGATE_TIMEOUT_QUALIFICATION_MODE,
  createContainedRuntimeRequest,
  parseContainedRuntimeRequest,
} from "./contained-runtime-request.mjs";

describe("contained runtime request protocol", () => {
  it("keeps ordinary commands outside qualification mode", () => {
    const request = createContainedRuntimeRequest({
      args: ["version"],
      qualificationMode: null,
      stdin: Buffer.alloc(0),
    });

    expect(request).toEqual({
      schemaVersion: "2",
      args: ["version"],
      qualificationMode: null,
      stdinBase64: "",
    });
    expect(parseContainedRuntimeRequest(request)).toEqual({
      args: ["version"],
      qualificationMode: null,
      stdin: Buffer.alloc(0),
    });
  });

  it("allows aggregate qualification only for an explicit run", () => {
    const request = createContainedRuntimeRequest({
      args: ["run", "bounded-image"],
      qualificationMode: AGGREGATE_TIMEOUT_QUALIFICATION_MODE,
      stdin: Buffer.from("bounded input"),
    });

    expect(parseContainedRuntimeRequest(request)).toEqual({
      args: ["run", "bounded-image"],
      qualificationMode: AGGREGATE_TIMEOUT_QUALIFICATION_MODE,
      stdin: Buffer.from("bounded input"),
    });
    expect(() =>
      createContainedRuntimeRequest({
        args: ["version"],
        qualificationMode: AGGREGATE_TIMEOUT_QUALIFICATION_MODE,
        stdin: Buffer.alloc(0),
      }),
    ).toThrow(/qualification/u);
  });

  it("rejects unknown, malformed, and non-canonical requests", () => {
    const ordinary = createContainedRuntimeRequest({
      args: ["version"],
      qualificationMode: null,
      stdin: Buffer.alloc(0),
    });

    expect(() =>
      parseContainedRuntimeRequest({ ...ordinary, extra: true }),
    ).toThrow(/shape/u);
    expect(() =>
      parseContainedRuntimeRequest({
        ...ordinary,
        qualificationMode: "unknown",
      }),
    ).toThrow(/qualification/u);
    expect(() =>
      parseContainedRuntimeRequest({ ...ordinary, stdinBase64: "%%%" }),
    ).toThrow(/input/u);
    expect(() =>
      parseContainedRuntimeRequest({ ...ordinary, args: ["version", ""] }),
    ).toThrow(/argument/u);
  });
});
