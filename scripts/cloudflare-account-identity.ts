import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const AccountIdSchema = z.string().regex(/^[a-f0-9]{32}$/u);

const WranglerWhoamiSchema = z
  .strictObject({
    loggedIn: z.literal(true),
    authType: z.string().min(1),
    email: z.string().min(1).optional(),
    accounts: z.array(z.object({ id: AccountIdSchema }).passthrough()).min(1),
    tokenPermissions: z.array(z.string()),
  })
  .superRefine((identity, context) => {
    const accountIds = identity.accounts.map((account) => account.id);
    if (accountIds.length !== new Set(accountIds).size) {
      context.addIssue({
        code: "custom",
        path: ["accounts"],
        message: "Wrangler account identity contains duplicate account IDs",
      });
    }
  });

const WranglerConfigAccountSchema = z.object({
  account_id: AccountIdSchema,
});

export function verifiedCloudflareAccountId(
  whoamiValue: unknown,
  configValue: unknown,
): string {
  const whoami = WranglerWhoamiSchema.parse(whoamiValue);
  const config = WranglerConfigAccountSchema.parse(configValue);
  const matches = whoami.accounts.filter(
    (account) => account.id === config.account_id,
  );
  if (matches.length !== 1) {
    throw new Error(
      "the authenticated Wrangler identity does not contain the configured Cloudflare account exactly once",
    );
  }
  return config.account_id;
}

function isRepositoryPath(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
  );
}

async function existingRepositoryFile(
  root: string,
  requested: string,
): Promise<string> {
  const candidate = resolve(root, requested);
  if (!isRepositoryPath(root, candidate)) {
    throw new Error(
      `Cloudflare identity path escaped the repository: ${requested}`,
    );
  }
  const [metadata, physical] = await Promise.all([
    lstat(candidate),
    realpath(candidate),
  ]);
  const physicalMetadata = await stat(physical);
  if (
    metadata.isSymbolicLink() ||
    !isRepositoryPath(root, physical) ||
    !physicalMetadata.isFile()
  ) {
    throw new Error(`Cloudflare identity path is unsafe: ${requested}`);
  }
  return physical;
}

function argumentsFrom(argv: string[]): { config: string } {
  if (argv.length !== 2 || argv[0] !== "--config" || argv[1] === undefined) {
    throw new Error("Usage: cloudflare-account-identity --config FILE");
  }
  return { config: argv[1] };
}

async function main(): Promise<void> {
  const root = await realpath(resolve(import.meta.dirname, ".."));
  const args = argumentsFrom(process.argv.slice(2));
  const configPath = await existingRepositoryFile(root, args.config);
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const whoamiText = Buffer.concat(chunks).toString("utf8");
  const configText = await readFile(configPath, "utf8");
  process.stdout.write(
    verifiedCloudflareAccountId(
      JSON.parse(whoamiText) as unknown,
      JSON.parse(configText) as unknown,
    ),
  );
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
