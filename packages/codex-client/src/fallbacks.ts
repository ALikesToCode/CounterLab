import {
  CompilerEventSchema,
  CompilerSetupError,
  type CodexCompiler,
  type CompileLabInput,
  type CompilePatchInput,
  type CompilerEvent,
  type CompilerHealth,
  type RepairLabInput,
} from "./types.js";

type ReplayRecord = {
  replayId: string;
  recordedAt: string;
  model: string;
  events: CompilerEvent[];
};

export class ReplayCodexCompiler implements CodexCompiler {
  private readonly record: ReplayRecord;

  constructor(record: ReplayRecord) {
    this.record = {
      replayId: record.replayId,
      recordedAt: record.recordedAt,
      model: record.model,
      events: record.events.map((event) => CompilerEventSchema.parse(event)),
    };
  }

  health(): Promise<CompilerHealth> {
    return Promise.resolve({
      mode: "replay",
      available: true,
      replayId: this.record.replayId,
      recordedAt: this.record.recordedAt,
      model: this.record.model,
    });
  }

  compileLab(_input: CompileLabInput): AsyncIterable<CompilerEvent> {
    return this.replay();
  }

  repairLab(_input: RepairLabInput): AsyncIterable<CompilerEvent> {
    return this.replay();
  }

  compilePatch(_input: CompilePatchInput): AsyncIterable<CompilerEvent> {
    return this.replay();
  }

  private async *replay(): AsyncIterable<CompilerEvent> {
    yield {
      type: "replay_metadata",
      replayId: this.record.replayId,
      recordedAt: this.record.recordedAt,
      model: this.record.model,
    };
    for (const event of this.record.events) yield structuredClone(event);
  }
}

export class DisabledCodexCompiler implements CodexCompiler {
  constructor(private readonly reason = "Codex live mode is disabled.") {}

  health(): Promise<CompilerHealth> {
    return Promise.resolve({
      mode: "disabled",
      available: false,
      reason: this.reason,
    });
  }

  async *compileLab(_input: CompileLabInput): AsyncIterable<CompilerEvent> {
    throw new CompilerSetupError("CODEX_DISABLED", this.reason);
  }

  async *repairLab(_input: RepairLabInput): AsyncIterable<CompilerEvent> {
    throw new CompilerSetupError("CODEX_DISABLED", this.reason);
  }

  async *compilePatch(_input: CompilePatchInput): AsyncIterable<CompilerEvent> {
    throw new CompilerSetupError("CODEX_DISABLED", this.reason);
  }
}
