-- Public replay expiry is access authority only. Expiry disables playback but
-- never deletes the immutable replay, projection, Capsule, or evidence rows.
CREATE TABLE public_replay_lifecycles (
  replay_id TEXT PRIMARY KEY REFERENCES replays(replay_id) ON DELETE RESTRICT,
  published_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  policy_version TEXT NOT NULL CHECK (
    policy_version = 'public-replay-expiry-v1'
  ),
  CHECK (expires_at > published_at)
) STRICT;

-- Existing reviewed public projections receive a fresh 30-day migration grace
-- window. Their scientific recorded_at timestamp remains unchanged.
INSERT INTO public_replay_lifecycles (
  replay_id,
  published_at,
  expires_at,
  policy_version
)
SELECT
  replay_id,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days'),
  'public-replay-expiry-v1'
FROM public_replay_projections;

CREATE INDEX public_replay_lifecycles_expiry
  ON public_replay_lifecycles(expires_at);

CREATE TRIGGER public_replay_lifecycles_no_update
BEFORE UPDATE ON public_replay_lifecycles
BEGIN
  SELECT RAISE(ABORT, 'public replay lifecycles are immutable');
END;

CREATE TRIGGER public_replay_lifecycles_no_delete
BEFORE DELETE ON public_replay_lifecycles
BEGIN
  SELECT RAISE(ABORT, 'public replay lifecycles are immutable');
END;
