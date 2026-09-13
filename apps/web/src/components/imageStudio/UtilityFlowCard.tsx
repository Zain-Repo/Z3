import { inputPortDrop, outputPortDrag } from "./flowPortDrag";
import { memo, useEffect, useRef, useState, type ComponentProps } from "react";
import type { FlowCard } from "./FlowCard";
import { FLOW_COMPONENTS, PORT_Y } from "./flowModel";
import { readFlowReference } from "./flowReference";

export const UtilityFlowCard = memo(function UtilityFlowCard({
  node,
  selected,
  disabled,
  connected,
  pendingConnection,
  onChange,
  onDrag,
  onSelect,
  onPort,
  onDuplicate,
  onRemove,
}: ComponentProps<typeof FlowCard>) {
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadVersion = useRef(0);
  useEffect(() => {
    if (disabled) {
      uploadVersion.current++;
      setUploading(false);
    }
    return () => {
      uploadVersion.current++;
    };
  }, [disabled]);
  const kind = FLOW_COMPONENTS.find((item) => item.kind === node.kind);
  const upload = async (file: File | undefined) => {
    if (!file || disabled || uploading) return;
    const version = ++uploadVersion.current;
    setUploading(true);
    setError("");
    try {
      const reference = await readFlowReference(file);
      if (version === uploadVersion.current) onChange(node.id, { reference });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The image could not be opened.");
    } finally {
      setUploading(false);
    }
  };
  return (
    <article
      data-node-id={node.id}
      tabIndex={0}
      aria-label={`${node.title} card`}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onSelect(node.id);
      }}
      className={`zf-card zf-${node.kind} ${selected ? "zf-selected" : ""}`}
      style={{ transform: `translate(${node.position.x}px, ${node.position.y}px)` }}
      onPointerDown={() => onSelect(node.id)}
    >
      <header
        className="zf-card-header"
        onPointerDown={(event) => {
          if (!(event.target instanceof HTMLElement && event.target.closest("button,input")))
            onDrag(event, node);
        }}
      >
        <span className="zf-kind" aria-hidden="true">
          {kind?.symbol}
        </span>
        <input
          aria-label="Card name"
          value={node.title}
          disabled={disabled}
          maxLength={80}
          onChange={(event) => onChange(node.id, { title: event.target.value })}
        />
        <button
          type="button"
          className="zf-card-menu"
          aria-label={node.collapsed ? "Expand card" : "Collapse card"}
          onClick={() => onChange(node.id, { collapsed: !node.collapsed })}
          disabled={disabled}
        >
          {node.collapsed ? "+" : "−"}
        </button>
        <button
          type="button"
          className="zf-card-menu"
          aria-label={`Duplicate ${node.title}`}
          disabled={disabled}
          onClick={() => onDuplicate(node.id)}
        >
          ⧉
        </button>
        <button
          type="button"
          className="zf-card-menu"
          aria-label={`Remove ${node.title}`}
          disabled={disabled}
          onClick={() => onRemove(node.id)}
        >
          ×
        </button>
      </header>
      {node.kind !== "note" && (
        <button
          type="button"
          className="zf-port zf-output-port"
          style={{ top: 67 }}
          data-label={node.kind === "combine" ? "prompt output" : "image output"}
          {...outputPortDrag(node.id, disabled)}
          aria-label={`Connect from ${node.title}`}
          disabled={disabled}
          onClick={() => onPort(node.id, "output")}
        />
      )}
      {node.kind === "combine" && (
        <button
          type="button"
          className={`zf-port zf-input-port ${pendingConnection ? "zf-port-ready" : ""}`}
          style={{ top: PORT_Y.prompt }}
          {...inputPortDrop(node.id, "prompt", disabled, onPort)}
          data-label="prompt fragments"
          aria-label={`Connect to ${node.title}: prompt`}
          disabled={disabled}
          onClick={() => onPort(node.id, "prompt")}
        />
      )}
      <div hidden={node.collapsed}>
        {node.kind === "reference" ? (
          <div
            className="zf-reference-body"
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("Files")) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onDrop={(event) => {
              if (event.dataTransfer.files.length) {
                event.preventDefault();
                event.stopPropagation();
                void upload(event.dataTransfer.files[0]);
              }
            }}
            onPaste={(event) => {
              const file = event.clipboardData.files[0];
              if (file) {
                event.preventDefault();
                void upload(file);
              }
            }}
          >
            {node.reference ? (
              <>
                <img src={node.reference.url} alt={node.reference.name} draggable={false} />
                <span className="zf-reference-name">{node.reference.name}</span>
              </>
            ) : (
              <div className="zf-empty-output">
                <span aria-hidden="true">↑</span>
                <strong>Drop a reference image</strong>
                <small>
                  PNG, JPEG, WebP · up to 8 MB
                  <br />
                  You can also paste an image here.
                </small>
              </div>
            )}
            <input
              ref={fileInput}
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <div className="zf-reference-actions">
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? "Reading image…" : node.reference ? "Replace image" : "Choose image"}
              </button>
              {node.reference && (
                <button
                  type="button"
                  disabled={disabled || uploading}
                  onClick={() => {
                    onChange(node.id, { reference: null });
                  }}
                >
                  Remove
                </button>
              )}
            </div>
            {error && (
              <p role="alert" className="zf-status zf-error">
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className="zf-prompt-body">
            {node.kind === "combine" && (
              <label className="zf-field">
                <span>Join inputs with</span>
                <select
                  aria-label="Prompt separator"
                  disabled={disabled}
                  value={node.separator ?? "paragraph"}
                  onChange={(event) => {
                    const separator = event.target.value;
                    if (separator === "paragraph" || separator === "line" || separator === "space")
                      onChange(node.id, { separator });
                  }}
                >
                  <option value="paragraph">Paragraph break</option>
                  <option value="line">New line</option>
                  <option value="space">Space</option>
                </select>
              </label>
            )}
            <textarea
              aria-label={node.kind === "note" ? "Note" : "Additional prompt text"}
              placeholder={
                node.kind === "note"
                  ? "Add art direction, decisions, or reminders. Notes are never sent to a model."
                  : "Optional text to append after the connected inputs."
              }
              value={node.text}
              disabled={disabled}
              onChange={(event) => onChange(node.id, { text: event.target.value })}
            />
            {node.kind === "combine" && (
              <details className="zf-combined-preview">
                <summary>Combined prompt preview</summary>
                <p>
                  {[connected, node.text.trim()]
                    .filter(Boolean)
                    .join(
                      node.separator === "space" ? " " : node.separator === "line" ? "\n" : "\n\n",
                    ) || "Connect prompt cards to assemble a reusable brief."}
                </p>
              </details>
            )}
            <div className="zf-meta">
              {node.kind === "note"
                ? "Canvas note · not sent to models"
                : "Inputs follow connection order"}
            </div>
          </div>
        )}
      </div>
      {node.collapsed && (
        <div className="zf-collapsed-summary">
          {node.kind === "reference"
            ? (node.reference?.name ?? "No reference yet")
            : node.text || kind?.description}
        </div>
      )}
    </article>
  );
});
