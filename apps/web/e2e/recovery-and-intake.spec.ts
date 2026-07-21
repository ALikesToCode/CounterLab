import { expect, test, type Page } from "./cloak-test";
import { privateSessionHeaders } from "./private-session";
import { SAMPLE_LEAKAGE_QUESTION } from "../shared/sample-authority";

const liveQuestion =
  "Does this notebook score show that the model generalizes to customers it has never seen?";
const supportedNotebookPath = new URL(
  "../../../evals/held-out/notebooks/leakage-rows-pipeline.ipynb",
  import.meta.url,
).pathname;
const supportedNotebookName = "leakage-rows-pipeline.ipynb";

const readyHealth = {
  ok: true,
  data: {
    platform: "cloudflare-workers",
    sample: "available",
    replay: "available",
    liveGpt: "configured",
    liveCodex: "configured",
    liveKernel: "configured",
    readiness: "ready",
    sandbox: "credential-and-privilege-boundary",
    generationFilesystemReadIsolation: "OS_ENFORCED",
    release: {
      status: "bound",
      workerVersionId: "11111111-2222-3333-4444-555555555555",
      workerVersionTag: `git-${"a".repeat(40)}`,
      workerEvidenceCommit: "a".repeat(40),
      runnerSourceCommit: "b".repeat(40),
      runnerImageDigest: `sha256:${"c".repeat(64)}`,
      generationIsolationEvidenceSha256: "5".repeat(64),
      generationIsolationProbeSha256: "6".repeat(64),
      releaseCheckGenerationIsolationEvidenceSha256: "7".repeat(64),
      releaseCheckGenerationIsolationProbeSha256: "6".repeat(64),
      releaseCheckGenerationIsolationVerifiedAt:
        "2026-07-19T05:31:00.000+05:30",
      timeoutCleanupReceiptSha256: "d".repeat(64),
      aggregateLimitEvidenceSha256: "9".repeat(64),
      runtimePolicySha256: "e".repeat(64),
      proofDependencyManifestSha256: "f".repeat(64),
      workerArtifactClassification: "PROCESS_BOUND_PARTIAL",
      workerArtifactManifestSha256: "1".repeat(64),
      workerBundleSha256: "2".repeat(64),
      clientAssetsSha256: "3".repeat(64),
      clientAssetCount: 27,
      clientPublicAssetsSha256: "4".repeat(64),
      clientPublicAssetCount: 25,
      viteVersion: "8.1.4",
      wranglerVersion: "4.110.0",
    },
    requestId: "e2e-ready-intake",
  },
} as const;

async function reset(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", {
      name: "What result are you trying to understand?",
    }),
  ).toBeVisible();
}

async function storedSessionId(page: Page): Promise<string | null> {
  return page.evaluate(() =>
    window.localStorage.getItem("counterlab.sessionId"),
  );
}

async function openSampleModelDuel(page: Page): Promise<void> {
  await reset(page);
  await page.getByRole("button", { name: /Try verified sample/i }).click();
  await expect(
    page.getByRole("heading", { name: /What do you think the score means/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Compare two explanations/i }).click();
  await expect(
    page.getByRole("heading", {
      name: /Does your current explanation capture what you mean/i,
    }),
  ).toBeVisible();
}

async function installReadyHealth(page: Page): Promise<void> {
  await page.route("**/api/health*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(readyHealth),
    });
  });
}

async function openReadyLiveIntake(page: Page): Promise<void> {
  await installReadyHealth(page);
  await reset(page);
  await page.getByLabel("Your question or claim").fill(liveQuestion);
  await page.getByRole("button", { name: /Test this claim/i }).click();
  await expect(
    page.getByRole("heading", {
      name: /Start with evidence that matches your question/i,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Check live notebook tools/i })
    .click();
  await expect(
    page.getByRole("heading", { name: "Test my notebook" }),
  ).toBeVisible();
  await expect(
    page.getByText("Source-bound hosted notebook runner is ready"),
  ).toBeVisible();
  await expect(page.getByLabel(/Attach a supported notebook/i)).toBeEnabled();
}

function isPostTo(requestUrl: string, method: string, suffix: string): boolean {
  return method === "POST" && new URL(requestUrl).pathname.endsWith(suffix);
}

for (const response of [
  {
    action: "Reject",
    terminalState: "REJECTED_BY_LEARNER",
  },
  {
    action: "Not enough evidence",
    terminalState: "INSUFFICIENT_EVIDENCE",
  },
] as const) {
  test(`${response.action} preserves the claim and resubmits only in a fresh session`, async ({
    page,
  }) => {
    const proposalSessionIds: string[] = [];
    page.on("request", (request) => {
      if (!isPostTo(request.url(), request.method(), "/belief-test")) return;
      const segments = new URL(request.url()).pathname.split("/");
      const encodedSessionId = segments.at(-2);
      if (encodedSessionId !== undefined) {
        proposalSessionIds.push(decodeURIComponent(encodedSessionId));
      }
    });

    await openSampleModelDuel(page);
    const closedSessionId = await storedSessionId(page);
    expect(closedSessionId).toMatch(/^session_/u);
    await expect(page).toHaveURL(
      new RegExp(`/session/${encodeURIComponent(closedSessionId!)}$`, "u"),
    );
    const preservedClaim = (
      await page.locator("blockquote").first().innerText()
    ).trim();
    expect(preservedClaim).toBe(SAMPLE_LEAKAGE_QUESTION);

    await page.getByText("More ways to respond", { exact: true }).click();
    await page
      .getByRole("button", { name: response.action, exact: true })
      .click();
    await expect(
      page.getByText("Your response closed that explanation."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Compare two explanations/i }),
    ).toBeDisabled();
    await expect(page.locator("body")).not.toContainText(
      /REJECTED_BY_LEARNER|INSUFFICIENT_EVIDENCE/u,
    );
    const terminalResponse = await page.request.get(
      `/api/sessions/${encodeURIComponent(closedSessionId!)}`,
      {
        headers: await privateSessionHeaders(page, closedSessionId!),
      },
    );
    expect(terminalResponse.ok()).toBe(true);
    expect((await terminalResponse.json()).data.state).toBe(
      response.terminalState,
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByText("Your response closed that explanation."),
    ).toBeVisible();
    await expect(
      page.getByText(SAMPLE_LEAKAGE_QUESTION, { exact: true }),
    ).toBeVisible();
    expect(await storedSessionId(page)).toBe(closedSessionId);

    await page
      .getByRole("button", { name: /Revise in a new investigation/i })
      .click();
    await expect
      .poll(() => storedSessionId(page), {
        message: "the replacement investigation should install a fresh session",
      })
      .not.toBe(closedSessionId);
    await expect(
      page.getByRole("heading", { name: /What do you think the score means/i }),
    ).toBeVisible();
    const freshSessionId = await storedSessionId(page);
    expect(freshSessionId).toMatch(/^session_/u);
    expect(freshSessionId).not.toBe(closedSessionId);
    await expect(page).toHaveURL(
      new RegExp(`/session/${encodeURIComponent(freshSessionId!)}$`, "u"),
    );
    expect(
      await page.evaluate(() =>
        window.localStorage.getItem("counterlab.claim"),
      ),
    ).toBe(preservedClaim);
    await expect(
      page.getByRole("button", { name: /Compare two explanations/i }),
    ).toBeEnabled();

    await page
      .getByRole("button", { name: /Compare two explanations/i })
      .click();
    await expect(
      page.getByRole("heading", {
        name: /Does your current explanation capture what you mean/i,
      }),
    ).toBeVisible();
    expect(proposalSessionIds).toEqual([closedSessionId, freshSessionId]);

    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(
      new RegExp(`/session/${encodeURIComponent(closedSessionId!)}$`, "u"),
    );
    await expect(
      page.getByText("Your response closed that explanation."),
    ).toBeVisible();
    await expect(
      page.getByText(SAMPLE_LEAKAGE_QUESTION, { exact: true }),
    ).toBeVisible();
    expect(await storedSessionId(page)).toBe(closedSessionId);

    await page.goForward({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(
      new RegExp(`/session/${encodeURIComponent(freshSessionId!)}$`, "u"),
    );
    await expect(
      page.getByRole("heading", {
        name: /Does your current explanation capture what you mean/i,
      }),
    ).toBeVisible();
    expect(await storedSessionId(page)).toBe(freshSessionId);
    await page
      .getByRole("button", { name: /Yes, this captures my view/i })
      .click();
    await expect(
      page.getByRole("heading", {
        name: /Seal what you expect before the result appears/i,
      }),
    ).toBeVisible();
    expect(proposalSessionIds).toEqual([closedSessionId, freshSessionId]);
  });
}

test("live intake cannot continue without an uploaded supported artifact", async ({
  page,
}) => {
  await openReadyLiveIntake(page);

  expect(await storedSessionId(page)).toBeNull();
  await expect(page.getByText(/Notebook intake passed/i)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Compare two explanations/i }),
  ).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/Preparing artifact/i);
});

test("malformed live upload remains at intake and creates no session", async ({
  page,
}) => {
  let sessionCreationRequests = 0;
  page.on("request", (request) => {
    if (isPostTo(request.url(), request.method(), "/api/live/sessions")) {
      sessionCreationRequests += 1;
    }
  });
  await openReadyLiveIntake(page);

  await page.getByLabel(/Attach a supported notebook/i).setInputFiles({
    name: "broken.ipynb",
    mimeType: "application/x-ipynb+json",
    buffer: Buffer.from("not-json"),
  });

  await expect(page.getByRole("alert")).toContainText(/not valid JSON/i);
  await expect(
    page.getByRole("heading", { name: "Test my notebook" }),
  ).toBeVisible();
  await expect(page.getByLabel(/Attach a supported notebook/i)).toBeEnabled();
  expect(sessionCreationRequests).toBe(0);
  expect(await storedSessionId(page)).toBeNull();
});

test("unsupported live upload is refused without creating a session", async ({
  page,
}) => {
  let sessionCreationRequests = 0;
  page.on("request", (request) => {
    if (isPostTo(request.url(), request.method(), "/api/live/sessions")) {
      sessionCreationRequests += 1;
    }
  });
  await openReadyLiveIntake(page);
  const unsupportedNotebook = {
    cells: [
      {
        cell_type: "code",
        execution_count: null,
        metadata: {},
        outputs: [],
        source: ["%load_ext custom_extension\n", "import requests\n"],
      },
    ],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  };

  await page.getByLabel(/Attach a supported notebook/i).setInputFiles({
    name: "unsupported.ipynb",
    mimeType: "application/x-ipynb+json",
    buffer: Buffer.from(JSON.stringify(unsupportedNotebook)),
  });

  await expect(page.getByText(/UNSUPPORTED_MAGIC/i)).toBeVisible();
  await expect(page.getByText(/EXTERNAL_NETWORK_DEPENDENCY/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Compare two explanations/i }),
  ).toBeDisabled();
  expect(sessionCreationRequests).toBe(0);
  expect(await storedSessionId(page)).toBeNull();
});

test("a supported live upload creates one source-bound session", async ({
  page,
}) => {
  let uploadRequests = 0;
  let sessionCreationRequests = 0;
  const duplicateKeyWarnings: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /same key|keys should be unique/i.test(message.text())
    ) {
      duplicateKeyWarnings.push(message.text());
    }
  });
  page.on("request", (request) => {
    if (isPostTo(request.url(), request.method(), "/api/artifacts")) {
      uploadRequests += 1;
    }
    if (isPostTo(request.url(), request.method(), "/api/live/sessions")) {
      sessionCreationRequests += 1;
    }
  });
  await openReadyLiveIntake(page);

  await page
    .getByLabel(/Attach a supported notebook/i)
    .setInputFiles(supportedNotebookPath);

  await expect(
    page.getByRole("heading", { name: /What do you think the score means/i }),
  ).toBeVisible();
  await expect(page.getByText(supportedNotebookName)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Compare two explanations/i }),
  ).toBeEnabled();
  expect(await storedSessionId(page)).toMatch(/^session_/u);
  expect(uploadRequests).toBe(1);
  expect(sessionCreationRequests).toBe(1);
  expect(duplicateKeyWarnings).toEqual([]);
});

test("an interrupted upload accepts the same file on retry", async ({
  page,
}, testInfo) => {
  testInfo.annotations.push({
    type: "counterlab-expected-request-failures",
    description: "POST /api/artifacts",
  });
  let uploadAttempts = 0;
  await page.route("**/api/artifacts", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    uploadAttempts += 1;
    if (uploadAttempts === 1) {
      await route.abort("connectionreset");
      return;
    }
    await route.continue();
  });
  await openReadyLiveIntake(page);
  const upload = page.getByLabel(/Attach a supported notebook/i);

  await upload.setInputFiles(supportedNotebookPath);
  await expect(page.getByRole("alert")).toContainText(
    /could not reach the API/i,
  );
  await expect(upload).toBeEnabled();
  await upload.setInputFiles(supportedNotebookPath);

  await expect(
    page.getByRole("heading", { name: /What do you think the score means/i }),
  ).toBeVisible();
  expect(uploadAttempts).toBe(2);
  expect(await storedSessionId(page)).toMatch(/^session_/u);
});

test("a lost private-session response retries without re-uploading", async ({
  page,
}, testInfo) => {
  testInfo.annotations.push({
    type: "counterlab-expected-request-failures",
    description: "POST /api/live/sessions",
  });
  let uploadRequests = 0;
  let sessionCreationAttempts = 0;
  page.on("request", (request) => {
    if (isPostTo(request.url(), request.method(), "/api/artifacts")) {
      uploadRequests += 1;
    }
  });
  await page.route("**/api/live/sessions", async (route) => {
    sessionCreationAttempts += 1;
    if (sessionCreationAttempts === 1) {
      await route.abort("connectionreset");
      return;
    }
    await route.continue();
  });
  await openReadyLiveIntake(page);

  await page
    .getByLabel(/Attach a supported notebook/i)
    .setInputFiles(supportedNotebookPath);
  await expect(page.getByRole("alert")).toContainText(
    /could not reach the API/i,
  );
  await expect(
    page.getByRole("button", { name: /Retry private session setup/i }),
  ).toBeEnabled();
  await expect(page.getByText(supportedNotebookName)).toBeVisible();

  await page
    .getByRole("button", { name: /Retry private session setup/i })
    .click();
  await expect(
    page.getByRole("heading", { name: /What do you think the score means/i }),
  ).toBeVisible();
  expect(uploadRequests).toBe(1);
  expect(sessionCreationAttempts).toBe(2);
  expect(await storedSessionId(page)).toMatch(/^session_/u);
});
