import { useEffect, useRef, useState } from "react";
import type { FlowNode } from "./flowModel";
import { flowApi } from "./flowApi";

export function PromptUpdaterBody({
  node,
  connected,
  disabled,
  onChange,
}: {
  readonly node: FlowNode;
  readonly connected: string;
  readonly disabled: boolean;
  readonly onChange: (id: string, patch: Partial<FlowNode>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const source = [connected, node.text.trim()].filter(Boolean).join("\n\n");
  const instructions = node.instructions ?? "";
  const fresh = node.rewrite?.source === source && node.rewrite.instructions === instructions;
  useEffect(() => {
    request.current?.abort();
    setBusy(false);
    return () => request.current?.abort();
  }, [source, instructions, disabled]);
  const rewrite = async () => {
    if (busy || disabled || !source.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const result = await flowApi.rewritePrompt(
        { prompt: source, instructions },
        controller.signal,
      );
      if (!controller.signal.aborted)
        onChange(node.id, { rewrite: { source, instructions, result: result.prompt } });
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Prompt rewrite failed. Please retry.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <div className="zf-prompt-body zf-updater-body">
      <label className="zf-field">
        <span>Original prompt</span>
        <textarea
          aria-label="Original prompt"
          placeholder="Connect a prompt or describe your idea here."
          value={node.text}
          maxLength={10000}
          disabled={disabled}
          onChange={(event) => onChange(node.id, { text: event.target.value })}
        />
      </label>
      {connected && (
        <details className="zf-combined-preview">
          <summary>Connected prompt</summary>
          <p>{connected}</p>
        </details>
      )}
      <label className="zf-field">
        <span>Rewrite direction</span>
        <textarea
          aria-label="Rewrite direction"
          placeholder="For example: add cinematic lighting and camera details. Preserve the subject."
          maxLength={4000}
          value={instructions}
          disabled={disabled}
          onChange={(event) => onChange(node.id, { instructions: event.target.value })}
        />
      </label>
      <div className="zf-reference-actions">
        <button
          type="button"
          disabled={disabled || busy || !source.trim() || source.length > 10000}
          onClick={() => void rewrite()}
        >
          {busy ? "Rewriting…" : node.rewrite ? "Rewrite again" : "Rewrite with AI"}
        </button>
        {busy && (
          <button
            type="button"
            onClick={() => {
              request.current?.abort();
              setBusy(false);
            }}
          >
            Cancel
          </button>
        )}
      </div>
      <p className="zf-meta">
        Uses your connected Codex account, with OpenRouter as a fallback. Provider charges may
        apply.
      </p>
      {source.length > 10000 && (
        <p role="alert" className="zf-status zf-error">
          Shorten the input to 10,000 characters.
        </p>
      )}
      {error && (
        <p role="alert" className="zf-status zf-error">
          {error}
        </p>
      )}
      {node.rewrite && (
        <label className="zf-field">
          <span>{fresh ? "Updated prompt · output" : "Previous output · rewrite required"}</span>
          <textarea
            aria-label="Updated prompt"
            value={node.rewrite.result}
            disabled={disabled || busy || !fresh}
            maxLength={16000}
            onChange={(event) => {
              if (node.rewrite)
                onChange(node.id, { rewrite: { ...node.rewrite, result: event.target.value } });
            }}
          />
        </label>
      )}
      <div className="zf-meta" role="status">
        {busy
          ? "Adding detail while preserving your intent…"
          : fresh
            ? "Connect the output to an image, video, or prompt card."
            : "Rewrite before running connected generation cards."}
      </div>
    </div>
  );
}
