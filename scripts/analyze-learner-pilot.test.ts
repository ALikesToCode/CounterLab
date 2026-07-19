import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  containedOptionalPilotInput,
  parsePilotAnalysisArguments,
  parsePilotJsonLines,
  preparePilotAnalysis,
} from "./analyze-learner-pilot.js";

const analyzedAt = "2026-07-15T03:00:00.000Z";
const qualifiedReleaseReceiptSha256 = "a".repeat(64);

async function repositoryRoot(): Promise<string> {
  return realpath(resolve(import.meta.dirname, ".."));
}

describe("learner pilot analysis CLI", () => {
  it("accepts at most two positional repository inputs", () => {
    expect(parsePilotAnalysisArguments([])).toEqual({
      sessionInput: "evals/learner-pilot/data/session-results.jsonl",
      sessionInputWasExplicit: false,
      consentInput: "evals/learner-pilot/data/consent-references.jsonl",
      consentInputWasExplicit: false,
    });
    expect(
      parsePilotAnalysisArguments(["sessions.jsonl", "consent.jsonl"]),
    ).toEqual({
      sessionInput: "sessions.jsonl",
      sessionInputWasExplicit: true,
      consentInput: "consent.jsonl",
      consentInputWasExplicit: true,
    });
    expect(() => parsePilotAnalysisArguments(["one", "two", "three"])).toThrow(
      /Usage/u,
    );
    expect(() => parsePilotAnalysisArguments(["--input"])).toThrow(/Usage/u);
  });

  it("treats only an absent implicit session input as NO_DATA", async () => {
    const root = await repositoryRoot();
    const missing =
      "evals/learner-pilot/fixtures/intentionally-absent-session.jsonl";

    await expect(
      containedOptionalPilotInput(root, missing, "pilot session input", false),
    ).resolves.toBeNull();
    await expect(
      containedOptionalPilotInput(root, missing, "pilot session input", true),
    ).rejects.toThrow(/does not exist/u);
  });

  it("rejects escaped inputs through the shared physical-path gate", async () => {
    const root = await repositoryRoot();

    await expect(
      containedOptionalPilotInput(
        root,
        "../outside.jsonl",
        "pilot session input",
        true,
      ),
    ).rejects.toThrow(/escapes the repository/u);
  });

  it("reports malformed JSON by logical input and line without row content", () => {
    const privateValue = "DO_NOT_ECHO_THIS_ROW";
    let message = "";
    try {
      parsePilotJsonLines(
        `{"privateValue":"${privateValue}"\n`,
        "session input",
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBe("session input line 1 contains invalid JSON");
    expect(message).not.toContain(privateValue);
  });

  it("validates fixed assignment, prior consent, and exact release before aggregation", async () => {
    const root = await repositoryRoot();
    const result = await preparePilotAnalysis({
      root,
      argv: [
        "evals/learner-pilot/fixtures/synthetic-session-results.jsonl",
        "evals/learner-pilot/fixtures/synthetic-consent-references.jsonl",
      ],
      analyzedAt,
    });

    expect(result.status).toBe("DESCRIPTIVE_ONLY");
    expect(result.qualifiedReleaseReceiptSha256).toBe(
      qualifiedReleaseReceiptSha256,
    );
    expect(result.participantCount).toBe(1);
    expect(result.completedSessionCount).toBe(1);
    expect(result.metrics?.taskCount).toBe(2);
    expect(result.metrics?.predictionDifferenceRate).toBe(0.5);
    expect(result.metrics?.confusionCategoryCounts.prediction_meaning).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(
      /participant_synthetic|consent_ref_|startedAt|completedAt/u,
    );
  });

  it("fails before output replacement when consent references are unavailable", async () => {
    const root = await repositoryRoot();
    const output = resolve(root, "docs/LEARNER_PILOT_RESULTS.json");
    const before = await readFile(output, "utf8");

    await expect(
      preparePilotAnalysis({
        root,
        argv: [
          "evals/learner-pilot/fixtures/synthetic-session-results.jsonl",
          "evals/learner-pilot/fixtures/intentionally-absent-consent.jsonl",
        ],
        analyzedAt,
      }),
    ).rejects.toThrow(/does not exist/u);
    await expect(readFile(output, "utf8")).resolves.toBe(before);
  });

  it("does not echo malformed row content or replace the aggregate", async () => {
    const root = await repositoryRoot();
    const output = resolve(root, "docs/LEARNER_PILOT_RESULTS.json");
    const before = await readFile(output, "utf8");
    let message = "";
    try {
      await preparePilotAnalysis({
        root,
        argv: [
          "evals/learner-pilot/fixtures/malformed-session-results.jsonl",
          "evals/learner-pilot/fixtures/synthetic-consent-references.jsonl",
        ],
        analyzedAt,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBe("session input line 1 contains invalid JSON");
    expect(message).not.toContain("DO_NOT_ECHO");
    await expect(readFile(output, "utf8")).resolves.toBe(before);
  });
});
