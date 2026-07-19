# Public API and deployment baseline

Observed read-only at `2026-07-18T18:57:27Z`–`2026-07-18T18:59:06Z`.

## Deployment identity

- Worker script: `counterlab`
- Cloudflare deployment: `dad4cd71-3dcd-4b00-a1b6-d16068d53c81`
- Worker version: `bef5edb7-6a76-4c72-94be-fcb2b94e668d` (version number `82`)
- Traffic: `100%`
- Deployment created: `2026-07-18T18:12:53.84457Z`
- Deployment source: Wrangler upload
- Public hostname: `https://counterlab.cserules.workers.dev`
- Source commit: not exposed by the deployment metadata inspected in this audit

This deployment is newer than the production identifiers named in `README.md`, `docs/PROGRESS.md`, and `docs/PRODUCTION_SMOKE.json`. Those older smoke records cannot be treated as exact-version evidence for Worker version 82.

## `GET /ready`

- HTTP status: `200`
- Cache policy: `no-store`
- JSON service: `counterlab-control-plane`
- JSON status: `ready`
- Checks reported `true`: analyst, persistence, private storage, runner, signing
- Cloudflare request region: `MRS`

## `GET /api/health`

- HTTP status: `200`
- Cache policy: `no-store`
- Security headers observed: restrictive CSP (`default-src 'none'`, `frame-ancestors 'none'`), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
- Platform: `cloudflare-workers`
- Sample: `available`
- Replay: `available`
- GPT, Codex, kernel, and sandbox: all reported `configured`

These responses prove configuration/readiness reporting, not a completed live notebook journey.

### API timing sample

Five sequential, low-rate `GET /api/health` requests from the audit environment completed in `0.4075`, `0.4081`, `0.4158`, `0.3852`, and `0.3906` seconds. Median total time was approximately `0.4075 s`; observed range was `0.3852–0.4158 s`. These are control-plane API timings, not browser Core Web Vitals or notebook-runner latency.

## Public replay

- `GET /api/replays/leakage-01`: `200`, replay timestamp `2026-07-14T11:50:37.947Z`, verified patch metadata present.
- The legacy replay payload has no explicit `mode` property and no Proof Capsule property.
- `GET /api/replays/leakage-01/proof-capsule`: `404 REPLAY_NOT_FOUND`.
- Current source copy explicitly describes this as a legacy v1 replay without a Proof Capsule download; the 404 is therefore a capability boundary, not by itself a defect.

## Safety scope

Only public, read-only API and Cloudflare deployment-metadata requests were made. No session, artifact, job, database row, object, secret, or deployment was created or changed.

## HTML route header check

Read-only `HEAD` requests to `/` and `/judge` both returned `200`, `Content-Type: text/html`, and `Cache-Control: public, max-age=0, must-revalidate`. Neither response exposed a Content Security Policy, frame-ancestor/X-Frame-Options protection, Referrer-Policy, X-Content-Type-Options, Permissions-Policy, or HSTS header. API routes do set several of these headers. This establishes a production response-header gap without downloading or rendering page content.
