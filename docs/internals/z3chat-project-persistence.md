# Z3Chat Project Persistence

> Maintainer feature note. This document describes the planned durable project model for Z3Chat.

## Status

Z3Chat project data is stored in the browser and is not synchronized through the Z3 server. Project
metadata remains compatible with the `z3chat:projects:v1` localStorage record; larger project
snapshots are additionally persisted in a dedicated IndexedDB record so source files can exceed
Web Storage quotas without being silently lost.

Project sources currently allow up to 5 MiB per file and 20 MiB per project. Provider context remains
bounded separately at 120,000 characters, so increasing source storage does not increase the amount
of project text injected into each turn.

Source indexing currently uses the configured OpenRouter provider and its embeddings endpoint. The
browser keeps the original source bytes and text in its local project store; the server keeps the
generated text chunks and vectors in memory only. Re-indexing replaces the in-memory entry for the
same project/source pair, and deleting a source removes that entry. This is intentionally temporary:
Convex should become the durable source and vector store when that integration is implemented.

Completed user/assistant rounds are indexed by the server for bounded conversation recall. Each
ChatProject stores a `memoryMode` of `full` or `project-only`. Full mode leaves the chat retrieval
boundary open across Z3Chat conversations; project-only mode includes the active chat project's
known thread ids on turn start, and the server uses those ids only as a retrieval boundary. In both
modes, the server injects up to three relevant historical rounds into provider-only context. This
improves continuity without persisting the project's browser-local metadata in the event store. It
does not replace the durable project integration described below.

The initial SQLite schema has been drafted in migration 037, but the server and client integration
is not complete.

## Existing work

Migration 037 is registered in `apps/server/src/persistence/Migrations.ts` and defines three
normalized tables:

- `projection_chat_projects` stores project identity, name, instructions, timestamps, and soft-delete state.
- `projection_chat_project_sources` stores source metadata and contents, with cascade deletion from its project.
- `projection_chat_project_threads` stores project/thread membership with an idempotent composite key.

The migration also defines indexes for project updates and deletion, source ordering, thread lookup,
and membership ordering. Focused migration testing is currently blocked by the local Node 22.15.0
runtime; the test harness requires Node.js 22.16+, 23.11+, or 24+ for the required `node:sqlite`
APIs.

## Intended architecture

ChatProjects should remain a separate domain from Z3Code filesystem projects. Z3Code project
commands model workspace roots, repository identity, and code-thread relationships, while Z3Chat
projects contain conversation context and user-provided sources.

Chat threads should remain projectless at the orchestration level (`projectId: null`). Their
association with a ChatProject should be represented by `projection_chat_project_threads` rather
than by the filesystem-project field on the thread.

The selected environment and active ChatProject are client preferences. Durable project metadata,
source data, and thread membership belong to the server database.

## Follow-up implementation

1. Add typed ChatProject contracts for list/detail, create/update/delete, source changes, and thread assignment.
2. Add a dedicated server repository/service for the three tables, including server-side validation of project and source limits.
3. Add typed WebSocket/RPC queries and mutations for ChatProjects.
4. Replace the localStorage project store with server-backed client-runtime state.
5. Hydrate and refresh project state on reconnect, including changes made by another client.
6. Make thread assignment idempotent and durable after successful first-turn bootstrap.
7. Define deletion behavior for existing threads: preserve them as unassigned, retain historical context, or apply another explicit policy.
8. Add focused repository, RPC, client, and migration-rebuild tests.

Source contents should be loaded through a project detail query rather than included in lightweight
sidebar or shell payloads.

## Event-sourcing consideration

Direct writes to `projection_*` tables are sufficient for the initial schema work but are not a
complete long-term event-sourced design. If ChatProjects become part of the orchestration projection
system, add commands, events, and projector handling so rebuilding projections recreates project
records and memberships.

## Related files

- `apps/web/src/lib/chatProjects.ts`
- `apps/web/src/components/ChatWorkspaceSidebar.tsx`
- `apps/web/src/components/ChatProjectDialog.tsx`
- `apps/server/src/persistence/Migrations/037_ProjectionChatProjects.ts`
- `apps/server/src/persistence/Migrations/037_ProjectionChatProjects.test.ts`
- `packages/contracts`
- `packages/client-runtime`
