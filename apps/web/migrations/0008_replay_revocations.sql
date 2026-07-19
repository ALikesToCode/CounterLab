-- A share-safe projection cannot be reconstructed from the private Capsule
-- metadata stored by earlier releases. Fail the migration before changing
-- replay visibility when legacy rows exist; those rows require an explicit,
-- evidence-reviewed projection migration.
CREATE TABLE replay_projection_migration_guard (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  existing_replay_count INTEGER NOT NULL CHECK (existing_replay_count = 0)
) STRICT;

INSERT INTO replay_projection_migration_guard
  (singleton, existing_replay_count)
SELECT 1, COUNT(*) FROM replays;

CREATE TABLE replay_revocations (
  event_id TEXT PRIMARY KEY,
  replay_id TEXT NOT NULL UNIQUE REFERENCES replays(replay_id) ON DELETE RESTRICT,
  revoked_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason = 'owner_requested')
) STRICT;

CREATE TRIGGER replay_revocations_no_update
BEFORE UPDATE ON replay_revocations
BEGIN
  SELECT RAISE(ABORT, 'replay revocations are append-only');
END;

CREATE TABLE public_replay_projections (
  replay_id TEXT PRIMARY KEY REFERENCES replays(replay_id) ON DELETE RESTRICT,
  projection_hash TEXT NOT NULL CHECK (
    length(projection_hash) = 64
    AND projection_hash = lower(projection_hash)
    AND projection_hash NOT GLOB '*[^0-9a-f]*'
  ),
  bytes_hash TEXT NOT NULL CHECK (
    length(bytes_hash) = 64
    AND bytes_hash = lower(bytes_hash)
    AND bytes_hash NOT GLOB '*[^0-9a-f]*'
  ),
  object_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
) STRICT;

CREATE TRIGGER public_replay_projections_no_update
BEFORE UPDATE ON public_replay_projections
BEGIN
  SELECT RAISE(ABORT, 'public replay projections are immutable');
END;

CREATE TRIGGER public_replay_projections_no_delete
BEFORE DELETE ON public_replay_projections
BEGIN
  SELECT RAISE(ABORT, 'public replay projections are immutable');
END;

CREATE TRIGGER replay_revocations_no_delete
BEFORE DELETE ON replay_revocations
BEGIN
  SELECT RAISE(ABORT, 'replay revocations are append-only');
END;
