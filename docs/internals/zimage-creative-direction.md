# ZImage creative direction and canvas

Researched September 13, 2026. The UI direction follows the repository's redesign-existing-projects
skill: a restrained work surface, clear hierarchy, visible image controls, and isolated interaction.
The studio uses existing theme tokens and a static dot grid, without a new rendering dependency.

## Research and resulting decisions

- [Adobe Firefly Boards](https://helpx.adobe.com/ca/firefly/web/create-mood-boards/firefly-boards/add-images.html)
  combines references and generated images on a canvas. ZImage adopts reference reuse and an
  inspection surface within the library. The main workspace now uses connected cards; it does not
  claim collaboration or generative fill.
- [Black Forest Labs' FLUX.2 guide](https://docs.bfl.ai/guides/prompting_guide_flux2)
  favors subject-first natural descriptions and positive visual direction. FLUX.2 does not support
  negative prompts. ZImage uses descriptive cues for FLUX and does not invent sampler or negative
  prompt fields.
- [Google's image-generation guide](https://ai.google.dev/gemini-api/docs/image-generation)
  describes scene, lighting, viewpoint, and reference-based iteration. Instruction-oriented models
  receive an explicit brief followed by subordinate creative direction.
- [Tongyi's Z-Image guidance](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo/discussions/8)
  and [model card](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo)
  describe positive scene prompting and Turbo's guidance behavior. ZImage leaves sampling settings
  to its capability-aware Civitai routes instead of applying generic high-CFG or high-step presets.
- [OpenRouter's image API](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
  exposes model-specific output controls. Resolution, quality, image counts, and reference bounds
  remain governed by the existing catalog and endpoint validation.

These are product and prompting design inputs, not measured guarantees of better image quality.

## Request and persistence boundaries

`ImageGenerationInput.creativeDirection` is optional and has an explicit version. Requests without
it remain unchanged. Version 1 contains enumerated style, lighting, composition, detail, and
reference intent. `packages/shared/src/imageCreativeDirection.ts` builds deterministic text for
both the browser preview and server provider calls. Preserve version 1 behavior; introduce a new
version if prompt semantics change after release.

The server prepares the prompt immediately before OpenRouter or Civitai generation. The persisted
`input_json` retains the original request, including direction. The existing `prompt` column retains
the original brief. No migration or extra language-model request is required. Reuse and reroll
therefore compile once at the same boundary. Provider-side prompt revisions remain separate.

Canvas image cards store direction per model. Existing remote HTTP routing, cancellation, and
result persistence apply. No agent-provider adapters are involved: ZImage uses image providers,
independently of Codex, Claude, Cursor, Grok, and OpenCode agent runtimes.

## Canvas workflow

The canvas redesign follows the minimalist-ui skill's flat warm surfaces, restrained semantic
color, and compact typography. The user requested fewer card borders and slight elevation; card
surfaces now use a low-opacity shadow and unboxed headers, with a thin focus/selection outline. The existing inspection and organization tools remain
inside the Library panel rather than occupying the main work surface.

Research references:

- [FLORA node overview](https://docs.flora.ai/blocks/editor) and
  [canvas](https://docs.flora.ai/editor/canvas): text/image/video cards and typed connections.
- [FLORA navigation](https://docs.flora.ai/editor/navigation): direct manipulation, panning,
  zooming, and keyboard alternatives.
- [Weave helpers](https://help.weavy.ai/en/articles/12268300-helpers-overview): reusable media
  inputs, previewing outputs, and preserving original exports.

`FlowWorkspace` replaces the old form entry point without changing routes or transport contracts.
`flowModel` owns the versioned board schema, connection validation, dependency planning, and input
assembly. `flowExecution` limits execution to two cards at once and skips descendants of failures.
All requested cards are preflighted before starting paid requests. Single-card runs reuse existing
upstream images; whole-board runs regenerate generation cards. Library nodes remain immutable inputs.
Video nodes are terminal outputs and use the existing asynchronous video jobs and polling API.

The canvas uses native pointer events, transforms, and SVG paths with existing dependencies. Cards
are memoized; no animation repaints while idle. Toolbar drag/drop has a click alternative, card
movement has keyboard controls, and ports are focusable buttons. Preview image bytes use the existing
bounded content loader. Video bytes load on demand through authenticated environment URLs.

`useFlowBoard` saves a validated v1 document in an environment-keyed IndexedDB store, with bounded
edit history and workflow import/export. Optional v1 fields preserve older boards. Legacy local
storage boards are read as migration input; the old copy is retained. Each IndexedDB write reads
and compares a revision in the same readwrite transaction to reject stale writers across tabs. No image bytes are duplicated for generated output links.
Reused input references can retain their original data URLs. Storage failure or a revision conflict stops persistence; the UI offers export. Layouts are device-local, not collaborative or
server-synchronized. Generation records remain server-owned. Remote requests continue through the
primary environment client and authenticated media loaders; no localhost origins are embedded.

Web and desktop share this entry point. Native mobile has no ZImage route and is unchanged. Agent
provider adapters and wire contracts do not change. The focused workflow tests cover persistence
validation, cycles, port types, shared prompts, reference forwarding, capability rejection, dependency
order, branch failures, concurrency, stopping, and zoom coordinates. Visual verification requires
separate user approval; this change was verified with automated tests and a production build only.

## Additional canvas components

The [Weave text tools](https://help.weavy.ai/en/articles/12268282-text-tools) informed explicit
prompt composition, and its [helpers](https://help.weavy.ai/en/articles/12268300-helpers-overview)
informed reusable imported media. Combine nodes concatenate inputs deterministically in edge order;
notes never enter a generation plan. Reference nodes embed validated PNG/JPEG/WebP data and supply
provider inputs without scheduling a generation of their own. Files are checked for MIME, signature,
and an 8 MB limit. No image transformation or LLM prompt-enhancement request is implied.

The canvas supports drag-to-connect with click/keyboard alternatives, prompt-input ordering,
collapsible cards, snap-to-grid, wire visibility, and dependency-based arrangement using measured
card heights. Starter workflows append validated connected cards and never run automatically.
Capability-specific background/compression and video creativity/upscale settings use the same
preflight checks and existing provider transport. No server contract or native-mobile entry point
was added. Verification remains scoped automated tests, typecheck, lint, and web production build.

## Saved sheets

IndexedDB version 2 adds a `sheets` metadata store indexed by environment, leaving existing board
records intact. Initialization atomically registers the original IndexedDB board (or imports the
legacy local-storage board) as the first sheet. New sheets commit a blank board and metadata in one
transaction. Autosave commits board revision and metadata together; sidebar lists do not load media.

`FlowSheetSession` coordinates sidebar actions and the active editor. New generation and selection
await the editor's flush before switching; failed saves retain the active sheet, and concurrent
clicks are ignored during a transition. Keyed editors isolate undo history, selections, requests,
and content caches between sheets. Active generation prevents switching until current submissions
finish. Idle submitted video jobs remain persisted and reload through the existing API.

Last selection is stored separately per environment. Sidebar titles/counts refresh after commits;
focus refreshes discover changes from other tabs. Existing compare-and-write revisions continue to
reject conflicting edits. Sheets are client-local; this does not introduce server synchronization.
The existing image sidebar now opens the shared library when selecting generations or collections.

Optional `creativeDirection.realism` selects `natural`, `editorial`, or `off`. Absent/off preserves the existing version 1 prompt exactly. The shared prompt builder applies it at the backend provider boundary and in the UI preview; persisted original prompts remain reusable. Native Civitai negative prompts remain a separate capability-validated option and are never appended to descriptive model prompts.

References: [FLUX.2 prompting guide](https://docs.bfl.ai/guides/prompting_guide_flux2) and [Z-Image Turbo prompting guide](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo/discussions/8). Both explain the limits of conventional negative prompting; camera language and positive scene descriptions inform the optional realism cues.
