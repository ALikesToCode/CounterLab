# Codex App Server client

CounterLab uses the stable App Server `stdio` JSONL transport. It performs the
required `initialize`/`initialized` handshake, starts an ephemeral thread and
turn, rejects interactive approval requests, and emits only sanitized compiler
events. A turn explicitly uses `workspaceWrite` with only the prepared guest
workspace writable, network disabled, and both `/tmp` write exceptions removed.

## Generation read isolation

Live generation fails closed unless the host provides an
`AppServerLaunchBoundary`. A boundary receives the host generation directory
and must return a launch command plus the guest workspace path used in App
Server protocol messages. Direct process spawning is available only to fake
App Server unit tests under `NODE_ENV=test`.

The included Bubblewrap probe creates a new mount namespace without binding
`/`, the repository, held-out fixtures, or the verifier. It binds only `/usr`
and the exact generation workspace, supplies fresh `/proc`, `/dev`, and `/tmp`,
clears the environment, and checks that named host paths resolve as missing.
This proves the filesystem shape needed by a future launch boundary; it is not
itself a credential solution.

Run the focused probe and protocol tests with:

```bash
pnpm exec vitest run \
  packages/codex-client/src/read-isolation.test.ts \
  packages/codex-client/src/index.test.ts
```

## Why the live Bubblewrap launcher remains unavailable

The installed stable App Server auth flows load credentials from Codex-managed
storage, and API-key login stores the credential. Mounting even a minimal
`CODEX_HOME/auth.json` into the App Server namespace would leave that file
readable to model-generated commands: `workspaceWrite` constrains writes but
does not provide a read allowlist. The alternative host-owned ChatGPT token
flow is currently an experimental App Server capability, while CounterLab
intentionally initializes with `experimentalApi: false`. CounterLab therefore
returns `CODEX_ISOLATION_UNAVAILABLE` instead of exposing a credential or
claiming live success.

The smallest safe next design is a host credential-injecting proxy:

1. Bubblewrap gives App Server only `/workspace`, the native Codex runtime,
   minimal certificates/resolver files, and a non-secret temporary
   `CODEX_HOME`; the repository and hidden evidence stay absent.
2. App Server receives a loopback Responses base URL and a dummy token. A host
   proxy owns OAuth/account headers, allowlists the exact Responses/model
   endpoint, bounds request and response sizes, and never returns credentials.
3. The outer namespace shares network only to that loopback proxy. Generated
   command execution still uses the explicit no-network turn sandbox.
4. A launch probe must prove the exact mounts, hidden-path `ENOENT`, proxy-only
   connectivity, and absence of credentials in environment, files, events, and
   child command output before enabling live mode.

That proxy is deliberately not implemented as a fragile OAuth shim in this
slice. Replay and disabled implementations remain the credential-free product
paths.

References: [Codex App Server](https://developers.openai.com/codex/app-server/),
[Codex sandboxing](https://developers.openai.com/codex/security/), and the
[official Codex config schema](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json).
