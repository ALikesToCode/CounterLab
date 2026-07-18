CREATE TABLE learner_interactions (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  event_kind TEXT NOT NULL CHECK (event_kind IN (
    'stage.entered',
    'stage.completed',
    'prediction.recorded',
    'hint.opened',
    'boundary_hunt.classified',
    'revision.recorded',
    'transfer.evaluated',
    'patch.downloaded',
    'proof_capsule.downloaded'
  )),
  stage TEXT NOT NULL CHECK (stage IN (
    'question', 'prediction', 'test', 'boundary', 'apply', 'repair'
  )),
  mode TEXT NOT NULL CHECK (mode IN (
    'sample_lesson', 'live_notebook', 'verified_replay', 'guided_lab', 'challenge'
  )),
  concept TEXT NOT NULL CHECK (concept IN (
    'entity_leakage', 'class_imbalance', 'unresolved'
  )),
  event_json TEXT NOT NULL CHECK (json_valid(event_json)),
  timestamp TEXT NOT NULL
) STRICT;

CREATE INDEX learner_interactions_session_time
  ON learner_interactions(session_id, timestamp, event_id);

CREATE TRIGGER learner_interactions_no_update
BEFORE UPDATE ON learner_interactions
BEGIN
  SELECT RAISE(ABORT, 'learner interactions are append-only');
END;

CREATE TRIGGER learner_interactions_no_delete
BEFORE DELETE ON learner_interactions
BEGIN
  SELECT RAISE(ABORT, 'learner interactions are append-only');
END;
