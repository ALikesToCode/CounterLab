ALTER TABLE runner_jobs ADD COLUMN request_purpose TEXT
  CHECK (
    request_purpose IS NULL OR request_purpose IN (
      'LAB_COMPILE',
      'LAB_RUN_AUTHORITATIVE',
      'LAB_RUN_INTERACTIVE',
      'PATCH_COMPILE'
    )
  );

ALTER TABLE runner_jobs ADD COLUMN request_fingerprint TEXT
  CHECK (
    request_fingerprint IS NULL OR (
      length(request_fingerprint) = 64
      AND request_fingerprint = lower(request_fingerprint)
      AND request_fingerprint NOT GLOB '*[^0-9a-f]*'
    )
  );

ALTER TABLE runner_jobs ADD COLUMN request_identity_json TEXT;

CREATE UNIQUE INDEX runner_jobs_reusable_request
  ON runner_jobs(request_fingerprint)
  WHERE request_fingerprint IS NOT NULL
    AND status IN (
      'QUEUED',
      'STARTING',
      'RUNNING',
      'AWAITING_APPROVAL',
      'REPAIRING',
      'VERIFIED'
    );

CREATE INDEX runner_jobs_request_history
  ON runner_jobs(request_fingerprint, created_at DESC);

CREATE UNIQUE INDEX runner_callback_receipts_one_per_job
  ON runner_callback_receipts(job_id);
