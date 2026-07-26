export const STOCK_CHROMIUM_DESIGN_REVIEW =
  "stock-chromium-design-review" as const;

// Remote CDP journeys keep screenshots and traces as browser evidence. Leaving
// Playwright video disabled avoids a second, local browser-runtime dependency
// on its bundled FFmpeg executable.
export const PLAYWRIGHT_VIDEO_MODE = "off" as const;

const APPROVED_STOCK_CHROMIUM_EXECUTABLE = "/usr/bin/chromium";

export type BrowserAuthority =
  | {
      kind: "cloak";
      evidenceLabel: "CLOAK_CDP_ENDPOINT";
      endpoint: string;
    }
  | {
      kind: "stock-chromium-design-review";
      evidenceLabel: typeof STOCK_CHROMIUM_DESIGN_REVIEW;
      executablePath: typeof APPROVED_STOCK_CHROMIUM_EXECUTABLE;
    };

type BrowserEnvironment = Readonly<Record<string, string | undefined>>;

export function validateCloakCdpEndpoint(configured: string): string {
  const endpoint = new URL(configured);
  if (!["http:", "https:", "ws:", "wss:"].includes(endpoint.protocol)) {
    throw new Error(
      "CLOAK_CDP_ENDPOINT must use an http(s) or ws(s) CDP endpoint",
    );
  }
  if (endpoint.username !== "" || endpoint.password !== "") {
    throw new Error("CLOAK_CDP_ENDPOINT must not contain URL credentials");
  }
  if (
    !new Set(["127.0.0.1", "localhost", "[::1]"]).has(endpoint.hostname) ||
    endpoint.port === ""
  ) {
    throw new Error(
      "CLOAK_CDP_ENDPOINT must use an explicit port on a loopback host",
    );
  }
  return configured;
}

export function resolveBrowserAuthority(
  environment: BrowserEnvironment,
): BrowserAuthority {
  const endpoint = (environment.CLOAK_CDP_ENDPOINT ?? "").trim();
  const requestedAuthority = (
    environment.COUNTERLAB_BROWSER_AUTHORITY ?? ""
  ).trim();

  if (endpoint !== "" && requestedAuthority !== "") {
    throw new Error(
      "CLOAK_CDP_ENDPOINT and COUNTERLAB_BROWSER_AUTHORITY cannot be combined",
    );
  }
  if (endpoint !== "") {
    return {
      kind: "cloak",
      evidenceLabel: "CLOAK_CDP_ENDPOINT",
      endpoint: validateCloakCdpEndpoint(endpoint),
    };
  }
  if (requestedAuthority !== STOCK_CHROMIUM_DESIGN_REVIEW) {
    throw new Error(
      "CLOAK_CDP_ENDPOINT is required unless stock-chromium-design-review is explicitly requested",
    );
  }

  const executablePath = (
    environment.COUNTERLAB_STOCK_CHROMIUM_EXECUTABLE ??
    APPROVED_STOCK_CHROMIUM_EXECUTABLE
  ).trim();
  if (executablePath !== APPROVED_STOCK_CHROMIUM_EXECUTABLE) {
    throw new Error(
      `Stock Chromium design review permits only ${APPROVED_STOCK_CHROMIUM_EXECUTABLE}`,
    );
  }
  return {
    kind: STOCK_CHROMIUM_DESIGN_REVIEW,
    evidenceLabel: STOCK_CHROMIUM_DESIGN_REVIEW,
    executablePath: APPROVED_STOCK_CHROMIUM_EXECUTABLE,
  };
}

export function currentBrowserAuthorityLabel(): BrowserAuthority["evidenceLabel"] {
  return resolveBrowserAuthority(process.env).evidenceLabel;
}
