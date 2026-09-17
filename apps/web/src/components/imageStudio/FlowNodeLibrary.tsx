import { useState } from "react";
import { SearchIcon, PlusIcon } from "lucide-react";
import { FLOW_COMPONENTS, type FlowNode } from "./flowModel";

/** Uses the canvas registry so every supported node remains discoverable. */
export function FlowNodeLibrary({
  disabled,
  onAdd,
  onClose,
}: {
  readonly disabled: boolean;
  readonly onAdd: (kind: FlowNode["kind"]) => void;
  readonly onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const matches = FLOW_COMPONENTS.filter((item) =>
    `${item.label} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <aside className="zf-node-library" aria-label="Node library">
      <header>
        <div>
          <strong>Node library</strong>
          <p>Build your workflow</p>
        </div>
        <button type="button" aria-label="Close node library" onClick={onClose}>
          ×
        </button>
      </header>
      <label className="zf-node-search">
        <SearchIcon size={14} aria-hidden="true" />
        <input
          aria-label="Search nodes"
          placeholder="Search nodes…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="zf-node-results">
        {matches.map(({ kind, label, description, symbol }) => (
          <button
            key={kind}
            type="button"
            disabled={disabled}
            draggable={!disabled}
            onDragStart={(event) => {
              event.dataTransfer.setData("application/x-zimage-node", kind);
              event.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onAdd(kind)}
          >
            <span className={`zf-node-symbol zf-node-symbol-${kind}`} aria-hidden="true">
              {symbol}
            </span>
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <PlusIcon size={14} aria-hidden="true" />
          </button>
        ))}
        {!matches.length && <p role="status">No matching nodes. Try “image” or “prompt”.</p>}
      </div>
      <footer>Click to add · Drag to place on canvas</footer>
    </aside>
  );
}
