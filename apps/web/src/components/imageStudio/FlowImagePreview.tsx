import { useState } from "react";
import { ImageGenerationSkeleton } from "../ImageGenerationSkeleton";

/** Resets decode state when a reference is replaced, including cached images. */
export function FlowImagePreview({ src, alt }: { readonly src: string; readonly alt: string }) {
  return <ImagePreview key={src} src={src} alt={alt} />;
}

function ImagePreview({ src, alt }: { readonly src: string; readonly alt: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  return (
    <span className="zf-image-preview" aria-busy={state === "loading"}>
      {state === "loading" && <ImageGenerationSkeleton />}
      {state === "error" ? (
        <span role="status">Image unavailable. Replace this image to try again.</span>
      ) : (
        <img
          src={src}
          alt={alt}
          draggable={false}
          decoding="async"
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
          data-loaded={state === "loaded"}
        />
      )}
    </span>
  );
}
