# Codex credential-safe launch boundary

Date: 2026-07-14

## Problem

CounterLab can prove that a Bubblewrap generation namespace cannot read the
repository, held-out fixtures, or verifier, but the installed Codex login is
stored in `CODEX_HOME/auth.json`. Mounting that file into the namespace would
also make it readable to model-invoked commands. Direct host launch is therefore
disabled even though the App Server protocol client itself is complete.

The boundary must let App Server authenticate while keeping credentials,
personal Codex configuration, skills, history, and unrelated host files outside
the command-visible filesystem and environment.

## Considered approaches

1. **Mount `auth.json` read-only.** Rejected. Read-only protects integrity, not
   confidentiality; generated commands could still copy the credential.
2. **Use the App Server daemon/proxy transport.** Rejected for this gate. The
   proxy isolates protocol bytes but the host daemon still owns tool execution,
   so it does not prove that generated commands cannot read host paths.
3. **Inject a short-lived access token into an isolated App Server process.**
   Selected. Current App Server documentation explicitly supports
   `CODEX_ACCESS_TOKEN`. The host broker reads only the current access token,
   never mounts the credential file, and launches App Server in a minimal
   Bubblewrap filesystem.

## Boundary design

`BubblewrapCodexLaunchBoundary` implements the existing
`AppServerLaunchBoundary` interface. It validates the credential file on the
host: regular file, owned by the current user, no group/world access, bounded
size, and a schema-valid non-empty access token. It resolves the installed Codex
package before entering the namespace.

The prepared process receives a minimal environment containing only locale,
TLS, path, isolated home, and `CODEX_ACCESS_TOKEN`. The token is passed through
the process environment, never command arguments, logs, events, or generated
files. The namespace mounts:

- `/usr` read-only for the runtime and system libraries;
- the installed Codex package read-only at `/opt/codex`;
- only required TLS/DNS files read-only;
- the generation directory read-write at `/workspace`;
- an empty temporary `HOME`, `CODEX_HOME`, and `/tmp`.

It does not mount the repository root, source credential file, verifier,
held-out fixtures, personal configuration, skills, or host `/proc`. PID, IPC,
UTS, user, and cgroup namespaces are separated; capabilities are dropped. The
host network remains available to App Server for its model request. Tool
commands still receive `networkAccess: false` through the installed Codex Linux
sandbox.

Codex is started with `shell_environment_policy.inherit=none` and explicit
credential exclusions. This prevents model-issued commands from inheriting the
App Server token. Omitting `/proc` prevents those commands from reading the
parent process environment; host `ptrace_scope=1`, the new PID/user namespace,
and dropped capabilities prevent child-to-parent process inspection on the
supported Linux host.

## Fail-closed behavior

Health is unavailable unless Bubblewrap, Node, the Codex package, secure auth
metadata, and the host kernel protections are present. Preparation rechecks
every precondition. No fallback launches App Server directly. Any unsupported
credential schema, permissive file mode, missing isolation feature, or runtime
failure returns `CODEX_ISOLATION_UNAVAILABLE` and leaves replay available.

An expired token may produce an upstream authentication error; the broker does
not copy or refresh the long-lived refresh token. The user can refresh the
normal Codex login outside CounterLab and retry.

## Verification

Tests are written before implementation and cover:

- rejection of symlinked, oversized, foreign-owned, or permissive auth files;
- token extraction without exposing refresh-token fields;
- invocation contains only allow-listed mounts and no host `/proc`;
- token exists only in the App Server environment, never argv;
- shell environment inheritance is disabled and credential names are excluded;
- real Bubblewrap probe sees the workspace but not auth/verifier/held-out paths;
- command probe cannot see the token in its environment or parent process;
- authenticated App Server handshake/turn, followed by the existing external
  verifier and mutation matrix when the current access token is accepted.

The gate is marked pass only if the real authenticated probe succeeds. A unit
test or invocation inspection alone remains `PARTIAL`.
