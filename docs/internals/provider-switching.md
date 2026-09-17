# Switching providers within a conversation

Chat and Code use the same turn orchestration. Web/desktop unlock the provider picker when the session has no active turn; mobile already permits selecting a provider in its composer draft. The server rejects cross-instance requests while a turn, queued start, or approval/question is outstanding.

An incompatible driver or continuation identity starts a fresh provider session with an explicit null resume cursor. Omitted cursors retain normal resume behavior. The prior binding remains authoritative until the replacement starts successfully; stopped-session identity is read from the session rather than the already-updated thread model selection. A successful binding emits a `provider.session.switched` activity.

`needsConversationHandoff` is an optional internal provider contract field stored in the existing runtime payload, without a database migration. It survives failed sends, session stops, and service restarts. The service clears it only after the adapter accepts a turn. A retry after an ambiguous adapter failure can repeat history; this does not promise exactly-once delivery by external providers.

The next turn reads persisted user/assistant messages preceding its message ID, excluding later queued prompts. It prepends at most 80,000 characters of recent history after reserving the entire current request, including decoded text-file context. Insufficient space fails explicitly. Truncation is marked in the provider context. Historical skill tokens are escaped, and historical files are described by name rather than replayed as binary attachments. Native tool state and checkpoint history are not transferred between providers; the existing workspace and Z3 timeline remain intact.

Runtime events correlated to a retired provider instance cannot overwrite the newly bound session. Legacy events without instance IDs retain their existing handling. If shutdown of an old adapter fails, session enumeration prefers the active session matching the durable binding and retains the shutdown warning.

Replacement startup stages a new MCP browser-tool credential without revoking the old one. Startup failure revokes the staged credential and restores the previous configuration; successful startup revokes the retired credential. The rollback path never restores a configuration over a newer concurrent replacement.

The implementation was adapted from the intent of upstream PR #9392, not cherry-picked. Its historical attachment replay was excluded to avoid exceeding input/attachment limits. Native same-provider restrictions remain enforced.

Validation: 85 tests passed in the final handoff, provider-service, credential, and composer-logic batch; six targeted reactor/ingestion tests passed, and the full 49-test ingestion suite passed. The reactor suite also passed before the final active-turn regression was added, which passed in the targeted run. Web, server, and contracts typechecks passed. Targeted lint passed with one existing unused-variable warning in the decider; existing Effect suggestions remain. Diff whitespace checks passed.

Live providers, browsers, native clients, and relay/tunnel connections have not been exercised for this change. Changes are local and uncommitted.
