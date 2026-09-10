import "./ImageGenerationSkeleton.css";

/** Fills the caller's ratio-sized canvas without imposing a minimum tile size. */
export function ImageGenerationSkeleton({ index = 0 }: { readonly index?: number }) {
  return (
    <div className="image-generation-skeleton" aria-hidden="true">
      <div className="image-generation-skeleton__grid" />
      <div
        className="image-generation-skeleton__light"
        style={{ animationDelay: `${index * 160}ms` }}
      />
      <div className="image-generation-skeleton__frame">
        <svg viewBox="0 0 100 80" fill="none" className="image-generation-skeleton__art">
          <circle
            cx="69"
            cy="24"
            r="9"
            fill="currentColor"
            className="image-generation-skeleton__sun"
          />
          <path
            d="M8 66 36 31 64 66Z"
            fill="currentColor"
            className="image-generation-skeleton__mountain"
          />
          <path d="m43 66 22-25 27 25Z" fill="currentColor" opacity=".35" />
        </svg>
      </div>
    </div>
  );
}
