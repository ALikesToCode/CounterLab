import { z } from "zod";

const RECENT_WORK_KEY = "counterlab.recentWork.v1";
const MAX_RECENT_WORK = 3;

const IdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);

const RecentWorkRecordSchema = z
  .object({
    id: IdentifierSchema,
    mode: z.enum(["instant", "live", "replay"]),
    status: z.string().trim().min(1).max(64),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

const RecentWorkRegistrySchema = z
  .object({
    schemaVersion: z.literal("1"),
    records: z.array(RecentWorkRecordSchema).max(MAX_RECENT_WORK),
  })
  .strict();

export type RecentWorkRecord = z.infer<typeof RecentWorkRecordSchema>;

function emptyRegistry() {
  return { schemaVersion: "1" as const, records: [] as RecentWorkRecord[] };
}

function read(storage: Storage) {
  try {
    const serialized = storage.getItem(RECENT_WORK_KEY);
    if (serialized === null) return emptyRegistry();
    const parsed = RecentWorkRegistrySchema.safeParse(JSON.parse(serialized));
    if (parsed.success) return parsed.data;
    storage.removeItem(RECENT_WORK_KEY);
  } catch {
    // Browser storage is optional. Recovery remains available without history.
  }
  return emptyRegistry();
}

function write(
  records: readonly RecentWorkRecord[],
  storage: Storage,
): boolean {
  const registry = RecentWorkRegistrySchema.safeParse({
    schemaVersion: "1",
    records: records.slice(0, MAX_RECENT_WORK),
  });
  if (!registry.success) return false;
  try {
    if (registry.data.records.length === 0) {
      storage.removeItem(RECENT_WORK_KEY);
    } else {
      storage.setItem(RECENT_WORK_KEY, JSON.stringify(registry.data));
    }
    return true;
  } catch {
    return false;
  }
}

export function listRecentWork(storage: Storage): RecentWorkRecord[] {
  return read(storage).records.map((record) => ({ ...record }));
}

export function upsertRecentWork(
  record: RecentWorkRecord,
  storage: Storage,
): boolean {
  const parsed = RecentWorkRecordSchema.safeParse(record);
  if (!parsed.success) return false;
  const records = read(storage)
    .records.filter(
      (candidate) =>
        candidate.id !== parsed.data.id || candidate.mode !== parsed.data.mode,
    )
    .concat(parsed.data)
    .sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.id.localeCompare(right.id),
    );
  return write(records, storage);
}

export function removeRecentWork(
  id: string,
  mode: RecentWorkRecord["mode"],
  storage: Storage,
): boolean {
  const parsedId = IdentifierSchema.safeParse(id);
  if (!parsedId.success) return false;
  return write(
    read(storage).records.filter(
      (record) => record.id !== parsedId.data || record.mode !== mode,
    ),
    storage,
  );
}

export function recentWorkPath(record: RecentWorkRecord): string {
  const segment = encodeURIComponent(record.id);
  return record.mode === "replay"
    ? `/replay/${segment}`
    : `/session/${segment}`;
}
