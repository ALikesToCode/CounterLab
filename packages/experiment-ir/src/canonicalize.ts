import { assertExperimentIRPolicy } from "./policy.js";
import { ExperimentIRV5Schema, type ExperimentIRV5 } from "./schema.js";

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

export function canonicalizeExperimentIR(value: unknown): string {
  assertExperimentIRPolicy(value);
  const parsed = ExperimentIRV5Schema.parse(value);
  return JSON.stringify(canonicalValue(parsed, new WeakSet<object>()));
}

export function parseExperimentIR(value: unknown): ExperimentIRV5 {
  assertExperimentIRPolicy(value);
  return ExperimentIRV5Schema.parse(value);
}

function canonicalValue(
  value: unknown,
  ancestors: WeakSet<object>,
): CanonicalValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonical JSON does not support non-finite numbers");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new TypeError("canonical JSON does not support cyclic arrays");
    }
    ancestors.add(value);
    const normalized = value.map((item) => canonicalValue(item, ancestors));
    ancestors.delete(value);
    return normalized;
  }
  if (typeof value === "object") {
    const object = value as object;
    const prototype = Object.getPrototypeOf(object);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("canonical JSON supports only plain objects");
    }
    if (ancestors.has(object)) {
      throw new TypeError("canonical JSON does not support cyclic objects");
    }
    ancestors.add(object);
    const normalized: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) {
        throw new TypeError("canonical JSON does not support undefined values");
      }
      normalized[key.normalize("NFC")] = canonicalValue(item, ancestors);
    }
    ancestors.delete(object);
    return normalized;
  }
  throw new TypeError(`canonical JSON does not support ${typeof value} values`);
}
