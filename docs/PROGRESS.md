# Progress

Updated: 2026-07-20

## Active v6.1 release board

This is the live execution ledger for `feat/learner-ux-v6.1`. It is updated at
each material test, qualification, deployment, and integration gate. Statuses
mean exactly `PASS`, `FAIL`, `IN PROGRESS`, `BLOCKED`, or `NOT RUN`; a local
pass is never presented as a browser or production pass.

### Current checkpoint

- **Branch:** `feat/learner-ux-v6.1`
- **Current product checkpoint:**
  `134c22ff21afefb82c4e1bf0a51357254ca9a306`. The owner partitioned the
  preserved integration delta into nine commits and fast-forwarded both
  `feat/learner-ux-v6.1` and `main` to this candidate before qualification. The
  lead switched back to the feature branch for small independent fix-forward
  commits; the existing `main` ref is an unqualified candidate, not release
  evidence. At `2026-07-20T19:33:40Z`, 28 hours, 26 minutes, and 20 seconds
  remained. Current local source verification passes web Vitest **605/605**,
  repository/web/Worker strict TypeScript, and the expanded Python matrix
  **323/324**; the sole Python failure is denied localhost socket creation in
  the managed sandbox. Root Vitest passes **619/646**; 24 failures are denied
  process/socket/sandbox capabilities and three are stale scientific-evidence
  expectations. The source-bound SBOM and scientific manifests still name
  source `6f551367`, not this checkpoint, so qualification and deployment are
  prohibited until the final source freezes and all evidence is regenerated.
  No current CloakBrowser journey, exact image, qualification receipt,
  deployment, production smoke, learner observation, Devpost publication, or
  submission receipt is inferred.
- **Finish-command starting checkpoint:** committed `HEAD`
  `24262ea6f40e988d7be054bdba6f531531b1679f` plus the explicitly preserved
  dirty slices listed by `git status`. At `2026-07-19T15:18:04Z`, the
  `2026-07-22T00:00:00Z` deadline was 56 hours, 41 minutes, and 56 seconds
  away. No current source, image, Worker, browser, learner, Devpost, or
  submission qualification is inferred from the older public Worker.
- **Containment implementation checkpoint:**
  `863a2a8257aae604b238f8e44d3db1bc0cdf1fcd`. The next source-bound build
  was made from documentation checkpoint
  `184b43796b382094de32a8d2f733d9fd232dab32` and records that identity in its
  receipt. A second exact build from
  `cf6108e306e43fb4dd270dfdcc1317f2e508aeda` followed after preserving the
  concurrent screenshot set. That build is now also superseded as the release
  candidate because a further concurrent visual/generative-UI audit document
  appeared before evidence refresh. After that audit was fully preserved,
  source `fcd69a8bffff0f8f8c90f0e16b6fb4cebd6e39dc` produced a third exact
  image. Its first evidence refresh exposed a fail-closed containerd transfer
  configuration defect; the image remains retained but is superseded by the
  reviewed runtime-import repair. Source
  `6e6081add5e7675b16bdc136bc11288a9ebb8905` then produced a fourth exact
  image; its refresh passed import and exposed a separate fail-closed OCI tar
  compatibility defect. Commit
  `27d1f96bcd565c94178cc4fffbecbba9ae63560e` contains that repair and produced
  the fifth exact image. Its refresh passed import, Syft, Node/container SBOM,
  and Grype scanning before exposing an obsolete tagged-image identity
  assumption. Commit
  `e73494d2518060a76786a83cf61f256bcbcd22ae` contains the replacement
  untagged-OCI identity gate. Source
  `41394afd7aa102bc91f3cce0700a20c0f9722537` then built successfully in
  fresh runtime `rt-v61-0719p`: runner config digest
  `sha256:fdba354f631a38fa3e0775789cd6ac871430dc309bae43bbde6ce1bfdedc81cd`,
  normalized manifest
  `sha256:26cf61f40bc7a22de58ccb884ba1d69933c7cc96f4d877e10c06f8935451b55c`,
  and adapter digest
  `sha256:818a42278b66f4bce0d18b62e7a883cab751ed7cf547ed78d180c1f4315edbbd`.
  Its refresh imported the image, generated both SBOMs, hydrated the pinned
  Grype database, scanned 129 packages, and prepared source-bound VEX before
  nerdctl 2.3.1 rejected Docker's `--ipc=none`. The reviewed repair uses the
  explicit isolated nerdctl namespace `--ipc=private`; because the validator is
  attested, the old runtime, build, and partial refresh are retained but cannot
  be qualified. Source `74d60a70402a8a9a057f33f3efe6f2ac828fd2ae` then built
  in fresh runtime `rt-v61-0719q`: runner config digest
  `sha256:001791d2bbbff8e682d549c9eb09979c3bc16936eabb3db69c8f6bd700316dce`,
  normalized manifest
  `sha256:fb225ad3071513bd4bd8f60273b08aedf23dc8f176f8290af14087f3597958ea`,
  and adapter digest
  `sha256:0dea7e966d48c364d542f4086b7b70433a588b143e9f92bfeeb3628ff104c4e3`.
  Its refresh passed import, SBOM generation, Grype, and VEX preparation, then
  exposed nerdctl 2.3.1's separate client-side hardcoded
  `/run/containerd/fifo` path. The reviewed repair retains nerdctl for exact
  OCI-spec creation and uses pinned containerd `ctr --fifo-dir` only to start
  the validated task against an attested repository path. Runtime
  `rt-v61-0719q` is stopped and ineligible because its helper hashes predate
  this repair; a fresh runtime and exact rebuild remain required.
  Commits `8ce4b6f` and `24262ea` subsequently contained runc state and the
  BuildKit OTEL socket. Fresh runtime `rt-v61-0719x` reached a real runner
  start and then failed closed when the rootless host denied creation of
  `/sys/fs/cgroup/counterlab-v6.1`; adding runc rootless mode in
  `rt-v61-0719y` did not remove the OCI `cgroupsPath`. Pinned containerd and
  nerdctl documentation and local CLI help confirm that this host has no
  delegated cgroup v2 authority. The current reviewed implementation stages an
  independently validated nerdctl spec, verifies the requested aggregate
  intent and five OCI rlimits, removes only `linux.cgroupsPath` and
  `linux.resources`, records pre/post hashes, and invokes pinned
  `ctr run --config ... --cgroup "" --rm`. It explicitly does **not** claim
  local cgroup enforcement. Runtime `rt-v61-0719z` attested this helper set,
  imported the retained `74d60a7...` runner archive, and failed closed on the
  first strict container-metadata binding before runc. Successive diagnostic
  sessions `rt-v61-0719aa` through `rt-v61-0719ac` established the canonical
  image name, OCI 1.3 shape, and optional empty ambient-capability behavior;
  none is qualified. An independent runtime-security review then found that
  mutable-tag execution, unchecked OCI hooks/process/mount/Linux fields,
  deletion before ownership proof, config-only persistence verification, and
  competing timeout owners still blocked release. The active uncommitted
  repair authenticates target/index/manifest/config bytes, uses a random
  invocation-specific image alias, compares the generated process and mounts
  to authenticated command intent, denies unknown OCI authority, requires a
  default-deny seccomp posture and the six standard devices, labels staging
  and final containers, refuses ambiguous cleanup, and hash-binds both config
  and receipt before and after execution. No successful real execution of this
  repaired lifecycle is claimed yet.
- **Continuation starting commit:**
  `dd451c77606ec270cfba030784df50cb3aa19969`
- **Repository boundary:** physical root
  `/home/mysterious/storage/github/CounterLab`; root marker present; all active
  build, scan, and browser state is required to remain inside the repository.
- **Post-audit-preservation working tree:** the concurrent screenshot set and
  the complete visual/generative-UI audit addendum are preserved in reviewed
  documentation commits. Exactly 25 scientific-engine and SBOM paths remain
  intentionally dirty as one coherent older generated snapshot. The failed
  `41394afd...` refresh did not replace those tracked files; its zero-byte
  reachability output and incomplete scan artifacts remain only in a unique
  ignored repository-contained staging directory. Those tracked evidence paths
  must be regenerated against the next exact source commit and image; no stale
  evidence, partial staging file, audit file, or ignored stock-browser capture
  may be folded silently into qualified evidence.
- **Integration rule:** commit source tooling first, build and qualify that
  exact commit, commit its generated evidence separately, deploy only the
  qualified image, then fast-forward this branch into `main` after every
  required gate is recorded.

### Live commander update — 2026-07-19T20:15:29Z

- **Deadline:** 51 hours, 44 minutes, and 31 seconds remained before
  `2026-07-22T00:00:00Z` at this checkpoint.
- **Contained runtime source:** the active repair now validates all 16 exact
  nerdctl annotations and both exact lifecycle hooks before removing them from
  the final direct-`ctr` spec. It authenticates the observed alias-expanded
  nerdctl v2.3.1 hook arguments and environment, pins requested mounts to the
  recovered read-only/default-writable shapes, and rejects extra authority.
- **Internal `/etc` lifetime:** the three nerdctl-generated files are accepted
  only from their exact state-store paths and exact original bind shape, read
  through no-follow descriptors, content-hashed, copied into a private
  invocation-owned bundle before staging cleanup, rebound
  `ro,nodev,noexec,nosuid`, and rehashed before and after execution. The file
  contents, sanitized config, receipt, and final container identity are bound
  together. The repository filesystem reports every regular file as mode
  `0700` even after `chmod 0644`; real non-root readability therefore remains
  an observed-runtime gate rather than a claimed static pass.
- **Real fail-closed sentinels:** `rt-v61-0720g` rejected the previously
  unvalidated hook set; `rt-v61-0720h` rejected the first incomplete exact hook
  vector; `rt-v61-0720i` imported the retained exact adapter OCI in 415.3
  seconds, passed hook and internal-file validation, and then rejected the
  fixture-invented writable `rw` bind mode. All three released no result.
  Forensic recovery proved the exact pinned writable shape omits `rw` and all
  requested binds include `nodev,nosuid`. That source and fixture mismatch is
  repaired. Fresh attested runtime `rt-v61-0720j` is active and importing the
  same exact archive for the next sentinel; no success is claimed yet.
- **Focused verification:** `scripts/contained-runtime.test.ts` passes 1 file,
  30 tests after adding the exact default-writable mount regression. The prior
  focused Python Docker/host/kernel set remains 31/31 at its named earlier
  checkpoint and must be rerun after this runtime slice freezes.
- **Review graph:** the critical dependency remains runtime sentinel → source
  freeze → exact image/evidence regeneration → qualification → contained
  Cloudflare identity and D1 preflight → deploy → public CloakBrowser journeys
  → submission evidence → fast-forward merge to `main`. Review also identified
  later hardening for command-specific absence proofs, create-timeout orphan
  recovery, exact seccomp profile pinning, cross-language timeout-policy
  mutation tests, and a host execution receipt. These are open and are not
  silently treated as production passes.
- **Cloud/browser/submission truth:** contained Wrangler identity, the
  production replay-count preflight, deployment, CloakBrowser journeys,
  Devpost submission, public video, and learner study remain not run or
  externally unverified. Learner evidence remains `NO_DATA`.
- **Safety incident:** one read-only diagnostic accidentally expanded the
  default Go module-cache path through command substitution and attempted an
  out-of-repository source lookup. It returned no external file contents,
  changed nothing, and was stopped from recurrence. All later pinned-source
  reads use the ignored repository-contained Go module cache and literal
  repository paths. This is a process failure, not a repository mutation.

### Live commander update — 2026-07-19T21:32:20Z

- **Deadline:** 50 hours, 27 minutes, and 40 seconds remained before
  `2026-07-22T00:00:00Z` at this checkpoint.
- **Pinned containerd semantics:** current official containerd documentation
  and the repository-contained pinned v2.3.1 source confirm that
  `ctr run --config FILE ID` takes no image argument, config-mode execution
  derives its rootfs from the validated OCI config, and `ctr images mount --rw`
  uses its target as both lease ID and snapshot key. The runtime now validates
  that mount output against the authenticated image rootfs chain, persists an
  absolute read-only OCI root, and removes only the invocation-owned mount,
  lease, snapshot, and alias after execution. A pre-existing snapshot named for
  the final container ID is treated as contamination and is never deleted.
- **Deterministic execution binding:** the sanitized runtime spec strips
  nerdctl annotations, hashes that annotation-free base, then adds only the
  exact base-spec hash and invocation annotations that `ctr run` also receives
  as labels. Persisted verification recomputes both base and final hashes.
  Runtime receipt schema is `3`, and the final-container identity uses the
  `counterlab-rootless-v3` domain. Browser-visible result authority remains
  unchanged.
- **Real sentinels:** `rt-v61-0720m` failed under the sandbox when rootless
  `newuidmap` capabilities were unavailable. Escalated `rt-v61-0720n` reached
  `runc` and proved that a read-only image view could not create required
  mountpoints. Writable snapshot sentinels `rt-v61-0720o` and
  `rt-v61-0720p` then timed out at 5 and 90 seconds respectively without
  releasing a result. Fresh `rt-v61-0720q` authenticated exact runner image
  `sha256:9132170251a874813dab1d3c568665d2a0fe99edbe6964138950856c29fdf9ce`,
  materialized its writable snapshot, and reached process execution. It failed
  closed because `/usr/local/bin/node` in the image was mode `0700`, so the
  declared `10001:10001` user received `permission denied`. The runtime was
  stopped, no result was released, and no deployment is claimed.
- **Non-root image repair:** a new deployment-config regression failed exactly
  on the missing executable hardening while the other 15 tests passed.
  `Dockerfile.runner` now sets `/usr/local/bin/node` to mode `0555` and verifies
  it before creating the final non-root image. The focused file now passes all
  16 tests. A rebuilt exact-image startup sentinel remains mandatory before
  this source change can be called qualified.
- **Focused verification:** contained-runtime Vitest passes 1 file/30 tests;
  Docker/host-pipeline/kernel-verifier Pytest passes 31/31 with the required
  `PYTHONPATH`; Node syntax checks pass for all three runtime helpers; focused
  Prettier and Git whitespace checks pass. The first Pytest invocation omitted
  `PYTHONPATH` and failed collection with three `ModuleNotFoundError` errors;
  the corrected invocation is the reported 31/31 pass. The first
  deployment-config invocation used a root-relative Vitest filter and found no
  files; the config-relative invocation produced the intentional red test and
  then the 16/16 green result.
- **Expanded verification:** current Web Vitest passes 65 files/442 tests;
  combined kernel and runner Pytest passes 241/241 when local loopback is
  permitted; repository, Web, and Worker strict TypeScript all pass. The
  unsandboxed root Vitest run passes 44 files/533 tests and fails 2 files/3
  tests, all in the deliberately stale scientific-engine/SBOM/integrity
  evidence that must be regenerated after the exact source and image freeze.
  The first sandboxed root run failed 27/536 because loopback, bubblewrap
  netlink, and child-process behavior were denied in addition to the three
  stale-evidence failures. The first broad Python command omitted the repository
  root from `PYTHONPATH` and failed collection twice; the corrected sandboxed
  run passed 240 tests with one loopback denial before the complete 241/241
  authorized rerun.
- **Safety disclosure:** one pinned-source search used a read-only stderr
  redirect to `/dev/null`, contrary to this repository's absolute filesystem
  scope rule. It did not modify external state or reveal external content and
  has not been repeated. Logical shell `$PWD` also reported the legacy symlinked
  checkout name; every command is now anchored by the verified physical root
  `/home/mysterious/storage/github/CounterLab` and uses `login:false`.
- **Next hard gate:** review and commit only this runtime/image slice, rebuild
  from that exact clean source commit, pass startup plus timeout-cleanup
  sentinels, regenerate all source/image-bound evidence, qualify the tuple,
  then perform contained Wrangler identity and read-only D1 preflight. Public
  deploy, CloakBrowser journeys, learner evidence, Devpost, video, submission,
  and merge to `main` remain open.

### Live commander update — 2026-07-19T21:50:36Z

- **Deadline:** 50 hours, 9 minutes, and 24 seconds remained before
  `2026-07-22T00:00:00Z` at this checkpoint.
- **Cloudflare Container readiness:** the old dispatcher returned `true`
  without starting a Container. The active test-first repair now starts a
  digest-named readiness instance with the exact production entrypoint and
  bounded environment, fetches `/ready`, requires an exact four-field schema,
  and compares the runner's source commit and image digest with the Worker's
  qualified release identity. Startup, HTTP, schema, stale-source, and
  stale-image failures release no readiness. Focused Worker tests pass 2
  files/19 tests, hosted-runner HTTP tests pass 1 file/6 tests, and
  hosted-runner TypeScript passes. The first hosted HTTP run was denied only by
  the managed sandbox's loopback policy and passed unchanged with local
  loopback authorization. One attempted script name, `typecheck:worker`, does
  not exist; the real Web typecheck gate remains queued and this invocation is
  not counted as a product failure.
- **Independent runtime review:** 3 P0 and 4 P1 release blockers remain. The
  Python runner still accepts a caller-selected marker root; aggregate memory
  and process isolation are not enforced even though downstream evidence can
  say `VERIFIED`; trusted read-only mounts and the writable active snapshot are
  not byte/diff-bound; cleanup ownership/retry is incomplete; image manifest
  layer validation is incomplete; ordinary release-critical execution does not
  require pre/post attestation; and the generic Docker timeout fallback removes
  a named container without an invocation ownership check. These findings are
  open gates, not production-closed issues.
- **Immediate order:** add characterization tests and repair fixed-root and
  fail-closed resource authority first; bind trusted mount/snapshot content;
  repair cleanup, manifest, and attestation semantics; rerun the real non-root
  and timeout sentinels; then harden deployment rollback and receipt freshness
  before freezing the source commit. Exact build, scientific evidence,
  Cloudflare promotion, public journeys, submission, and merge remain pending.

### Live commander update — 2026-07-19T22:10:25Z

- **Deadline:** 49 hours, 49 minutes, and 35 seconds remained before
  `2026-07-22T00:00:00Z` at this checkpoint.
- **Dependency graph:** the repository graph was incrementally refreshed from
  the dirty working tree with no errors. It indexes 432 files, 4,145 nodes,
  and 69,229 edges across TypeScript, TSX, Python, JavaScript, SQL, and shell;
  the active change risk is `medium`, concentrated in runner containment and
  scientific-evidence flows.
- **Fixed repository authority:** Python runner entrypoints now derive one
  exact physical checkout root, reject alternate or relative marker roots,
  reject symlink escapes, require run/artifact paths beneath that root, and
  accept only the registered public leakage fixture. The initial
  characterization test proved the old fake-marker acceptance; the repaired
  Docker runner suite passed 19/19 before two additional negative cases were
  added. The expanded file must be rerun before this slice is closed.
- **Byte-bound release inputs:** scientific verification no longer requests a
  read-only mount of the entire repository. It mounts exactly three required
  inputs; reachability mounts exactly four. The active image-authority repair
  validates OCI manifest layer descriptors/count and recursively hashes every
  requested read-only file/directory, rejecting symlinks and changes during
  capture. The command validator accepts only the exact mount/destination
  matrix. Focused contained-runtime Vitest now passes 1 file/32 tests. Receipt,
  final-ID, pre/post execution, and writable-snapshot binding remain in
  progress, so this is not yet a qualified runtime.
- **Sample claim boundary:** the approved fixed-sample analyst now rejects any
  learner claim that is not exactly the canonical sample question with typed
  `INVALID_INPUT`; the canonical path remains deterministic. Focused belief
  analyst Vitest passes 1 file/41 tests. MB-048 is source-closed by this test,
  while browser and production proof remain not run.
- **Release truth:** no new image was built, no Cloudflare resource was
  changed, no browser journey was executed, and no deployment or submission is
  claimed at this checkpoint.

### Live commander update — 2026-07-19T22:28:32Z

- **Deadline:** 49 hours, 31 minutes, and 28 seconds remained before
  `2026-07-22T00:00:00Z` at this checkpoint.
- **Narrow mount authority:** both scientific release scripts now request only
  the exact read-only inputs accepted by the contained command policy. Runtime
  verification receives its verifier, runner dependency lock, and scientific
  engine evidence; reachability receives its probe, public fixtures, notebook
  fixtures, and one source-bound review file. Neither command mounts the
  repository root.
- **Runtime identity and cleanup:** rootless receipt schema v4 now binds the
  canonical read-only mount manifest and ordered OCI layer digests into the
  final container identity. The runtime verifies those bytes before and after
  execution, compares the active snapshot diff, proves the expected parent
  chain before cleanup, and retries owned cleanup after a first failure.
  Generic Docker timeout cleanup now verifies an invocation label and exact
  container ID before kill/removal. These controls are locally tested but do
  not eliminate the host-writer race without an immutable input snapshot.
- **Focused verification:** contained-runtime Vitest passes 1 file/33 tests;
  Worker deployment-configuration Vitest passes 1 file/16 tests; Python Docker
  runner Pytest passes 1 file/22 tests; belief analyst Vitest passes 1 file/41
  tests. Shell syntax, Node syntax, and scoped Git whitespace checks pass.
- **Open P0:** current rootless evidence still describes per-process rlimits,
  not proven aggregate memory/process containment. No successful rebuilt
  exact-image sentinel, evidence refresh, registry qualification, Cloudflare
  mutation, CloakBrowser journey, Devpost submission, learner outcome, or merge
  is claimed.

### Live commander update — 2026-07-19T22:46:41Z

- **Deadline:** 49 hours, 13 minutes, and 19 seconds remained before
  `2026-07-22T00:00:00Z` at this checkpoint.
- **Result-release fail closure:** the hosted compile/verify pipeline now rejects
  an execution record unless exact public mounts, all five named limits, and
  aggregate limit authority are all proven. That rejection occurs before the
  fixture is read or the fixed kernel is invoked; a monkeypatched regression
  proves the kernel receives zero calls for scoped-only evidence.
- **Resource evidence vocabulary:** the frozen verifier retains compatibility
  with historical aggregate evidence while explicitly reporting current
  rootless `RLIMIT_AS`, real-UID process count, and host postconditions as
  scoped enforcement with an aggregate-enforcement limitation. It no longer
  describes those controls as container-wide cgroup authority.
- **Exact deployment identity:** deployment config generation now rejects
  unknown Container/SSH fields and emits only the reviewed digest-bound
  Container keys. Deployment receipt selection derives the immutable image
  from the qualified registry repository plus qualified digest, requires the
  fixed Container name, and rejects missing, duplicate, or caller-substituted
  active Containers.
- **Focused verification:** combined Python Docker, host-pipeline, and frozen
  verifier Pytest passes 36/36; deployment-receipt plus contained-runtime
  Vitest passes 35/35; Worker deployment-config Vitest passes 16/16; repository,
  web, and Worker strict TypeScript pass.
- **Release truth:** safe rollout rollback semantics and post-readiness status
  recapture remain in progress. No new image, Cloudflare mutation,
  CloakBrowser journey, deployment, submission, learner outcome, or merge is
  claimed.

### Live commander update — 2026-07-19T22:55:47Z

- **Deadline:** 49 hours, 4 minutes, and 13 seconds remained before
  `2026-07-22T00:00:00Z` at this checkpoint.
- **Release-bound maintenance:** maintenance and Container-rollout Worker
  versions now use the same required `git-<evidence-commit>` tag as the final
  Worker. Each version is captured from Wrangler output, polled until it owns
  100 percent traffic, and matched by the public health/readiness response.
- **Safe recovery state machine:** before any migration the exact prior Worker
  is the recovery target; after a migration starts or Container rollout starts,
  only the exact release-bound maintenance Worker is eligible. The policy is a
  typed executable module with mutation-phase and missing-version tests.
  Recovery is verified at 100 percent traffic and maintenance health after
  irreversible mutation.
- **Post-readiness evidence:** final Worker status, version metadata, and the
  single exact digest-bound Container are recaptured after readiness and then
  followed by a second exact-version readiness observation before receipt
  issuance. Recovery remains armed through the complete public production
  smoke and is disarmed only after that smoke passes.
- **Wrangler authority:** release config generation now rejects unknown
  top-level authority and unknown nested assets, version metadata, D1, R2,
  Durable Object, migration, observability, Container, and SSH keys. A route or
  preview-database injection is covered as a negative control.
- **Focused verification:** deployment recovery, receipt, and contained-runtime
  Vitest passes 3 files/41 tests; Worker deployment-config Vitest passes 1
  file/16 tests; deploy shell syntax and repository/web/Worker strict
  TypeScript pass.
- **Release truth:** no exact executable fake-Wrangler orchestration, fresh
  image, Cloudflare mutation, CloakBrowser journey, production smoke,
  deployment, submission, learner outcome, or merge is claimed.

### Live commander update — 2026-07-19T23:03:57Z

- **Deadline:** 48 hours, 56 minutes, and 3 seconds remained before
  `2026-07-22T00:00:00Z` at this checkpoint.
- **Observed live readiness:** `/ready` and `/api/health` now share one
  fail-closed snapshot of persistence, private storage, signing, admission,
  maintenance, exact release identity, analyst configuration, and the awaited
  runner dispatcher probe. Runner probe exceptions produce `not-ready` rather
  than a configured-looking live path. Judge Mode and live setup require the
  observed `ready` state before exposing notebook intake.
- **Bounded client operations:** every API request now owns a bounded abort
  signal; capability checks stop after at most 10 seconds, uploads after at
  most 60 seconds, and longer scientific actions after at most 210 seconds.
  Timeout errors are typed and retryable. Caller cancellation is propagated.
- **Honest upload retry:** a failed upload forgets the old operation key,
  including an interrupted body that the server may already have admitted, so
  the next explicit attempt does not deterministically collide with a consumed
  key. The dominant Question and claim-path file inputs clear their native
  value before callback, allowing the same notebook to be chosen again.
- **Focused verification:** API/Judge/file-input Vitest passes 4 files/45
  tests; App Vitest passes 1 file/53 tests; Worker API Vitest passes 1 file/83
  tests; repository/web/Worker strict TypeScript pass. The request-redelivery
  regression still proves identical URL, method, headers, and body while
  correctly requiring a fresh internal AbortSignal per attempt.
- **Browser expansion:** a separate Cloak-only spec now statically collects two
  mobile public replay tests covering direct deep-link/reload at 390x844 and
  Judge to replay back/forward at 375x812, with read-only network, overflow,
  console, request-failure, screenshot, and JSON evidence assertions. No
  rendered execution is claimed because this session has no exposed Cloak CDP
  endpoint.
- **Release truth:** no fresh image, Cloudflare mutation, CloakBrowser journey,
  production smoke, deployment, submission, learner outcome, or merge is
  claimed.

### Live commander update — 2026-07-19T23:15:15Z

- **Repository boundary:** Git resolves the exact root to
  `/home/mysterious/storage/github/CounterLab`; `COUNTERLAB_REPO_ROOT` is
  present, the physical working directory matches that root, the active branch
  is `feat/learner-ux-v6.1`, and HEAD remains `0ac752d83b346ca23be36917eff6eb41a6870268`.
  The complete dirty tree was re-inspected and preserved without stash, reset,
  clean, deletion, or an out-of-repository file operation.
- **Terminal-response lineage:** both `REJECTED_BY_LEARNER` and
  `INSUFFICIENT_EVIDENCE` remain immutable terminal evidence. A retry now
  creates a distinct session only from a terminal same-artifact/same-mode
  source, requires an existing source event chain, and binds the source session
  ID, source state, and source event-chain head into the new `session.created`
  event. Reject and insufficient-evidence records now hash-bind the Belief Spec
  authority and decision payload instead of leaving empty input/output hashes.
- **Recoverable learner loop:** parameterized Worker and App regressions prove
  both terminal choices preserve the learner Question, restart onto a distinct
  session ID, resubmit and confirm the Belief Spec only on the new session, seal
  a Prediction successfully, and leave the original session terminal. The App
  fake API now retains the routed replacement-session identity through belief,
  confirmation, Prediction, compile, and run responses.
- **Transfer/Repair authority:** the leakage transfer copy and fixed evaluator
  are now characterized together: selecting the genuinely future-reading
  feature passes with fixed evidence, while selecting the apparently safe
  feature fails with `FUTURE_INFORMATION_RISK`. A failed sample transfer returns
  typed `PATCH_LOCKED_TRANSFER`; no patch result is released. Existing live
  patch-route error semantics remain unchanged.
- **Focused verification:** session core passes 1 file/27 tests; App passes 1
  file/53 tests; combined Worker API/sample-learning-loop passes 2 files/86
  tests. The earlier API/Judge/file-input slice passes 4 files/45 tests.
  Repository, web, and Worker strict TypeScript passed before the final scoped
  Worker transfer-lock adjustment and are queued for immediate rerun. Browser
  refresh/back/forward proof for both terminal branches remains open.
- **Release truth:** no image build, Cloudflare mutation, CloakBrowser journey,
  production smoke, deployment, submission, learner outcome, commit, or merge
  occurred in this slice.

### Live commander update — 2026-07-19T23:40:10Z

- **Repository and ownership:** the physical root, marker, feature branch, and
  committed HEAD were reverified before this slice. The complete dirty tree is
  still preserved. Read-only reviewers own only the event-chain and release
  dependency audits; the lead remains the sole editor of App, Worker, proof,
  contracts, migrations, shared state, and this progress ledger.
- **Truthful provenance:** fixed sample compilation and patch events are now
  recorded as system-owned, approved fixed-sample work rather than fabricated
  Codex calls. The proof console renders a closed provenance ledger that shows
  GPT-5.6 and Codex only when corresponding stored events exist, identifies
  replay as making no new call, labels fixed sample framing, and says when
  bounded operation IDs are unavailable. Hash labels distinguish artifact,
  Experiment IR, verifier reports, fixed-kernel result, Boundary result,
  recorded event-chain head, Capsule root, and generator/template commit; a
  generic event commit is not presented as a release commit.
- **Capability-link lifecycle:** current source gives learner-published public
  replay links a Worker-owned 30-day expiry, with revocation and expiry both
  disabling playback without deleting the private evidence. A new additive D1
  lifecycle table preserves existing publications with a migration grace
  period, disallows mutation/deletion of lifecycle rows, and prevents an
  expired locator from being resurrected. Invalid, revoked, expired, and
  overlong locators return the same generic public not-found surface. Private
  owner capabilities remain separate; the bundled release replay remains a
  permanent fixed fixture rather than being mislabelled as a learner link.
- **Focused verification:** eight affected web/Worker Vitest files pass
  **171/171** tests, covering D1 publication lifecycle, Worker APIs, App replay
  recovery, static privacy headers/robots, capability copy, Reasoning Diff,
  provenance, and the proof console. Repository, web, and Worker strict
  TypeScript pass, including fresh Wrangler type generation. Event-chain
  recomputation before stored events are exposed remains the active next
  integrity change; operation-ID projection and a genuine sample Proof Capsule
  remain partial.
- **Release truth:** no image build, Cloudflare mutation, CloakBrowser journey,
  production smoke, deployment, Devpost mutation, learner outcome, commit, or
  merge occurred in this slice.

### Live commander update — 2026-07-20T00:06:43Z

- **Stored-evidence integrity:** the private session-events endpoint now
  recomputes the canonical event chain before returning evidence, binds every
  event to the requested session, requires contiguous sequence and previous
  hashes, rejects a self-consistent truncated prefix against the stable session
  version, retries once across a concurrent version change, and otherwise
  fails closed. It returns an explicit verified chain head/count receipt; the
  browser schema cross-checks that receipt and clears a previously rendered
  same-session snapshot if a later refresh cannot be verified.
- **Verified operation provenance:** only verifier-owned `lab.verified` events
  may carry the new closed operation summary. Fixed sample operations bind to
  the checked-in plan hash; live operations bind to the fixed-selected
  Experiment IR hash. The proof ledger ignores model-authored or stale
  summaries and exposes exact registered operation IDs only when that binding
  succeeds.
- **Legacy replay provenance:** the replay client now validates a closed public
  compiler trace rather than accepting an arbitrary record. The learner view
  renders only the recorded generate, verifier rejection, bounded repair,
  later generate, and verifier-success sequence, and binds its replay ID,
  model, commit, date, and fixed result hash. It states that replay makes no new
  call and exposes no private reasoning.
- **Hash and capability copy:** proof surfaces distinguish artifact,
  Experiment IR, operation authority, verifier report, fixed-kernel result,
  Boundary result, recorded event-chain, Capsule root, and legacy v1 result
  domains. The 30-day public replay lifecycle remains separate from private
  owner capability and the permanent bundled fixture.
- **Current verification:** full web Vitest passes **66 files / 470 tests**.
  Contracts/session/proof focused Vitest passes **5 files / 88 tests**.
  Contained-runtime/release focused Vitest passes **3 files / 42 tests** in the
  managed sandbox; the hosted server suite passes **6/6** when rerun with the
  required loopback authority, and web runtime configuration passes **3 files /
  35 tests**. Focused runner, host-pipeline, verifier-contract, and production-
  smoke Pytest passes **54/54** with all temporary/cache paths contained in the
  repository. Repository, web, and Worker TypeScript pass. The production
  Vite/Worker build passes: Worker 1,715.05 kB / 332.55 kB gzip; main client
  420.45 kB / 121.63 kB gzip; CSS 181.83 kB / 31.93 kB gzip.
- **Sample Capsule decision:** no genuine checked-in v5 sample Proof Capsule
  currently exists. The v1 sample/replay bundle will not be renamed or wrapped
  as one. MB-015 therefore remains open; the UI must continue to describe the
  legacy proof record honestly until a real semantically validated Capsule is
  issued.
- **Code-review dependency graph:** ownership/curation precedes the independent
  core-journey and contained-runtime slices; replay/provenance and the trusted
  visual depend on core truth; release tooling depends on runtime truth; all
  converge before source freeze. The serialized release chain is source freeze
  → exact image → real startup and timeout-cleanup sentinels → regenerated
  evidence-only commit → qualification → full release check → contained
  Wrangler identity/preflight → D1/Container/Worker deployment → schema-v3
  receipt and production smoke → public CloakBrowser re-audit → truthful
  submission evidence → clean fast-forward merge to `main`.
- **Release truth:** no fresh image, real runtime sentinel, Cloudflare mutation,
  CloakBrowser journey, production smoke, Devpost mutation, learner outcome,
  commit, or merge occurred in this slice. Learner evidence remains `NO_DATA`.

### Finish-command live issue matrix

| Issue | Source mechanism | Planned file owner | Acceptance test | Production proof status |
| --- | --- | --- | --- | --- |
| MB-001 terminal learner response | Refusal states are correctly terminal; the old UI reused their session ID | Lead: App, API client, Worker | Reject and insufficient evidence retain the old terminal chain, create a distinct source-bound `INGESTED` session, preserve the claim, resubmit only on the new ID, and survive refresh/back/forward without raw state names | Source PASS; public NOT RUN |
| MB-002 live intake | Live Setup previously advanced with no file and upload callers entered Claim before intake resolved | Lead: App, Worker, Judge | Absent, malformed, unsupported, supported, interrupted, same-file retry, and interrupted session-creation retry all fail or advance at the correct boundary | App/Worker/Judge source PASS, including exact shared readiness, request timeouts, consumed-key rotation, and same-file retry; public proof OPEN |
| MB-006 transfer alignment | UI asked for a safe feature while the fixed evaluator correctly expects identification of the leaking feature | Learner component worker; lead App/cross-runtime authority | Safe and leaky selections produce fixed pass/fail outcomes, equivalent screen-reader text, failed transfer keeps Repair locked, legacy payloads replay, and one semantic vector agrees across IR/TypeScript/Python/patch verification | Source PARTIAL: strict ingress and evaluators pass, but pre-submit answer leakage, imbalance IR mapping, legacy payload compatibility, cross-runtime authority, and imbalance restoration are under repair; public NOT RUN |
| MB-007 pre-seal result leak | Result/verdict copy previously occurred before immutable Prediction on non-Theater surfaces | Lead App/tests | Rendered pre-seal text contains no outcome values or verdict/fix language; values appear only after the seal | Source PASS; public NOT RUN |
| MB-048/012/013 claim scope and interpretation | Sample routing and completion copy previously overgeneralized or skipped a learner-authored interpretation | Lead App/tests | Nonsense/unrelated claims cannot become verified conclusions; interpretation is required; completion language stays bounded | Source PASS, including exact canonical-claim rejection at the standalone analyst; public NOT RUN |
| MB-005 proof hydration | Studio previously received only in-memory runner events | Lead-owned App integration plus isolated proof utility/console | Stored session events and genuine compiler events merge deterministically on active/restored/completed/proof surfaces with conflicts shown as integrity failures | Source PASS at `7bf3c67`: focused 3 files/71 tests, full web 64 files/436 tests, web TypeScript and build PASS; public browser proof NOT RUN |
| MB-003/004/016 provenance | GPT/Codex/sample roles and genuine bounded operations were not consistently visible | Lead App/Studio/proof | Show only calls and operation IDs that occurred; fixed sample framing is labelled; unavailable provenance says unavailable | Source PASS with verifier-owned operation bindings and strict legacy compiler trace; public browser proof NOT RUN |
| MB-009 hash domains | Several hashes lacked precise domain labels | Lead proof/copy | Kernel, verifier, event chain, Boundary, Capsule, and release hashes are consistently unified or domain-labelled | Source PASS; public browser proof NOT RUN |
| MB-010 capability links | Expiry, retention, revocation, and replay privacy required a complete matrix | Lead API/Worker/tests | Invalid, expired, revoked, private, and public replay-link tests pass | Source PASS for dynamic expiry, retention, revocation, privacy, and permanent bundled-fixture separation; production migration/browser proof NOT RUN |
| MB-015 sample Capsule | Judge lacks one-click checked-in sample Capsule inspection/download | Lead Judge/proof | Checked-in Capsule passes integrity validation and is inspectable/downloadable from Judge | OPEN |
| Verified belief break | Landing and Judge needed an immediate fixed-evidence mechanism while the active sample still had to preserve Prediction timing | Lead App/Judge and isolated component/E2E workers | First fold binds the exact sample mechanism, remains pre-seal safe for the active session, and passes desktop/mobile CloakBrowser comprehension proxies | Source PASS at `cc61917` plus fail-closed rebind fix `0ac752d`; 29 journeys collect; rendered/browser proof NOT RUN |
| Exact release | Contained runtime still lacks a successful immutable exact-image and timeout-cleanup sentinel | Lead runtime/release | Truthfully distinguish aggregate intent from scoped enforcement, reserve cleanup time, prove timeout cleanup and exact-image execution, then freeze one clean commit/image/evidence tuple and deploy only that tuple | Source repair IN PROGRESS; real runtime proof BLOCKED; no deployment claim |
| Submission and impact | Devpost, video, learner pilot, and receipt are externally unverified | Lead plus owner/account boundary | Exact release, public assets, consented aggregates or `NO_DATA`, submission receipt and slug all agree | OPEN; learner evidence remains `NO_DATA` |

### Completed in this continuation

| Work item | Status | Exact evidence |
| --- | --- | --- |
| Terminal recovery, live intake, and transfer semantics | PASS locally; public NOT RUN | App/API/Worker/TimelineTransfer focused Vitest passes 4 files/162 tests. Both terminal learner responses restart only through a distinct owner-authenticated source session; malformed and interrupted intake remain retryable; unsupported intake creates no live session; same-file and private-session retries pass; browser history preserves the session-owned claim without cross-session leakage. Client and Worker strict TypeScript pass. No rendered production journey is claimed. |
| Inquiry integrity and bounded completion | PARTIAL locally; public NOT RUN | New HTTP sample sessions now use only the canonical pre-authored customer-generalization question and reject historical custom framing before new patch/proof issuance. Pre-seal copy is neutral; active learners must write a direct observation before Explore/Boundary and a generated clause replacement revokes authorship; completion copy is fixed-task scoped. Focused interpretation passes 1/1, Reflection/imbalance passes 10/10, belief analyst passes 40/40, and web/Worker strict TypeScript pass. The standalone approved-sample analyst still accepts a direct noncanonical caller. A v2 Boundary-lineage regeneration was stopped after 45 minutes with no output; v1 and its generator/import remain unchanged, so MB-048 is not fully closed. No browser or production journey is claimed. |
| Stored proof hydration | PASS locally; public NOT RUN | Commit `7bf3c67` loads `/api/sessions/:id/events` for the exact private session/version, retains same-session evidence during refresh, ignores stale responses, rejects cross-session records, and merges genuine recorded/streamed compiler activity without coercing public replay activity into private evidence. Invalid/conflicting records are excluded and announced; endpoint failure never manufactures lifecycle evidence. Focused Vitest passes 3 files/71 tests, full web Vitest passes 64 files/436 tests, web TypeScript and the production build pass. The first root-relative focused invocation found zero files and exited 1; it was corrected to the config-relative invocation and is not counted as a pass. |
| Verified belief-break integration | PASS locally; rendered proof NOT RUN | Commit `cc61917` adds the closed `verified_sample_belief_break_v1` registry, strict sample-only/result-hash mounting, fail-closed lazy and stale-binding states, fixed-sample/no-call labelling, learner interpretation before the bounded finding, and exact first-fold assertions at 1440x900 and 390x844. Review fix `0ac752d` hides old verified values synchronously on a changed binding, restores the 12px label/18px card token floors, observes cold navigation failures, and time-bounds Landing/Judge availability to ten seconds. Web Vitest passes 65 files/442 tests; repository/web/Worker TypeScript and the production build pass; Playwright statically collects 29 tests. CloakBrowser executed 0 journeys because no endpoint is available. |
| Current root-suite triage | IN PROGRESS | An earlier repository-contained unsandboxed Vitest run collected 46 files and 527 tests: 43 files/521 tests passed and 3 files/6 tests failed. The current contained-runtime focused suite now passes 28/28; the combined source-bound/release verifier passes 21/24, with three failures caused by the intentionally stale scientific/SBOM/internal-integrity evidence. That evidence must be regenerated only after the exact final source/image is frozen. Twenty-four previously isolated sandbox-only child-process, loopback, and netlink failures are not counted as product failures. |
| Rootless OCI execution repair | SOURCE PARTIAL; real gate red | The cross-language timeout policy now has one packaged JSON source, Node uses a monotonic clock, the caller budget is candidate wall time plus 150 seconds of bounded control/cleanup and 5 seconds of grace, and every post-tag exit attempts exact owned-alias removal. The OCI validator pins `rootfs`, rejects unsafe clone/clone3 and malformed seccomp arguments, and verifies exact persisted paths before reading. Python trusts contained cleanup only for the exact repository adapter. Runner evidence and the frozen verifier now consume the same exact limit mode: aggregate cgroup intent remains explicitly `false`, while process/real-user/host-postcondition scopes are named and carried as a limitation rather than presented as aggregate enforcement. Focused contained-runtime Vitest passes 28/28; combined Docker/host-pipeline/kernel-verifier Pytest passes 30/30. Physical plan-root checks, structured absence diagnostics, the broad seccomp allowlist, repository-explicit temporary roots, a successful exact-image run, and a real timeout-cleanup negative control remain open. No runtime qualification or deployment is claimed. |
| Repository and dirty-tree preservation | PASS | Root, marker, branch, commit, and every dirty path were inspected; no stash, reset, clean, tracked-file discard, or deletion was used. |
| Direct test temporary containment | FAIL | One focused direct Pytest attempt inherited Pytest's host `/tmp` default before the missing environment was detected. It was stopped and no external cleanup or inspection followed. Every subsequent direct Python run uses a unique repository-contained `TMPDIR`, `PYTHONPYCACHEPREFIX`, and `--basetemp`; the formal test/release scripts now establish contained paths themselves. |
| Parallel review read boundary | FAIL isolated read-only command; no mutation | A read-only release reviewer used `git diff --no-index /dev/null <new-file>` once before recognizing that even reading `/dev/null` conflicts with the literal repository-only constitution. The command changed and removed nothing, produced no external file, and was not repeated. All lead file reads and writes remained repository-contained. |
| Runtime characterization path boundary | FAIL isolated metadata lookup; no mutation | One new adapter-lookalike test initially resolved the nonexistent path `/repo/scripts/contained-runtime-adapter.sh`, received `FileNotFoundError`, and wrote nothing. The test was immediately changed to a repository-contained temporary lookalike and now passes. |
| Wrangler diagnostic containment | FAIL isolated write attempt; no mutation | A read-only release reviewer invoked bare repository Wrangler once; Wrangler attempted to open `$HOME/.config/.wrangler/logs/...` and failed read-only before writing. No further bare Wrangler command is permitted. Identity, release, and deployment calls must run only through the contained wrapper with repository-local HOME, TMPDIR, XDG, and Git configuration. |
| Learner-focused presentation and navigation | PASS | Local commits `2ce90ad` and `fafa0e0` simplify the question-first entry, evidence choices, stage actions, accessible names, and client chunking while preserving signed-data authority. |
| Full web component suite | PASS | Local web Vitest passed 65 files/442 tests after belief-break review fixes. |
| Web, Worker, and repository TypeScript | PASS | All three strict TypeScript checks passed at the current learner checkpoint. |
| Production Vite/Worker build | PASS | Local Vite 8.1.4 built 389 Worker modules and 204 client modules. Worker 1,702.43 kB / 330.17 kB gzip; main client 414.43 kB / 120.04 kB gzip; CSS 181.22 kB / 31.83 kB gzip; lazy belief-break chunk 18.15 kB / 4.46 kB gzip. |
| Formatting, whitespace, and secret scan | PASS | Prettier, Git whitespace checks, and the repository secret scan passed; the latest scan covered 802 files. |
| Source-bound runner build inputs | PASS | Local commit `e0559ff` includes the bounded adapter inputs required by the exact-image build. |
| Pinned local Syft and Grype tools | PASS | Syft 1.44.0 and Grype 0.112.0 archives and binaries were independently hash-checked in repository-contained tool storage. |
| Exact-image evidence generator implementation | PASS | Local commit `c6575a8` contains normalization, VEX preparation, source/image binding, 31 tracked output hashes, pinned scanner configs, 14-day KEV freshness, bounded verification, and persisted/hash-bound runtime evidence. Exact-image execution still follows the final source commit. |
| Repository-contained release execution | PASS | Local commit `863a2a8` removes host `/dev/null` sinks from the formal release/deploy/smoke chain, uses physical roots and marker checks, symlink-checks ignored write roots and Git config, adds read-only held-out/achieved gates, gives each production Cloak stage a separate contained runtime, and moves public UI extraction into Cloak-backed Playwright. Shell syntax passed; graph-targeted Vitest passed 3 files/37 tests; release/production Pytest passed 26/26; setup smoke, TypeScript, and achieved-metrics checks passed. Exact-image qualification remains a separate pending gate. |
| First exact source-bound runner build | PASS | The contained `rt-v61-0719j` runtime built source `184b43796b382094de32a8d2f733d9fd232dab32`. Receipt: `node_modules/.cache/counterlab-v6.1/releases/runner-build-184b43796b382094de32a8d2f733d9fd232dab32.json`; normalized runner digest `sha256:c76bc97f22caf25f26abc7d48bbcaf4dd96331aafe036d4651f595832d95f428`; adapter image digest `sha256:e9f2237e326a462eb0c2823ae13810c38714e54ef0559ae1eca489d99d08a979`; normalized OCI manifest `sha256:f78a0743306f251ed661eca023607f811f4a65c7dc7bb530495def366c74b743`. The image is retained but not yet qualified or deployed. Any preservation commit for the concurrent visual evidence will require a new exact-source build. |
| Second exact source-bound runner build | PASS | After preserving the screenshots, the contained `rt-v61-0719m` runtime built source `cf6108e306e43fb4dd270dfdcc1317f2e508aeda`. Receipt: `node_modules/.cache/counterlab-v6.1/releases/runner-build-cf6108e306e43fb4dd270dfdcc1317f2e508aeda.json`; runner config digest `sha256:9ad43785334e70dbaa738e08ece1efd48c51b55a578730d8620ec47f849f14b7`; normalized OCI manifest `sha256:d2cfc4a1455ebd426ab977733b6598221cebc2a78e965716aed48887ae600a7e`; adapter digest `sha256:32444ee794ab3abb35ac4e670ca62beb901faa5afc3d9709af472d588cf8c9e7`. A later concurrent audit document again advanced the preservation checkpoint, so this image is retained but will not be qualified or deployed. |
| Third exact build and contained import repair | PASS build; PASS diagnosis; rebuild pending | The contained `rt-v61-0719m` runtime built preserved source `fcd69a8bffff0f8f8c90f0e16b6fb4cebd6e39dc`: runner config digest `sha256:83f8d0dbb84f32c0fc0d202a27618f769293873024b03def0f75dc3209ac9c47`, adapter digest `sha256:8996ec6ae45b515e096d47654df95a2c9387396f9bda0b3e8e29fb5b57ab4216`, and normalized OCI manifest `sha256:bb3ac7fd1ec28363cb899d8f7d0aeb03f807851416945b062e7db92472ca965c`. Evidence refresh then failed before tracked writes with containerd `no unpack platforms defined`. Context7 and pinned `nerdctl 2.3.1` help confirmed platform-aware load semantics; the runtime lacked a transfer-service unpack mapping. The repair pins both the load request and containerd transfer configuration to `linux/amd64` plus the native snapshotter. Focused tests pass 2 files/22 tests; a fresh `rt-v61-0719n` attestation is `VERIFIED`; the same OCI imported in 160.5 seconds and its loaded image ID exactly matched `sha256:83f8d0…9ac9c47`. Because release tooling changed, this image is retained but will not be qualified or deployed. |
| Fourth exact build and OCI archive compatibility repair | PASS build; PASS diagnosis; superseded | The repaired `rt-v61-0719n` runtime built source `6e6081add5e7675b16bdc136bc11288a9ebb8905`: runner config digest `sha256:38cb19f4a9a506f23c0a19ed7bf326305cd668b8a04479b8f0af3d023d2b8fb6`, adapter digest `sha256:0f3c9d0e0f2a707da9a4344e9ed5e16ea56ef83f93bd87a97f6ee55eb73229f8`, and normalized OCI manifest `sha256:f280607a69763c5e97152e08d6a63d7781bf052571baa5ebfdc6ed9e00aad45e`. Evidence refresh imported the exact image in 133.5 seconds, then pinned Syft 1.44 rejected the normalized tar's root `./` entry as a potential traversal. A repository-contained diagnostic archive naming only `oci-layout`, `index.json`, and `blobs` scanned successfully. The build repair emits that standard rootless layout and a regression assertion forbids the dot-root form. The image is retained but will not be qualified or deployed. |
| Fifth exact build and untagged OCI identity repair | PASS build; PASS real-image identity/VEX; full refresh pending | Runtime `rt-v61-0719n` built source `27d1f96bcd565c94178cc4fffbecbba9ae63560e`: runner config digest `sha256:dc613fe5fe63e5eb604a0a7b93d49ca254d48bd2c07be7912ed858eec00cf3b3`, adapter digest `sha256:ef7079d70a6b4a875ba0184e05dd28ce2b238433a8ccfa2e55744ef84ea8bc45`, and normalized OCI manifest `sha256:1a48c42de1ca60547d0c0b3749df33d9a9617f64a01ca92549a619a5380ae8af`. Refresh imported in 123.0 seconds, passed Syft, both SBOM gates, and Grype, then failed closed because Grype correctly reports an untagged OCI archive with empty tags/repository digests/raw platform fields. The repaired gate verifies exact config and manifest hashes, decoded `linux/amd64`, exact archive bytes/path, source revision/tree/URL labels, empty presentation identity, and three-scan VEX identity. Focused Vitest passes 2 files/18 tests; repository, web, and pilot TypeScript pass. The real 944 MB 27d1 archive passed the new gate and source-bound VEX preparation. Because the gate source changed, this image is retained but will not be qualified or deployed. |
| Exact OCI evidence retention | PASS locally; rebuild pending | Commit `e73494d` makes current vulnerability and VEX summaries retain the validated OCI manifest digest instead of collapsing evidence back to the config digest. Current verification recomputes both reports from raw Grype evidence, requires one manifest identity across the three VEX scans, and rejects missing or cross-report manifest binding while preserving historical parser compatibility. Qualification compares both reports directly to the build receipt before registry promotion. Both summarizer CLIs reject escaped/symlinked paths, unknown or duplicate flags, and output replacement. Focused root Vitest passes 4 files/31 tests; repository TypeScript, shell syntax, Prettier, and Git whitespace checks pass. |
| Qualification receipt and image-load preflight | PASS locally; source commit pending | The qualification CLI proves that its repository-contained receipt path is new before image loading, scientific verification, or registry promotion, and still writes with exclusive-create semantics. Both runner and adapter imports now satisfy the runtime validator's exact `load --platform linux/amd64 --input FILE` contract; a regression assertion requires both platform flags. The focused Worker release test passes 1 file/16 tests; repository and web TypeScript, Prettier, and Git whitespace checks pass. |
| Next contained runtime | STALE runtime rejected; fresh start pending | A read-only continuation attestation against `rt-v61-0719n` failed closed with `kill ESRCH`; its recorded daemon processes are no longer live and the session will not be reused. The pinned installed rootless toolchain plus cached Syft 1.44.0 and Grype 0.112.0 inputs remain available. A fresh unique repository-contained runtime will be started only after every non-evidence source path is committed. |
| Concurrent visual-audit evidence triage | PASS as preservation; NOT QUALIFIED as release evidence | Sixteen valid, byte-stable PNGs at the intended 1440x900 and 390x844 viewports plus one `.keep` file appeared under the audit evidence tree. All 16 were visually inspected; no ancillary PNG metadata, secret, personal content, or local path was found. A later local ignored sidecar established the public URL, timestamps, source checkpoint, and stock-Chromium capture method. The README therefore marks them unqualified: they do not satisfy the current CloakBrowser-only policy and no browser/a11y pass is inferred from them. |
| Visual/generative-UI audit addendum | PASS as preservation; NOT QUALIFIED as browser evidence | The concurrent audit correctly identifies a high-leverage visual gap and the dormant bounded Lab Scene opportunity. Its capture script used stock Chromium, however, so the addendum now carries a prominent CloakBrowser-policy disclaimer. The verified Belief Break visual and trusted scene-renderer recommendation enter the prize queue; the broader agentic Learning Director remains authority-gated and must not delay P0 production truth. |
| Current-source P1 reconciliation | PASS as source audit; production proof pending | A read-only reconciliation found CL-003 (claim-only chooser), CL-004 (read-only replay), CL-005 (fixed-evidence sample Boundary plus learner-authored reflection), and CL-010 (current vocabulary/metadata) fixed in current source. CL-007 admission/cost controls are implemented but need deployed proof; CL-008 remains honestly `PARTIAL`; CL-009 is narrowly mitigated; CL-023 remains partial because no verified Lab Scene reaches the browser; CL-006 and CL-024 remain open. Old Worker 82 observations are not misrepresented as current feature-branch behavior. |
| Verified Belief Break component | PASS in isolation; integration/browser pending | A new fixed-evidence `VerifiedBeliefBreakTheater` was created only under the learner component boundary. It verifies the exact checked-in sample bytes, result lineage, Boundary fixture, and controlled runs before exposing values; keeps a persistent sample label; provides a non-color mechanism and exact-value table; reserves a stable explicit preview layout; and makes no model, runner, or network call. Focused Vitest passed 2 files/14 tests; web TypeScript, Prettier, and Git whitespace checks passed. `App.tsx` and Judge integration remain lead-owned and not yet changed. |
| Learner-pilot evidence hardening | PASS locally; outcomes remain `NO_DATA` | Pilot v2 now fails closed on assignment/order, consent-reference, duplicate-linkage, exact-release, escaped/symlinked path, malformed-line, and aggregate-reconciliation failures. It records first-unassisted transfer, prediction/result difference, bounded confusion/abandonment, and closed reactions while publishing only aggregates plus one frozen qualified-release hash. The contained wrapper loads the tracked seed-1729 schedule, treats only a missing implicit session input as `NO_DATA`, and computes before replacing the fixed aggregate. Focused Vitest passed 3 files/24 tests; pilot, eval, and repository TypeScript plus Prettier and Git whitespace checks passed. The `tsx` CLI could not create its repository-contained IPC socket under the managed sandbox (`EPERM`); the non-IPC `node --import tsx` path succeeded and regenerated schema-v2 `NO_DATA`. No participant or learner-impact result is claimed. |
| Contained-runtime IPC portability | PASS policy; exact rebuild pending | Pinned nerdctl 2.3.1 documents `private` as its isolated IPC namespace and rejects Docker's `none` spelling. All four approved runtime profiles now require `--ipc=private`; focused Vitest passes 1 file/14 tests, including rejection of both `--ipc=none` and `--ipc=host`; TypeScript formatting, shell syntax, and Git whitespace checks pass. A diagnostic call reached container creation instead of the prior IPC parser error, then failed at a separate stale-runtime `/run/containerd/fifo` permission boundary. No runtime pass is claimed. The attestation correctly rejects the modified validator in `rt-v61-0719p`, so a fresh runtime and new exact build are mandatory. |
| Contained-runtime FIFO, shim, and runc-state isolation | PASS local implementation; real runc sentinel rerun pending | Exact nerdctl 2.3.1 source confirms that its client I/O helper hardcodes `/run/containerd/fifo`; pinned `ctr tasks start --fifo-dir` supplies the supported contained client directory. Official containerd 2.3.1 source identifies the supported 42-character shim-manager `socket_dir`, and the verified repository root is exactly 42 characters, so transient shim sockets bind there and are checked for cleanup. Fresh runtime `rt-v61-0719v` attested, imported source-bound runner `74d60a70402a8a9a057f33f3efe6f2ac828fd2ae`, created a generated container ID and repository-root v2 shim socket, then failed closed because containerd's pinned runc integration supplied `/run/containerd/runc`. Exact containerd/go-runc source confirms that task start exposes no runc-root option and invokes the PATH-resolved `runc` binary with a separate `--root` argument. The repair therefore places one private, hash-attested `runc` wrapper ahead of the pinned toolchain, rewrites only the two exact containerd roots into `.rt/<session>/run/runc`, constrains log output to a physical owned session path, rejects joined/duplicate/unknown roots and mutating no-root calls, and preserves all arguments after the runc subcommand. Both launch and verification use one minimal generated environment; the wrapper directory must contain exactly `runc`; and the launcher starts through an empty privileged Bash environment. First clean-environment launch `rt-v61-0719w` proved containerd could boot but stopped before attestation or a task because BuildKit's OpenTelemetry controller defaulted to `/run/buildkit`. Current official BuildKit configuration documents `[otel].socketPath`; the launcher now pins it to `.rt/<session>/run/inner/buildkit-otel.sock`, attests that socket and the XDG runtime directory, and keeps the rest of BuildKit state unchanged. The failed `v` task cleaned its FIFO, shim socket, and container record; `w` launched no task. Focused Vitest passes 1 file/22 tests; repository TypeScript, Node/Bash syntax, Prettier, Git whitespace, and a secret scan across 809 repository files pass. No sentinel result is claimed until a fresh attested runtime executes it. |
| Contained Wrangler identity | BLOCKED on fresh OAuth | Current Wrangler 4.110.0 documentation was checked through Context7. Repository-contained `wrangler whoami` ran without printing a token and reported unauthenticated. A fresh `--browser=false --use-keyring=false` OAuth callback was started inside repository state but timed out before approval; no Cloudflare mutation occurred. Generate a new short-lived link only when the owner is ready to approve it. |
| Code-review graph and parallel review | PASS | The latest repository-local graph reports 430 files, 4,105 nodes, 68,225 edges, and six languages. Incremental review parsed the 61-file dirty working set without errors. The exact 17-file belief-break slice scores medium risk (0.55); App, component, failure-path, and E2E tests cover the named entry points, while rendered layout evidence remains required. Independent standards and spec reviews are in progress against fixed point `2656666`. |
| Focused scientific/release tests | PASS | Earlier combined release Vitest passed 4 files/35 tests; focused Python reachability/scientific/held-out gates passed 12 tests. The latest graph-targeted Vitest passed 2 root files/22 tests plus 1 Worker file/15 tests, release/production Pytest passed 26/26, and the read-only held-out execution matched tracked evidence at 10/10 intake and 7/8 legacy fixed-loop completion. |
| CloakBrowser harness and static collection | BLOCKED | Playwright 1.61.1 statically collected 29 tests in one spec, including six strict belief-break viewport/lifecycle journeys. A missing `CLOAK_CDP_ENDPOINT` prevents browser execution; 0 rendered journeys ran and no stock browser was launched. |
| Broad product/runtime verification | IN PROGRESS | Current web Vitest passes 65 files/442 tests; repository/web/Worker TypeScript, production build, exact-file formatting, and whitespace pass. Previously recorded Python kernel/runner, scientific verifier/reachability, mutation, broader formatting, and secret-scan results remain historical to their named worktree checkpoints and will be rerun after source freeze. Current runtime-specific failures are recorded above and must be repaired before the next exact-image refresh. |
| Held-out benchmark | PASS | Intake passed 10/10. Seven of seven patch-eligible cases complete the fixed loop; the separate RandomForest case is correctly refused with `PATCH_ESTIMATOR_OUTSIDE_CONTRACT`. The legacy aggregate remains 7/8 for compatibility. The new read-only formal gate recomputed the benchmark and matched both tracked evidence documents without changing them. |

### Ordered completion queue

The lead owns integration, shared architecture, release scripts, deployment,
documentation, commits, and the final merge. Independent read-only reviews and
test inventory may run in parallel, but no two workers edit the same file.

1. **Final source containment review and source commit — PASS**
   - Source-bound evidence tooling was committed at `c6575a8` after independent
     review and focused repair tests.
   - Local commit `863a2a8` contains the reviewed containment/read-only repair.
     It retains formal release diagnostics inside repository state, validates
     contained Git configuration, uses read-only held-out/achieved evidence
     checks in the formal clean-tree gate, and moves UI transport inspection
     behind CloakBrowser.
2. **Exact runner image and evidence regeneration — IN PROGRESS**
   - Attest the repository-contained runtime.
   - Immutable images and receipts for `184b4379` and `cf6108e` built
     successfully. Both are retained but superseded after concurrent audit
     work was preserved. Freeze the next clean documentation checkpoint and
     rebuild once more so the final receipt binds every preserved source file
     rather than treating audit work as invisible.
   - The fifth exact build from `27d1f96…` proved the rootless archive and
     exposed the untagged Grype identity shape. Commit the reviewed two-digest
     OCI gate, then rebuild once more because release-source changes invalidate
     the fifth image.
   - Generate Syft, Grype, CISA KEV, VEX, reachability, license, engine-health,
     registry, runtime-manifest, and snapshot evidence against that next exact
     image.
   - Run the negative VEX control and reject wrong-image, wrong-component,
     stale, or unbound evidence.
   - Commit generated evidence separately only after the full exact-image
     verifier passes.
   - Source `41394afd...` built successfully and reached source-bound VEX, but
     its evidence refresh exposed the nerdctl IPC spelling mismatch. Commit the
     reviewed `private`-namespace repair, start a fresh attested runtime, and
     rebuild. Do not reuse runtime `rt-v61-0719p`, its build receipt, or its
     partial evidence staging directory for qualification.
3. **Broad local qualification — IN PROGRESS**
   - The current baseline is green for product/runtime behavior. Pre-refresh
     root Vitest is 499/502, with all three failures isolated to the
     intentionally stale evidence graph. The formal registry-only engine gate
     reports exactly 14 binding
     findings: the pnpm lock hash, SBOM tool-lock hash, and 12 internal
     renderer/oracle/mutation integrity hashes.
   - `docs/sbom/node.cdx.json` still identifies pnpm 11.13.0 while the pinned
     build tool is 11.13.1. Regeneration must correct that evidence; the check
     must not be weakened.
   - Full web Vitest, repository/web/Worker/hosted-runner TypeScript, full
     Python kernel/runner suites, mutation suites, held-out cases, and the
     production build are green. Full root Vitest must be rerun after evidence
     regeneration.
   - Migrations, production-smoke harness tests, release-script tests,
     formatting, whitespace, secret scan, and SBOM/scientific evidence gates.
   - Repair implementation failures; never weaken or skip tests to turn a gate
     green.
4. **Container qualification and registry promotion — NOT RUN for the new
   source commit**
   - Qualify the exact immutable image with a clean tree.
   - Publish only the qualified source-bound tag to the configured Cloudflare
     registry.
   - Record source commit, OCI/config/manifest digests, evidence authority,
     tool versions, and exact qualification receipt.
5. **Cloudflare release gate and Wrangler deployment — NOT RUN for this
   branch**
   - Verify the active Cloudflare identity and destination without changing
     Git or remote identity.
   - Run the exact release check and bounded D1 migration gate.
   - Deploy the qualified Worker and Container with Wrangler.
   - Record the actual Worker version, Container version/digest, and deployment
     receipt; do not claim deployment before those commands succeed.
6. **Production smoke and live authority journeys — NOT RUN for this branch**
   - Readiness/capability/no-secret checks.
   - Untouched live entity-leakage and class-imbalance journeys.
   - Event reconnect, verified Boundary, deterministic transfer, copied patch
     download, Proof Capsule export/replay, failed-verification behavior, and
     exact deployed-version binding.
7. **CloakBrowser and accessibility qualification — BLOCKED until a live
   `CLOAK_CDP_ENDPOINT` is available**
   - Execute the 29 collected CloakBrowser tests. The explicit viewport matrix
     covers 1440x900, 1280x720, and 390x844; the complete learner, replay, and
     live journeys run at their configured viewport and must not be described
     as 69 separately executed journeys.
   - Exercise keyboard-only navigation, screen-reader names and announcements,
     focus restoration, reduced motion, refresh during asynchronous phases,
     downloads, unsupported notebooks, failed verification/transfer, and
     horizontal-overflow checks.
   - Capture rendered screenshots and Web Vitals only from the exact qualified
     public release. Never fall back to stock Chromium.
8. **Prize submission evidence and impact — PARTIAL**
   - Resolve every technically actionable P0/P1/P2 item in
     `docs/audits/counterlab-first-prize` and update the diagnostic score with
     evidence.
   - After the P0 exact-release gate, implement one signed-data-backed Verified
     Belief Break visual for the landing/Judge fast path, with an accessible
     table, reduced-motion parity, persistent sample/replay/live provenance,
     and no browser-side numerical authority. Recapture it only through the
     formal CloakBrowser harness.
   - Treat the broader GPT-5.6 Learning Director as a separately evaluated,
     bounded authority expansion; do not give it scorer, verifier, kernel,
     transfer, patch-unlock, or Proof Capsule authority, and do not let it
     delay the exact public release.
   - Current source already repairs the claim-only handoff, replay authority,
     fixed-evidence sample Boundary/reflection, and current metadata findings
     from the older public audit. Prove those repairs on the exact deployment
     before spending time rebuilding them.
   - Freeze an exact public build and bind screenshots, demo copy, source,
     Container digest, and claims to it.
   - A real learner-impact study and final Devpost submission require genuine
     external participants/account actions; no synthetic impact or submission
     is claimed.
9. **Final documentation and merge — NOT RUN**
   - Update release checklist, evidence report, support limits, production
     identities, browser/a11y evidence, known limitations, and complete test
     totals.
   - Confirm a clean feature branch, verify `main` ancestry, switch to `main`,
     and merge `feat/learner-ux-v6.1` with `--ff-only`.
   - Do not delete the feature branch, rewrite history, force-push, or deploy a
     commit different from the one documented.

### Current blockers and non-claims

- The current public audit snapshot is not proof that this branch is deployed;
  exact source, image, Worker, and Container identities still need to be
  qualified together.
- No current-branch rendered browser journey, screenshot, screen-reader
  session, accessibility audit, or Web Vitals result is claimed while the
  CloakBrowser endpoint is unavailable.
- The concurrent `visual-judge` PNGs are useful design-review artifacts but
  have no recorded source/URL/browser provenance. They are being preserved as
  unverified audit inputs, not promoted into current-release browser evidence.
- The existing browser suite has no Axe, Lighthouse, automated screen-reader,
  or Web Vitals integration. Keyboard, accessible-name, reduced-motion, and
  viewport scenarios are represented in the 23-test specification, but their
  rendered behavior remains unverified until CloakBrowser is available.
- The `41394afd...` source-bound evidence refresh is deliberately ineligible:
  it ended before binding tracked evidence, and release-helper source changed
  afterward. The old runtime attestation now rejects that helper drift. Its
  retained staging artifacts are diagnostic history only.
- One focused direct Pytest attempt in this continuation used Pytest's host
  default temporary root before the missing containment environment was
  detected. The attempt was stopped; no cleanup, inspection, or further action
  was taken against that external path. Every subsequent direct Python test is
  required to set repository-contained `TMPDIR`, `PYTHONPYCACHEPREFIX`, and
  `--basetemp`; the formal release script already exports a contained `TMPDIR`.
- One focused JavaScript release-verifier run reached an existing recursive
  cleanup hook. Its `TMPDIR` was explicitly repository-contained, so it touched
  only unique agent-owned fixture directories and no outside path. The affected
  verifier test now uses additive unique fixtures under the repository cache
  and performs no recursive cleanup; it will be rerun after the intentionally
  stale evidence graph is refreshed.
- During triage of a transient in-repository FUSE placeholder, one read-only
  `lsof` invocation emitted host mount warnings; no outside path was modified
  or subsequently inspected. Separately, one read-only visual-audit search
  mistakenly redirected diagnostics to `/dev/null`; it made no persistent
  change and was not repeated. Both are recorded because the repository-only
  boundary applies to diagnostics as well as writes.
- A repository-wide Prettier scan can race with transient
  `.code-review-graph` SQLite sidecars. Explicit checks of every tracked and
  active untracked source file pass; the transient database files are not
  product evidence and must be excluded from the broad formatting surface
  rather than chased or deleted.
- `scripts/clean-demo.sh` is not part of the formal v6.1 release chain and is
  blocked under the current filesystem constitution: it still uses uncontained
  package/tool setup and host diagnostic sinks. It will not be run or treated
  as a release gate during this pass.
- The held-out `leakage_random_forest` notebook is supported for intake and
  reaches verified result and transfer, but Repair is intentionally refused:
  the notebook only imports `RandomForestClassifier` and provides no admitted
  estimator/configuration shape for a fixed verified patch. Broadening the
  patcher from an import token would weaken authority. The benchmark will
  report this as one expected contract refusal, not as a fabricated eighth
  patch.
- The interactive Verified Sample Playground remains omitted unless its
  fixture-integrity authority can be satisfied without browser-side
  authoritative computation.
- Physics/free-fall remains outside this UX/release pass until the two existing
  ML Subject Packs pass the production authority gate.
- Devpost submission and measured learner impact are not complete. The
  repository work can prepare and verify the evidence package, but it must not
  fabricate submission state, participants, or outcomes.
- The isolated release profile is not yet authenticated to Cloudflare. The
  owner's normal-home Wrangler login cannot be read under the repository
  boundary; a new repository-contained OAuth flow must be approved promptly
  after it is started.

### Review methods and capabilities used

- Repository constitution, physical-root checks, marker checks, Git diff, and
  selective staging protect the filesystem and user-authored work.
- Context7 supplied current `code-review-graph`, nerdctl, and official
  Cloudflare Wrangler/D1/Container/deployment guidance; the installed graph CLI performed
  the repository-contained full build, change detection, architecture, impact,
  and test-link queries.
- Three independent read-only subagent reviews covered release drift,
  deployment gates, test coverage, and documentation truth; the lead owns all
  edits and integration.
- Vitest, Pytest, strict TypeScript, shell syntax, Prettier, the secret scan,
  held-out recomputation, mutation suites, scientific verification, and builds
  provide local evidence. Wrangler and CloakBrowser are listed only after their
  commands actually run.

## Historical milestone archive

The material below preserves earlier milestone evidence and identifiers. It is
not the active release status and may contain superseded counts, image digests,
or authentication observations. The active v6.1 release board above is the
only current operational ledger.

### Learner UX v6.1 local checkpoint

Branch `feat/learner-ux-v6.1` now implements the question-first six-stage
learner presentation locally: one progress model; Notebook Evidence Story and
privacy summary; Model Duel and Prediction Seal; Fair Test Builder and
Experiment Theater; Boundary Hunt; Reflection Builder; TimelineTransfer and
CostTransfer; RepairPreview; capability-first completion; deterministic hints;
and privacy-safe interaction evidence. Milestone commits run from `273e2b8`
through `755f698`; the recovery checkpoint is `b4e23ca`.

The learner UX milestones did not change notebook intake, mode provenance,
Belief Spec or Prediction semantics, Experiment IR, candidate scoring, metric
formulas, Boundary computation, transfer evaluation, patch operations,
Reasoning Diff, Proof Capsule, or deployment configuration. A post-milestone
release repair made new schema-v1 held-out patch bundles bind the current
Subject Pack version while retaining the historical fallback for old bundles;
it did not widen patch authority. The interaction components consume existing
signed or integrity-bound data and do not calculate authoritative metrics in
the browser.

Milestone 4, the interactive Verified Sample Playground, was intentionally
omitted. No independently admitted fixed-kernel fixture authority existed for
the proposed matrix; hashing a fixture alongside the output produced by the
same generator would be self-authentication. The sample therefore remains
fixed, live exploration remains runner-backed, and replay remains read-only.

Current source-candidate evidence: web Vitest passed 58 files and 360 tests;
repository, web, and Worker TypeScript checks passed; and the combined fixed
kernel/runner Python gate passed 231/231. All eight D1 migrations applied to a
fresh repository-contained database, and a second pass reported no migrations
to apply. The production-smoke harness passed 19/19 tests. The Vite/Worker build
passed with a 398.22 kB (115.88 kB gzip) main client chunk, below the 500 kB
warning threshold, and the repository secret scan passed across 741 files while
excluding generated browser-profile state.

The complete root Vitest gate currently passes 486/488 tests. The only two
failures are the deliberately stale internal-authority and pnpm-lock evidence
checks; those hashes cannot be refreshed truthfully until this source candidate
is committed and its exact runner/adapter images are built. A new check/write
tool now reports and propagates only the fixed internal, catalog, Subject Pack,
runtime, Node SBOM, and snapshot bindings. The Cloak-only Playwright suite
statically collects 22 tests, but no browser test executed because
`CLOAK_CDP_ENDPOINT` is absent. No current-branch screenshot, screen-reader
session, rendered viewport/accessibility result, or Web Vitals measurement is
claimed.

Wrangler 4.110.0 reports the repository-contained session is unauthenticated,
and no repository-visible Cloudflare API token is present. Exact-image
qualification, remote migration, deployment, and production smoke remain
pending and are not claimed.

The complete local evidence, performance sizes, and remaining manual checks are
recorded in
[`docs/LEARNER_UX_V6_1_EVIDENCE.md`](LEARNER_UX_V6_1_EVIDENCE.md).

CounterLab Studio has three contract-separated modes: sample lesson, live
notebook analysis, and verified replay. Both released ML Subject Packs—entity
leakage and class imbalance/metric choice—have fixed kernels, independent
contract/result verification, interactive controls, deterministic transfer,
source-free Patch Plans, and verified copied-notebook patches. Native local
paths produce Reasoning Diff v2 and Proof Capsule v2; historical sample/replay
paths retain their labelled Proof Bundles.

The hosted architecture is implemented as a Vite/React Cloudflare control plane
with D1/R2 plus a Container-backed Durable Object runner. Runtime Codex writes
only bounded typed scientific artifacts and display-only scene/rationale; its
separate repair turn writes only a Patch Plan and rationale. The public critical
path never executes model-authored Python. The existing adapter-code compiler
remains a separately labelled advanced local proof and replay.

The v5 scientific-method packages are implemented and independently tested:
`BeliefSpecV2`, Experiment IR v5 with a v2 projection adapter, the deterministic
candidate scorer, and the epistemic verifier with tri-state Evidence Verdicts.
The local Worker/runner implementation now creates a native Belief Spec, accepts
only the four bounded Codex scientific artifacts, independently reruns candidate
verification at the compile callback, dispatches an authority-bound v5
`LAB_RUN`, and executes only its fixed projected Plan against the registered
fixture. The runner deliberately withholds `result.ready`; Worker-side epistemic
verification now freezes the result, independently verifies it, persists its
tri-state verdict, and alone releases readiness. The browser renders native v2
belief authority after refresh, and downstream session-core/Worker gates now
resolve exact v5 evidence authority before revision and concept-specific
transfer. Interactive reruns now derive from frozen compile/result authority
without changing the Evidence Verdict. The strict v5 patch contract, runner,
fixed Python verifier, and both Worker concept paths now preserve that authority
through reject-repair or direct verification, source sealing, exact terminal
hashes, immutable patch artifacts, and `PATCH_VERIFIED`. Native Reasoning Diff
v2 now binds the complete v5 evidence tuple, and the Worker issues a
content-addressed Proof Capsule v2 only after independently rebuilding that
authority from immutable job objects. The canonical archive, optional HMAC,
semantic validator, exact-byte download, duplicate-callback recovery, tamper
rejection, and local validate/inspect/replay CLI pass. Capsule issuance itself
is covered for both ML packs. Boundary Map v1 now has strict
cross-runtime contracts, fixed 25-cell leakage and 15-cell imbalance kernels,
pack-owned grids, and exact-request authorization. Its independent verifier,
strict purpose-separated runner contract, and fixed hosted execution now pass
locally. Worker-owned immutable freeze, independent verification, HMAC-signed
receipt, session projection, authority-checked retrieval, rejection handling,
and revision gating now pass for both concepts. The browser now parses that
authority strictly, starts and reconnects Boundary jobs, releases no cells
before verification, renders a keyboard-inspectable semantic map, and keeps
revision locked until the receipt is present. Both live ML paths also render the
native six-dimension Reasoning Diff and download the immutable `.counterlab`
Proof Capsule directly; historical sample and replay paths retain their own
labelled authority.
The first v5.1 production promotion reached Worker
`89db95bc-d0c1-48c7-963b-2e2f9a35f876` and Container version 14. Public
readiness, capability health, secret scanning, Judge Mode, Sample lesson, and
Verified replay passed. The untouched live leakage path then failed closed
before state advancement because the configured Responses-compatible endpoint
rejected the Belief Spec v2 tuple schema. No runner job or result was released.
The transport schema is fixed in `36ee156`, and the live verification command
now exercises Belief Spec v2 in `bcd5df1`. Those commits are bound to the fresh
local candidate recorded below; registry promotion and a new exact-version
smoke remain pending.

The live Responses integration was exercised against the configured endpoint.
A minimal request and the legacy v1 schema succeed. The exact pre-fix Belief
Spec v2 request reproduced HTTP 400 `invalid_json_schema`; the bounded-array
wire schema now succeeds while the canonical tuple and ordered hypothesis
validation remain unchanged. A real v2 untouched leakage analysis at `medium`
effort completed in approximately 36 seconds, validated locally, and resolved
artifact evidence. An `xhigh` run reached the 180-second transport timeout and
is not presented as a successful latency result. The custom base URL remains
server-only and provider-neutral in product state and copy.

The production control plane is deployed at
`https://counterlab.cserules.workers.dev` as Worker version
`89db95bc-d0c1-48c7-963b-2e2f9a35f876`, with Container version 14 healthy on
the earlier v5.1 candidate digest
`sha256:1b974af90901e818fc202fffca8702f7a48aa1bcfa54776af7cc67831b5e34da`.
That version did not pass the live smoke and therefore has no completed v5.1
production authority claim. The last full exact-version production smoke
belongs to Worker
`7c67c0f4-a4cb-4503-80b0-5a5bd491f3ab` and completed all seven stages at
`2026-07-16T05:03:38.850648Z`; its byte-for-byte report is committed as
`docs/PRODUCTION_SMOKE.json` with SHA-256
`cd5c0c05b2f007c577905630a61f7be84c71908a511ca9bffad68f76bd86431a`.

Scientific-engine governance is implemented for the released ML packs. The
exact source-bound v5.1 candidate is `bcd5df1…`, local OCI digest `588b0963…`,
and authority `9cd4478e…`. Its four admitted engines are bound to versions,
roles, operations, licenses, installed-file hashes, health evidence, three
normalized SBOMs, raw vulnerability evidence, and an exact-image reviewed
exception. The full local image gate passes. The earlier Cloudflare registry
digest `bdd65fee…` and authority `d7677c79…` remain historical production v2
evidence; those identities are not interchangeable with the new candidate.

## Active v5.1 execution tracker

### At-a-glance execution ledger

- **Done locally:** native Belief Spec v2; bounded Codex scientific compile;
  fixed scorer and epistemic verifier; tri-state primary result authority;
  interactive fixed-kernel controls; deterministic transfer; verified copied
  notebook patches for both ML packs; canonical JSON parity; and end-to-end
  Boundary Map dispatch, fixed execution, rejection, Worker verification,
  integrity/HMAC receipt, retrieval, revision gating, verified-only accessible
  rendering, native Reasoning Diff v2, deterministic Proof Capsule v2
  issuance/download/CLI replay, direct learner download, and the six-stage
  Studio vocabulary with keyboard-operable Evidence & proof tabs; hosted,
  persistently labelled Capsule replay; evidence-first Judge Mode; D1 migration
  application; and an exact source-bound non-root runner candidate whose local
  scientific gate passes.
- **In progress:** Cloudflare registry push, qualified Container/Worker
  promotion, and exact-version production smoke for the schema-fixed v5.1
  candidate.
- **Pending:** current-source 1440 × 900, 1280 × 720, and 390 × 844
  CloakBrowser journeys; rendered accessibility and Web Vitals evidence;
  clean-clone; and final release gates. Chat-first learner simplification and
  the current-tree secret scan are complete locally.
- **Blocked by phase order:** verified physics/free-fall and learner-impact
  expansion. Physics does not begin until both ML concepts pass the new public
  production authority gate.
- **Not run for this checkpoint:** local `dev`, current schema-fixed browser
  journeys, or a completed v5.1 production smoke. The previous promotion and
  partial smoke are recorded above; the exact replacement runner image build
  and scientific qualification checks passed locally.

| Slice | Status | Repository evidence | Remaining release condition |
| --- | --- | --- | --- |
| Belief Spec v2 analyst/session authority | done | Native v2 proposal, confirmation, evidence resolution, v1 replay adapter, and live Worker tests; commits through `06465f3` | Production promotion is deferred until the full v5 chain is complete. |
| Bounded Codex scientific compile | done | Four-file allowlist, compiler provenance, fixed candidate verifier/scorer, two-repair contract, and terminal callback reconstruction; commits `d57b4a2` through `1972c2d` | Rerun in the final production image and smoke both concepts. |
| V5 fixed-run dispatch | done | Exact Belief Spec, Prediction, manifest, fixture, raw/canonical IR, selection, selected IR, report, and Plan hashes bind the run; `c7eca2e` | No production claim until every downstream v5 stage passes. |
| V5 runner/Python execution | done | Versioned runner dispatches `LAB_RUN` before Codex, Python validates Experiment IR v5 and registered fixture authority, fixed kernel alone computes output, and no early result event is emitted; direct leakage and imbalance envelopes are covered. | Rebuild and requalify only with the complete release chain. |
| Worker epistemic result callback | done | Commits `36d8157`, `32e9b0a`, and `f5de4e2` close runner writes, freeze exact bytes, bind frozen kernel/fixture/seed authority, persist reports/verdict, and prove `SUPPORTS` plus five no-release imbalance mutations through the Worker. | Migrate the browser and downstream learner stages before promotion. |
| Browser and downstream evidence authority | done | Commits `f406f0e`, `22169c9`, and `3dbadd0` render exact v2 Belief Specs after refresh, fail closed on mixed or hash-mismatched authority, and route leakage/imbalance to their fixed transfer evaluators. | Preserve this authority tuple through interactive, patch, and proof migration. |
| Interactive controls on v5 lineage | done locally | Commits `30ec305`, `ce88b9c`, and `ee3c78f` add a purpose-separated strict bundle, cross-language fixed derivation, frozen compile/result authority, both concept controls, and immutable session verdicts. | Requalify in the final image and production smoke. |
| V5 deterministic transfer | done locally | Both genuine v5 concepts pass their registered fixed transfer evaluator; `INCONCLUSIVE` may transfer but remains patch-locked. | Requalify inside the complete release chain before production promotion. |
| V5 artifact-specific patch | done locally for both packs | Commits `1d96fe0`, `3f8a653`, `ff5e03c`, `15799f9`, `a970fc0`, `8822f4d`, and `d2f2b92` add the strict v5 bundle, independent Python checks, transfer evaluator binding, idempotent Worker dispatch, genuine verifier reject-repair, source sealing, exact four-output callback, immutable authority, and copied patch download without creating a legacy proof. The Worker test now completes both concepts to `PATCH_VERIFIED`. | Requalify both concepts in the final image and production smoke. |
| Canonical JSON authority | done locally | Commits `47f49a7` and `b4a68ff` preserve dangerous own keys, write sorted object text directly, use UTF-16 key order in both runtimes, reject lone surrogates, preserve Unicode normalization, and pass shared hash vectors without changing normal historical evidence. Proof Capsule v2 records `counterlab-canonical-json-v1`. | Rerun final release vectors after the last lock/source change. |
| Reasoning Diff v2 and Proof Capsule v2 | done locally | Commits through `7e82a5d` add native session authority, deterministic canonical archives, semantic verification, immutable content-addressed storage, safe public receipts, HMAC/integrity policy, exact-byte download, duplicate-callback recovery, tamper rejection, validate/inspect/replay CLI support, a six-dimension learner Reasoning Diff, direct `.counterlab` download for both ML packs, and persistently labelled hosted Capsule replay. No v5 object is cast into legacy proof. | Qualify the exact image and prove both live concepts plus replay in the new production smoke. |
| Boundary Map authority and learner rendering | done locally | Commits through `5b89084`, `77e1cba`, `9c4fc23`, and `f50bab1` bind the exact pack sweep into compile authority, execute only registered grids, freeze and independently reverify lineage and values, issue an integrity/HMAC receipt, reject without result release, expose immutable authority-checked retrieval, gate revision, and render only a verified map with a semantic table and keyboard cell inspection. Both concepts and rejection/reconnect paths are covered. | Requalify both concepts in the final image and run the current desktop/390 px browser journey. |
| Simplified Theater and Judge Mode | done locally; browser pending | `DESIGN.md`, the focused-theater work, hosted Capsule replay commits, `ef066fa`, and v6.1 commits `e4ecf9c` through `755f698` remove the permanent agent cockpit, add the question-first flow and learner components, consolidate technical evidence into a collapsed Evidence & proof drawer, and preserve labelled Judge routes. | Run the 22 current CloakBrowser journeys at 1440 × 900, 1280 × 720, and 390 × 844; capture accessibility/performance evidence; then qualify the exact source. |
| Physics/free-fall | blocked by phase order | No verified public support is claimed. | Start only after both live ML concepts pass the new production authority gate. |
| Final release | in progress | Exact source-bound runner `bcd5df1…` built as local OCI `588b0963…`; scientific gate passes as authority `9cd4478e…`. Previous production v2 smoke remains valid only for that deployment. | Evidence-only commit, registry push, qualification, deploy, exact-version smoke, current browser journeys, and remaining release checks. |

Latest local v5.1 verification checkpoint (2026-07-16):

- Worker API Vitest: 57/57 passed after native Reasoning Diff and Proof Capsule
  issuance for both packs, HMAC and missing/wrong-key policy, immutable
  download, duplicate callback, CLI replay, and tamper rejection.
- Proof Capsule archive/semantic authority Vitest: 5/5 passed; node CLI Vitest:
  3/3 passed. The positive CLI path uses an actual Worker-issued capsule.
- Strict repository, web, and Worker TypeScript checks passed for this slice.
- Concept registry Vitest: 12/12 passed.
- Relevant v5 patch contracts/runner Vitest: 83/83 passed before Worker
  integration; hosted Python patch tests: 9/9 passed.
- Shared canonical, Proof Bundle, session, and Experiment IR suites pass,
  including integer-like keys, non-BMP UTF-16 ordering, dangerous own keys,
  Unicode preservation, and lone-surrogate rejection in TypeScript and Python.
- Boundary Map contracts and Experiment IR: 70/70 focused TypeScript tests
  passed. Registry, analyst, scientific-candidate, and epistemic suites: 101/101
  passed.
- Boundary Map verifier: 24/24 mutation, lineage, canonical-report, and
  integrity/HMAC receipt tests passed. Runner bundle: 21/21; hosted runner:
  15/15 focused tests passed.
- Boundary compile contracts/compiler/runner: 48/48 focused TypeScript tests;
  hosted Boundary execution: 22/22 Python tests.
- Worker Boundary authority after dispatch, rejection, receipt, retrieval, and
  revision-race closure: 18 files and 140/140 tests; session core 26/26;
  repository TypeScript check passed.
- Full Python kernel suite: 170/170 passed.
- Full TypeScript suites after the Belief Spec transport repair: 435/435 root
  and 185/185 web/Worker tests passed; strict repository TypeScript passed.
- Belief analyst transport regression: 36/36 passed. The captured Responses
  schema now has object-valued `items` with an exact length of two; the
  canonical local schema still enforces ordered `current` and `competing`
  hypotheses. The real v2 leakage verification completed at `medium` effort.
- Focused Theater React tests: 3/3 passed; strict web/Worker TypeScript and
  targeted Prettier checks passed. `DESIGN.md` lint reports 0 warnings and 0
  errors.
- Current learner-surface React/API suite: 153/153 passed after strict public
  proof parsing, verified-only Boundary rendering, revision gating, native
  Reasoning Diff/Capsule review, six-stage navigation, and keyboard proof tabs;
  strict web TypeScript passed. Shared contract tests: 39/39 passed.
- Current live Worker test fixtures resolve pack versions from the registry;
  historical signed replay/contract fixtures remain on their original versions.
- Git whitespace check: passed.
- The exact source-bound runner image was built from `bcd5df1…` as local OCI
  `sha256:588b0963…`, with non-root user `10001:10001` and matching OCI source
  labels. The replacement image has not yet been deployed; the preceding v5.1
  deployment and its failed-closed live smoke remain recorded separately.
- Two independent no-cache Python builder executions and the release candidate
  produced the same kernel wheel SHA-256 `38b1be0e…`.
- Scientific registry Vitest passed 68/68; repository TypeScript passed; the
  exact-image scientific gate returned `VERIFIED` with authority `9cd4478e…`.
  Grype recorded 171 findings, 0 fixable Critical, one reviewed fixable High,
  one intended VEX suppression, and zero negative-control suppressions.
- Production D1 migrations `0004_boundary_request_purpose.sql` and
  `0005_proof_capsule_replays.sql` are applied; all 137 existing runner-job
  purpose values were preserved across migration 0004.
- Next active release slice: qualify the exact source, execute the current
  CloakBrowser journeys, push and qualify the matching Cloudflare image, deploy
  the Worker/Container, and run the full production smoke. The learner-clarity
  implementation itself is complete locally.

## Acceptance matrix

| Gate                                         | Status  | Current evidence                                                                                                                                                                                                                          |
| -------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sample/live/replay mode separation           | pass    | Contract and Worker regression tests prevent a non-sample artifact from receiving sample Belief Test, result, patch, or replay authority.                                                                                                 |
| Scientific-engine registry and evidence      | partial | The full gate passes for source-bound local image `588b0963…` and authority `9cd4478e…`; 0 fixable Critical and 1 fixable High are handled by exact-image VEX, bounded reachability, and a negative-control scan. Registry push, production promotion, and new smoke binding remain pending. |
| Safe notebook intake and evidence references | pass    | Parser tests cover bounded input, no execution, active-output sanitization, stable hashes, exact cells/outputs, and typed refusal.                                                                                                        |
| Live schema-constrained Belief Spec          | partial | The exact pre-fix v2 call reproduced `invalid_json_schema`; `36ee156` fixes the provider-compatible wire schema, 36/36 tests pass, and a real medium-effort v2 leakage result validated with resolved evidence. Production rerun is pending. |
| Live analyst preview and approval            | pass    | Live calls require a hash-bound preview of the exact sanitized packet; sensitive-looking evidence requires explicit approval, and claim/artifact changes invalidate it.                                                                  |
| Runner job/token/callback/event cursor model | pass    | D1 repository, optimistic transitions, Worker-held P-256 private signing, Container public-key verification, callback idempotency, cursor reconnect, scoped cancellation, recoverable dispatch acknowledgement, and browser-safe event schemas pass tests and production smoke. |
| Artifact-specific hosted Experiment Plan     | pass    | Worker/runner integration compiles and independently verifies typed v2 Plans; rejected candidates release no result.                                                                                                                      |
| V5 hosted scientific authority migration     | partial | Native Belief Spec, bounded compile/repair, fixed selection, fixture-bound fixed execution, Worker-owned tri-state result release, browser v2 belief rendering, deterministic transfer, frozen interactive controls, both patch paths, both Boundary Map paths, Reasoning Diff v2, Proof Capsule v2 download, and hosted labelled replay pass locally. Exact-image production promotion and smoke remain pending. |
| Fixed hosted result and cross-language hash  | pass    | Python v2 result hashes now use browser-compatible canonical JSON while legacy v1/replay hashes remain stable; TypeScript result verification passes both concepts.                                                                       |
| Entity-leakage lab and mutations             | pass    | Computed random 0.984722, group 0.594444, ablation 0.673611, zero group overlap; the current CLI rejects 13/13 critical mutations and the achieved-metrics collector records the same 13/13 published set.                                |
| Class-imbalance lab and mutations            | pass    | 6,000 rows, 1.0833% positives, majority accuracy 0.989333 with recall 0; threshold recall 0.3125; the current CLI rejects 19/19 critical mutations and the achieved-metrics collector records its narrower 15/15 published set.             |
| Interactive fixed-kernel controls            | pass    | Leakage split/entity/ablation/test-fraction and imbalance threshold/prevalence/metric focus dispatch verified configurations; authoritative results remain immutable.                                                                     |
| Transfer-gated artifact patch                | pass    | Fixed forecasting/manufacturing evaluators gate source-free Patch Plans; both concept patch engines preserve unrelated cells and fail closed on verifier mutations.                                                                       |
| Non-sample leakage patch                     | pass    | Three logistic-regression held-out styles compile through the registered one-cell group/identity transformation; entity aliases and patch mutations are tested.                                                                           |
| Reasoning Diff and portable proof            | partial | Native v5 independently rebuilds frozen compile/result/Boundary/transfer/patch authority, issues Reasoning Diff v2, stores/downloads a semantically validated content-addressed Proof Capsule, renders its six learner-facing dimensions, and persists a visibly labelled hosted replay. Final image qualification and production proof remain pending. |
| Studio navigation and resume                 | pass    | Explicit completed-stage review, recent sessions, canonical refresh restoration, Start over, focused project/evidence rail, command palette, collapsed Evidence & proof drawer, Question → Prediction → Test → Boundary → Apply → Repair progress, keyboard tab navigation, and no-permanent-cockpit contract have React tests. |
| Black-first frontend coherence               | partial | All 24 CSS files resolve through 60 declared variables and 1,574 variable uses with zero undefined or self-referential tokens. Focus and semantic contrast regression checks pass. Current desktop/mobile browser rendering remains unqualified because the required CloakBrowser CDP endpoint is unavailable. |
| Constrained generative UI                    | pass    | `json-render` composes only trusted public proof components from sanitized events; it has no action registry and no validity authority.                                                                                                   |
| Private operational diagnostics              | pass    | Secret-protected Worker aggregation reports queue/phase timing samples, repairs, token usage, concept, support, and failures without notebook or session/artifact/job identifiers.                                                         |
| Held-out intake/routing                      | pass    | `counterlab-held-out-v2`: 10/10 cases pass; four leakage, four imbalance, two unsupported.                                                                                                                                                |
| Held-out fixed full-loop completion          | partial | 7/8 supported notebooks complete Plan verification → fixed result → transfer → verified patch without source edits. Random Forest reaches result/transfer then receives `PATCH_ESTIMATOR_OUTSIDE_CONTRACT`. Human review remains pending. |
| Learner pilot                                | partial | A no-control, counterbalanced two-task descriptive protocol, consent/privacy note, randomization, schema, and analysis script exist. No participants or learner outcomes are claimed.                                                     |
| TypeScript/Web/Python suites                 | partial | Web Vitest passes 58 files/360 tests; repository, web, and Worker TypeScript pass; fixed-kernel/runner Python passes 231/231. Root Vitest passes 486/488, with only the deliberately deferred exact-source integrity and lock evidence checks pending. |
| New-version browser E2E                      | partial | Historical production v2 has 13 passing CloakBrowser journeys and a full live smoke. The current redesign browser suite did not run because no `CLOAK_CDP_ENDPOINT` was available. Desktop, 1280 px, mobile, reconnect, replay, live-mocked, accessibility, and download journeys remain unqualified for this source; no stock browser was substituted. |
| Container image build and production deploy | partial | The schema-fixed image is source-bound to `bcd5df1…`, local OCI `588b0963…`, and passes the local engine gate. Public Worker `89db95bc…` still runs the preceding v5.1 image until replacement qualification/deploy completes. |
| Production live runner smoke                | fail    | Worker `89db95bc…` passed readiness, health, secret scan, Judge Mode, Sample, and replay; untouched leakage failed before state advancement on the now-fixed v2 schema. No result leaked. Both concepts must pass after redeploy. |
| One-command local demo                      | pass    | `./scripts/clean-demo.sh` regenerated both fixtures, passed 5 focused tests, confirmed current local D1 migrations, and served healthy kernel and Worker endpoints before its exact processes were stopped.                               |
| Clean-clone/release check/secret scan       | partial | The source-candidate secret scan passed across 741 files while excluding generated browser-profile state. Exact Node SBOM, image evidence, clean release, and deployment gates remain pending. |

## Latest verified commands

- Web Vitest — 58 files/360 tests passed, including the question-first landing, dark-theme contrast, focus, and release-script safety regressions.
- Fixed-kernel/runner Python — 231/231 tests passed.
- Root Vitest — 486/488 passed; the two pending tests are exact-source evidence checks scheduled after the immutable image build.
- Frontend CSS token audit — 24 files, 60 variables, 1,574 variable uses, zero undefined variables, and zero self-referential variables.
- CloakBrowser render attempt — not run because `CLOAK_CDP_ENDPOINT` was unavailable. No stock browser was substituted.
- `pnpm exec wrangler deploy --config dist/counterlab/wrangler.json --containers-rollout=none` — deployed focused Theater assets as Worker `67b6b2ad-a77b-4f62-b8f6-4bbd02300869` at 100%; Container version 13 and digest `bdd65fee…` remained unchanged. `/ready` returned all five checks true, and CloakBrowser completed the sample at desktop and 390 px with no browser errors or page overflow.
- `./scripts/production-smoke.sh https://counterlab.cserules.workers.dev` — exact Worker version `7c67c0f4-a4cb-4503-80b0-5a5bd491f3ab` and deployed image digest `bdd65fee…`; all seven stages passed, including two genuine untouched live notebooks and authority hash `d7677c79…` in both live Proof Bundles. Report SHA-256: `cd5c0c05…`.
- `COUNTERLAB_E2E_BASE_URL=https://counterlab.cserules.workers.dev ./scripts/test-all.sh` — 303 root TypeScript, 110 web/Worker, and 157 Python tests passed; 13 CloakBrowser journeys passed against production and 2 credentialed browser-only live cases were skipped. The separate production smoke above exercised both real live concepts.
- `./scripts/run-mutations.sh leakage` and `./scripts/run-mutations.sh imbalance` — 13/13 and 19/19 critical mutations detected.
- `PYTHONPATH=services/kernel/src .venv/bin/python scripts/collect-achieved-metrics.py` — regenerated canonical current kernel hashes and the 13/13 leakage plus 15/15 published imbalance mutation subsets in `docs/ACHIEVED_METRICS.json`.
- `./scripts/build-source-bound-runner.sh` from a clean detached worktree — built source `bcd5df1…` as non-root local OCI `sha256:588b0963f3473be0347411a857399f6dfd9f31ccc7c8248963323792ff0a394a` with matching source/tree labels.
- `./scripts/verify-scientific-engines.sh --image counterlab-runner:git-bcd5df1729de303ab9553dd261843977b4f34ffa` — passed with no findings and authority `9cd4478e97c20f235df4df0b20b2e301d5883d42886f5ac73bb8f965ecf62c82`. Its `local_candidate` metadata remains deliberately distinct from Cloudflare production authority.
- The unsuppressed Grype 0.112.0 scan recorded 171 findings and 0 fixable Critical. One fixable High (`CVE-2026-15308`) is bound to exact-image VEX and bounded reachability; the applied scan ignored exactly that one finding and the wrong-subcomponent control ignored none.
- `pnpm test:ts` — 435 root and 185 web/Worker tests passed;
  `pnpm test:python` — 170 passed; repository `tsc --noEmit` — passed.
- Two independent no-cache builder executions plus the release candidate produced kernel wheel hash `38b1be0e3c6e1ca33b3a8f36b45fb3273a416b1c2bea099f25afec71e8ebb87b`.
- `pnpm --filter @counterlab/web test -- --run` after dispatch recovery — 101/101 web tests passed; strict web and Worker typechecks passed.
- `./scripts/test-all.sh` before the final dispatch-recovery slice — 179 root TypeScript, 99 web, 136 Python, and 13 local browser journeys passed with 2 credentialed live skips. A current full rerun remains a release action.
- Historical pre-hardening `./scripts/release-check.sh` and fresh-clone runs passed their then-current locked tree; they are not substituted for the pending v5.1 release rerun.
- `./scripts/clean-demo.sh` — 5 focused tests passed; local kernel and Worker health responses were verified independently.
- `pnpm run held-out:run` — intake 10/10; fixed completion 7/8, with the allowlist refusal recorded rather than bypassed.
- `COUNTERLAB_SANDBOX_IMAGE=counterlab-runner:local ./scripts/reproduce-session.sh leakage-01` — validated historical result `25016542…`, reproduced current semantic result `a6ae7652…`, detected 13/13 mutations, and verified the patch without rewriting replay evidence.
- `./scripts/replay-patch.sh leakage-01` — validated archived patch `eb20…` and independently verified current patch `6aee…`, with group overlap 0.
- Protected production diagnostic probe — unauthenticated 401, authenticated 200, aggregate-only schema.
- Production event cursor probe — a verified 20-event live compile returned events 11–20 when resumed with `after=10`.
- `pnpm run belief:live:verify` — real configured analyst output validated and resolved; approximately 99 seconds on this environment.

## Highest-risk remaining issue

The highest remaining product risk is promotion of the complete native v5
authority without source, image, registry, or smoke drift. Both ML paths now
continue from their frozen Belief Spec, Prediction, Experiment IR, selection,
result, Evidence Verdict, Boundary receipt, transfer, Patch Plan, and copied
patch through Reasoning Diff v2, a semantically verified Proof Capsule v2, and a
persistently labelled hosted replay. The exact local candidate and engine
authority pass; registry push, qualified deployment, current browser execution,
and exact-version production smoke remain open. The current production
deployment stays on its qualified v2 contract until those gates pass.
Upstream Runtime Codex turn intermittency remains an operational
risk; the runner fails closed and the previous production smoke proved its
bounded recovery path. The reviewed vulnerability exception expires on
`2026-07-30T19:10:33Z` and requires requalification on any bound source, image,
SBOM, entrypoint, scanner, or vulnerability-status change. Cloudflare
Containers remain a beta runtime, and no formal sandbox proof is claimed.

## Finish commander update — 2026-07-20T01:07:09Z

- **Branch/source:** `feat/learner-ux-v6.1` at
  `0ac752d83b346ca23be36917eff6eb41a6870268`; the working tree remains
  intentionally dirty and preserved. No source freeze, image promotion,
  deployment, submission, or merge is claimed.
- **Dependency graph:** the repository-local graph now covers 432 files, 4,208
  nodes, and 71,227 edges across TypeScript, TSX, Python, JavaScript, SQL, and
  Bash. The serialized release chain remains source freeze -> exact image ->
  runtime proofs -> qualification -> deploy -> production smoke ->
  CloakBrowser qualification -> submission receipt -> fast-forward merge.
- **Qualification contract slice:** versioned timeout-cleanup, qualified-runner
  v4, and deployment-receipt v4 schemas are generated. Historical v3 schemas
  remained byte-identical. The timeout proof is bound through qualification,
  deployment preparation, Worker identity, deployment receipt creation, and
  production smoke.
- **Current verification for that slice:** repository/web/Worker TypeScript
  passed; focused scientific-registry/release Vitest passed 4 files and 21/21
  tests; timeout and production-smoke Pytest passed 22/22; focused web/Worker
  Vitest passed 5 files and 193/193 tests after correcting one fixture's
  impossible timestamp ordering. Runtime characterization passed 35/35 Vitest
  and 32/32 runner Pytest tests. Broader suites must be rerun after the pending
  runtime changes.
- **Runtime release blockers:** clean allowlisted adapter entry, isolated Python
  proof loading, runtime-policy and full proof-dependency attestation, typed
  timeout sidecars, fail-closed drain/admission, handle-owned shutdown, and
  real aggregate memory/process/CPU enforcement remain open. The existing
  pipeline correctly refuses evidence whose aggregate enforcement flag is
  false; that gate will not be weakened or satisfied by relabelling.
- **Product release blockers:** the 390x844 first fold still hides too much of
  the causal split and uses 14px finding text; Judge still lacks a genuine
  one-click v5 sample Proof Capsule. The unused trusted Lab Scene renderer does
  not yet verify its claimed hash/signature and will not be integrated as
  authoritative UI.
- **Public evidence:** the current branch has not been deployed or qualified in
  a rendered browser. Learner evidence remains `NO_DATA`; the Devpost entry,
  video, public slug, exact release identity, and submission receipt remain
  externally unverified.
- **Next active slices:** complete runtime truth in dependency order, repair the
  isolated mobile first-fold/Capsule surfaces in parallel, run focused then
  broad gates, freeze one clean tuple, and only then execute Wrangler deployment
  and CloakBrowser public qualification.

## Finish commander update — 2026-07-20T01:59:48Z

- **Filesystem and ownership checkpoint:** the verified repository root remains
  `/home/mysterious/storage/github/CounterLab`, branch
  `feat/learner-ux-v6.1`, source `0ac752d83b346ca23be36917eff6eb41a6870268`.
  The existing dirty worktree was inspected and preserved. No deployment,
  submission, source freeze, or merge is claimed.
- **Contained timeout authority:** the timeout proof now enters through an
  explicit session ID and optional control-receipt path, runs with a fixed
  environment, distinguishes controller failure from receipt-proven wall-clock
  timeout, and binds the runtime policy plus complete Python proof-dependency
  manifest into attestation v2 and downstream release evidence. Focused runtime
  verification passed **46/46 Vitest** and **29/29 Pytest** tests.
- **Release identity propagation:** the runtime-policy and proof-dependency
  hashes now flow through qualified release v4, generated deployment config,
  active Worker bindings, `/health`, `/ready`, Judge release evidence,
  deployment receipt v4, and production-smoke report v3. The smoke parser and
  tamper controls passed **18/18 Pytest** tests. Wrangler 4.110.0 regenerated
  the checked-in Worker runtime types successfully; release-only variables are
  still supplied by the generated qualified deployment config and validated by
  the explicit Worker binding contract.
- **Script validation:** Bash syntax checks passed for the source-bound build,
  qualified deploy, production smoke, runtime launcher, and runtime adapter.
  Git whitespace checks passed for the current runtime/release slice. Prettier
  formatted the touched JavaScript/TypeScript files; it correctly has no Python
  parser, so Python formatting remains a separate review item.
- **Still red:** runtime drain proves only empty task/container lists, shutdown
  still signals attested numeric PIDs instead of supervisor-owned child handles,
  and aggregate resource enforcement still truthfully reports incomplete.
  These block exact-image qualification and deployment. Learner-side restored
  result gating, same-sample answer priming, mobile first-fold qualification,
  and the genuine one-click sample Proof Capsule are also still open.
- **Active parallel audits:** read-only audits are checking the smallest safe
  supervisor/drain design, learner restore/Prediction boundaries, and the full
  release identity graph. Production files remain lead-owned; no concurrent
  subagent edits are allowed.

## Finish commander update — 2026-07-20T02:24:38Z

- **Learner result authority repaired:** all session views now reject a
  `verifiedResult` that has no immutable Prediction. Restored and completed
  sessions map only known signed Prediction receipts; an unknown or absent
  receipt withholds the result instead of inventing the former `stays-high`
  default. The legacy replay fallback is used only when no current session
  exists.
- **Same-sample priming removed:** the ordinary landing page explains the
  Question -> Prediction -> one-variable Test mechanism without revealing the
  bundled 98.5% -> 59.4% answer. Judge Mode may still show that completed fixed
  example, but now labels its sample entry as a disclosed walkthrough and does
  not present its Prediction as unassisted.
- **Bundled sample failure is now contained:** fixed sample evidence is parsed
  into an explicit available/unavailable union. Invalid schema, wrong Subject
  Pack, and missing-run fixtures no longer crash module evaluation; Sample mode
  fails closed with a typed learner-facing error, while verified replay
  metadata remains independently importable.
- **Exact focused verification:** five web test files passed **107/107** tests,
  including API/session result gating, restored-session recovery, landing and
  Judge disclosures, Theater binding, and malformed sample cases. Web and
  Worker TypeScript checks passed, including Wrangler 4.110.0 type generation.
- **Current parallel slice:** an isolated accessibility worker owns only the
  three responsive component styles; read-only workers are mapping smoke-schema
  versioning and an honest sample Proof Capsule path. The lead retains release
  scripts, shared contracts, runtime architecture, global CSS, and integration.
- **Graph tooling status:** the repository dependency graph already recorded
  above remains the review baseline. Its requested incremental refresh was
  rejected by the graph service because the account tool-usage limit is
  exhausted; no replacement scanner or bypass was attempted.
- **Filesystem incident log:** one diagnostic `tsx -e` attempt tried to create
  its default IPC socket under `/tmp` and failed with `EPERM` before executing
  the diagnostic. It read or changed no external repository data. The command
  was not repeated; subsequent verification uses repository-contained scripts
  and cache paths only.
- **Still red:** contained-runtime handle ownership, complete drain evidence,
  aggregate resource enforcement, current full-suite qualification, exact
  image freeze/promotion, current CloakBrowser journeys, Devpost/video receipts,
  learner pilot evidence, final deployment, and fast-forward merge remain open.

## Finish commander update — 2026-07-20T02:54:16Z

- **Supervisor-owned runtime shutdown is source-complete:** the contained
  runtime now launches RootlessKit and BuildKit as supervisor-owned child
  handles, proxies BuildKit admission, enters a one-way drain state before
  inventory, validates the drain receipt against the exact attestation, and
  terminates only those owned handles after admission is closed. The stop
  helper no longer signals recorded numeric PIDs or treats a timeout as a
  closed runtime. Focused static/protocol/runtime verification passed **3
  files, 42/42 Vitest tests**; JavaScript parsing, Bash syntax, Prettier, and
  whitespace checks passed for the slice.
- **Behavioral runtime qualification remains blocked, not inferred:** a real
  launcher attempt reached RootlessKit and failed because the managed sandbox
  strips the `newuidmap` capabilities needed for the configured user namespace.
  The failed evidence remains repository-contained under `.rt/rt-supv6201`.
  The required capability-enabled rerun was requested and rejected because the
  tool account limit is exhausted until July 25. No bypass was attempted, and
  aggregate resource enforcement still truthfully remains incomplete. Exact
  image qualification and deployment therefore remain red.
- **Smoke report versioning is backward compatible:** production-smoke report
  v3 owns the eight-field deployment identity; strict historical v2 accepts
  only its original five-field shape. Expanded v2, incomplete v3, malformed
  hashes, and semantic readiness/health mismatches fail closed. Focused smoke
  verification passed **19/19 Pytest tests**.
- **Fixed sample evidence is inspectable without overstated authority:** Judge
  Mode now verifies the checked-in Boundary fixture, exposes separately named
  kernel-result, Experiment IR, Evidence Verdict, Boundary, receipt, and
  fixture-integrity hash domains, and offers a one-click JSON download only
  after schema and canonical-hash verification. The UI explicitly records that
  GPT-5.6, Codex, and the runner were not called and that this artifact is not
  Proof Capsule v2. A tampered fixture withholds both values and download.
  Focused evidence verification passed **4 files, 16/16 Vitest tests** after
  correcting two case-sensitive test matchers; web and Worker TypeScript plus
  Wrangler 4.110.0 type generation passed.
- **Accessibility source hardening is complete for the assigned surfaces:**
  the Judge/Theater isolated styles enforce 44 px controls, the typography
  floors, mobile stable minimum dimensions, horizontal-overflow containment,
  and reduced-motion hover parity. Focused accessibility verification passed
  **4 files, 20/20 Vitest tests**. Rendered CloakBrowser qualification is still
  required before these source-level checks can become public evidence.
- **Current parallel reviews:** read-only workers are reconciling the remaining
  learner P0/P1 acceptance matrix, reviewing the runtime/release dependency
  graph, and independently checking the fixed sample evidence authority and
  accessibility wording. The lead is the sole editor of integration, shared
  state, release scripts, and `docs/PROGRESS.md`.
- **Still red:** aggregate runtime memory/process/CPU proof, a permitted real
  supervisor launch, direct remaining release-binding tamper tests, broader
  suites, exact source/image freeze, Wrangler deployment, current public
  CloakBrowser journeys, live GPT/Codex provenance, supported live notebook
  completion, Devpost/video/submission receipts, real learner evidence, and the
  requested fast-forward merge to `main` remain open. No deployment,
  submission, learner outcome, source freeze, or merge is claimed.

## Finish commander update — 2026-07-20T03:21:26Z

- **Containment remains physical-path verified:** `/bin/pwd -P` and
  `git rev-parse --show-toplevel` both resolve to the permitted root
  `/home/mysterious/storage/github/CounterLab`. The inherited logical `PWD`
  string points at an alternate historical path, so all continuing slices use
  the physical-path check and never target that alternate path.
- **Release receipts now reject cross-domain drift:** deployment receipt
  creation validates runtime-policy and proof-dependency hashes against the
  qualified tuple, with focused receipt and registry tamper verification
  passing **2 files, 8/8 Vitest tests**. Public contained-runtime attestation v2
  projects only its declared public file-hash fields; the internal supervisor
  readiness file remains separately validated and toolchain-bound. Combined
  runtime/release verification passed **5 files, 51/51 Vitest tests**.
- **Supervisor shutdown retries are fail-closed:** a failed SIGTERM timeout
  leaves the supervisor in `DRAINING`, a later shutdown retries only live owned
  children, and closure is recorded only after both owned handles exit.
  Focused supervisor verification passed **3 files, 44/44 Vitest tests**;
  repository, web, and Worker TypeScript all passed.
- **Current sample Repair lineage is source-bound:** an additive deterministic
  fixture now binds the current notebook `d0e9f323…` to patched bytes
  `6aee552e…`; the archived replay remains separately bound from `92ba6389…` to
  `eb20dc7e…`. The Worker verifies the raw current patch byte hash before
  persisting verified Patch or Proof state, and API tests pin both lineages plus
  the downloaded current bytes. The generator/fixture verification passed
  **2/2 Pytest tests**; the earlier integrated sample/App/Worker slice passed
  **4 files, 148/148 Vitest tests**.
- **Fixed sample claim authority now fails closed:** the sample Belief Test API
  accepts only the disclosed fixed customer-generalization question. Unrelated
  or nonsense prose returns typed `SAMPLE_CLAIM_MISMATCH` without advancing the
  session or adding an event; it is never silently rewritten into a verified
  conclusion. Completion fixtures now use bounded one-task language and assert
  against implied mastery. The complete focused Worker/sample/completion slice
  passed **3 files, 91/91 Vitest tests**; repository, web, and Worker TypeScript
  passed, and the touched TypeScript files are Prettier-clean.
- **Judge evidence wording and accessibility are source-checked:** the final
  evidence-pack surface passed **3 files, 14/14 Vitest tests** after narrowing
  its claim to verified fixture and embedded bindings. Browser qualification
  remains pending.
- **Still red and deliberately not bypassed:** aggregate runtime containment,
  a real capability-enabled supervisor lifecycle, complete release-script
  containment, broad clean-tree gates, exact source/image freeze, qualified
  Wrangler deployment, public production smoke, CloakBrowser desktop/mobile
  journeys, supported live completion, Devpost/video/submission receipts,
  learner evidence, and the requested fast-forward merge to `main`. No
  deployment, submission, learner outcome, source freeze, or merge is claimed.

## Finish commander update — 2026-07-20T03:48:05Z

- **The current fixed sample is no longer combined with historical replay
  proof:** compile, result release, transfer, and Repair now re-resolve one
  checked-in authority tuple covering the current notebook `d0e9f323…`, kernel
  result `a6ae7652…`, Experiment IR `c203df37…`, technical report, Evidence
  Verdict, Boundary result/report/receipt, fixture-integrity root, and current
  patch `6aee552e…`. Tuple drift returns typed
  `SAMPLE_AUTHORITY_MISMATCH` before the relevant transition.
- **Legacy proof is withheld instead of overclaimed:** the sample completes at
  `PATCH_VERIFIED` and retains its verified patch download, but no longer issues
  Proof Bundle v1 from mismatched historical verifier material. Completion
  points to the integrity-checked fixed Sample Evidence Pack, explicitly not a
  Proof Capsule v2. Historical `leakage-01` GET replay remains unchanged and
  read-only; the unused replay-session POST now fails with typed
  `REPLAY_SESSION_UNAVAILABLE` instead of binding the current sample artifact to
  historical replay authority.
- **Sample-authority verification:** tampered Boundary hashes, the historical
  result under the current manifest, and historical patch lineage all fail
  closed. Current sample state/events contain none of the five pinned legacy
  result, notebook, patch, verifier, or adapter hashes. After repairing two
  integration mistakes exposed by the first run, the focused authority suite
  passed **5 files, 101/101 Vitest tests**. Repository, web, and Worker
  TypeScript all passed.
- **Repository-contained reproduction accepted after lead diff review:**
  `replay-patch` now requires a new absolute canonical work directory inside
  the verified checkout, retains generated evidence, verifies the historical
  replay separately, and byte/object-compares all five current patch evidence
  files. Focused reproduction tooling passed **12/12 Pytest tests**, the current
  sample fixture passed **2/2**, and the real wrapper passed three times with
  archived patch `eb20dc7e…`, current patch `6aee552e…`, and entity overlap
  `0`. Three ignored evidence work directories remain intentionally; no cleanup
  or deletion was performed.
- **Release identity no longer depends on positional tuples:** qualified-runner
  and deployment receipts now cross scripts as strict keyed JSON envelopes that
  include the complete schema-validated receipt plus the exact receipt-byte
  SHA-256. Release check, qualified deploy, and production smoke use named
  fields and independently re-hash the source receipt before continuing.
  Missing, unknown, malformed, relationally inconsistent, or changed receipt
  data fails closed. Lead verification passed **4 files, 27/27 Vitest tests**
  and the combined production-smoke/reproduction/current-patch slice passed
  **33/33 Pytest tests**; Bash syntax and Prettier checks passed.
- **Broader test truth:** the latest full web run before this slice passed **69
  files, 483/483 Vitest tests**. The latest full root Vitest run remains red:
  **45 files/548 tests passed; 6 files/27 tests failed**, for **575 total**.
  Failures are the restricted loopback/child-process/bubblewrap environment and
  source-bound scientific evidence that correctly detects this dirty tree. A
  capability-enabled rerun request was rejected by the platform usage limit;
  it was not bypassed. One earlier root run used the test harness's ambient
  `/tmp` default before the omission was noticed; all later runs explicitly set
  repository-contained `TMPDIR` and cache paths.
- **Still red:** exact contained-runtime aggregate enforcement, a real
  capability-enabled lifecycle, clean source-bound evidence regeneration,
  exact image qualification, qualified deployment, public smoke,
  CloakBrowser journeys, supported live completion, real learner data,
  Devpost/video/submission receipts, and the requested fast-forward merge to
  `main`. No deployment, submission, source freeze, learner outcome, or merge
  is claimed.

## Finish commander update — 2026-07-20T03:57:27Z

- **Core learner acceptance is current-source green:** one repository-contained
  focused run covering terminal-response recovery, supported-artifact gating,
  transfer semantics, rendered pre-seal result locks, stored/streamed proof
  event merging, fixed-sample claim scope, and the exact sample-authority tuple
  passed **6 files, 164/164 Vitest tests**.
- **Trust surfaces remain current-source green:** provenance shown only from
  genuine events, precise hash-domain labels, capability-link lifecycle and
  privacy, stored proof rendering, static privacy controls, and App integration
  passed **8 files, 106/106 Vitest tests**.
- **Integrated web regression is green:** the current full web suite passed
  **70 files, 487/487 Vitest tests** with `HOME`, `TMPDIR`, and
  `XDG_CACHE_HOME` bound to repository-contained paths. This supersedes the
  older 69-file/483-test checkpoint.
- **Test-containment correction:** the first focused Vitest invocation in this
  slice was started without the required repository-local environment and was
  interrupted immediately before test output. It may have inherited the host
  temporary default; no external inspection or cleanup was attempted. The
  corrected focused and full runs used only repository-contained environment
  paths.
- **Remaining red gates are unchanged:** a genuine semantically validated
  sample Proof Capsule v2, rendered CloakBrowser evidence, real exact-image
  contained-runtime proof, clean release qualification, deployment and public
  smoke, supported live completion, Devpost/video/submission receipts, real
  learner evidence, and the requested fast-forward merge to `main` remain
  open. No deployment, submission, source freeze, learner outcome, or merge is
  claimed.

## Finish commander update — 2026-07-20T04:35:34Z

- **Live claim applicability now fails closed before model work:** a versioned,
  exhaustive policy for the two released Subject Packs rejects off-topic and
  obvious self-contradictory live claims before preview approval, admission, or
  GPT transport. It does not grade prose or claim universal nonsense
  detection. Comparison questions remain valid, common contractions are
  normalized, raw rejected text is not echoed into error/event evidence, and
  rejected sessions remain `INGESTED`. Belief-analyst verification passed **1
  file, 53/53 tests**; both selected and insufficient-evidence Worker routes
  passed **2/2 focused tests**.
- **Runtime Codex provenance is request-versus-evidence precise:** compiler
  dispatch records a system request marker; the learner ledger credits Codex
  only when a verifier-owned event contains schema-valid hosted artifact
  lineage. Legacy actor strings and failed/unverified requests no longer imply
  that Codex acted. Focused web/Worker verification passed **2 files, 6/6
  tests** with 85 unrelated tests skipped; the session transition invariant
  passed **1/1 focused test** with 27 skipped.
- **The 10-second Judge mechanism is now purpose-built for the fold:** compact
  Judge presentation retains the fixed claim, one changed variable, controls,
  exact 98.5%/59.4% values, Boundary consequence, learner benefit, authority
  label, and an integrity link without placing the full technical table inside
  the height-critical card. Focused Theater/Judge/accessibility verification
  passed **3 files, 19/19 tests**. Desktop is source-plausible and mobile is
  borderline; neither is browser-qualified without CloakBrowser bounding-box
  evidence.
- **Audience, vocabulary, and contrast gaps are source-closed:** the landing
  now explicitly addresses learners, both completed-pack reviews say
  `Verified Test`, the recoverable rejection reason uses plain explanation
  language, and the stale live E2E label now targets the canonical Boundary
  result. Focused App verification passed **5/5 tests**. Accessibility source
  verification now calculates WCAG contrast for secondary/faint tokens and
  passed **4/4 tests**. Rendered Axe, screen-reader, and viewport evidence
  remain pending.
- **Review dependency graph is explicit:** dirty-tree curation and source gates
  precede a source freeze; that exact source must produce one runner/image;
  real startup, timeout-cleanup, and aggregate-resource sentinels precede
  regenerated SBOM/VEX/scientific evidence; negative controls precede
  qualification; only the qualified tuple may be deployed; production smoke
  and CloakBrowser public re-audit precede video, submission receipt, final
  evidence docs, and a clean `git merge --ff-only` into `main`. Any source
  repair invalidates every downstream image/evidence receipt.
- **Current integrated checks are green at the web boundary:** repository,
  browser-app, and Worker TypeScript all pass after repairing one redundant
  compact-presentation comparison found by the first web typecheck. The full
  web suite now passes **70 files, 491/491 tests**. Direct production Vite build
  passes with Worker **1,801.62 kB / 346.66 kB gzip**, main client **423.28 kB /
  122.33 kB gzip**, and client CSS **182.81 kB / 32.07 kB gzip**. Playwright
  statically collects **31 tests in 2 specs** against an inert CDP value; none
  executed because no real CloakBrowser endpoint is present.
- **Broader gate truth is refreshed:** the root Vitest run now passes **45
  files / 564 tests** and fails **6 files / 27 tests** (**591 total**). The
  failures remain restricted loopback/Bubblewrap/child-process execution plus
  source-bound scientific evidence that detects the dirty tree; no test was
  weakened. The complete kernel suite passes **184/185 tests**; its only
  failure is the loopback HTTP-service test denied by the sandbox. A narrowly
  requested loopback escalation was rejected by the platform usage limit and
  was not bypassed. The complete runner suite passes **74/74 tests**.
- **Contained Wrangler authentication is not yet available:** with `HOME`,
  `TMPDIR`, XDG paths, config, and log path bound inside the repository,
  Wrangler 4.110.0 `whoami` reports unauthenticated. No Cloudflare token or
  account ID is present in process environment. The reported normal-home login
  cannot be read under the repository constitution, and `--temporary` would
  target the wrong authority, so no deployment was attempted.
- **Boundary incident recorded:** a read-only review worker invoked the
  repository-installed Wrangler version without first rebinding `HOME`/XDG.
  Wrangler attempted its default log under `/home/mysterious/.config`; the
  filesystem returned `EROFS`, no write occurred, and the command was not
  repeated. Every future Wrangler invocation must use repository-contained
  `HOME`, `TMPDIR`, XDG, config, and log paths.
- **Still red:** genuine sample Proof Capsule v2, aggregate runtime enforcement,
  a capability-enabled supervisor lifecycle, stale generated evidence, clean
  exact source/image qualification, contained Wrangler identity verification,
  deployment, production smoke, CloakBrowser QA, supported live provenance,
  learner data, public video/repository/feedback evidence, Devpost submission
  receipt, and the requested merge remain open. No deployment, submission,
  source freeze, learner outcome, browser qualification, or merge is claimed.

## Finish Commander checkpoint — 2026-07-20T07:22:00Z

Deadline: `2026-07-22T00:00:00Z`; **40 hours 38 minutes remained at this
checkpoint**. Branch `feat/learner-ux-v6.1` was at committed HEAD
`0ac752d83b346ca23be36917eff6eb41a6870268` with the preserved in-progress
worktree. This is a current-tree checkpoint, not a deployment receipt.

### Current source and production truth

- **MB-001 is source-pass, production-open.** Both terminal learner decisions
  restart through a deterministic distinct child session, preserve the Question,
  reconcile response-loss retries, hydrate an already-progressed child, and
  replace raw state names with learner-facing status labels. Public back,
  refresh, and resubmission evidence is still absent.
- **MB-006 is source-pass, production-open.** The leakage transfer no longer
  exposes its classification before submission in either the visual or
  accessible description. The imbalance path preserves its released v1
  authority (`manufacturing-rare-defect-v1` and
  `counterlab-imbalance-transfer-v1`) while using the corrected task ID;
  decision, minority-sensitive metric, and evidence selections restore after a
  failed attempt and refresh. Worker patch preflight and Python hosted-patch
  verification reconstruct the fixed semantic policy instead of trusting
  display prose. A checked-in 26-vector corpus covers both packs across
  TypeScript and Python, including pass, optional evidence, missing evidence,
  duplicates, unknown IDs, cross-shape payloads, and reordered equivalence.
  Affected suites pass **46/46 contracts**, **72/72 App and learner UI**,
  **129/129 Worker API, sample-loop, and semantic vectors**, and **71/71 Python
  transfer, verifier, hosted-patch, fixture, and semantic-vector tests**. Root,
  web, and Worker strict TypeScript pass. Browser/public transfer proof remains
  absent. Two earlier root-relative Vitest commands found no tests and exited
  1; corrected config-relative commands produced the results above.
- **MB-007 and bounded sample-claim work remain source-pass, production-open.**
  The pre-Prediction narrative guard and canonical fixed-sample scope have
  focused coverage. Live claim routing remains bounded by the documented
  lexical support decision rather than a claim of arbitrary semantic proof.
- **MB-015 is source-pass only for an honestly labelled fixed Sample Proof
  Capsule v1.** Judge Mode mounts `SampleEvidencePack`, which verifies the exact
  checked-in archive and reference before exposing inspection or download. It
  explicitly says GPT-5.6, Runtime Codex, the runner, learner Prediction,
  revision, and learner event chain were not represented. It is not Live Proof
  Capsule v2 and has no rendered public proof yet.
- **Build-receipt schema divergence is repaired in source.** Bind, VEX,
  qualification, and refresh tooling now share one strict canonical
  source-bound build receipt v4 schema. Focused receipt and source-bound
  evidence tests pass **1/1** and **10/10**; repository TypeScript and Bash
  syntax pass. Full release qualification remains red.
- **Browser status is static only.** Playwright currently collects **31 tests in
  2 specs**. CloakBrowser executed **0** journeys because
  `CLOAK_CDP_ENDPOINT` is unavailable; no stock Chromium fallback, screenshots,
  screen-reader result, console/network result, or Web Vitals result is claimed.
- **Learner evidence remains `NO_DATA`.** Devpost, public video, public-repo
  verification, feedback Session ID, submission receipt, deployment, and final
  merge remain open.
- **Current scientific binding check passes.** The production Node SBOM was
  regenerated from the pinned pnpm 11.13.1 lockfile with `--lockfile-only`,
  normalized, and rebound with the changed fixed transfer sources;
  `refresh-scientific-engine-bindings.ts --check` reports
  `SCIENTIFIC_BINDINGS_CURRENT`. The broader scientific registry suite passes
  **82/85**; three release-verifier tests remain red because the in-progress
  source-bound release evidence still has stale tool-lock/reachability/VEX
  bindings. Those failures remain a release blocker and were not weakened.

### Code-review dependency graph

```text
dirty-tree ownership + source tests
  -> core journey integrity (MB-001/002/006/007/048/012/013)
  -> proof/provenance + Sample Capsule + verified belief-break integration
  -> strict build receipt + aggregate runtime enforcement + frozen deploy bytes
  -> clean source freeze
  -> one exact runner image + real startup/timeout/resource sentinels
  -> regenerated SBOM/VEX/scientific bindings + negative controls
  -> exact qualification receipt
  -> repository-contained Wrangler identity + D1/Container/Worker deployment
  -> public identity/health/production smoke
  -> CloakBrowser desktop/mobile/live/replay/failure qualification
  -> truthful video, learner evidence or NO_DATA, Devpost receipt
  -> reviewed atomic commits and `git merge --ff-only` into `main`
```

Any source change below the freeze point invalidates every downstream image,
evidence, deployment, browser, and submission receipt. Parallel review may
shorten diagnosis, but those release edges remain serialized.

### Immediate ordered queue

1. Keep aggregate-resource qualification fail-closed: the present host cannot
   prove delegated cgroup-v2 aggregate enforcement within the repository-only
   filesystem constitution. Continue non-blocked work, but do not qualify or
   deploy until a compliant delegated builder or a narrowly authorized runtime
   evidence path exists.
2. Characterize and repair the Vite-generated Wrangler configuration mismatch;
   freeze one prebuilt Worker and client manifest for every state-changing
   deployment step.
3. Finish the remaining core/proof source review, then run the complete
   TypeScript, Vitest, Pytest, mutation, held-out, build, formatting,
   whitespace, secret, and release suites. Regenerate source/image-bound
   scientific evidence only from the final frozen tuple.
4. Freeze and commit one clean exact source, build one exact image, run real
   runtime sentinels, regenerate evidence, and qualify the tuple.
5. Deploy only if qualification passes; then execute production smoke and all
   31 CloakBrowser journeys before recording video or submission evidence.
6. Preserve `NO_DATA` unless real consented learner observations are actually
   collected. Merge into `main` only after reviewed final commits and public
   release evidence agree.

## Finish Commander update — 2026-07-20T08:37:23Z

Deadline: `2026-07-22T00:00:00Z`; **39 hours 22 minutes 37 seconds remained at
this checkpoint**. Committed HEAD remains
`0ac752d83b346ca23be36917eff6eb41a6870268`; all results below apply to the
preserved dirty source tree and are not deployment evidence.

### Completed in this slice

- **MB-007 historical v1 authority is source-pass.** The compatibility
  migration no longer promotes the recorded intervention into pre-Prediction
  conditions. A strict compatibility-only v1 narrative schema scans evidence
  relevance, hypotheses, alternatives, limitations, and both predicted
  outcomes. Session proposal and edit boundaries reject unsafe verdict, result,
  and repair prose before persistence, without changing the permissive parser
  used for historical replay. Rejected writes append no event and leave state
  unchanged. The App uses the same shared scanner and preserves the original
  learner Question on the fail-closed screen. No historical signed object or
  hash is rewritten.
- **MB-048 historical fixed-sample scope is source-pass.** A pre-fix sample
  whose claim differs from `SAMPLE_LEAKAGE_QUESTION` remains stored for
  forensics but cannot advance and cannot expose session state, events,
  Reasoning Diff, patch bytes, Proof Bundle, or Proof Capsule. A brand-new
  sample with no belief authority remains allowed to start; a sample carrying a
  v2 belief authority or a mismatched v1 claim fails closed with
  `SAMPLE_SCOPE_RESTART_REQUIRED`.
- **Focused verification:** contracts **46/46**; full App **61/61**; historical
  sample API **2/2 selected** with 94 unrelated tests skipped; v1 session
  transition **1/1 selected** with 29 unrelated tests skipped; repository, web,
  and Worker strict TypeScript all pass. Exact-file Prettier and Git whitespace
  checks pass. One initial isolated `pnpm exec` attempted registry resolution
  and failed before test collection; repository-local binaries produced the
  reported results. One web-root filter found no tests; the corrected
  config-relative invocation produced the full App result.

### Frozen Worker/client byte graph

- Source now performs one Vite build, creates one deterministic frozen Worker
  and client-asset manifest, projects the 51-key generated Wrangler config into
  the reviewed 15-key release config, and supplies the same positional Worker
  bundle with `--no-bundle` to dry-run, maintenance, Container rollout, and
  final deployment steps. Deployment receipts and Worker health carry the
  manifest, Worker bundle, and client-tree hash domains.
- Focused release tests pass **24/24**, release-facing web/Worker tests pass
  **151/151**, deployment-config characterization passes **17/17**, repository,
  web, and Worker TypeScript pass, and Bash syntax passes. A real local Vite
  build and Wrangler 4.110 dry-run proved the emitted `index.js` hash equals the
  frozen Worker bundle. That manifest describes the dirty tree and is test
  evidence only.
- The binding remains **`PROCESS_BOUND_PARTIAL`**. Review found six open
  release-integrity edges: v4 omitted the v3 dry-run equality invariants;
  manifest and qualified/release-receipt bytes are not rehashed before every
  state-changing step; the production-smoke Python characterization is stale
  and absent from the release test graph; public client bytes are not yet
  compared path-for-path to the frozen manifest; and the partial classification
  is not propagated through receipt, health, UI, and smoke. These are active
  source blockers. No deploy or exact public-byte claim is made.

### Active dependency graph and next work

```text
v1 narrative and sample-scope guards [source PASS]
  -> stored compiler history across all runner jobs [IN PROGRESS]
  -> proof/provenance copy and exact Judge evidence table
  -> frozen-byte invariant repairs and public-asset verifier
  -> full source suites and reviewed atomic commits
  -> exact source/image evidence and real aggregate-runtime sentinel [BLOCKED]
  -> qualification -> Wrangler deploy -> public smoke -> CloakBrowser QA
  -> truthful submission evidence -> fast-forward merge to main
```

The stored-event audit confirmed the current merge primitive and evidence-chain
verification are sound, but native v5 refresh loses compiler activity because
`/events` supplies lifecycle evidence only and the patch runner is child-local.
The next implementation will return bounded, ordered, all-status runner-job
history with a separately labelled recorded-stream receipt, merge it with live
events, and keep hosted replay on its existing share-safe activity projection.
Aggregate cgroup enforcement, CloakBrowser, deployment, learner evidence,
Devpost submission, video, and merge remain open.

## Finish Commander update — 2026-07-20T09:02:03Z

Deadline: `2026-07-22T00:00:00Z`; **38 hours 57 minutes 57 seconds remained at
this checkpoint**. Committed HEAD remains
`0ac752d83b346ca23be36917eff6eb41a6870268`; this is current dirty-source
evidence, not a release, deployment, or browser receipt.

### MB-005 stored proof history is source-pass

- The runner-job repository now returns every status for a session in stable
  creation-time/job-ID order. The service rejects cross-session and duplicate
  repository history before returning a clone.
- `GET /api/sessions/:id/events` now takes a bounded, race-checked snapshot of
  the verified evidence chain and all recorded public compiler streams. It
  caps history at 32 jobs and 512 compiler events, verifies every job-local
  cursor, job identity, and globally unique event ID, retries one changed
  snapshot, and otherwise fails with a retryable busy response. Compiler
  activity is labelled `RECORDED`; it is not represented as cryptographic or
  scientific verification.
- The client validates the compiler receipt, count, contiguous cursors,
  non-reappearing job streams, and evidence receipt. App hydration merges
  stored events, legacy proof events, the active runner, patch runner, and
  interactive leakage runner deterministically. Restored native v5 sessions
  populate Plan and Verifier even when no embedded Proof Bundle exists.
- Hosted public replay remains a separate share-safe projection. Its Evidence
  & proof disclosure now always shows Activity, Plan, Diff, Tests, and Verifier
  groups while publishing only sequence, actor, and allowlisted kind. It
  explicitly excludes job/event IDs, timestamps, source excerpts, and patch
  diffs, and introduces no mutable controls.
- Exact affected results: session-core runner jobs **10/10**; Worker API plus
  D1 runner repository **103/103**; combined App, API, proof merge, Proof
  Console, provenance ledger, and public replay **126/126**. Repository, web,
  and Worker strict TypeScript pass. Exact-file Prettier and Git whitespace
  checks pass. One root Vitest invocation intentionally found no web tests;
  rerunning through `apps/web/vitest.config.ts` produced the reported web
  results. One formatter path was invoked from the web directory and was not
  found; the correct repository-root formatter then reported all files
  unchanged.

### Exact-release receipt progress

- Deployment receipt v4 now rejects a dry-run hash that differs from the
  frozen Worker bundle and structurally requires exactly one authoritative
  Worker file. The pure constructor assertion rejects byte drift, zero files,
  and multiple files; the generated JSON Schema carries `const: 1` while the
  sibling-hash equality remains a runtime Zod refinement.
- Focused deployment-receipt and release-schema tests pass **18/18**; root
  TypeScript, generated-schema byte equivalence, Prettier, and whitespace
  checks pass.
- This does not close the cloud-mutation gate. `deploy-qualified.sh` must apply
  the singleton dry-run check before its first remote mutation. Public
  path/hash/count asset comparison, ignored frozen-output secret scanning,
  production-smoke gate coverage, receipt revalidation before every remote
  mutation, truthful `PROCESS_BOUND_PARTIAL` propagation, and authenticated
  account binding remain open.

### Current dependency graph

```text
MB-005 stored/private proof history + share-safe public replay [SOURCE PASS]
  -> frozen receipt hash/count invariants [SOURCE PASS]
  -> pre-mutation singleton + receipt-byte checks
  -> frozen-output secret scan + public path/hash/count verifier
  -> smoke characterization + readiness/classification propagation
  -> clean source freeze -> one exact image -> aggregate-runtime proof [BLOCKED]
  -> qualification -> authenticated Wrangler deploy -> public identity/smoke
  -> CloakBrowser qualification -> truthful submission -> ff-only main merge
```

No Cloudflare mutation, CloakBrowser journey, exact-image aggregate-resource
proof, learner observation, Devpost update/submission, video publication,
source freeze, commit, or merge occurred in this slice.

## Finish Commander update — 2026-07-20T09:48:16Z

Deadline: `2026-07-22T00:00:00Z`; **38 hours 11 minutes 44 seconds remained at
this checkpoint**. Committed HEAD remains
`0ac752d83b346ca23be36917eff6eb41a6870268`; all evidence below describes the
preserved dirty source tree. It is not a deployment or browser qualification.

### First-fold and browser-test source progress

- The landing keeps the chat-like Question composer visually dominant, moves
  the explanatory fixed-test card to the secondary column, and switches to one
  column before the prior intermediate-width overflow range. The first-fold
  promise now states: “Name the claim. Lock your expectation. Change one
  thing, then let fixed evidence answer.” The pre-Prediction surface remains
  result-locked.
- Judge comprehension assertions now separate 10-second claim/result, 20-second
  intervention/control, and 30-second authority/Boundary/benefit proxies for
  desktop and mobile. Source-focused UI tests previously passed **91/91**;
  current release-facing App/API/Judge/Worker selections passed **4/4** with
  150 unrelated tests skipped.
- Playwright statically collected **29 tests in one spec**, including exact
  public assets, desktop/mobile first folds, Judge, sample, replay, live,
  refresh, recovery, keyboard, reduced-motion, transfer, patch, and Capsule
  paths. This was collection only. `CLOAK_CDP_ENDPOINT` is still unavailable,
  so zero rendered journeys or screenshots are claimed. An initial incorrect
  root-relative Playwright binary path exited 127; the repository-local web
  binary produced the successful collection.

### Exact Worker/client release graph is source-pass

- One canonical manifest now binds the Worker bundle, the complete deploy tree,
  the separately fetchable public subset, exact file counts, the truthful
  `PROCESS_BOUND_PARTIAL` classification, and observed pinned Vite `8.1.4` and
  Wrangler `4.110.0` versions. `/` is the public deployment path for
  `index.html`; `.assetsignore` and `_headers` remain non-fetchable metadata
  whose bytes stay in the complete tree.
- Config, Worker health/readiness, strict browser schema, Judge disclosure, and
  deployment receipt v4 carry the same classification, full/public hashes and
  counts, and tool versions. Judge labels the complete deploy-tree and
  fetchable-public-subset domains separately rather than implying one hash
  proves every domain.
- Deployment receipt construction now reuses the canonical manifest collector.
  This repaired a release-stopping duplicate representation that omitted
  `publicPath` and would have rejected every receipt after cloud mutation.
- The final deployment build is explicitly secret-scanned, including ignored
  `dist` bytes. Wrangler dry-run must contain only its reviewed README and one
  byte-identical Worker bundle before any remote mutation.
- A dedicated account parser consumes `wrangler whoami --json` in memory,
  returns only the configured 32-hex account ID, and rejects logged-out,
  malformed, missing, duplicate, or wrong account evidence. Raw email,
  permission, and token metadata is not persisted.
- The deployment authority guard now runs before maintenance Worker deployment,
  D1 migration, Container rollout, final Worker deployment, and receipt issue.
  It rechecks clean exact HEAD, qualified/release-check receipt bytes, raw
  manifest bytes, reconstructed Worker/client bytes, release/maintenance/
  recovery configs, pinned tool versions, strict dry-run projection, and the
  current authenticated account. Recovery uses an exclusive preserved config
  and deliberately does not depend on the guard; pre-migration failure restores
  the prior Worker, while post-migration or Container failure targets the exact
  maintenance Worker without claiming D1 or Container rollback.
- Production smoke report schema v4 records the expanded release identity.
  Readiness and health require exact equality with the receipt. The
  CloakBrowser public-asset test now reads the receipt-bound manifest, fetches
  every non-null `publicPath` in the browser context, verifies status, no
  redirect, byte hash, byte length, expected immutable caching, no secret
  pattern, canonical public hash, and exact count. It no longer treats only
  incidentally loaded JS/CSS as complete release proof.

### Exact verification in this slice

- Frozen release, Cloudflare account, deployment receipt, and generated schema:
  **4 files, 29/29 tests passed**.
- Deployment config and command-order characterization: **17/17 passed**.
- Production smoke/report characterization: **19/19 passed**; combined secret
  scan, smoke, and OCI-normalization run: **26/26 passed**.
- Repository, web, and Worker strict TypeScript: passed.
- Repository secret scan: **1,389 files passed**. Explicit ignored frozen-build
  scan: **27 files passed**.
- Shell syntax, exact-file Prettier, generated receipt schema, and Git whitespace
  checks: passed.

### Current dependency graph

```text
core journey + stored proof history [SOURCE PASS]
  -> first-fold belief-break source and assertions [SOURCE PASS]
  -> full/public frozen artifact identity [SOURCE PASS]
  -> receipt + smoke + deploy mutation guards [SOURCE PASS]
  -> broader source suites and reviewed atomic commits [NEXT]
  -> clean exact source + one image + aggregate-runtime proof [BLOCKED]
  -> authenticated deploy of only the qualified tuple
  -> CloakBrowser exact-public-asset and journey qualification [BLOCKED]
  -> truthful Devpost/video/learner evidence -> ff-only main merge
```

Aggregate cgroup evidence remains impossible under the repository-only
filesystem constitution because the required runtime evidence surface is
outside the repository. No Cloudflare mutation, public release claim,
CloakBrowser execution, learner study, Devpost publication/submission, video,
commit, or merge occurred at this checkpoint.

## Finish Commander update — 2026-07-20T10:04:44Z

Deadline: `2026-07-22T00:00:00Z`; **37 hours 55 minutes 16 seconds remained at
this checkpoint**. Committed HEAD remains
`0ac752d83b346ca23be36917eff6eb41a6870268`. The build and test receipts below
describe the preserved dirty source tree and are not qualification or
deployment evidence.

### Exact build projection and release-script repairs

- The dirty-tree production build passed. Output was Worker **1,828.13 kB /
  353.00 kB gzip**, main client **539.62 kB / 144.79 kB gzip**, and CSS
  **199.73 kB / 34.57 kB gzip**. The main client remains above Vite's 500 kB
  warning threshold. No runtime Web Vitals are available.
- The frozen audit manifest binds source commit
  `0ac752d83b346ca23be36917eff6eb41a6870268`, Worker SHA-256
  `3519f6ce3f0e267c8ed53d6c397e02b0af589b540c5bb0348395e1233d8d33bc`,
  complete client-tree SHA-256
  `05cc1def553ff0e5da4d9baac1fa62c8e3d1fcfbd8ab4b9dd405429ddc3acec9`
  across 26 files, and fetchable-public SHA-256
  `4cf51edc79386a173fa94d91aaf746839435317e6f222d8c3be6f75d8c5ff1b2`
  across 24 files. Classification remains `PROCESS_BOUND_PARTIAL`.
- Two independent Wrangler 4.110.0 dry runs emitted one exact Worker bundle;
  strict manifest verification passed both times. Debug output explains
  Wrangler's count precisely: 27 enumerated entries are 26 files plus the
  `assets/` directory entry. Wrangler then explicitly ignores `.assetsignore`
  and `_headers`, leaving the manifest's 24 browser-fetchable files. This is
  local projection evidence only.
- A real source defect in the scientific-evidence refresh was fixed with a
  red/green characterization: attestation, image load, image inspection, and
  bounded reachability execution now all use the same session-bound contained
  runtime command. No legacy raw adapter load, inspect, or run invocation
  remains.
- VEX preparation now parses the shared build-receipt v4 schema strictly at
  its first boundary. A new regression proved the previous parser accepted an
  unknown field before the strict parser rejected it. It now rejects the
  unknown field before creating any staged evidence output.
- Focused source-bound evidence tests pass **10/10**; repository TypeScript and
  refresh-script Bash syntax pass.

### Complete current test truth

- Full web Vitest: **71/71 files and 554/554 tests passed**.
- Current full root Vitest: **49/55 files and 597/624 tests passed**;
  **6 files and 27 tests failed**. The failures are fully classified:
  18 Codex App Server tests are blocked by managed-sandbox nested Node stdio;
  five hosted-runner tests are blocked by localhost `listen EPERM`; one real
  Bubblewrap probe is blocked by namespace/netlink `EPERM`; and three
  scientific-registry tests correctly report stale source/image evidence.
  Counts overlap by file but total exactly 27 failed tests. The previously
  failing release-check receipt fixture is repaired.
- Full kernel Pytest: **220/221 passed**; the sole failure is the unchanged
  HTTP service test's denied localhost bind.
- Static Playwright collection: **29 tests in one spec**. Zero current-branch
  rendered journeys were executed because `CLOAK_CDP_ENDPOINT` is unavailable.
- Repository secret scan passed **1,389 files**; exact ignored build scan
  passed **27 files** (one Worker plus 26 client-tree files). Repository, web,
  and Worker TypeScript, generated schema equality, selected Prettier, shell
  syntax, and Git whitespace checks pass.

### Fail-closed capability and evidence status

- A capability-enabled hosted-runner test was requested with repository-
  contained HOME/TMP/XDG paths. The execution platform rejected escalation
  because its usage allowance is exhausted. No workaround was attempted and
  no capability-enabled pass is claimed.
- Registry-only evidence verification is correctly red for old source/image,
  pnpm tool-lock, reachability v1, missing OCI manifest binding, and changed
  App renderer/test hashes. The complete source-bound v2 refresh must occur
  only after a clean source commit and one exact contained image; visible
  hashes will not be hand-patched.
- The newly integrated `VerifiedBeliefBreakTheater` is result-bearing and must
  enter the renderer-integrity scope before refresh. The trusted Lab Scene
  renderer is checked in and tested but is not yet production-integrated. A
  read-only dependency-graph audit is identifying the complete minimal scope
  before the source freeze.

### Active dependency graph

```text
core learner/proof/release source [PASS]
  -> session-bound evidence refresh + strict v4 receipt boundary [PASS]
  -> complete result-renderer integrity scope [IN PROGRESS]
  -> reviewed atomic source commits and clean source freeze
  -> one exact contained image + aggregate-runtime evidence [BLOCKED]
  -> source-bound evidence v2 regeneration and qualification
  -> authenticated Wrangler deploy of only the qualified tuple
  -> public smoke + CloakBrowser journeys [BLOCKED]
  -> truthful submission evidence -> ff-only main merge
```

No Cloudflare mutation, exact-image qualification, public deployment,
CloakBrowser journey, learner observation, Devpost publication/submission,
video, new commit, or branch merge occurred in this slice.

## Finish Commander update — 2026-07-20T12:14:58Z

Deadline: `2026-07-22T00:00:00Z`; **35 hours 45 minutes 2 seconds remained at
this checkpoint**. Committed HEAD remains
`0ac752d83b346ca23be36917eff6eb41a6870268`; every result below is dirty-tree
source verification, not release qualification.

### Trusted generated Lab Scene is now source-integrated

- Live notebook result views now lazy-load `VerifiedLabScenePanel` only after
  an immutable Prediction and fixed verified result exist. The Worker reloads
  the frozen compiler bytes, reruns the fixed scientific verifier, rechecks
  stored lineage, and returns a strict private/no-store scene/result envelope.
  Sample and replay authority cannot enter this route.
- The shared envelope binds scene ID, session, concept, raw Experiment IR,
  Discrimination Contract, scene hash, fixed result hash, and result bytes.
  The browser renderer fails closed on stale authority, unresolved paths,
  prototype traversal, unknown blocks, or an integrity/result mismatch.
- Endpoint acceptance proves pre-result `409 LAB_SCENE_RESULT_REQUIRED`, exact
  post-verification release, private/no-store caching, two result-bearing
  Metric blocks, and `409 SCIENTIFIC_AUTHORITY_DERIVATION_MISMATCH` after a
  frozen-scene mutation. The client rejects a forged integrity binding.
- Scientific candidate verifier **v4** now requires at least two distinct
  selected-run Metric bindings rooted at the exact authoritative result v2.
  Explanation-only scenes, stale run IDs, duplicate metrics, and bound block
  types absent from that result root cannot pass. The Codex prompt receives
  the same fixed binding manifest and still cannot provide literal results or
  verifier authority.
- The generated scene remains honestly labelled `GUIDED_VISUAL`; fixed result
  verification does not relabel model-authored presentation as a verified
  test.

### Integrity-scope omission closed in source

- `scripts/internal-scientific-integrity-scope.ts` now owns exact, sorted
  oracle, renderer, mutation, and signed-result-binding path sets. It rejects
  missing, unexpected, duplicate, absolute, traversal, backslash, and unsorted
  paths and checks that every signed-result renderer/test is included in its
  enclosing integrity role.
- Both scientific evidence generators now materialize those exact paths rather
  than trusting keys already present in evidence JSON. This closes the prior
  failure mode where deleting a declared path silently narrowed refreshed
  evidence.
- Renderer scope now includes `ExperimentTheater`,
  `VerifiedBeliefBreakTheater`, `TrustedLabSceneRenderer`, and
  `VerifiedLabScenePanel`; the fixed sample Boundary authority remains in the
  oracle role instead of being mislabelled as presentation authority.
- The non-mutating bindings check reaches the expected stale-evidence gate and
  names ten outputs requiring regeneration, including all three internal
  integrity records and `signed-result-binding-v2`. No evidence hash was
  hand-patched.

### Exact verification in this slice

- Shared Lab Scene contract: **7/7 passed**.
- Trusted renderer and panel: **2 files, 11/11 passed**.
- Client Lab Scene acceptance: **1/1 passed**, 34 unrelated tests skipped.
- Worker Lab Scene authority: **1/1 passed**, 98 unrelated tests skipped.
- Live App integration through the explicit result-reveal action: **1/1
  passed**, 60 unrelated tests skipped.
- Scientific candidate verifier: **21/21 passed**, including both new binding
  mutations.
- Codex scientific prompt regression: **1/1 passed**, 6 unrelated tests
  skipped.
- Source-owned integrity scope: **8/8 passed**.
- Source-bound evidence characterization: **10/10 passed**.
- Python hosted plan interpreter: **12/12 passed**.
- Repository, web, and Worker TypeScript: passed.
- One initial `tsx` command failed because the managed sandbox denied its IPC
  socket. The same check was rerun cache-disabled through `node --import tsx`;
  it reached only the expected stale-evidence drift gate.

### Active dependency graph

```text
trusted post-result Lab Scene + fixed binding manifest [SOURCE PASS]
  -> source-owned renderer/oracle/mutation scope [SOURCE PASS]
  -> complete current web/root/kernel regressions + formatting/build [NEXT]
  -> reviewed atomic source commits and clean source freeze
  -> one exact contained image + aggregate-runtime evidence [BLOCKED]
  -> source-bound evidence v2 regeneration and qualification
  -> authenticated Wrangler deploy of only the qualified tuple
  -> public smoke + CloakBrowser journeys [BLOCKED]
  -> truthful submission evidence -> ff-only main merge
```

No Cloudflare mutation, exact-image qualification, public deployment,
CloakBrowser journey, learner observation, Devpost publication/submission,
video, new commit, or branch merge occurred in this slice.

## Finish Commander update — 2026-07-20T12:20:56Z

Deadline: `2026-07-22T00:00:00Z`; **35 hours 39 minutes 4 seconds remained at
this checkpoint**. Committed HEAD remains
`0ac752d83b346ca23be36917eff6eb41a6870268`; these are broad dirty-tree source
checks, not exact-image or deployment qualification.

### Broad source gates after trusted Lab Scene integration

- Full web Vitest passed **72/72 files and 558/558 tests**.
- Full root Vitest ran **56 files and 635 tests**: **50 files and 608 tests
  passed; 6 files and 27 tests failed**. The failure classes remain the known
  environment/evidence gates: 18 Codex App Server tests blocked by managed
  nested-Node stdio, five hosted-runner localhost tests blocked by `EPERM`, one
  Bubblewrap namespace/netlink probe blocked by `EPERM`, and three checks that
  correctly reject stale scientific evidence pending a clean source commit and
  exact image.
- Full kernel Pytest ran **221 tests**: **220 passed and one localhost service
  test failed** because the managed environment denied the socket bind with
  `PermissionError: EPERM`.
- The production Vite/Worker build passed. Output was Worker **1,835.20 kB /
  354.79 kB gzip**, main client **545.08 kB / 146.21 kB gzip**, and CSS
  **199.73 kB / 34.57 kB gzip**. The lazy trusted Lab Scene panel is **18.71 kB
  / 5.34 kB gzip** with **9.38 kB / 2.36 kB gzip** CSS. The existing main-chunk
  warning above 500 kB remains. Vite also reports that the belief-break module
  is both statically and dynamically imported, so that module does not split
  into a separate chunk.
- Repository, web, and Worker TypeScript passed. All newly introduced product,
  authority, scope, and renderer tests passed inside the broad suites.

### Current qualification truth

The source-side result-rendering dependency is now covered and broad product
regression is green. Exact scientific evidence remains intentionally stale
until the dirty tree is reviewed and committed, and the capability-dependent
runtime gates remain unavailable in the managed environment. No test was
weakened, no stale evidence was refreshed or hand-edited, and no deployment
was attempted.

```text
current P0/P1 reconciliation + complete diff review [IN PROGRESS]
  -> selective atomic commits and clean source freeze
  -> exact contained image + real capability proof [BLOCKED HERE]
  -> source/image-bound evidence regeneration and all-green qualification
  -> guarded Wrangler deployment
  -> public smoke + CloakBrowser qualification [CLOAK ENDPOINT ABSENT]
  -> truthful submission evidence -> ff-only main merge
```

## Finish Commander update — 2026-07-20T12:44:26Z

Deadline: `2026-07-22T00:00:00Z`; **35 hours 15 minutes 34 seconds remained at
this checkpoint**. Committed HEAD remains
`0ac752d83b346ca23be36917eff6eb41a6870268`; no release or deployment is
claimed.

### P0/P1 source reconciliation

- MB-001, MB-002, MB-003, MB-004, MB-005, MB-006, MB-007, MB-009, MB-010,
  MB-012, MB-013, MB-015, MB-016, MB-017, and MB-048 are source-covered by
  current mechanisms and focused regressions. Every item still requires its
  named public/browser acceptance journey against the exact deployed tuple.
- CL-001 remains open because no official Devpost receipt, `submitted_at`, or
  public slug exists. CL-006 remains honestly `NO_DATA` with zero participants.
  CL-024 remains open; GPT-5.6 is still the bounded one-shot reasoning analyst,
  and no Learning Director or agentic tool loop is claimed.
- CL-023 is source-partial against the strict audit wording. Judge Mode shows
  the complete checked-in 98.5% to 59.4% belief break immediately, while the
  landing intentionally withholds those result values and active sample/live
  sessions preserve the immutable-Prediction gate. The trusted Lab Scene is
  post-result only. No rendered 10/20/30-second comprehension proof exists.

### Qualification fail-open repaired

- A read-only release audit found that timeout cleanup was parsed without
  requiring aggregate resource enforcement. The current rootless runtime
  truthfully emits `aggregateLimitIntentEnforced: false` and a process-only
  limit mode, yet the old qualification path could still create a `VERIFIED`
  runner receipt.
- Red characterizations were added before repair in both TypeScript and Python.
  Qualification now accepts only
  `container-cgroup-and-process-rlimit` with
  `aggregateLimitIntentEnforced: true`; process-only, merely declared, or
  unknown modes fail closed. Qualified-runner receipt v4 and its generated JSON
  Schema carry both fields.
- Post-source evidence changes are now an exact allowlist. Authority schemas,
  runtime policy, scripts, or undeclared evidence cannot be hidden beneath a
  broad `scientific-engines/**` prefix.
- The source-bound build allowlist now names the exact generated files and
  includes the previously omitted three internal validation records, Subject
  Pack bindings, and signed-result-binding v2. The refresh receipt now hashes
  the signed-result binding instead of silently omitting it.

### Exact verification in this slice

- Aggregate qualification, exact evidence delta, source-bound evidence, release
  schema, and release-check tests: **5 files, 32/32 passed**.
- Python timeout-proof validation: **5/5 passed**.
- Worker deployment configuration: **17/17 passed**.
- Repository, web, and Worker TypeScript: passed after updating the shared
  qualification fixture.
- Shell syntax for the two changed source-bound release scripts: passed.
- Git whitespace and repository secret scan: passed; the secret scan covered
  **1,382 files**.
- One first Python invocation omitted the kernel source from `PYTHONPATH` and
  failed collection; the corrected invocation produced the 5/5 result. One
  first Worker Vitest invocation duplicated the config path and failed startup;
  the corrected config-relative command produced the 17/17 result.
- The complete Prettier traversal was stopped after several minutes while it
  traversed the preserved 65 MB audit tree. Exact changed TypeScript, schema,
  and progress files were formatted; a final scoped changed-file check remains.

### Release decision

Wrangler deployment is **NO-GO** on the present host. No current aggregate
enforcement proof, runtime session, exact image, source-bound evidence receipt,
qualification receipt, contained Wrangler authentication, CloakBrowser
endpoint, or release-check receipt exists. The new guard correctly prevents
the process-only runtime from being promoted. No gate will be narrowed and no
partial tuple will be deployed as verified.

## Finish Commander update — 2026-07-20T13:12:57Z

Deadline: `2026-07-22T00:00:00Z`; **34 hours 47 minutes 2 seconds remained at
this checkpoint**. Committed HEAD remains
`0ac752d83b346ca23be36917eff6eb41a6870268`; all results below apply to the
preserved dirty source tree.

### Aggregate proof hardened beyond a mode flag

- A second independent review showed that the first fail-closed repair still
  trusted a mode string and Boolean. A future receipt could have asserted those
  two values without observed controller evidence.
- Qualification now additionally requires a strict, canonically hashed cgroup
  v2 observation: exact requested/observed memory, swap, PID, and CPU limits;
  invocation/container/spec identity; a unique leader-plus-descendant member
  set; increasing memory, PID, and CPU negative-control counters; timeout
  cleanup; observer hashes; runtime attestation; and a fresh observation time.
  The exact aggregate-evidence hash is carried into timeout receipt v1 and
  qualified-runner receipt v4.
- The repository-contained producer truthfully emits
  `aggregateLimitEvidence: null`, process-only mode, and
  `aggregateLimitIntentEnforced: false`. It cannot qualify merely by flipping
  fields. A compliant post-run observer is not implemented because this host
  has no delegated cgroup v2 authority and repository policy forbids inspecting
  or mutating the external kernel cgroup filesystem.
- Evidence-only source-to-evidence deltas now parse Git raw status and mode.
  Only regular-file additions and modifications on the exact reviewed path set
  pass; deletions, renames, symlinks, executable-bit changes, authority schemas,
  and undeclared files fail closed. Python receipt loading now rejects every
  intermediate symlink, not only the terminal path.

### Exact verification

- Aggregate/release TypeScript slice: **5 files, 34/34 passed**.
- Python timeout proof: **6/6 passed**, including intermediate-symlink
  rejection.
- Worker deployment configuration: **17/17 passed**.
- Honest process-only rootless receipt characterization: **1/1 passed** with 34
  unrelated contained-runtime tests skipped.
- Repository TypeScript: passed.
- Generated timeout and qualified-runner JSON Schemas were regenerated from
  the strict source contracts.
- Playwright static collection found **31 tests in 2 specs** using a synthetic
  unreachable CDP value only for configuration parsing. It launched no browser
  and produced no rendered evidence; the real `CLOAK_CDP_ENDPOINT` is absent.
- Repository-contained `wrangler whoami --json` returned
  `{"loggedIn":false}`. No Cloudflare token, account environment, runtime
  session, runtime adapter, or BuildKit address is injected. The owner's normal
  home login was not read or copied.
- One source-bound evidence test originally exceeded Vitest's default five
  second timeout while launching seven bounded child checks; it passed 11/11
  after assigning a 30-second test budget. One source-format assertion was
  updated to tolerate Prettier whitespace while still requiring both exact OCI
  load vectors.

### Release decision remains unchanged

Wrangler deployment remains **NO-GO**. The strengthened proof contract prevents
false qualification but does not create the missing cgroup capability. No
current image, qualification receipt, release-check receipt, contained Wrangler
identity, CloakBrowser endpoint, deployment, browser result, learner outcome,
video, or Devpost receipt is claimed.

## Finish Commander update — 2026-07-20T13:30:06Z

Deadline: `2026-07-22T00:00:00Z`; **34 hours 29 minutes 54 seconds remained at
this checkpoint**. Committed HEAD remains
`0ac752d83b346ca23be36917eff6eb41a6870268`; all results below apply to the
preserved dirty source tree.

### Deterministic sample evidence and local release checks

- Repository, web, and Worker strict TypeScript passed again. The production
  build passed at Worker **1,835.40 kB / 354.86 kB gzip**, main client **545.08
  kB / 146.22 kB gzip**, and CSS **199.73 kB / 34.57 kB gzip**. The existing
  main-chunk warning and ineffective belief-break dynamic import remain visible
  performance findings.
- Full runner Pytest passed **75/75** after restoring byte-canonical checked-in
  patch JSON and excluding that authority fixture from Prettier.
- A full secret scan initially failed closed on a pytest symlink inside the
  repository-local `.counterlab` cache. The cache is now explicitly ignored;
  its safety regression passes **6/6**, and the full scan passes across **1,384
  repository files**. The cache was neither followed nor deleted.
- The Sample Boundary checker exposed real Belief Spec applicability drift and
  also crashed while diagnosing a missing object key. Missing values are now
  compared safely. The fixed-kernel fixture was regenerated, inspected, and
  deterministically check-passes with **25 cells**, primary result hash
  `a6ae7652e04e4d70196f991c63b8f7bcb3b76f8c4ab833d3ce2b626df0ab6c94`,
  Boundary result hash
  `c948d25fef6ab5f5f33322dde2025557f0704f01bff2bde48ee93149066ccbd3`,
  and fixture integrity hash
  `5b33c4adad52d797fa8268c53fe8a0dec560161c76a162ffe83e87d91271ffd2`.
- The independently fixed Sample Boundary authority was rebound only after the
  artifact and primary-result hashes remained unchanged. The checked-in Sample
  Proof Capsule was regenerated and check-passes at **94,236 bytes** with root
  `e45cf88f1bbdd470723f83def9550d47ac272f7c5aaf8554bec52c2a34f9856b`.
  Focused Proof Capsule and web sample-authority tests pass **4 files, 18/18
  tests**.

### Gate state

Remaining local mutation, held-out, formatting, and high-risk diff reviews are
in progress. Exact-image qualification remains blocked on real aggregate
cgroup-v2 observation; repository-contained Wrangler remains logged out; and
the CloakBrowser endpoint remains absent. No deployment, browser qualification,
learner study, video, Devpost publication, submission, or main merge is claimed.

## Finish Commander update — 2026-07-20T14:08:45Z

Deadline: `2026-07-22T00:00:00Z`; **33 hours 51 minutes 15 seconds remained at
this checkpoint**. Committed HEAD remains
`0ac752d83b346ca23be36917eff6eb41a6870268`; these are dirty-tree source
results, not frozen release or public evidence.

### Public tuple, scene authority, and navigation hardening

- The aggregate cgroup-v2 observation hash now propagates from qualified
  runner receipt v4 through release-check receipt v2, generated deployment
  variables, deployment receipt v4, active Worker bindings, `/ready`,
  `/api/health`, the client schema, Judge provenance, production-smoke report
  v4, and exact public reconciliation. Mutating or omitting the aggregate hash
  fails closed. Generated release schemas were refreshed.
- Focused aggregate/release verification passed: root release tests **4 files,
  27/27**; web/Worker/API tests **5 files, 219/219**; production-smoke Pytest
  **19/19**; repository/web/Worker TypeScript passed; and
  `production-smoke.sh` plus `deploy-qualified.sh` passed `bash -n`.
- The trusted Lab Scene verifier now binds each metric path to a fixed label
  and unit and binds title, assumptions, limitations, and limitation blocks to
  fixed Subject Pack presentation copy. Mutations that relabel accuracy as
  recall, change proportion to percent, or insert a result/verdict into the
  title or limitations release no scene. The contract and verifier tests pass
  **2 files, 32/32**; renderer plus Worker revalidation pass **2 files,
  109/109**.
- Lab Scene result integrity is now labelled only `Integrity-hashed`. The
  renderer rejects signature-shaped input instead of inferring an HMAC claim
  from hexadecimal fields; the current Worker does not expose a
  server-authenticated HMAC verification status for this surface.
- Pre-Prediction narrative regressions now cover outcome/verdict paraphrases
  such as a sole explanation remaining compatible with observations and
  repair directives such as using grouped evaluation while omitting identity.
  The focused guard test passes.
- User-initiated async work has a navigation generation guard. Browser Back,
  reset, unmount, or a newer operation invalidates stale sample, replay,
  upload, session-creation, analyst, compile, run, and restart responses before
  they can mutate React state, routes, or storage. Four deferred-response Back
  regressions pass **4/4**; the complete App and claim-path component slice
  passes **2 files, 67/67**; strict TypeScript passes.
- The sample-path copy no longer promises to retain wording that the fixed
  sample replaces. It now states that the sample starts a separate practice
  question and does not analyze or answer the learner's wording.

### Gate state

Release remains **NO-GO**. A real aggregate-limit producer, exact clean source
commit/image, refreshed source-bound scientific evidence, qualification and
release receipts, repository-contained Wrangler login, CloakBrowser endpoint,
public journeys, learner observations, video, and submission receipt are still
absent. No deployment or merge is claimed.

## Finish Commander update — 2026-07-20T14:36:44Z

Deadline: `2026-07-22T00:00:00Z`; **33 hours 23 minutes 16 seconds remained at
this checkpoint**. Committed HEAD remains
`0ac752d83b346ca23be36917eff6eb41a6870268`; all results below apply to the
preserved dirty tree and are not frozen-release or public evidence.

### Private downloads and privacy-safe interaction timing

- Live patch and Proof Capsule controls no longer depend on bare private URLs.
  The client retrieves bytes with the stored owner capability, same-origin
  credentials, a bounded 60-second timeout, exact media-type checks, a
  nonempty-body check, expected file-suffix validation, and a sanitized
  server-approved filename. Interrupted body reads become typed retryable
  failures. Worker patch downloads now match Capsule hardening with
  `private, no-store` and `X-Content-Type-Options: nosniff`.
- The browser creates a local object URL only after those checks. Interaction
  evidence is emitted best-effort only after verified bytes are retrieved and
  the browser download action is initiated; it is never treated as proof that
  the operating system completed a save. Failed retrieval records no download
  interaction and leaves an actionable alert. Non-authoritative telemetry no
  longer keeps download controls busy.
- Rapid repeat activation is guarded in both completion and Studio paths. The
  Playwright live leakage and imbalance journeys now target the actual button
  controls and retain download-event, suggested-filename, and downloaded-path
  assertions.
- Stage entry/completion IDs are deterministic per session, kind, and stage.
  Only a wall-clock entry time and first completed elapsed value are persisted;
  refresh uses the original entry, and retries carry the exact same elapsed
  payload so D1 accepts them as duplicates instead of conflicting. Timing
  remains client-measured, privacy-safe, bounded to seven days, and best-effort
  when storage is unavailable.

### Navigation races and the pre-Prediction authority boundary

- Late cancel and Start-over cancellation responses now capture the same
  generation boundary as the rest of the App. Browser navigation invalidates
  them before they can replace route, session, storage, busy, or error state.
  Deferred cancel-to-Judge and Start-over-to-Judge regressions pass.
- Pre-Prediction learner copy is now structural rather than denylist-only. The
  exact learner Question and resolved sanitized notebook excerpts remain
  visible, but hypotheses, predicted patterns, conditions, non-claims,
  alternatives, and limitations are rendered only from a closed reviewed
  Subject Pack framing. Model-authored prose cannot become result, verdict, or
  repair copy on that surface. The existing v1/v2 narrative guard remains as
  defense in depth and now also rejects elimination and
  separate-folds/discard-identifier paraphrases.

### Exact verification in this slice

- Authenticated download, interaction, timing, App, and Worker focused run:
  **7 files, 217/217 passed**.
- API and refresh-timing rerun after suffix and persistence hardening:
  **2 files, 41/41 passed**.
- Complete App integration suite after navigation and closed-framing repair:
  **68/68 passed**.
- Contract suite after the additional pre-Prediction paraphrases: **46/46
  passed**.
- Repository, web, and Worker strict TypeScript: passed.
- An initial pnpm wrapper invocation failed before Vitest because its contained
  home had no metadata database; the repository-installed Vitest executable
  was used directly. An initial focused cycle then exposed four missing test
  storage shims, three expectations tied to the superseded raw-prose UI, and
  one plural `folds` guard gap. All were repaired before the green results
  above.

### Gate state and independent reconciliation

- Read-only issue reconciliation now classifies the major black-box product
  issues as source-addressed except strict Judge prior-art/cold-user evidence
  and the optional Learning Director. Every product issue remains
  production/browser-unverified. Learner evidence remains `NO_DATA`; no model,
  Codex, deployment, video, submission, or learner outcome is inferred.
- A release audit confirmed `main` is still an ancestor and the feature branch
  remains fast-forwardable after completion. It also confirmed the cached
  runtime/image receipts are stale and must not be reused.
- Deployment remains a hard **NO-GO**: this host cannot produce the required
  observed aggregate cgroup-v2 receipt inside the repository filesystem
  boundary; repository-contained Wrangler is unauthenticated; the configured
  Cloudflare account cannot be verified; `CLOAK_CDP_ENDPOINT` is absent; and no
  current clean source/image/qualification/release tuple exists. No Wrangler
  deploy or main merge was attempted.

## Finish Commander update — 2026-07-20T14:43:29Z

Deadline: `2026-07-22T00:00:00Z`; **33 hours 16 minutes 31 seconds remained at
this checkpoint**. Committed HEAD remains
`0ac752d83b346ca23be36917eff6eb41a6870268`; this is dirty-tree source evidence,
not public-release evidence.

### Education positioning and prior-art scope

- The landing and Judge first folds now use one quotable category and mechanism:
  CounterLab is evidence-first learning for notebook users; the learner seals a
  Prediction, changes one condition, and fixed evidence—not AI prose—controls
  the bounded result release.
- Judge Mode now acknowledges Predict–Observe–Explain and Peer Instruction as
  established commitment-before-reveal lineage. It makes no claim that
  CounterLab invented that pedagogy.
- Three named, scoped contrasts are public in source: Predict–Observe–Explain /
  Peer Instruction, the LAMS POE lesson template, and the NBLyzer /
  sklearn-diagnose notebook-tooling family. The claimed contribution is the
  artifact-bound synthesis of fixed computation, frozen verification,
  deterministic transfer, and a portable evidence record—not categorical
  uniqueness.
- Canonical Devpost copy carries the same wording, citations, contrasts, and
  limitation. Focused App, Judge, and static-shell verification passes **3
  files, 78/78 tests**.

### Remaining evidence gap

MB-014 is source-addressed, but its cold-user comprehension criterion is still
unverified. CloakBrowser is unavailable and no consented learner observations
exist, so no 10/20/30-second rendered-comprehension or impact outcome is
claimed. Release remains **NO-GO** for the unchanged aggregate-cgroup,
contained-authentication, clean-tuple, and CloakBrowser blockers.

## Finish Commander update — 2026-07-20T15:17:20Z

Deadline: `2026-07-22T00:00:00Z`; **32 hours 42 minutes 40 seconds remained at
this checkpoint**. Committed HEAD remains
`0ac752d83b346ca23be36917eff6eb41a6870268`; the results below are dirty-tree
local design-review evidence, not frozen-release or public evidence.

### Explicit stock-Chromium design-review path

- The user explicitly authorized installed stock Chromium when CloakBrowser is
  unavailable. Browser authority is now a fail-closed discriminated mode:
  release qualification still requires `CLOAK_CDP_ENDPOINT`; the fallback must
  be explicitly selected as `stock-chromium-design-review`, accepts only the
  checked executable, and labels every resulting evidence record with that
  lower authority. Ambiguous Cloak-plus-stock configuration is rejected.
- All browser profile, cache, temporary, D1, trace, screenshot, and report
  paths are rooted below the repository runtime directory. Stock runs disable
  video because the repository has no contained Playwright FFmpeg executable;
  screenshots and traces remain enabled. Focused browser-authority tests pass
  **5/5** and Playwright static collection reports **31 tests in 2 files**.
- A repository-contained static SPA server provides an explicitly not-ready
  health envelope for shell-only review. Stock-Chromium desktop landing and
  Judge first-fold smoke passed **2/2**. The 390x844 landing initially exposed
  real horizontal and first-fold overflow. Width/min-width containment,
  duplicate mobile preview removal, and tighter small-screen spacing repaired
  it; the final mobile landing run passed **1/1** with no horizontal overflow.
- Full local Worker review uses the Cloudflare Vite plugin with Containers
  disabled only when the stock design-review authority is explicit. Normal
  build and production configuration are unchanged. Wrangler D1 migrations
  `0001` through `0009` were applied only to fresh repository-contained local
  state. The first Worker-backed attempt correctly failed before migration
  with `no such table artifacts`.
- The next Worker-backed attempt exposed a stale Playwright assumption: the
  current journey intentionally requires `Run the fair test` after sealing and
  then routes directly to `Compare the verified result`, where a small
  learner-authored interpretation gates the bounded reading. The test now
  follows that real sequence. The paired 1440x900 and 390x844 sample journeys
  pass **2/2** through Question, immutable Prediction, explicit test run, and
  post-release trusted belief-break rendering. An uncaught `pageerror` channel
  is now part of the first-fold failure log.

Evidence roots remain below:

- `apps/web/test-results/runtime/stock-chromium-mobile-fix-3/`
- `apps/web/test-results/runtime/stock-chromium-worker-sample-3/`
- `apps/web/test-results/runtime/stock-chromium-worker-sample-4/`

These runs are useful rendered design review but **do not** close the
CloakBrowser or public-deployment gates and are not learner-comprehension
observations.

### Current independent verification

- Kernel Pytest: **220 passed, 1 environment-blocked of 221**; the sole failure
  is loopback socket creation denied before the service assertion.
- Runner Pytest: **75/75 passed**.
- Combined Python result: **295 passed, 1 environment-blocked of 296**.

### Gate state

Release remains **NO-GO**. There is still no observed aggregate cgroup-v2
receipt, clean frozen source/current image/qualified tuple, authenticated
repository-contained Wrangler session, CloakBrowser endpoint, public journey,
consented learner evidence, video, Devpost submission receipt, deployment, or
main merge. No such result is claimed.

## Finish Commander update — 2026-07-20T15:47:20Z

Deadline: `2026-07-22T00:00:00Z`; **32 hours 12 minutes 40 seconds remained at
this checkpoint**. The committed branch now ends at
`fd3fe8f652d3ac819912d38d50372bb07abba1a9` after eight independently
reviewed commits. All product, runtime, release, and documentation changes
still in the working tree remain unfrozen and are not public-release evidence.

### Independent commit checkpoint

- `93d2ce5 test(browser): contain explicit design-review authority` contains
  only the fail-closed browser-authority resolver, repository-contained stock
  design-review launch path, static built-client server, E2E TypeScript config,
  and their configuration tests. Verification passed **2 files, 9/9 tests**,
  E2E strict TypeScript, Prettier, and Git whitespace checks.
- `7e4bd2a test(browser): capture raw performance evidence` contains only the
  privacy-safe native browser measurement collector and its characterization
  tests. Verification passed **1 file, 6/6 tests**, E2E strict TypeScript,
  Prettier, and Git whitespace checks.
- `fbd1f34 fix(web): keep evidence routes out of indexes` adds no-index,
  no-referrer, and robots rules for session, proof, and replay routes.
  Verification passed **1 file, 4/4 static-shell tests** and Git whitespace.
- `9e99d3c fix(learner): harden notebook path selection` permits selecting the
  same notebook after a failed/finished attempt and states that Sample opens a
  separate practice Question. Verification passed **2 files, 10/10 tests**,
  Prettier, and Git whitespace.
- `9134a4b fix(learner): replace internal recovery states` maps internal and
  unknown legacy states to bounded learner copy and adds the unverified-replay
  recovery surface. Verification passed **1 file, 11/11 tests**, web strict
  TypeScript, Prettier, and Git whitespace.
- `cc02ebd fix(learner): persist stage timing idempotently` preserves original
  stage entry time across refresh and retries the exact deterministic event and
  elapsed payload. Verification passed **2 files, 8/8 tests**, web strict
  TypeScript, Prettier, and Git whitespace.
- `8c1f50d fix(a11y): expose transfer fieldset names` gives all Cost Transfer
  choice groups default or caller-authored accessible names. Verification
  passed **1 file, 3/3 tests**, Prettier, and Git whitespace.
- `fd3fe8f test(proof): retain compiler history across jobs` proves a rejected
  first compile remains visible when a repaired second compile overlaps the
  live stream. Verification passed **1 file, 13/13 tests**, Prettier, and Git
  whitespace.
- The commit index initially failed closed because the sandbox exposed the
  checkout's Git metadata through its host alias. The approved Git-only
  escalation staged exact path lists; staged diffs were inspected before both
  commits. No unrelated file was staged.

### Rendered local performance evidence

The stock-Chromium first-fold matrix passed **4/4** locally for Landing and
Judge at 1440x900 and 390x844. Native observations were:

- desktop Landing: LCP/FCP 124 ms, CLS 0, TTFB 10.6 ms, no long tasks;
- desktop Judge: LCP 412 ms, FCP 160 ms, CLS 0, TTFB 2.4 ms, two long tasks,
  185 ms total and 122 ms longest;
- mobile Landing: LCP/FCP 100 ms, CLS 0, TTFB 1.5 ms, no long tasks;
- mobile Judge: LCP 304 ms, FCP 156 ms, CLS 0.0177849, TTFB 1.8 ms, two long
  tasks, 121 ms total and 62 ms longest.

These are warm local `stock-chromium-design-review` measurements, not public
Web Vitals, CloakBrowser qualification, or human comprehension evidence.

### Newly reproduced blocker and remaining work

- A full Worker-backed Sample loop now reaches Question, immutable Prediction,
  explicit Test, verified result, learner interpretation, Boundary, revision,
  evidence-linked transfer, verified patch, repaired-notebook download, and
  bounded completion. Opening the fixed Sample Proof Capsule originally
  reproduced a genuine browser module-graph crash because the sample proof
  module reached the Node-only scientific-registry barrel. A narrow browser
  export now removes that path without changing snapshot hashing. The build,
  **7/7 Sample Capsule tests**, **3/3 Sample Evidence UI tests**, **68/68 App
  tests**, repository TypeScript, and formatting pass. A fresh local D1 database
  applied migrations 0001 through 0009; the complete rendered journey then
  exposed and repaired a premature Sample request for the live Proof Bundle.
  The final run passed **1/1 in 14.0 seconds on its first attempt with retries
  disabled**, including Capsule validation and zero browser console, page,
  request, or HTTP failures. This remains local `stock-chromium-design-review`
  evidence and the full Sample source/fixture slice is not yet committed.
- The remaining dirty tree is being partitioned read-only across learner/UI,
  Worker/contracts/kernel, and runtime/release ownership. New fixture files
  currently carry executable mode bits and must be normalized before they are
  eligible for a fixture commit. The root `cloak-normal-counterlab.png` is an
  untracked review artifact and is excluded from product commits.
- Deployment remains **NO-GO** for the same hard gates: no observed aggregate
  cgroup-v2 containment evidence, no clean exact source/image qualification
  tuple, no authenticated repository-contained Wrangler session, no
  CloakBrowser endpoint, no public end-to-end qualification, no consented
  learner evidence, no video or submission receipt, and no main merge.
- Read-only commit review also found four source risks that remain open: a
  legacy verifier branch can read an uninitialized resource policy; migration
  0009 currently seeds lifecycle state from all replays instead of only public
  projections; upload retry may rotate idempotency after an ambiguous network
  commit; and duplicated Sample proof exports appear unused. Each requires a
  focused characterization before its containing shared-file commit.

## Finish Commander update — 2026-07-20T16:19:47Z

Deadline: `2026-07-22T00:00:00Z`; **31 hours 40 minutes 13 seconds remained at
this checkpoint**. The committed branch now ends at
`591793b0a687de7d3745b01e3477ca48123922dd`, ten commits ahead of its remote
tracking branch. Nothing is staged; **227** tracked or untracked paths remain
in the preserved working tree and still require logical review.

### Newly frozen independent evidence

- `b8dc00e fix(verifier): report resource authority honestly` initializes the
  legacy no-`limitMode` path and keeps aggregate versus scoped resource
  authority distinct. Focused verifier checks passed **9/9**, and the broader
  verifier-related kernel selection passed **21/21**.
- `591793b feat(sample): bind fixed evidence capsule` freezes the deterministic
  25-cell Sample Boundary authority, moves browser consumers onto a Node-free
  scientific-registry entry, and adds an integrity-hashed fixed Sample Proof
  Capsule with fail-closed lineage and tamper validation. The Boundary and
  Capsule regeneration checks matched exactly; focused tests passed **13/13**,
  repository TypeScript passed, formatting/whitespace/mode/secret checks
  passed, and the repository-contained production build passed. The client
  build still warns at **550.37 kB** for the main minified chunk.
- The checked-in Capsule is explicitly fixed sample evidence. Its embedded
  scientific-runtime tuple is a local reproduction candidate, no GPT-5.6,
  Codex, hosted-runner, learner-event, live-session, or deployment claim is
  made, and it is not a substitute for a live Proof Capsule v2.

### Current work and release state

- Migration 0009 has a focused dirty-tree correction to seed expiry lifecycle
  only for existing public projections; its D1 replay tests passed **6/6**,
  but the replay vertical slice is not committed yet.
- Upload retry after an ambiguous response remains under design review. The
  current client rotates its idempotency key, which can repeat a committed
  upload and mint another capability. No speculative fix is counted as done.
- The local Worker-backed Sample journey passed **1/1** with retries disabled,
  including verified patch, repaired notebook, reload, fixed Capsule inspect
  and download, and zero console/page/request/HTTP failures. The App and E2E
  integration that produced that result remains unstaged and is not yet a
  frozen release claim.
- Release remains **NO-GO**: aggregate cgroup-v2 evidence, a clean exact
  source/image qualification tuple, repository-contained Wrangler
  authentication, CloakBrowser qualification, public live/sample/replay
  journeys, learner evidence, video, Devpost receipt, deployment, and the main
  merge are all still absent.

## Finish Commander update — 2026-07-20T19:17:12Z

Deadline: `2026-07-22T00:00:00Z`; **28 hours 42 minutes 48 seconds remained at
this checkpoint**. The branch is at committed HEAD
`d6c4aec6c3f32b264aef8a90e1f9c8fa148b77f4`. The Git index is empty and the
large pre-existing dirty tree remains preserved for independent review.

### Newly frozen independent commits

- `0509833 fix(api): bound stalled client requests` bounds ordinary and upload
  requests without changing scientific authority.
- `51d989f fix(admission): fence retry lease releases` prevents a stale
  request from releasing another generation's admission lease.
- `b9dd722 fix(upload): reconcile retryable notebook intake` binds upload
  identity to content and metadata, reconciles ambiguous committed responses,
  preserves one private artifact authority, and keeps malformed,
  unsupported, interrupted, and session-creation retry paths explicit.
- `d6c4aec fix(session): reconcile terminal investigation restart` preserves
  terminal evidence, creates or recovers a deterministic source-bound child,
  preserves artifact/mode/Question authority, derives an independent owner
  capability, rejects unrelated deterministic-ID lineage, and restores the
  authoritative child stage instead of resubmitting the terminal source.

### Exact restart commit evidence

- App Vitest: **55/55 passed**.
- Client API Vitest: **32/32 passed**.
- Worker API Vitest: **90/90 passed**.
- Session-core Vitest: **29/29 passed**.
- Repository, web, and Worker strict TypeScript: **passed**.
- Scoped Prettier, Git whitespace, and the explicit eight-file secret scan:
  **passed**.
- Standards review: **zero blockers**. MB-001 specification review: **zero
  source blockers** after the reviewer discarded an obsolete snapshot and
  reran the current exact index. Focused Reject recovery passed **1/1** and
  both terminal actions reach successful resubmission and sealed Prediction.
- The isolated snapshot initially lacked generated Cloudflare declarations
  and hosted-runner workspace links. Those harness-only checks failed before
  collection/typing, were wired only to repository-contained dependencies,
  and then passed. No missing-type result is counted as a product failure or a
  pass.

### Live source and production issue matrix

| Slice | Frozen source status | Next acceptance evidence | Production status |
| --- | --- | --- | --- |
| MB-001 terminal recovery | **PASS** at `d6c4aec` | CloakBrowser Reject and insufficient-evidence journeys with real refresh/back/forward | **NOT RUN** |
| MB-002 upload/session intake | **PASS** across `0509833`, `51d989f`, and `b9dd722` | CloakBrowser absent, malformed, unsupported, supported, interrupted, ambiguous-response, and retry matrix | **NOT RUN** |
| In-flight navigation freshness | Dirty implementation preserved; commit review pending | Stale Sample/replay/upload/cancel/restart responses cannot mutate a newer route | **NOT RUN** |
| MB-006 transfer authority | Dirty cross-runtime implementation preserved; atomic commit pending | Leakage and imbalance fail/pass vectors agree in UI, IR, Worker, and Python; failed transfer keeps Repair locked | **NOT RUN** |
| MB-010 replay/capability lifecycle | Dirty migration/API/UI implementation preserved; atomic commit pending | Invalid, private, public, revoked, and expired links plus download behavior | **NOT RUN** |
| Trusted post-result Lab Scene | Dirty renderer/contracts/App integration preserved; atomic commit pending | Canonical signed binding, stale/unknown fail-closed behavior, reset isolation, keyboard/table equivalence | **NOT RUN** |
| Exact contained release | Runtime/release work remains dirty and separately owned | Clean source, one exact image, real startup/timeout/resource sentinels, regenerated evidence, qualification | **BLOCKED / NOT RUN** |
| Submission and learner impact | No source commit can create external evidence | Truthful `NO_DATA` or consented aggregate, exact video/repo/app agreement, Devpost receipt | **OPEN** |

### Code-review and release dependency graph

```text
preserve and classify the dirty tree
  -> bounded requests [0509833]
  -> generation-fenced upload admission [51d989f]
  -> retry-safe artifact/session intake [b9dd722]
  -> terminal-response child reconciliation [d6c4aec]
  -> navigation freshness + replay/capability + transfer + trusted Lab Scene
  -> complete source tests, mutation/held-out checks, build, format, secrets
  -> clean source freeze
  -> one exact runner image and real contained startup/timeout/resource proof
  -> regenerate source/image-bound SBOM, VEX, registry, and negative controls
  -> exact qualification and release checks
  -> contained Wrangler identity/preflight and qualified-only deployment
  -> public identity, health, production smoke, and CloakBrowser matrix
  -> truthful video, learner evidence or NO_DATA, and Devpost receipt
  -> reviewed fast-forward merge into main
```

No downstream receipt can be reused after an upstream source change. Parallel
read-only review and disjoint source work may shorten preparation, but source
freeze, image build, evidence regeneration, qualification, deployment, public
browser proof, submission, and the final merge remain serialized.

### Immediate ordered queue

1. Commit this factual progress checkpoint independently.
2. Partition and review the remaining App/navigation, replay/capability,
   transfer, trusted Lab Scene, and accessibility slices without broad staging.
3. Run focused checks after each commit, then the complete TypeScript, Vitest,
   Pytest, mutation, held-out, build, formatting, whitespace, and secret gates.
4. Freeze one clean source only after the product and authority slices are
   complete; do not refresh scientific/release evidence earlier.
5. Produce the exact image and real contained sentinels. Aggregate cgroup-v2
   qualification remains fail-closed until a compliant evidence path exists.
6. Qualify and deploy only that exact tuple, then execute the complete public
   CloakBrowser journey matrix and re-audit every P0/P1.
7. Keep learner evidence `NO_DATA` unless real consented observations occur;
   align app, repo, video, Devpost, feedback ID, and receipts before submission.
8. Merge the reviewed feature branch into `main` only after the release and
   submission state is truthfully recorded. No deployment, submission, or
   merge is claimed at this checkpoint.

## Finish Commander reconciliation — 2026-07-20T19:33:40Z

### Completed and frozen

- `0509833 fix(api): bound stalled client requests`
- `51d989f fix(admission): fence retry lease releases`
- `b9dd722 fix(upload): reconcile retryable notebook intake`
- `d6c4aec fix(session): reconcile terminal investigation restart`
- The owner partitioned the remaining preserved integration delta into nine
  commits ending at `134c22f`; web Vitest passes **77/77 files, 605/605 tests**,
  repository/web/Worker TypeScript passes, and the expanded kernel, runner,
  secret, smoke, and OCI-normalization Python matrix passes **323/324**. The
  one Python failure is `test_kernel_service_exposes_health_and_only_the_fixed_public_run`
  because this managed sandbox rejects an IPv4 socket with `EPERM`.

### Open release-critical graph

```text
truthful live-readiness gate + accessibility/publication hygiene
  -> focused tests and small independent commits
  -> complete deterministic suites, build, format, whitespace, secrets
  -> clean final source freeze
  -> one exact runner image and real aggregate containment sentinel
  -> regenerate source/image-bound SBOM, VEX, registry, and negative controls
  -> issue exact qualification and release-check receipts
  -> verify contained Wrangler identity and deploy only that tuple
  -> public identity/smoke plus full CloakBrowser desktop/mobile matrix
  -> truthful learner evidence or NO_DATA, video, Devpost, and receipt
  -> fast-forward the verified feature tip into main
```

Current blockers are explicit: `PARTIAL` generation-filesystem isolation is
still treated as live-ready in two web surfaces; generated scientific evidence
is stale; one untracked FUSE placeholder prevents a clean tree; no aggregate
cgroup-v2 enforcement receipt exists; and public browser, impact, video, and
submission evidence have not occurred. Audit-agent attribution and a residual
`Ctrl K` accessible-name defect are publication/accessibility repairs, not
release proof. No blocker is closed by source code alone.
