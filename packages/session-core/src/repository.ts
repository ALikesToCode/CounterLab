import type { CounterLabSession, EvidenceEvent } from "./domain.js";

export interface SessionRepository {
  create(session: CounterLabSession, firstEvent: EvidenceEvent): Promise<void>;
  find(sessionId: string): Promise<CounterLabSession | undefined>;
  save(
    session: CounterLabSession,
    expectedVersion: number,
    event: EvidenceEvent,
  ): Promise<void>;
  listEvents(sessionId: string): Promise<EvidenceEvent[]>;
  lastEvent(sessionId: string): Promise<EvidenceEvent | undefined>;
  close(): void;
}
