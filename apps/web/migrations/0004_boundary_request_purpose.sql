ALTER TABLE runner_jobs RENAME COLUMN request_purpose TO request_purpose_v1;

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

UPDATE runner_jobs
SET request_purpose = request_purpose_v1
WHERE request_purpose_v1 IS NOT NULL;

ALTER TABLE runner_jobs DROP COLUMN request_purpose_v1;
