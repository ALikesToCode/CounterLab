import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function stylesheet(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const theaterStyles = stylesheet("./VerifiedBeliefBreakTheater.module.css");
const deferredStyles = stylesheet("./DeferredVerifiedBeliefBreak.module.css");
const judgeStyles = stylesheet("../../features/judge/JudgeModeView.module.css");
const globalStyles = stylesheet("../../styles.css");
const studioStyles = stylesheet("../../styles/studio.css");
const questionComposerStyles = stylesheet("./QuestionComposer.module.css");
const startOverStyles = stylesheet("./StartOverDialog.module.css");
const boundaryMapStyles = stylesheet(
  "../generative-ui/BoundaryMapBlock.module.css",
);
const reasoningDiffStyles = stylesheet("../proof/ReasoningDiffView.module.css");

function colorToken(name: string): string {
  const match = globalStyles.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (match?.[1] === undefined) {
    throw new Error(`Missing six-digit color token ${name}`);
  }
  return match[1];
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  );
  return channels
    .map((channel) => channel / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (luminance, channel, index) =>
        luminance + channel * [0.2126, 0.7152, 0.0722][index]!,
      0,
    );
}

function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("learner-facing responsive style safeguards", () => {
  it("reserves stable preview space at narrow widths", () => {
    expect(theaterStyles).toContain(
      ".embeddedMechanism.preview {\n    min-height: 388px;\n  }",
    );
    expect(theaterStyles).toContain(
      ".previewBody {\n    min-height: 318px;\n  }",
    );
    expect(theaterStyles).toContain(
      ".previewEvidence {\n    min-height: 300px;\n  }",
    );
    expect(deferredStyles).toContain("min-height: 388px");
    expect(judgeStyles).toContain("gap: 20px");
    expect(judgeStyles).toContain("padding-block: 20px 52px");
  });

  it("keeps prose floors and 44px product targets explicit", () => {
    expect(deferredStyles).toContain("font-size: 15px");
    expect(theaterStyles).toContain(
      ".evidenceDisclosure summary {\n  display: flex;\n  min-height: 44px;",
    );
    expect(judgeStyles).toContain(
      ".page :where(a, button) {\n  min-height: 44px;",
    );
    expect(judgeStyles).toContain(
      ".previewAuthority {\n  margin: 0 0 14px;\n  color: var(--judge-panel-muted);\n  font-size: 13px;",
    );
    expect(judgeStyles).toContain(
      ".methodRail p {\n  margin: 7px 0 0;\n  color: var(--judge-muted);\n  font-size: 15px;",
    );
    expect(theaterStyles).toContain(
      ".integrityList code {\n  font-family: var(--mono);\n  font-size: 13px;",
    );
    expect(theaterStyles).toContain(
      ".compactBody .integrityState {\n  min-height: 248px;\n  margin-top: 8px;",
    );
    expect(judgeStyles).toContain(
      ".releaseIdentity code {\n  overflow-wrap: anywhere;\n  font-size: 13px;",
    );
    expect([theaterStyles, deferredStyles, judgeStyles].join("\n")).not.toMatch(
      /font-size:\s*(?:[0-9]|1[01])px\b/u,
    );
  });

  it("keeps secondary learner text above the WCAG AA contrast floor", () => {
    const paper = colorToken("--paper");

    expect(
      contrastRatio(colorToken("--ink-soft"), paper),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(colorToken("--ink-faint"), paper),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("contains horizontal overflow and removes hover motion when requested", () => {
    expect(judgeStyles).toContain("overflow-x: clip");
    expect(globalStyles).toContain(
      ".landing-question-first {\n  color-scheme: dark;\n  min-height: 100svh;\n  overflow-x: clip;",
    );
    expect(questionComposerStyles).not.toContain("overflow-x: auto");
    expect(questionComposerStyles).toContain(
      ".promptGroup > div {\n    width: 100%;\n    max-width: 100%;\n    display: grid;",
    );
    expect(judgeStyles).toContain("transition: none !important");
    expect(judgeStyles).toContain("transform: none");
    expect(theaterStyles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(theaterStyles).toContain("animation: none");
  });

  it("keeps programmatic landing-heading focus visible without boxing the headline", () => {
    expect(globalStyles).toContain(
      ".landing-intro > h1:focus-visible {\n  outline: 0;\n  text-decoration: underline;",
    );
    expect(globalStyles).toContain("text-decoration-color: var(--focus-ring)");
  });

  it("stacks proof authority state below its handle label on narrow screens", () => {
    expect(studioStyles).toContain(
      ".proof-console-handle {\n    display: grid;\n    min-height: var(--proof-console-handle-height);\n    grid-template-columns: minmax(0, 1fr) auto;",
    );
    expect(studioStyles).toContain(
      ".proof-console-context {\n    grid-column: 1 / -1;\n    flex-wrap: wrap;",
    );
    expect(studioStyles).toContain(
      ".proof-console-handle > strong {\n    display: none;",
    );
    expect(studioStyles).toContain("--proof-console-handle-height: 52px");
    expect(studioStyles).toContain(
      "--proof-console-body-height: min(290px, 40dvh)",
    );
    expect(studioStyles).toContain("grid-template-rows: auto minmax(0, 1fr)");
    expect(studioStyles).toContain("max-width: none");
    expect(studioStyles).not.toContain("height: 236px");
  });

  it("keeps proof values readable and technical secondary text at 13px", () => {
    expect(reasoningDiffStyles).toContain("overflow-wrap: anywhere");
    expect(reasoningDiffStyles).not.toContain("text-overflow: ellipsis");
    expect(reasoningDiffStyles).not.toContain("white-space: nowrap");
    expect(reasoningDiffStyles).toContain("font: 13px/1.4 var(--mono)");
    expect(startOverStyles).toContain("font-size: 0.8125rem");
    expect(boundaryMapStyles).toContain("font: 13px/1.4 var(--mono)");
    expect(boundaryMapStyles).toContain("font-size: 13px");
    expect(studioStyles).not.toContain("font-size: 11px");
  });

  it("keeps the composer dominant in one centered responsive column", () => {
    expect(globalStyles).not.toContain(
      "grid-template-columns: minmax(520px, 1.08fr) minmax(480px, 0.92fr)",
    );
    expect(globalStyles).toContain("@media (max-width: 1240px)");
    expect(globalStyles).toContain(
      ".question-first-layout {\n  width: 100%;\n  max-width: 820px;\n  min-width: 0;",
    );
    expect(globalStyles).toContain(
      ".question-first-layout {\n    width: 100%;\n    max-width: 820px;\n    min-width: 0;",
    );
    expect(questionComposerStyles).toContain(
      ".composer {\n  width: 100%;\n  max-width: 780px;\n  min-width: 0;",
    );
    expect(questionComposerStyles).toContain(
      ".promptGroup {\n  width: 100%;\n  max-width: 640px;\n  min-width: 0;",
    );
    expect(globalStyles).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(questionComposerStyles).toContain(
      ".form {\n    min-height: 122px;\n    padding-bottom: 58px;",
    );
    expect(questionComposerStyles).toContain(
      ".submitText {\n    position: static;",
    );
    expect(questionComposerStyles).not.toContain(
      ".promptGroup {\n    display: none;",
    );
  });
});
