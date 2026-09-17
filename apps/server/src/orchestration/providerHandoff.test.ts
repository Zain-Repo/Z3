import { describe, expect, it } from "vite-plus/test";
import {
  MessageId,
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  type OrchestrationThread,
} from "@t3tools/contracts";
import { buildProviderHandoff } from "./providerHandoff.ts";

function message(
  id: string,
  role: "user" | "assistant",
  text: string,
): OrchestrationThread["messages"][number] {
  return {
    id: MessageId.make(id),
    role,
    text,
    turnId: null,
    streaming: false,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  };
}

describe("provider conversation handoff", () => {
  it("carries preceding messages once and excludes later queued prompts", () => {
    const result = buildProviderHandoff({
      messages: [
        message("a", "user", "Use $skill"),
        message("b", "assistant", "I changed the parser"),
        message("c", "user", "review"),
        message("d", "user", "future"),
      ],
      messageId: "c",
      request: "review $skill",
    });
    expect(result?.input).toContain("Use \\$skill");
    expect(result?.input).toContain("I changed the parser");
    expect(result?.input.endsWith("[Current request]\nreview $skill")).toBe(true);
    expect(result?.input).not.toContain("future");
    expect(result?.truncated).toBe(false);
  });

  it("fits history around the complete current request", () => {
    const request = "x".repeat(PROVIDER_SEND_TURN_MAX_INPUT_CHARS - 2_000);
    const result = buildProviderHandoff({
      messages: [message("a", "user", "old".repeat(100_000)), message("b", "user", "current")],
      messageId: "b",
      request,
    });
    expect(result?.truncated).toBe(true);
    expect(result!.input.length).toBeLessThanOrEqual(PROVIDER_SEND_TURN_MAX_INPUT_CHARS);
    expect(result!.input.endsWith(request)).toBe(true);
    expect(result!.input).toContain("Earlier history omitted");
  });

  it("rejects missing messages or insufficient space instead of silently losing history", () => {
    const messages = [message("a", "user", "old"), message("b", "user", "current")];
    expect(buildProviderHandoff({ messages, messageId: "missing", request: "hi" })).toBeNull();
    expect(
      buildProviderHandoff({
        messages,
        messageId: "b",
        request: "x".repeat(PROVIDER_SEND_TURN_MAX_INPUT_CHARS),
      }),
    ).toBeNull();
  });

  it("describes historical attachments without replaying them", () => {
    const prior = {
      ...message("a", "user", "See this"),
      attachments: [
        {
          type: "image" as const,
          id: "image-1",
          name: "diagram.png",
          mimeType: "image/png",
          sizeBytes: 10,
        },
      ],
    };
    const result = buildProviderHandoff({
      messages: [prior, message("b", "user", "continue")],
      messageId: "b",
      request: "continue",
    });
    expect(result?.input).toContain('"diagram.png"; contents not replayed');
  });
});
