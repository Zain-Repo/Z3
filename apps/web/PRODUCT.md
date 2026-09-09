# Product

## Platform

Web UI, also used by the Electron desktop client. Z3Chat is currently desktop-only; ZImage is
available in both desktop and web. The React Native client is a separate surface.

## Purpose

Z3 connects people to their configured agent providers and environments. Z3Chat organizes general
conversations around project instructions, sources, and conversation memory. ZImage creates and
organizes image outputs using configured OpenRouter models.

## Current work

The approved direction combines practical improvements and new workspace layouts. This release
adds inspectable chat project context and continuation, an image canvas and comparison, and local
favorites and collections. Existing provider behavior and generation settings remain available.

## Constraints

- Execution, source indexing, and image bytes belong to the environment's server.
- Chat project metadata and image-library organization are currently client-local.
- Preserve existing light/dark themes, keyboard access, and reduced-motion support.
- Avoid continually repainting effects and unnecessary image loading.
- No implied cross-device metadata sync, per-answer retrieval transparency, or unsupported model
  capability. Those require separate integration work.
