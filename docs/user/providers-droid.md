# Factory Droid

Z3 can run Factory Droid through the Droid CLI installed on the server machine. The provider is
disabled by default while it is in Early Access.

## Install and authenticate

Follow [Factory's Droid CLI installation guide](https://docs.factory.ai/droid-cli/quickstart), then
run `droid` once and complete the browser sign-in flow. For non-interactive environments, set
`FACTORY_API_KEY` in the Droid provider's environment settings and mark it sensitive.

Enable Droid from **Settings** → **Providers** after the CLI is available on the server's `PATH`, or
set an explicit binary path on the provider instance.

## How Z3 connects

Z3 launches Droid's documented long-running JSON-RPC mode:

```text
droid exec --input-format stream-jsonrpc --output-format stream-jsonrpc
```

The server owns the subprocess, request timeouts, permission responses, session persistence, and
shutdown. Web, desktop, and mobile clients continue to communicate only with the Z3 server.

## Supported behavior

- Live model, reasoning-effort, slash-command, and skill discovery
- Streaming assistant and reasoning output
- Supervised approvals and Factory permission modes
- Plan mode through Droid Spec Mode
- Session resume across server restarts
- Checkpoint rollback by rewinding and re-anchoring the Droid conversation
- Droid subagent activity projected as thread tasks

Model and protocol details can change as Factory updates the CLI. If discovery or session resume
fails, update Droid, refresh the provider status, and start a new thread if the old native session
cannot be loaded.
