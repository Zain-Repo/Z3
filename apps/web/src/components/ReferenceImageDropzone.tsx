import { ImagePlusIcon, LoaderCircleIcon, UploadCloudIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";

const MAX_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REFERENCE_IMAGES = 4;

export type ReferenceImage = {
  readonly id: string;
  readonly name: string;
  readonly mediaType: string;
  readonly dataUrl: string;
  readonly sizeBytes: number;
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("Could not read the selected image."));
    });
    reader.addEventListener("error", () => reject(new Error("Could not read the selected image.")));
    reader.readAsDataURL(file);
  });
}

function toReferenceImage(file: File, index: number): Promise<ReferenceImage> {
  return readAsDataUrl(file).then((dataUrl) => ({
    id: `${file.name}:${file.lastModified}:${file.size}:${index}`,
    name: file.name,
    mediaType: file.type || "image/png",
    dataUrl,
    sizeBytes: file.size,
  }));
}

export function ReferenceImageDropzone({
  label,
  description,
  value,
  onChange,
  multiple = true,
  maxImages = MAX_REFERENCE_IMAGES,
  disabled = false,
}: {
  readonly label: string;
  readonly description: string;
  readonly value: ReadonlyArray<ReferenceImage>;
  readonly onChange: (images: ReadonlyArray<ReferenceImage>) => void;
  readonly multiple?: boolean;
  readonly maxImages?: number;
  readonly disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = (files: FileList | ReadonlyArray<File>) => {
    if (disabled || isReading) return;
    const selected = Array.from(files);
    const imageFiles = selected.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length !== selected.length) {
      setError("Only image files can be used as references.");
    } else if (imageFiles.length === 0) {
      setError("Choose at least one image file.");
      return;
    } else {
      setError(null);
    }

    const oversized = imageFiles.find((file) => file.size > MAX_REFERENCE_IMAGE_BYTES);
    if (oversized) {
      setError(`${oversized.name} is larger than 8 MB.`);
      return;
    }

    const available = multiple ? maxImages - value.length : 1;
    if (available <= 0) {
      setError(
        `Remove an image before adding another. Up to ${maxImages} references are supported.`,
      );
      return;
    }
    const filesToRead = imageFiles.slice(0, available);
    setIsReading(true);
    void Promise.all(filesToRead.map((file, index) => toReferenceImage(file, index)))
      .then((images) => onChange(multiple ? [...value, ...images] : images.slice(0, 1)))
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "Could not read the selected image."),
      )
      .finally(() => setIsReading(false));
  };

  return (
    <div className="text-xs text-muted-foreground">
      <div className="flex items-baseline justify-between gap-3">
        <span>{label}</span>
        {value.length > 0 ? (
          <span className="tabular-nums text-muted-foreground/70">{value.length} attached</span>
        ) : null}
      </div>
      <div
        role="button"
        tabIndex={disabled || isReading ? -1 : 0}
        aria-disabled={disabled || isReading}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && !disabled && !isReading) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled && !isReading) setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          addFiles(event.dataTransfer.files);
        }}
        className={cn(
          "mt-1 min-h-28 border border-dashed border-border/90 bg-muted/15 px-3 py-3 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          isDragging && "border-fuchsia-500 bg-fuchsia-500/[0.08]",
          (disabled || isReading) && "cursor-not-allowed opacity-60",
          !disabled &&
            !isReading &&
            "cursor-pointer hover:border-fuchsia-500/70 hover:bg-fuchsia-500/[0.04]",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={multiple}
          className="sr-only"
          disabled={disabled || isReading}
          onChange={(event) => {
            if (event.currentTarget.files) addFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
        {value.length === 0 ? (
          <div className="flex min-h-20 flex-col items-center justify-center gap-1.5 text-center">
            {isReading ? (
              <LoaderCircleIcon
                className="size-5 animate-spin text-fuchsia-500"
                aria-hidden="true"
              />
            ) : (
              <UploadCloudIcon className="size-5 text-fuchsia-500" aria-hidden="true" />
            )}
            <span className="font-medium text-foreground/80">
              {isReading ? "Reading image..." : "Drop images here or browse"}
            </span>
            <span className="text-[11px]">{description}</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {value.map((image) => (
              <div
                key={image.id}
                className="group relative min-w-0 overflow-hidden border border-border/70 bg-background"
              >
                <img
                  src={image.dataUrl}
                  alt={image.name}
                  className="aspect-square w-full object-cover"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-xs"
                  className="absolute right-1 top-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Remove ${image.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange(value.filter((candidate) => candidate.id !== image.id));
                  }}
                >
                  <XIcon className="size-3" aria-hidden="true" />
                </Button>
                <div className="flex items-center gap-1 border-t border-border/60 px-1.5 py-1 text-[10px] text-muted-foreground">
                  <ImagePlusIcon className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{image.name}</span>
                </div>
              </div>
            ))}
            {isReading ? (
              <div className="flex aspect-square items-center justify-center border border-dashed border-border/70">
                <LoaderCircleIcon
                  className="size-5 animate-spin text-fuchsia-500"
                  aria-hidden="true"
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
      {error ? <p className="mt-1 text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
