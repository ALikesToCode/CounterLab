CREATE TABLE runner_jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (
    kind IN (
      'BELIEF_ANALYSIS',
      'LAB_COMPILE',
      'LAB_VERIFY',
      'LAB_RUN',
      'PATCH_COMPILE',
      'PATCH_VERIFY'
    )
  ),
  status TEXT NOT NULL CHECK (
    status IN (
      'QUEUED',
      'STARTING',
      'RUNNING',
      'AWAITING_APPROVAL',
      'REPAIRING',
      'VERIFIED',
      'REJECTED',
      'FAILED',
      'CANCELLED',
      'TIMED_OUT'
    )
  ),
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE RESTRICT,
  artifact_manifest_hash TEXT NOT NULL,
  concept_pack_id TEXT NOT NULL,
  concept_pack_version TEXT NOT NULL,
  state_version INTEGER NOT NULL CHECK (state_version > 0),
  version INTEGER NOT NULL CHECK (version > 0),
  event_cursor INTEGER NOT NULL DEFAULT 0 CHECK (event_cursor >= 0),
  job_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX runner_jobs_session_created
  ON runner_jobs(session_id, created_at DESC);

CREATE INDEX runner_jobs_status_updated
  ON runner_jobs(status, updated_at);

CREATE TABLE runner_public_events (
  event_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES runner_jobs(id) ON DELETE RESTRICT,
  cursor INTEGER NOT NULL CHECK (cursor > 0),
  kind TEXT NOT NULL,
  event_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  UNIQUE (job_id, cursor)
) STRICT;

CREATE INDEX runner_public_events_cursor
  ON runner_public_events(job_id, cursor);

CREATE TABLE runner_callback_receipts (
  idempotency_key TEXT PRIMARY KEY,
  callback_id TEXT NOT NULL UNIQUE,
  job_id TEXT NOT NULL REFERENCES runner_jobs(id) ON DELETE RESTRICT,
  callback_json TEXT NOT NULL,
  received_at TEXT NOT NULL
) STRICT;

CREATE INDEX runner_callback_receipts_job
  ON runner_callback_receipts(job_id, received_at);

CREATE TRIGGER runner_public_events_no_update
BEFORE UPDATE ON runner_public_events
BEGIN
  SELECT RAISE(ABORT, 'runner public events are append-only');
END;

CREATE TRIGGER runner_public_events_no_delete
BEFORE DELETE ON runner_public_events
BEGIN
  SELECT RAISE(ABORT, 'runner public events are append-only');
END;

CREATE TRIGGER runner_callback_receipts_no_update
BEFORE UPDATE ON runner_callback_receipts
BEGIN
  SELECT RAISE(ABORT, 'runner callback receipts are append-only');
END;

CREATE TRIGGER runner_callback_receipts_no_delete
BEFORE DELETE ON runner_callback_receipts
BEGIN
  SELECT RAISE(ABORT, 'runner callback receipts are append-only');
END;
