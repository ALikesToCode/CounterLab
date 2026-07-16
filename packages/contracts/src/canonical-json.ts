export const CANONICAL_JSON_PROFILE = "counterlab-canonical-json-v1" as const;

function assertValidUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError(
          "canonical JSON does not support unpaired Unicode surrogates",
        );
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new TypeError(
        "canonical JSON does not support unpaired Unicode surrogates",
      );
    }
  }
}

function quote(value: string): string {
  assertValidUnicode(value);
  return JSON.stringify(value);
}

function canonicalArray(value: unknown[], ancestors: WeakSet<object>): string {
  if (ancestors.has(value)) {
    throw new TypeError("canonical JSON does not support cyclic values");
  }
  const enumerableKeys = Object.keys(value);
  if (
    enumerableKeys.length !== value.length ||
    enumerableKeys.some((key, index) => key !== String(index)) ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    throw new TypeError(
      "canonical JSON arrays must be dense and contain no extra properties",
    );
  }
  ancestors.add(value);
  try {
    const items: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        !descriptor.enumerable
      ) {
        throw new TypeError(
          "canonical JSON arrays require enumerable data elements",
        );
      }
      items.push(writeCanonical(descriptor.value, ancestors));
    }
    return `[${items.join(",")}]`;
  } finally {
    ancestors.delete(value);
  }
}

function canonicalObject(value: object, ancestors: WeakSet<object>): string {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("canonical JSON supports only plain objects");
  }
  if (ancestors.has(value)) {
    throw new TypeError("canonical JSON does not support cyclic values");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError("canonical JSON object keys must be strings");
  }

  const keys = Object.getOwnPropertyNames(value).sort();
  ancestors.add(value);
  try {
    return `{${keys
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (
          descriptor === undefined ||
          !("value" in descriptor) ||
          !descriptor.enumerable
        ) {
          throw new TypeError(
            "canonical JSON objects require enumerable data properties",
          );
        }
        return `${quote(key)}:${writeCanonical(descriptor.value, ancestors)}`;
      })
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function writeCanonical(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return quote(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonical JSON does not support non-finite numbers");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return canonicalArray(value, ancestors);
  if (typeof value === "object") return canonicalObject(value, ancestors);
  throw new TypeError(`canonical JSON does not support ${typeof value} values`);
}

export function canonicalJsonV1(value: unknown): string {
  return writeCanonical(value, new WeakSet<object>());
}
