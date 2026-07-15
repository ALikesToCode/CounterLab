import {
  ScientificEngineRegistrySchema,
  ScientificEngineSnapshotSchema,
  SubjectPackEngineBindingsSchema,
} from "./schema.js";
import {
  enforceScientificEnginePolicy,
  enforceScientificEngineSnapshotPolicy,
} from "./policy.js";
import {
  hashScientificEngineRegistry,
  hashSubjectPackEngineBindings,
} from "./canonicalize.js";
import type {
  ScientificEngineRegistry,
  ScientificEngineSnapshot,
  SubjectPackEngineBindings,
} from "./types.js";

export function validateScientificEngineRegistry(
  registry: unknown,
  bindings?: unknown,
): ScientificEngineRegistry {
  const parsedRegistry = ScientificEngineRegistrySchema.parse(registry);
  const parsedBindings: SubjectPackEngineBindings | undefined =
    bindings === undefined
      ? undefined
      : SubjectPackEngineBindingsSchema.parse(bindings);
  enforceScientificEnginePolicy(parsedRegistry, parsedBindings);
  return parsedRegistry;
}

export function validateSubjectPackEngineBindings(
  registry: unknown,
  bindings: unknown,
): SubjectPackEngineBindings {
  const parsedRegistry = ScientificEngineRegistrySchema.parse(registry);
  const parsedBindings = SubjectPackEngineBindingsSchema.parse(bindings);
  enforceScientificEnginePolicy(parsedRegistry, parsedBindings);
  return parsedBindings;
}

export async function validateScientificEngineSnapshot(
  snapshot: unknown,
  options: { verifyDeclaredHashes?: boolean } = {},
): Promise<ScientificEngineSnapshot> {
  const parsed = ScientificEngineSnapshotSchema.parse(snapshot);
  enforceScientificEngineSnapshotPolicy(parsed);
  if (options.verifyDeclaredHashes !== false) {
    const [registryHash, bindingsHash] = await Promise.all([
      hashScientificEngineRegistry(parsed.registry),
      hashSubjectPackEngineBindings(parsed.bindings),
    ]);
    if (parsed.runtimeManifest.registryHash !== registryHash) {
      throw new Error(
        "Scientific engine runtime manifest registry hash does not match the registered authority.",
      );
    }
    if (parsed.runtimeManifest.bindingsHash !== bindingsHash) {
      throw new Error(
        "Scientific engine runtime manifest bindings hash does not match the Subject Pack authority.",
      );
    }
  }
  return parsed;
}
