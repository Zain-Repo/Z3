# Z3Chat Project Persistence

> Maintainer feature note. This document describes the planned durable project model for Z3Chat.

## Status

Z3Chat project data is currently stored in the browser through the `z3chat:projects:v1`
localStorage record. Project metadata, instructions, sources, active-project selection, and thread
membership are therefore local to one client and are not synchronized through the Z3 server.

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
