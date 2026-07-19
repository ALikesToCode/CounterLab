import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

type HeaderRule = {
  path: string;
  headers: Map<string, string>;
};

const description =
  "CounterLab turns a supported notebook claim into competing models, an immutable Prediction, a verified Test and Boundary, deterministic transfer, and a repair unlocked only after transfer passes.";
const title = "CounterLab — A scientific debugger for beliefs";

async function readStaticFile(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

function parseHeaderRules(source: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let currentRule: HeaderRule | undefined;

  for (const rawLine of source.split(/\r?\n/u)) {
    if (rawLine.trim() === "") {
      continue;
    }

    if (!rawLine.startsWith(" ")) {
      currentRule = { path: rawLine.trim(), headers: new Map() };
      rules.push(currentRule);
      continue;
    }

    const separator = rawLine.indexOf(":");
    if (!currentRule || separator < 0) {
      throw new Error(`Invalid _headers line: ${rawLine}`);
    }

    currentRule.headers.set(
      rawLine.slice(0, separator).trim().toLowerCase(),
      rawLine.slice(separator + 1).trim(),
    );
  }

  return rules;
}

function parseCsp(value: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const rawDirective of value.split(";")) {
    const [name, ...sources] = rawDirective.trim().split(/\s+/u);
    if (name !== undefined && name.length > 0) directives.set(name, sources);
  }
  return directives;
}

describe("static shell security and metadata", () => {
  it("keeps executable content same-origin and permits inline styles only on style attributes", async () => {
    const rules = parseHeaderRules(await readStaticFile("../public/_headers"));
    const globalRule = rules.find((rule) => rule.path === "/*");

    expect(globalRule).toBeDefined();
    expect(globalRule?.headers.get("x-content-type-options")).toBe("nosniff");
    expect(globalRule?.headers.get("x-frame-options")).toBe("DENY");
    expect(globalRule?.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(globalRule?.headers.get("permissions-policy")).toBe(
      "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    );
    expect(globalRule?.headers.get("strict-transport-security")).toBe(
      "max-age=31536000",
    );

    const cspValue = globalRule?.headers.get("content-security-policy");
    expect(cspValue).toBeDefined();

    const csp = parseCsp(cspValue ?? "");
    expect(csp.get("default-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'none'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("script-src")).toEqual(["'self'"]);
    expect(csp.get("style-src")).toEqual(["'self'"]);
    expect(csp.get("style-src-elem")).toEqual(["'self'"]);
    expect(csp.get("style-src-attr")).toEqual(["'unsafe-inline'"]);
    expect(csp.get("img-src")).toEqual(["'self'", "data:"]);
    expect(csp.get("font-src")).toEqual(["'self'"]);
    expect(csp.get("connect-src")).toEqual(["'self'"]);
    expect(cspValue).not.toContain("'unsafe-eval'");
    expect(cspValue?.match(/'unsafe-inline'/gu)).toHaveLength(1);
    expect(cspValue).not.toMatch(/(?:https?:|blob:|\*)/u);
  });

  it("makes only hashed assets immutable and leaves HTML revalidatable", async () => {
    const rules = parseHeaderRules(await readStaticFile("../public/_headers"));
    const cacheRules = rules.filter((rule) =>
      rule.headers.has("cache-control"),
    );

    expect(cacheRules).toHaveLength(1);
    expect(cacheRules[0]?.path).toBe("/assets/*");
    expect(cacheRules[0]?.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(
      rules.find((rule) => rule.path === "/*")?.headers.has("cache-control"),
    ).toBe(false);
  });

  it("publishes frozen product metadata without legacy or unfrozen URL metadata", async () => {
    const source = await readStaticFile("../index.html");
    const document = new DOMParser().parseFromString(source, "text/html");

    expect(document.title).toBe(title);
    expect(document.title).not.toContain("CI for understanding");
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content"),
    ).toBe(description);
    expect(
      document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content"),
    ).toBe(title);
    expect(
      document
        .querySelector('meta[property="og:description"]')
        ?.getAttribute("content"),
    ).toBe(description);
    expect(
      document
        .querySelector('meta[property="og:type"]')
        ?.getAttribute("content"),
    ).toBe("website");
    expect(
      document
        .querySelector('meta[name="twitter:card"]')
        ?.getAttribute("content"),
    ).toBe("summary");
    expect(
      document
        .querySelector('meta[name="twitter:title"]')
        ?.getAttribute("content"),
    ).toBe(title);
    expect(
      document
        .querySelector('meta[name="twitter:description"]')
        ?.getAttribute("content"),
    ).toBe(description);
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.querySelector('meta[property="og:image"]')).toBeNull();
    expect(document.querySelector('meta[name="twitter:image"]')).toBeNull();
  });
});
