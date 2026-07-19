# Final repository drift check

Checked at synthesis after the shared branch advanced.

- Earlier red-team checkpoint: `087f3cfd282cd185cabbdbbefea3546b8d87db66`.
- Final repository checkpoint: `dd451c77606ec270cfba030784df50cb3aa19969`.
- Current history count: 362 commits.
- Intervening commits: `e1caeb4` (confine qualification workspaces), `56e955b` and `c12c8dc` (frontend/design documentation checkpoints), `dd451c7` (contained BuildKit source-bound build).

The delta changed release scripts/tests, design/CSS, README/Progress/Decisions, and added `docs/FRONTEND_MAP.md`. It did not change `apps/web/src/App.tsx`, `apps/web/src/features/judge/JudgeModeView.tsx`, `apps/web/worker/api.ts`, `services/hosted-runner/src/launch-boundary.ts`, `packages/codex-client/src/app-server.ts`, `Dockerfile.runner`, or `docs/DEVPOST_COPY.md`.

Relevant final Git object hashes:

- `apps/web/src/App.tsx`: `bc7a8e4e15175717b64eb2671a20a998ff0e5427`
- `apps/web/src/features/judge/JudgeModeView.tsx`: `910c0981fc254f14ae963f98a870d8dbfdbfe770`
- `apps/web/worker/api.ts`: `60496eebe222244eb11fdfd3d936e087c8a38e45`
- `services/hosted-runner/src/launch-boundary.ts`: `7db777b46b20599f9546024652a88791870d4bf4`
- `packages/codex-client/src/app-server.ts`: `37d1d72fa7cd90ed2f65723060178b73673aafd1`
- `Dockerfile.runner`: `a0fbd171be51ce8c7cff8162af539447da029307`
- `README.md`: `baff930f31deecf79f4cdc11c074e043fefb8195`
- `docs/DEVPOST_COPY.md`: `e6528776f7cbfc4cc13b5b599516eb3f30c74fbe`

The release delta strengthens repository-containment and source-bound build machinery but does not contain an executed build receipt, Container digest, Worker 82 source binding, or exact current production journey matrix. Therefore CL-002 remains open. Design/CSS changes are not assumed deployed: the final public Chromium recheck still loaded `/assets/index-Bf0xU---.js` and remained healthy.

The final worktree retained unrelated/concurrent modified SBOM and scientific-engine evidence plus untracked `data/` and `docs/a/`. The audit did not alter or clean them.
