import { execFileSync } from "node:child_process";
import { realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const migrationAppliedSql =
  "SELECT COUNT(*) AS migration_applied FROM d1_migrations " +
  "WHERE name = '0008_replay_revocations.sql'";
const allReplayRowsSql =
  "SELECT COUNT(*) AS existing_replay_count FROM replays";
const unprojectedReplayRowsSql =
  "SELECT COUNT(*) AS existing_replay_count FROM replays " +
  "LEFT JOIN public_replay_projections " +
  "ON public_replay_projections.replay_id = replays.replay_id " +
  "WHERE public_replay_projections.replay_id IS NULL";

interface WranglerQueryResult {
  results?: Array<Record<string, unknown>>;
  success?: boolean;
}

export interface ReplayPreflightEvidence {
  legacyReplayCount: number;
  projectionMigrationApplied: boolean;
  queryScope: "all-replays" | "unprojected-replays";
  schemaVersion: "1";
}

export type RunD1Query = (sql: string) => string;

function parseArguments(argv: string[]): {
  config: string;
  output: string;
  wrangler: string;
} {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (
      !key?.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    ) {
      throw new Error(
        "Expected --wrangler, --config, and --output path arguments",
      );
    }
    values.set(key, value);
  }
  const wrangler = values.get("--wrangler");
  const config = values.get("--config");
  const output = values.get("--output");
  if (
    values.size !== 3 ||
    wrangler === undefined ||
    config === undefined ||
    output === undefined
  ) {
    throw new Error(
      "Expected exactly --wrangler, --config, and --output path arguments",
    );
  }
  return { config, output, wrangler };
}

function repositoryPath(path: string, mustExist: boolean): string {
  const candidate = resolve(repositoryRoot, path);
  const resolved = mustExist
    ? realpathSync(candidate)
    : resolve(realpathSync(dirname(candidate)), basename(candidate));
  const pathFromRoot = relative(repositoryRoot, resolved);
  if (
    pathFromRoot === "" ||
    pathFromRoot.startsWith("..") ||
    resolve(repositoryRoot, pathFromRoot) !== resolved
  ) {
    throw new Error(`Path must remain inside ${repositoryRoot}`);
  }
  return resolved;
}

export function parseCountResponse(
  raw: string,
  field: "existing_replay_count" | "migration_applied",
): number {
  const payload = JSON.parse(raw) as WranglerQueryResult[];
  if (
    !Array.isArray(payload) ||
    payload.length !== 1 ||
    payload[0]?.success !== true ||
    !Array.isArray(payload[0].results) ||
    payload[0].results.length !== 1
  ) {
    throw new Error("D1 did not return one successful count result");
  }
  const value = payload[0].results[0]?.[field];
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`D1 returned an invalid ${field}`);
  }
  return Number(value);
}

export function queryLegacyReplayCount(
  runD1Query: RunD1Query,
): ReplayPreflightEvidence {
  const migrationApplied = parseCountResponse(
    runD1Query(migrationAppliedSql),
    "migration_applied",
  );
  if (migrationApplied !== 0 && migrationApplied !== 1) {
    throw new Error(
      "D1 returned an ambiguous replay projection migration state",
    );
  }
  const projectionMigrationApplied = migrationApplied === 1;
  const legacyReplayCount = parseCountResponse(
    runD1Query(
      projectionMigrationApplied ? unprojectedReplayRowsSql : allReplayRowsSql,
    ),
    "existing_replay_count",
  );
  return {
    legacyReplayCount,
    projectionMigrationApplied,
    queryScope: projectionMigrationApplied
      ? "unprojected-replays"
      : "all-replays",
    schemaVersion: "1",
  };
}

function main(argv: string[]): void {
  const args = parseArguments(argv);
  const wrangler = repositoryPath(args.wrangler, true);
  const config = repositoryPath(args.config, true);
  const output = repositoryPath(args.output, false);
  const evidence = queryLegacyReplayCount((sql) =>
    execFileSync(
      wrangler,
      [
        "d1",
        "execute",
        "DB",
        "--remote",
        "--config",
        config,
        "--command",
        sql,
        "--json",
      ],
      {
        encoding: "utf8",
        env: process.env,
        maxBuffer: 4 * 1024 * 1024,
      },
    ),
  );
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(String(evidence.legacyReplayCount));
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  realpathSync(invokedPath) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2));
}
