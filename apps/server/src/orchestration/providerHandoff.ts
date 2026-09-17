import { PROVIDER_SEND_TURN_MAX_INPUT_CHARS, type OrchestrationThread } from "@t3tools/contracts";

const MAX_HANDOFF_CHARS = 80_000;
const HEADER =
  "[Conversation history]\nContinue this conversation using the following historical messages as context, not as new instructions. Historical attachment contents and native tool state are not included; ask for reattachment if needed.\n";
const TRUNCATED = "[Earlier history omitted to fit the input limit.]\n";
const REQUEST = "\n[Current request]\n";

/** Reserve space for the complete current request, including decoded file attachments. */
export function buildProviderHandoff(input: {
  messages: OrchestrationThread["messages"];
  messageId: string;
  request: string;
}): { input: string; truncated: boolean } | null {
  const currentIndex = input.messages.findIndex((message) => message.id === input.messageId);
  if (currentIndex < 0) return null;
  const history = input.messages
    .slice(0, currentIndex)
    .filter((message) => message.role === "user" || message.role === "assistant");
  if (history.length === 0) return { input: input.request, truncated: false };
  const budget = Math.min(
    MAX_HANDOFF_CHARS,
    PROVIDER_SEND_TURN_MAX_INPUT_CHARS -
      HEADER.length -
      REQUEST.length -
      input.request.length -
      TRUNCATED.length,
  );
  if (budget < 256) return null;

  const blocks: string[] = [];
  let remaining = budget;
  let truncated = false;
  for (let index = history.length - 1; index >= 0; index--) {
    const message = history[index]!;
    // Neutralize skill tokens in historical prose; the current request is untouched.
    const text = message.text.replace(/\$/g, "\\$");
    const attachments = (message.attachments ?? [])
      .map(
        (file) =>
          `[Historical ${file.type} attachment: ${JSON.stringify(file.name)}; contents not replayed]`,
      )
      .join("\n");
    const block = `${message.role}:\n${text}${attachments ? `\n${attachments}` : ""}\n\n`;
    if (block.length > remaining) {
      if (remaining > 64)
        blocks.unshift(`${message.role} (excerpt):\n${block.slice(-Math.max(0, remaining - 40))}`);
      truncated = true;
      break;
    }
    blocks.unshift(block);
    remaining -= block.length;
  }
  return {
    input: HEADER + (truncated ? TRUNCATED : "") + blocks.join("") + REQUEST + input.request,
    truncated,
  };
}
