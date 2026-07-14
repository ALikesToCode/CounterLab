CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_sha256 TEXT NOT NULL UNIQUE,
  manifest_json TEXT NOT NULL,
  object_key TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE RESTRICT,
  state TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  aggregate_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE evidence_events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_hash TEXT NOT NULL UNIQUE,
  event_json TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  UNIQUE (session_id, sequence)
) STRICT;

CREATE INDEX evidence_events_session_order
  ON evidence_events(session_id, sequence);

CREATE TABLE replays (
  replay_id TEXT PRIMARY KEY,
  source_session_id TEXT REFERENCES sessions(id) ON DELETE RESTRICT,
  metadata_json TEXT NOT NULL,
  event_chain_head TEXT NOT NULL,
  object_key TEXT,
  recorded_at TEXT NOT NULL
) STRICT;

CREATE TRIGGER evidence_events_no_update
BEFORE UPDATE ON evidence_events
BEGIN
  SELECT RAISE(ABORT, 'evidence events are append-only');
END;

CREATE TRIGGER evidence_events_no_delete
BEFORE DELETE ON evidence_events
BEGIN
  SELECT RAISE(ABORT, 'evidence events are append-only');
END;
