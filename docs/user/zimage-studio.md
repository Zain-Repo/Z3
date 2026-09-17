# ZImage canvas

ZImage on web and desktop is a canvas for connected image and video workflows. Open **Image**
in the sidebar. Drag **Prompt**, **Image**, or **Video** from the toolbar onto the canvas, or
click a component to add it. Move a card by its header. Rename it in the header field.

**Reference** adds an uploaded image. Choose a PNG, JPEG, or WebP up to 8 MB, drag a file onto the
card, or paste an image into it. You can also drop up to eight image files on the canvas to create
reference cards. Connect their outputs to image references or supported video frame inputs.
Replacing a reference changes the next run; it does not modify previously generated outputs.

**Combine** assembles reusable prompt fragments. Connect subject, lighting, or style prompts to
its input, choose paragraph breaks, new lines, or spaces, and optionally append more text. Its
output connects to generation cards or another combiner. **Combined prompt preview** shows the
result. Select the card and use the arrows in Connections to reorder its incoming prompts.

**Note** holds art direction, decisions, and reminders. Notes have no ports and are never sent to
models or included in paid generation runs.

**Prompt updater** rewrites a brief with AI. Connect a prompt or enter an original prompt in the
card, optionally add rewrite direction, then choose **Rewrite with AI**. Review and edit the
updated prompt before connecting its output to an image, video, or another prompt utility.
Rewriting runs a background model through your connected Codex account first. If Codex is
unavailable or fails, it tries a configured OpenRouter account. Requests run sequentially and
stop after the first successful rewrite. OpenRouter may incur provider charges.
The original prompt stays available. Changing it, its connections, or the rewrite direction
requires a new rewrite before downstream generation can run. **Run canvas** uses the reviewed
result; it does not automatically submit rewrites.

**Image library** collects up to 16 images in one card. Upload or paste PNG, JPEG, or WebP files,
choose saved images, or connect image outputs to its left input. Uploaded files are limited to
8 MB each and about 18 MB combined per library. Use the image controls to remove or reorder
items. Saved and uploaded images come first, followed by connected images in connection order.
Connected outputs appear automatically in the collection and update when their source changes.
You do not need to select them again from saved images. Disconnecting a source removes its preview.

Connect the library output to an image card's reference input to use the collection together.
Choose a model that supports enough reference images, and describe how to combine them in its
prompt. For video, a first-frame or last-frame connection uses only the selected library image.
Click a thumbnail or set **Video frame image number**, including connected images in the count.
To animate a combined image, connect the library to an image card, then connect that image's
output to a video frame input. Missing upstream images are generated before their consumers.

## Generate with fal.ai

Open **Settings > Providers > fal.ai**, save your [fal API key](https://fal.ai/dashboard/keys),
and enable the provider. Generation uses your fal account credits. Return to ZImage and refresh
the model catalog if it was already open.

Choose a fal.ai image model from the list. **FLUX.2**, **FLUX.2 Pro**, **Nano Banana 2**,
**Nano Banana Pro**, and **Seedream 4.0** accept up to four reference images for editing.
**Qwen Image** is text-only. For photoreal custom styles, use **FLUX.1 [dev] · LoRA**,
**FLUX.1 Krea · LoRA**, **FLUX.2 [dev] · LoRA**, **Z-Image Turbo · LoRA**, or **HiDream-I1 Full**.
Those models accept Civitai LoRAs that match their base family. Configure a Civitai API key as
well, then search and attach LoRAs on the image card. ZImage asks Civitai for a direct file URL
and sends that to fal; include the LoRA trigger words in the prompt. Checkpoints are not used on
fal.

Choose a **Text to video** fal model for a prompt-only clip, or an **Image to video** model and
connect a first-frame image. Wan 2.6 is 5, 10, or 15 seconds at 720p or 1080p and has no last
frame. Kling 3 Pro and Seedance 2.0 can add an optional last frame and can generate native audio.
Generated media is saved in the connected environment's library. Submitted video jobs resume
status checks after the server restarts.

ZImage requests disabled safety checking for FLUX.2, Seedream, Qwen, Wan, and the LoRA endpoints,
the most permissive FLUX.2 Pro tolerance, and the least restrictive Nano Banana tolerance. fal
only honors disabled checking for authorized accounts; provider-side moderation can still apply.

## Saved canvas sheets

**New generation** in the sidebar saves your current canvas and opens a new, completely blank
sheet. Previous sheets remain under **Canvases**. Select one to restore its components, connections,
settings, uploaded references, and view position, then continue editing it.

Rename the active sheet using the canvas-name field at the top. The sidebar updates after autosave
and shows the sheet's card count and last edit date. A search field appears when you have more than
five sheets. Your last selected sheet opens again when you return to ZImage.

Sheet creation and switching wait for outstanding saves. If saving fails, the current sheet stays
open with an error. Finish or stop an active generation run before changing sheets. Submitted video
jobs keep processing on the server and can be revisited from their saved sheet or the asset library.

Sheets are saved for the connected environment on this device. Existing single-canvas work is
preserved as the first sheet. **Import** replaces only the current sheet's contents; **Export**
exports only the current sheet. Generated assets remain available across sheets in **Image library**.

## Connect a workflow

Write your brief in a prompt card. Drag its right-hand output port to an input, or click the output and then the prompt input on
an image or video card. Hover or focus a port to see its label. Choose a model on the generation
card and adjust the settings below its preview.

Image outputs connect to another image card's reference input, or to a video's first-frame or
last-frame input when supported by the selected model. If a card has several outputs, select the
number beneath the preview to choose the image used by downstream connections. Video cards are
outputs; video-to-video connections are not currently supported.

Select a card to see its connections. Use the connection's **Ã—** button to disconnect it.
Cards can be duplicated or removed from their header. Removing a card leaves its generated
assets in the library. Loops and incompatible connections are rejected.

**Generate image** or **Generate video** runs one card, reusing existing upstream images and
generating missing upstream images first. **Run canvas** regenerates all generation cards in
dependency order. Imported library assets are reused. Each model request is billed separately;
video count submits separate jobs. Up to two cards run at once. A failed branch does not discard
successful comparisons, and its dependent cards are skipped.

**Stop after current** prevents new work from starting. Requests already submitted finish, and
video jobs continue processing on the server. Leaving the canvas stops client-side scheduling;
check the library before resubmitting work that was already sent.

## Direct the image

Under **Advanced settings**, creative direction offers photographic, cinematic, product, and
illustration treatments, lighting, composition, focal detail, and reference intent. New model
selections use crisp focal detail. Disabling direction removes these optional treatments.
All image models receive baseline guidance for coherent lighting, anatomy, materials, and focus.
For photographic images, this includes clear skin with subtle natural texture and restrained
retouching. Your explicit style takes precedence, including illustration and intentionally stylized
work. The baseline remains active when optional creative direction is disabled.
**Preview model prompt** shows the prepared instructions. These guide the model; they do not
increase resolution or guarantee fidelity. Choose a supported resolution and quality for the output.

Civitai models retain checkpoint and LoRA controls in Advanced settings. Required checkpoints
must be selected before a run. Model options come from the connected provider's capability catalog.
Changing a model clears incompatible output settings. Add card-specific instructions beneath
**Additional instructions**; these follow connected prompt text.

## Inspect, organize, and reuse

Outputs appear directly on their cards. Open an image preview to inspect or download the original.
Video previews load on demand and offer playback and download. Video job status updates automatically.

**Library** opens the existing image library, including search, favorites, collections, saved
settings, downloads, and comparison previews. **Use as reference** adds the selected library image
as a reusable canvas card; connect its output to another card. **Reuse** creates a configured image
card. **Reroll** creates and runs one. Video assets can also be added from the library.

## Keep the canvas organized

Use the minus button in a card header to collapse it and the plus button to expand it. Connections
continue working while a card is collapsed. Open **Canvas** for snap-to-grid, connection visibility,
automatic arrangement by dependency, and controls to collapse or expand all cards. **Fit** uses the
cards' current sizes, including expanded settings.

The Canvas menu also adds ready-connected starters for **Compare two models**, **Reference to
image**, and **Image to motion**. Starters are added to the current board without replacing it.
Choose models and edit the brief before running; adding a starter never submits a generation.

Advanced image controls include background and compression when the model supports them. Video
models can expose creativity and an upscale factor. Unsupported controls remain hidden.

## Navigate and save

Drag the background or scroll to pan. Ctrl/Cmd + scroll zooms around the pointer. The lower-left
controls zoom or fit the board. After selecting a card and focusing the canvas, arrow keys move
it (Shift uses a larger step); Delete removes it. Ctrl/Cmd+Z undoes edits, and Ctrl/Cmd+Shift+Z
redoes them. Escape cancels a connection. On touch screens, tap to add cards, drag their headers,
and use the zoom buttons.

Layouts, prompts, connections, model settings, and output selections save on this device,
separately for each connected environment. **Export** saves a workflow file; **Import** replaces
the board and can be undone. Generated assets remain on the environment server. Exported asset IDs
only resolve where those assets exist. Reused embedded input references may be included in the file.
Storage failures are shown; export a copy if saving is unavailable. A revision check rejects saving over changes from another tab. Export your copy and reload to
continue from the saved version.

The same web canvas runs in desktop and remote web connections. The native mobile app does not
currently have a ZImage screen. Canvas layouts do not synchronize across devices.

Canvas documents use this browser's database so reference images do not depend on local storage's
small text quota. Existing saved canvases are imported automatically on first open. Wait for
**Saved on this device** before closing the app. Uploaded images are embedded in workflow exports;
generated assets remain linked to the environment library. Clearing site data removes local
canvases and uploaded references, so export workflows you want to keep.

### Delete a canvas

Use the delete control beside a canvas in the sidebar, then confirm. This permanently removes the sheet, its connections, settings, and uploaded references from this device. Generated images and videos remain in the library. Deleting the open sheet opens another saved sheet; deleting the last sheet opens a new blank canvas. Finish or stop an active run before deleting.

### Natural image detail

In an image card’s creative direction, choose Natural camera or Editorial camera under Realism treatment. These optional instructions guide perspective, texture, shadows, and restrained retouching. Preview model prompt shows the actual added direction. Existing canvases retain their previous treatment until you change it.

Compatible Civitai models offer a separate negative prompt with an editable realism quality preset. It excludes common rendering artifacts, without adding blanket content exclusions. Use short, scene-specific exclusions; provider content policies still apply. Models without native negative prompting should receive positive descriptions of the intended result instead.

## Canvas controls and image previews

Use **Add node** to search the node library by name or purpose. Click a result to add it, or drag it to a position on the canvas. The existing component toolbar remains available. Node headers and connections use colors to distinguish prompt and image paths; port labels remain available on hover and keyboard focus.

Generation nodes show a queued or generating preview while a run is active. The canvas status shows the number of queued nodes. Image previews display skeletons while loading and decoding, then reveal the image. Reference uploads and the asset library use the same loading treatment. Loading animations settle automatically and respect reduced-motion preferences.
