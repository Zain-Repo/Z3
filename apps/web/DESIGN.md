# Workspace design

This note covers the Z3Chat context and ZImage studio changes, not a replacement design system for
the rest of Z3. Use the existing theme tokens, DM Sans, Lucide icons, and base UI components.

## Z3Chat

The conversation is the primary reading surface. A compact project-context entry opens Sources,
Instructions, and Memory without moving the user out of the chat. At the extra-large breakpoint the
panel sits to the right; narrower windows use a Sheet with keyboard dismissal and focus handling.
Project home keeps the existing composer and recent conversations, with a direct continuation action.

Hierarchy comes from type weight, spacing, and separators. Source text is readable plain text in a
bounded preview. Index state is written explicitly. Memory scope copy must distinguish configuration
from evidence about a particular answer. Existing light and dark themes both apply.

## ZImage

The selected image is the focal point. Comparison shows two uncropped outputs with A/B captions.
The gallery below provides explicit selection, favorite, collection, and existing generation actions.
In wide windows the canvas/gallery region scrolls independently above the docked composer. In narrow
windows the composer comes before the library so creation remains reachable.

Model, aspect ratio, and image count are compact basic controls. Advanced settings and references
use a disclosure; JSON import remains a separate editor view. Output capability controls follow the
selected model and endpoint. Do not imply unsupported editing or generation capabilities.

The sidebar contains All generations, Favorites, and named collections. Forms for collection creation
and renaming are inline. Collection deletion explicitly preserves images. Organization errors must
remain visible, including when browser storage is unavailable.

Preserve image aspect ratios, lazy content loading, native keyboard actions, visible focus, and
reduced-motion behavior. Use existing fuchsia accents for image selections without changing the
global theme. Avoid continuous motion and image bytes in the organization store.
