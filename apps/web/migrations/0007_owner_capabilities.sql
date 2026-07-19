CREATE TABLE artifact_capabilities (
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE RESTRICT,
  owner_token_hash TEXT NOT NULL CHECK (
    length(owner_token_hash) = 64
    AND owner_token_hash = lower(owner_token_hash)
    AND owner_token_hash NOT GLOB '*[^0-9a-f]*'
  ),
  policy_version TEXT NOT NULL CHECK (policy_version = 'owner-capability-v1'),
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (artifact_id, owner_token_hash)
) STRICT;

CREATE INDEX artifact_capabilities_active
  ON artifact_capabilities(artifact_id)
  WHERE revoked_at IS NULL;

CREATE TABLE session_capabilities (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE RESTRICT,
  owner_token_hash TEXT NOT NULL CHECK (
    length(owner_token_hash) = 64
    AND owner_token_hash = lower(owner_token_hash)
    AND owner_token_hash NOT GLOB '*[^0-9a-f]*'
  ),
  policy_version TEXT NOT NULL CHECK (policy_version = 'owner-capability-v1'),
  created_at TEXT NOT NULL,
  revoked_at TEXT
) STRICT;

CREATE INDEX session_capabilities_active
  ON session_capabilities(session_id)
  WHERE revoked_at IS NULL;

-- A pre-capability session has no secret that can be securely assigned to its
-- original browser. Retire those private locators instead of preserving the
-- old session-ID-as-bearer behavior. Public replay projections are independent.
CREATE TABLE legacy_session_retirements (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE RESTRICT,
  retired_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (
    reason = 'missing_owner_capability_at_v1_migration'
  )
) STRICT;

INSERT INTO legacy_session_retirements (session_id, retired_at, reason)
SELECT
  id,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  'missing_owner_capability_at_v1_migration'
FROM sessions;

CREATE TRIGGER legacy_session_retirements_no_update
BEFORE UPDATE ON legacy_session_retirements
BEGIN
  SELECT RAISE(ABORT, 'legacy session retirements are immutable');
END;

CREATE TRIGGER legacy_session_retirements_no_delete
BEFORE DELETE ON legacy_session_retirements
BEGIN
  SELECT RAISE(ABORT, 'legacy session retirements are immutable');
END;

CREATE TRIGGER session_capabilities_reject_retired_session
BEFORE INSERT ON session_capabilities
WHEN EXISTS (
  SELECT 1
  FROM legacy_session_retirements
  WHERE session_id = NEW.session_id
)
BEGIN
  SELECT RAISE(ABORT, 'legacy private session is retired');
END;
