# Z3Chat Thread Bootstrap

Z3Chat starts a projectless chat and its first turn in one bootstrap operation. The client sends a
`thread.turn.start` command whose `bootstrap.createThread` payload carries `scope: "chat"` and
`projectId: null`. The server must copy both fields into the nested `thread.create` command before
dispatching the turn.

## Failure mode

If the bootstrap layer drops `scope`, orchestration applies the backwards-compatible default of
`"project"`. The create command is then rejected because project-scoped threads require a project
id. In the UI this appears as the composer docking briefly, then returning to the hero position with
the draft restored.

The server trace identifies this case with:

```text
Orchestration command invariant failed (thread.create): Project-scoped threads require a project id.
```

## Invariants

- Preserve `bootstrap.createThread.scope` when constructing the nested `thread.create` command.
- Z3Chat bootstrap creates use `scope: "chat"`, `projectId: null`, and approval-required runtime
  mode.
- Project-thread bootstrap behavior remains unchanged.
- Before promotion, chat-draft errors are keyed by the reserved thread id because Z3Chat drafts do
  not have a project draft id. Promotion migrates that error to the server-thread key.

Focused server coverage verifies that a WebSocket bootstrap request produces a chat-scoped
`thread.create` followed by `thread.turn.start`. Focused web coverage verifies the local error key
for chat drafts.
