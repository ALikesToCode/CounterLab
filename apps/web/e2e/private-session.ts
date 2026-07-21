import type { Page } from "./cloak-test";

const ownerCapabilityPattern = /^cl_owner_[A-Za-z0-9_-]{43}$/u;

export async function privateSessionHeaders(
  page: Page,
  sessionId: string,
): Promise<{ authorization: string }> {
  const storageKey = `counterlab.ownerCapability.${encodeURIComponent(sessionId)}`;
  const capability = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    storageKey,
  );
  if (capability === null || !ownerCapabilityPattern.test(capability)) {
    throw new Error(
      `Private session ${sessionId} has no valid browser-held owner capability`,
    );
  }
  return { authorization: `Bearer ${capability}` };
}
