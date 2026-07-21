import type { ContainedCgroupObserverManifest } from "./contained-cgroup-observer-protocol.mjs";
import type { ContainedCgroupObserverFinalization } from "./contained-cgroup-observer-protocol.mjs";

export function createContainedCgroupObserverReady(
  manifest: ContainedCgroupObserverManifest,
  options?: { armedAt?: Date; observerPid?: number },
): Record<string, unknown>;

export function validateContainedCgroupObserverReady<T>(
  value: T,
  manifest: ContainedCgroupObserverManifest,
): T;

export function createContainedCgroupObserverFailure(
  manifest: ContainedCgroupObserverManifest,
  options?: { failedAt?: Date },
): Record<string, unknown>;

export function validateContainedCgroupObserverFailure<T>(
  value: T,
  manifest: ContainedCgroupObserverManifest,
): T;

export function createContainedCgroupObserverDraft(
  manifest: ContainedCgroupObserverManifest,
  observation: Record<string, unknown>,
): Record<string, unknown>;

export function validateContainedCgroupObserverDraft<T>(
  value: T,
  manifest: ContainedCgroupObserverManifest,
): T;

export function parseContainedCgroupKeyValues(
  source: string,
): Record<string, number>;
export function parseContainedCgroupMembers(source: string): number[];
export function parseContainedProcessStat(
  source: string,
  expectedPid: number,
): { pid: number; parentPid: number; startTimeTicks: string };
export function selectContainedCgroupMembership(
  memberPids: number[],
  processStats: Map<
    number,
    { pid: number; parentPid: number; startTimeTicks: string }
  >,
): Record<string, unknown>;

export function observeContainedCgroup(
  manifest: ContainedCgroupObserverManifest,
  adapter: {
    now(): Date;
    waitForCgroup(): Promise<void>;
    readCgroupFile(name: string): string | Promise<string>;
    readProcessStat(pid: number): string | Promise<string>;
    runControl(
      control: Record<string, unknown>,
      baselineMemberPids: number[],
    ): Promise<void>;
    publishDraft(draft: Record<string, unknown>): Promise<void>;
    waitForFinalization(): Promise<ContainedCgroupObserverFinalization>;
    waitForCgroupAbsent(): Promise<void>;
  },
): Promise<Record<string, unknown>>;
