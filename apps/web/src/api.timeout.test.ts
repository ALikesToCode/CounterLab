import { afterEach, describe, expect, it, vi } from "vitest";

import { CounterLabApiClient } from "./api";

describe("CounterLabApiClient request timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects timeout configuration outside the bounded range", () => {
    expect(() => new CounterLabApiClient({ requestTimeoutMs: 0 })).toThrow(
      "API request timeout is outside the supported range",
    );
    expect(
      () => new CounterLabApiClient({ requestTimeoutMs: 210_001 }),
    ).toThrow("API request timeout is outside the supported range");
  });

  it("aborts a stalled request at the configured deadline", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const client = new CounterLabApiClient({
      fetch: fetcher,
      requestTimeoutMs: 25,
    });

    const assertion = expect(client.getHealth()).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
