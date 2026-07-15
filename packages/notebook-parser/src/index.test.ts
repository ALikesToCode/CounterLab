import { describe, expect, it } from "vitest";

import { NotebookParseError, parseNotebook } from "./index.js";

const notebook = (overrides: Record<string, unknown> = {}) => ({
  cells: [
    {
      cell_type: "code",
      execution_count: 1,
      metadata: {},
      outputs: [
        {
          output_type: "stream",
          name: "stdout",
          text: "Random split accuracy: 0.991\n",
        },
      ],
      source: [
        "from sklearn.model_selection import train_test_split\n",
        "print('Random split accuracy: 0.991')",
      ],
    },
  ],
  metadata: {
    counterlab: {
      createdAt: "2026-07-14T00:00:00.000Z",
      schemaSummary: {
        fields: [
          {
            name: "customer_id",
            inferredType: "categorical",
            privacyClass: "entity_identifier",
          },
          { name: "churned", inferredType: "integer", privacyClass: "target" },
        ],
        rowCount: 2400,
        entityCandidates: ["customer_id"],
        targetCandidates: ["churned"],
      },
    },
    kernelspec: {
      name: "python3",
      display_name: "Python 3",
      language: "python",
    },
  },
  nbformat: 4,
  nbformat_minor: 5,
  ...overrides,
});

describe("parseNotebook", () => {
  it("returns stable cell and output evidence hashes without executing code", () => {
    const bytes = Buffer.from(JSON.stringify(notebook()));
    const first = parseNotebook(bytes, "customer-churn.ipynb", {
      maxBytes: 1_000_000,
    });
    const second = parseNotebook(bytes, "customer-churn.ipynb", {
      maxBytes: 1_000_000,
    });

    expect(first).toEqual(second);
    expect(first.support.status).toBe("SUPPORTED");
    expect(first.cells[0]?.metricCandidates).toEqual([
      { name: "accuracy", value: 0.991, outputIndex: 0 },
    ]);
    expect(first.cells[0]?.outputHashes[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(first.packageHints).toContain("sklearn");
  });

  it("sanitizes active output and marks the notebook partial", () => {
    const active = notebook({
      cells: [
        {
          cell_type: "code",
          execution_count: 1,
          metadata: {},
          source: "display(payload)",
          outputs: [
            {
              output_type: "display_data",
              metadata: {},
              data: { "text/html": "<script>alert(1)</script>" },
            },
          ],
        },
      ],
    });

    const manifest = parseNotebook(
      Buffer.from(JSON.stringify(active)),
      "active.ipynb",
      {
        maxBytes: 1_000_000,
      },
    );

    expect(manifest.support.status).toBe("PARTIAL");
    expect(
      manifest.support.reasons.some(
        (reason) => reason.code === "ACTIVE_OUTPUT_REMOVED",
      ),
    ).toBe(true);
    expect(manifest.cells[0]?.outputHashes).toEqual([]);
  });

  it("rejects oversized notebooks before parsing", () => {
    expect(() =>
      parseNotebook(Buffer.from("{}"), "large.ipynb", { maxBytes: 1 }),
    ).toThrow(/maximum size/i);
  });

  it("hashes only canonical safe MIME data and retains safe fallbacks", () => {
    const withMimeData = notebook({
      cells: [
        {
          cell_type: "code",
          execution_count: 1,
          metadata: {},
          source: "display(result)",
          outputs: [
            {
              output_type: "display_data",
              metadata: {},
              data: {
                "application/json": { beta: 2, alpha: 1 },
                "text/plain": "Accuracy: 0.75",
                "text/html": "<script>alert(1)</script>",
              },
            },
          ],
        },
      ],
    });

    const manifest = parseNotebook(
      Buffer.from(JSON.stringify(withMimeData)),
      "mime.ipynb",
      {
        maxBytes: 1_000_000,
      },
    );

    expect(manifest.support.status).toBe("PARTIAL");
    expect(manifest.cells[0]?.outputHashes).toHaveLength(2);
    expect(manifest.cells[0]?.metricCandidates).toEqual([
      { name: "accuracy", value: 0.75, outputIndex: 0 },
    ]);
    expect(manifest.support.reasons).toContainEqual(
      expect.objectContaining({ code: "ACTIVE_OUTPUT_REMOVED", cellIndex: 0 }),
    );
  });

  it("canonicalizes JSON output hashes independent of object key order", () => {
    const make = (value: Record<string, number>) =>
      notebook({
        cells: [
          {
            cell_type: "code",
            execution_count: 1,
            metadata: {},
            source: "display(result)",
            outputs: [
              {
                output_type: "display_data",
                metadata: {},
                data: { "application/json": value },
              },
            ],
          },
        ],
      });

    const first = parseNotebook(
      Buffer.from(JSON.stringify(make({ alpha: 1, beta: 2 }))),
      "first.ipynb",
      { maxBytes: 1_000_000 },
    );
    const second = parseNotebook(
      Buffer.from(JSON.stringify(make({ beta: 2, alpha: 1 }))),
      "second.ipynb",
      { maxBytes: 1_000_000 },
    );

    expect(first.cells[0]?.outputHashes).toEqual(second.cells[0]?.outputHashes);
  });

  it("returns typed failures for malformed JSON and unsupported nbformat", () => {
    expect(() =>
      parseNotebook(Buffer.from("{"), "broken.ipynb", { maxBytes: 1_000_000 }),
    ).toThrowError(NotebookParseError);

    try {
      parseNotebook(Buffer.from("{"), "broken.ipynb", { maxBytes: 1_000_000 });
    } catch (error) {
      expect(error).toMatchObject({ code: "INVALID_JSON" });
    }

    const unsupported = parseNotebook(
      Buffer.from(JSON.stringify(notebook({ nbformat: 3 }))),
      "old.ipynb",
      { maxBytes: 1_000_000 },
    );
    expect(unsupported.support.status).toBe("UNSUPPORTED");
    expect(unsupported.support.reasons).toContainEqual(
      expect.objectContaining({ code: "UNSUPPORTED_NBFORMAT" }),
    );
  });

  it("uses a safe basename and reports unsupported executable notebook features", () => {
    const unsafe = notebook({
      cells: [
        {
          cell_type: "code",
          execution_count: null,
          metadata: {},
          outputs: [],
          source: ["%load_ext custom_extension\n", "import requests\n"],
        },
      ],
    });

    const manifest = parseNotebook(
      Buffer.from(JSON.stringify(unsafe)),
      "../escape.ipynb",
      {
        maxBytes: 1_000_000,
      },
    );

    expect(manifest.fileName).toBe("escape.ipynb");
    expect(manifest.support.status).toBe("UNSUPPORTED");
    expect(manifest.support.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        "UNSUPPORTED_MAGIC",
        "EXTERNAL_NETWORK_DEPENDENCY",
      ]),
    );
  });

  it("accepts pathlib as a harmless standard-library import in the public sample", () => {
    const withPathlib = notebook({
      cells: [
        {
          cell_type: "code",
          execution_count: 1,
          metadata: {},
          outputs: [],
          source: ["from pathlib import Path\n", "import pandas as pd\n"],
        },
      ],
    });

    const manifest = parseNotebook(
      Buffer.from(JSON.stringify(withPathlib)),
      "sample.ipynb",
      {
        maxBytes: 1_000_000,
      },
    );

    expect(manifest.support).toEqual({ status: "SUPPORTED", reasons: [] });
    expect(manifest.packageHints).toEqual(["pandas", "pathlib"]);
  });
});
