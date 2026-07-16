CREATE UNIQUE INDEX replays_source_session_unique
  ON replays(source_session_id)
  WHERE source_session_id IS NOT NULL;

CREATE UNIQUE INDEX replays_object_key_unique
  ON replays(object_key)
  WHERE object_key IS NOT NULL;

CREATE TRIGGER replays_no_update
BEFORE UPDATE ON replays
BEGIN
  SELECT RAISE(ABORT, 'replays are immutable');
END;

CREATE TRIGGER replays_no_delete
BEFORE DELETE ON replays
BEGIN
  SELECT RAISE(ABORT, 'replays are immutable');
END;
