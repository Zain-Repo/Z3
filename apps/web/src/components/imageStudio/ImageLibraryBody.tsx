import { useEffect, useRef, useState, type ComponentProps } from "react";
import type { FlowCard } from "./FlowCard";
import { LazyGeneratedImageTile } from "../ImageGenerationGallery";
import { readFlowReference } from "./flowReference";
import { FlowImagePreview } from "./FlowImagePreview";

export function ImageLibraryBody({
  node,
  disabled,
  images,
  loadImage,
  onChange,
  libraryPreview,
}: Pick<
  ComponentProps<typeof FlowCard>,
  "node" | "disabled" | "images" | "loadImage" | "onChange" | "libraryPreview"
>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const version = useRef(0);
  const items = node.libraryImages ?? [];
  const connectedImages = libraryPreview?.images ?? [];
  const occurrences = new Map<string, number>();
  const displayedItems = [...items, ...connectedImages].map((item) => {
    const identity = item.assetId ?? item.name;
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { ...item, previewKey: `${identity}:${occurrence}` };
  });
  useEffect(() => {
    version.current++;
    setBusy(false);
    return () => {
      version.current++;
    };
  }, [disabled]);
  const upload = async (files: readonly File[]) => {
    if (disabled || busy || !files.length) return;
    if (files.length + displayedItems.length > 16) {
      setError("A library supports up to 16 images.");
      return;
    }
    const current = ++version.current;
    setBusy(true);
    setError("");
    try {
      const additions = [];
      for (const file of files) additions.push(await readFlowReference(file));
      if (version.current !== current) return;
      const next = [...items, ...additions];
      if (next.reduce((size, item) => size + (item.url?.length ?? 0), 0) > 24_000_000)
        throw new Error("Use smaller images. Embedded library images must total less than 18 MB.");
      onChange(node.id, { libraryImages: next });
    } catch (cause) {
      if (version.current === current)
        setError(cause instanceof Error ? cause.message : "Images could not be loaded.");
    } finally {
      if (version.current === current) setBusy(false);
    }
  };
  const locked = disabled || busy;
  return (
    <div
      className="zf-library-body"
      aria-busy={busy}
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
          void upload(Array.from(event.dataTransfer.files));
        }
      }}
      onPaste={(event) => {
        if (event.clipboardData.files.length) {
          event.preventDefault();
          void upload(Array.from(event.clipboardData.files));
        }
      }}
    >
      <div className="zf-library-node-heading">
        <strong>Image collection</strong>
        <span>
          {displayedItems.length} images
          {connectedImages.length ? ` · ${connectedImages.length} connected` : ""}
        </span>
      </div>
      <div className="zf-library-grid">
        {displayedItems.map((item, index) => (
          <div key={item.previewKey} className="zf-library-image">
            <button
              type="button"
              disabled={locked || (!item.url && !item.assetId)}
              aria-label={`Use image ${index + 1} as video frame`}
              aria-pressed={node.assetIndex === index}
              onClick={() => onChange(node.id, { assetIndex: index })}
            >
              {item.url ? (
                <FlowImagePreview src={item.url} alt={item.name} />
              ) : item.assetId ? (
                <LazyGeneratedImageTile
                  assetId={item.assetId}
                  alt={item.name}
                  loadImageContent={loadImage}
                />
              ) : (
                <span className="zf-library-pending">Waiting for source image</span>
              )}
              <span>
                {index + 1}. {item.name}
              </span>
            </button>
            {index < items.length ? (
              <div className="zf-reference-actions">
                <button
                  type="button"
                  disabled={locked || index === 0}
                  aria-label={`Move image ${index + 1} earlier`}
                  onClick={() => {
                    const next = [...items];
                    const previous = next[index - 1];
                    const stored = next[index];
                    if (!previous || !stored) return;
                    next[index - 1] = stored;
                    next[index] = previous;
                    onChange(node.id, {
                      libraryImages: next,
                      assetIndex:
                        node.assetIndex === index
                          ? index - 1
                          : node.assetIndex === index - 1
                            ? index
                            : node.assetIndex,
                    });
                  }}
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={locked}
                  aria-label={`Remove image ${index + 1}`}
                  onClick={() =>
                    onChange(node.id, {
                      libraryImages: items.filter((_, i) => i !== index),
                      assetIndex: Math.max(
                        0,
                        node.assetIndex >= index ? node.assetIndex - 1 : node.assetIndex,
                      ),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ) : (
              <small className="zf-meta">Connected · updates automatically</small>
            )}
          </div>
        ))}
      </div>
      {!displayedItems.length && !libraryPreview?.error && (
        <button
          type="button"
          className="zf-library-node-dropzone"
          disabled={locked}
          onClick={() => input.current?.click()}
        >
          <span aria-hidden="true">＋</span>
          <strong>{busy ? "Reading images…" : "Add images"}</strong>
          <small>Drop, paste, or click to upload</small>
        </button>
      )}
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          void upload(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      {displayedItems.length > 0 && (
        <div className="zf-reference-actions">
          <button
            type="button"
            disabled={locked || displayedItems.length >= 16}
            onClick={() => input.current?.click()}
          >
            {busy ? "Reading images…" : "Upload images"}
          </button>
        </div>
      )}
      <label className="zf-field">
        <span>Add another saved image (optional)</span>
        <select
          aria-label="Add saved image"
          value=""
          disabled={locked || displayedItems.length >= 16}
          onChange={(event) => {
            const assetId = event.target.value;
            const record = images.find((record) =>
              record.assets.some((asset) => asset.id === assetId),
            );
            if (record)
              onChange(node.id, {
                libraryImages: [...items, { assetId, name: record.prompt.slice(0, 80) }],
              });
          }}
        >
          <option value="">Choose an image…</option>
          {images.flatMap((record) =>
            record.assets
              .filter((asset) => !items.some((item) => item.assetId === asset.id))
              .map((asset, index) => (
                <option key={asset.id} value={asset.id}>
                  {record.prompt.slice(0, 60)} · {index + 1}
                </option>
              )),
          )}
        </select>
      </label>
      <label className="zf-field">
        <span>Video frame image number</span>
        <input
          type="number"
          min={1}
          max={16}
          aria-label="Video frame image number"
          value={node.assetIndex + 1}
          disabled={locked}
          onChange={(event) => {
            const value = event.target.valueAsNumber;
            if (Number.isInteger(value) && value >= 1 && value <= 16)
              onChange(node.id, { assetIndex: value - 1 });
          }}
        />
      </label>
      <p className="zf-meta">
        Connect the output to image references or a video frame. Connected images follow saved
        images.
      </p>
      <p className="zf-meta">PNG, JPEG, WebP · 8 MB each · 16 images maximum</p>
      {(error || libraryPreview?.error) && (
        <p role="alert" className="zf-status zf-error">
          {error || libraryPreview?.error}
        </p>
      )}
    </div>
  );
}
