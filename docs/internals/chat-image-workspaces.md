# Chat and image workspace UI

## Chat context

The project context entry in `ChatView` uses the current environment and chat-project identity.
`ChatContextPanel` renders a side panel on wide windows and the existing Sheet primitive below the
extra-large breakpoint. Sources reuse the project upload, reindex, and deletion handlers. Text
previews are plain text and bounded to 12,000 characters. The Memory tab presents configured scope,
not the provider's actual retrieval history.

The project home can continue its most recently updated unarchived chat in the same environment.
The coding workspace's header, composer, and provider execution paths remain separate.

## Image organization

`ImageWorkspacePage` retains generation and cancellation ownership. `GalleryPanel` owns canvas
selection and comparison, with selection derived against the available image records so deleted or
filtered assets cannot remain selected. Images use contain-fit previews to preserve their aspect
ratios. The canvas loads through the existing image-content loader.

`imageLibrary` stores only collection names, collection membership, and favorite generation IDs.
`useImageLibrary` shares its environment-scoped store between the sidebar and gallery. The scope
uses the primary environment because image requests use `PrimaryEnvironmentHttpClient`.

The versioned local storage key is `zimage:library:v1:<encoded environment id>`. Invalid or unsupported
snapshots are preserved. Failed writes are reported without presenting unsaved metadata as durable.
Deleting a collection never deletes its image records; deleting a generation cleans its local
organization only after the server confirms deletion. This does not add a server schema or promise
cross-device synchronization.

## Surface coverage

- Z3Chat: Electron's web renderer, including narrow windows; its existing desktop-only gate remains.
- ZImage: web and Electron; local and remote clients use the existing primary-environment HTTP path.
- React Native: neither workspace is added by this change.
- Providers: existing capability-driven image controls and chat provider adapters are preserved.
- Entry points: workspace navigation, chat home continuation/context, image library navigation,
  generation keyboard shortcut, and JSON settings reuse.
