ALTER TABLE runner_jobs DROP COLUMN request_purpose;

ALTER TABLE runner_jobs ADD COLUMN request_purpose TEXT
  CHECK (
    request_purpose IS NULL OR request_purpose IN (
      'LAB_COMPILE',
      'LAB_RUN_AUTHORITATIVE',
      'LAB_RUN_INTERACTIVE',
      'LAB_RUN_BOUNDARY',
      'PATCH_COMPILE'
    )
  );
