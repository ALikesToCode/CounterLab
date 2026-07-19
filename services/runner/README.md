# Generated-adapter runner

This service is the host-owned boundary between runtime Codex output and the
fixed CounterLab kernel/verifier. It executes only a declarative adapter. It
does not let generated code compute metrics or decide whether a result passes.

## Enforced controls

- A server-generated session ID creates one fresh direct child under the
  configured generation root.
- The workspace must contain exactly `experiment-plan.json`,
  `artifact-adapter.py`, and `public_tests.py`; directories and symlinks are
  rejected.
- Plan/source sizes and JSON nesting are bounded. The plan is validated against
  the leakage contract and the adapter passes the fixed deny-by-default AST
  policy before execution.
- The pinned runner image contains only Python, the public declarative SDK, and
  the fixed harness. The repository, host verifier, mutation catalogue,
  held-out fixtures, and credentials are not mounted.
- Docker receives `network=none`, a read-only root, numeric non-root user
  `65532:65532`, all capabilities dropped, `no-new-privileges`, private IPC,
  PID/memory/CPU/file-size/file-descriptor limits, and a bounded temporary
  filesystem.
- Only the validated workspace and public fixture are read-only mounts. One
  fresh output directory is writable. The host enforces wall time, exact output
  names, regular-file-only output, aggregate output bytes, and output file
  count.
- Public tests run before the adapter in a subprocess with a fixed environment.
  The harness then loads the adapter in a fresh process state and writes the
  declarative contract with exclusive, no-follow file creation.
- The host compares the executable contract with the generated plan, computes
  the experiment and active mutation probes with fixed code, and calls the
  frozen verifier outside the mounted workspace.
- A repair receives only structured invariant, observed value, expected value,
  and minimal counterexample fields. Orchestration permits at most two repairs.

## Important limitations

This is defense in depth, not a formal sandbox proof. It trusts the local Docker
daemon, host kernel, pinned base image, and Docker's default seccomp policy.
The aggregate byte and file-count checks occur on the host after the container
returns; per-file size, memory, process count, CPU, and wall time have earlier
runtime enforcement. A malicious candidate may consume the writable output
mount until the wall/individual-file/container limits stop it, after which the
host rejects excess output. Production deployments should additionally use a
dedicated runner host or stronger microVM/container isolation if the threat
model extends beyond the hackathon's local single-user boundary.

Generation and execution are separate trust boundaries. The execution runner
above never mounts Codex credentials. The App Server client now fails closed
unless a trusted credential-and-privilege launch boundary is supplied; see
`packages/codex-client/README.md`. The hosted Container boundary stages and
revokes credentials, uses a fixed non-root UID plus
`setpriv --no-new-privs`, but has no mount namespace or read
allowlist, so filesystem generation read isolation is `PARTIAL`. A real
Bubblewrap probe confirms that an
exact generation mount can see its approved file while repository, verifier,
and held-out host paths resolve as missing. Stable Codex authentication is
currently file-backed in this environment, so CounterLab does not mount that
credential into the generation namespace. The documented next step is a
host-owned credential-injecting loopback proxy, not a credential-bearing
`CODEX_HOME` mount.

## Verification

Run unit and host-pipeline tests without building an image:

```bash
PYTHONPATH=services/runner/src:services/kernel/src \
  .venv/bin/python -m pytest services/runner/tests
```

Build the pinned image and run the real no-network container path explicitly:

```bash
./scripts/sandbox-smoke.sh --build
```
