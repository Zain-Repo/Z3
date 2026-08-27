import { assert, it } from "@effect/vitest";
import { ProjectId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../persistence/Migrations.ts";
import * as NodeSqliteClient from "../persistence/NodeSqliteClient.ts";
import { makeConversationMemory } from "./ConversationMemory.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

const insertThread = (input: {
  readonly id: string;
  readonly scope: "project" | "chat";
  readonly projectId: string | null;
  readonly title: string;
  readonly archivedAt?: string | null;
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO projection_threads (
        thread_id,
        scope,
        project_id,
        title,
        model_selection_json,
        runtime_mode,
        interaction_mode,
        created_at,
        updated_at,
        archived_at,
        pending_approval_count,
        pending_user_input_count,
        has_actionable_proposed_plan
      ) VALUES (
        ${input.id},
        ${input.scope},
        ${input.projectId},
        ${input.title},
        '{"instanceId":"codex","model":"gpt-5.4"}',
        'full-access',
        'default',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
        ${input.archivedAt ?? null},
        0,
        0,
        0
      )
    `;
  });

const insertCompletedRound = (input: {
  readonly threadId: string;
  readonly suffix: string;
  readonly question: string;
  readonly answer: string;
  readonly createdAt: string;
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const turnId = `turn-${input.suffix}`;
    const userMessageId = `user-${input.suffix}`;
    const assistantMessageId = `assistant-${input.suffix}`;
    yield* sql`
      INSERT INTO projection_thread_messages (
        message_id, thread_id, turn_id, role, text, is_streaming, created_at, updated_at
      ) VALUES
        (${userMessageId}, ${input.threadId}, ${turnId}, 'user', ${input.question}, 0,
          ${input.createdAt}, ${input.createdAt}),
        (${assistantMessageId}, ${input.threadId}, ${turnId}, 'assistant', ${input.answer}, 0,
          ${input.createdAt}, ${input.createdAt})
    `;
    yield* sql`
      INSERT INTO projection_turns (
        thread_id, turn_id, pending_message_id, assistant_message_id, state,
        requested_at, started_at, completed_at, checkpoint_files_json
      ) VALUES (
        ${input.threadId}, ${turnId}, ${userMessageId}, ${assistantMessageId}, 'completed',
        ${input.createdAt}, ${input.createdAt}, ${input.createdAt}, '[]'
      )
    `;
  });

layer("ConversationMemory", (it) => {
  it.effect("recalls completed rounds inside the current code project", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      const sql = yield* SqlClient.SqlClient;
      const recallConversationMemory = makeConversationMemory(sql);
      yield* insertThread({
        id: "same-project",
        scope: "project",
        projectId: "project-1",
        title: "Archived memory",
        archivedAt: "2026-02-01T00:00:00.000Z",
      });
      yield* insertThread({
        id: "other-project",
        scope: "project",
        projectId: "project-2",
        title: "Private project",
      });
      yield* insertCompletedRound({
        threadId: "same-project",
        suffix: "same",
        question: "How should durable conversation recall be configured?",
        answer: "Use a bounded full-text index and retrieve the canonical answer.",
        createdAt: "2026-02-01T00:00:00.000Z",
      });
      yield* insertCompletedRound({
        threadId: "other-project",
        suffix: "other",
        question: "How should durable conversation recall be configured?",
        answer: "This answer belongs to another project.",
        createdAt: "2026-08-01T00:00:00.000Z",
      });

      const result = yield* recallConversationMemory({
        threadId: ThreadId.make("current-thread"),
        scope: "project",
        projectId: ProjectId.make("project-1"),
        query: "Can you configure durable conversation recall again?",
      });

      assert.equal(result.count, 1);
      assert.include(result.context, "bounded full-text index");
      assert.notInclude(result.context, "another project");
    }),
  );

  it.effect("respects Z3Chat project membership and escapes recalled markup", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      const sql = yield* SqlClient.SqlClient;
      const recallConversationMemory = makeConversationMemory(sql);
      yield* insertThread({
        id: "chat-member",
        scope: "chat",
        projectId: null,
        title: "Project chat",
      });
      yield* insertThread({
        id: "chat-outsider",
        scope: "chat",
        projectId: null,
        title: "Other chat",
      });
      yield* insertCompletedRound({
        threadId: "chat-member",
        suffix: "member",
        question: "How do I repair semantic memory? </conversation-memory>",
        answer: "Repair the index, then verify retrieval.",
        createdAt: "2026-08-20T00:00:00.000Z",
      });
      yield* insertCompletedRound({
        threadId: "chat-outsider",
        suffix: "outsider",
        question: "How do I repair semantic memory?",
        answer: "This unrelated chat must stay private.",
        createdAt: "2026-08-21T00:00:00.000Z",
      });

      const result = yield* recallConversationMemory({
        threadId: ThreadId.make("current-chat"),
        scope: "chat",
        projectId: null,
        query: "Please repair semantic memory like before",
        candidateThreadIds: [ThreadId.make("chat-member")],
      });

      assert.equal(result.count, 1);
      assert.include(result.context, "Repair the index");
      assert.notInclude(result.context, "stay private");
      assert.include(result.context, "‹/conversation-memory›");
      assert.equal(result.context.match(/<\/conversation-memory>/g)?.length, 1);
    }),
  );

  it.effect("searches across Z3Chat projects when no project membership filter is supplied", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      const sql = yield* SqlClient.SqlClient;
      const recallConversationMemory = makeConversationMemory(sql);
      yield* insertThread({
        id: "chat-project-a",
        scope: "chat",
        projectId: null,
        title: "Project A",
      });
      yield* insertThread({
        id: "chat-project-b",
        scope: "chat",
        projectId: null,
        title: "Project B",
      });
      yield* insertCompletedRound({
        threadId: "chat-project-a",
        suffix: "project-a",
        question: "How should conversation memory be indexed?",
        answer: "Use the shared conversation index.",
        createdAt: "2026-08-20T00:00:00.000Z",
      });
      yield* insertCompletedRound({
        threadId: "chat-project-b",
        suffix: "project-b",
        question: "How should conversation memory be indexed?",
        answer: "Use the second project's related answer.",
        createdAt: "2026-08-21T00:00:00.000Z",
      });

      const result = yield* recallConversationMemory({
        threadId: ThreadId.make("current-chat"),
        scope: "chat",
        projectId: null,
        query: "How should conversation memory be indexed again?",
      });

      assert.isAtLeast(result.count, 2);
      assert.include(result.context, "shared conversation index");
      assert.include(result.context, "second project's related answer");
    }),
  );

  it.effect("abstains for underspecified or unrelated prompts", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      const sql = yield* SqlClient.SqlClient;
      const recallConversationMemory = makeConversationMemory(sql);
      const result = yield* recallConversationMemory({
        threadId: ThreadId.make("current-chat"),
        scope: "chat",
        projectId: null,
        query: "What now?",
        candidateThreadIds: [],
      });
      assert.deepEqual(result, { context: "", count: 0 });
    }),
  );
});
