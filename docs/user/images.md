# ZImage

Open the workspace switcher and choose **ZImage** to browse and create images with your configured
OpenRouter or Civitai image models. ZImage is available in the desktop and web clients.

## Connect Civitai

Create an API key in your [Civitai account settings](https://civitai.com/user/account).
In **Settings > Providers**, enter it in the **Civitai** card and save it. You can replace or
remove the key there later. The key is stored on your connected server and is not included in
generation exports.

In ZImage, choose **Civitai** from the **Provider** dropdown, then choose a model. The Civitai
selection is grouped by provider and includes OpenAI, Google, Gemini, Grok, Seedream, Wan, FAL,
Qwen, Krea, FLUX, and Civitai worker models. Worker options include Z-Image, Anima, Qwen,
HiDream, ERNIE, Ideogram, Lens, Boogu, and MageFlow, where supported by Civitai.

Each model offers its supported image counts, sizes, aspect ratios, resolutions, quality, formats,
and seeds. Switching models adjusts incompatible selections. Civitai generation uses your Civitai
account balance; model and resource availability depends on Civitai.

### Checkpoints and LoRAs

For photographic images, use **Realistic checkpoints** in Advanced settings. The list includes
verified versions of Juggernaut XL, CyberRealistic, CyberRealistic XL and Pony, epiCRealism XL,
Photonic Fusion, Stable Yogi's realism models, and DreamShaper 8 (a versatile model that also
supports realism). Only checkpoints compatible with the selected model family appear.
Choose an SDXL or SD1.5 route from **Community checkpoints** to see those families.
Selecting a recommendation clears existing LoRAs, and Civitai availability is rechecked before
generation. Search remains available for additional checkpoints and newer versions.

Choose a supported Civitai model and open **Advanced settings and references** to customize
its resources. Search for a checkpoint or LoRA, select a version, and review its base model and
trigger words. Checkpoints replace the underlying model; LoRAs adjust its style or subject.
Each LoRA has a strength control and can be removed independently.

Search by name (for example, **IntoRealism** with **Z-Image Turbo**) or paste a Civitai model
link into the search field. A link containing `modelVersionId` looks up that exact version.
Search checks version availability because Civitai's listing flags can differ from its generation
availability. An incompatible or unavailable exact version displays an explanation.

LoRA support depends on the generation route, even when models share a name. Advanced settings
shows compatible base models or explains when custom LoRAs are unavailable for the selected route.
LoRAs must match the selected checkpoint's architecture; FLUX.2 Klein sizes and base variants
are checked separately. Unsupported or incompatible resources are rejected before generation.
Supported routes include FLUX.2 Dev and Klein, Wan 2.2 A14B, and compatible Civitai worker
routes. Other Wan image routes remain unavailable for LoRAs because their execution support
has not been verified. A model being listed on Civitai does not imply that its API route accepts
custom resources.

The **Community checkpoints** model group offers Stable Diffusion 1.5, SDXL (including Pony and
Illustrious), and FLUX.1 routes. These require a checkpoint before generation. Other routes offer an optional
override or only support LoRAs. The controls reflect the selected route's capabilities. Search
filters resources by compatible base models, and ZImage checks availability and compatibility
again before submitting a generation. Civitai may charge additional fees for selected resources.

Where supported, you can also set a negative prompt, sampling steps, and guidance scale. Leave
optional values blank to use provider defaults. Changing the model clears these resource settings;
reusing a gallery generation or importing its JSON restores them. Image editing is not included.

Temporary Civitai server errors and rate limits are retried automatically. Submission retries reuse
the same request identifier so Civitai can return the original generation without creating another.
If submitting a generation fails with a server error, check your Civitai account before generating
again: the request may already have been accepted. Errors identify rejected settings, missing model
access, or unavailable workers when
Civitai provides that information.

Choose **OpenRouter** to return to your existing image models. Both providers save images to the
same gallery; reusing generation settings preserves the provider choice. Remote clients use the
key saved on the server they are connected to.

## Create an image

Write a prompt, then choose a provider, model, size, and image count. These choices follow the selected
model's capabilities. Expand the settings to adjust quality, output format, references, and other
supported options. The JSON view remains available for importing reusable generation settings.

The creation panel stays beside the gallery in wide windows. In narrow windows it appears above the
library so it remains easy to reach. Choose **Generate** to start and **Stop generation** to cancel
the current request. Generation requires a configured image provider.

## Inspect and compare

The workspace opens with a grid of your generations. Choose **Show preview** to open the canvas,
or use an image's **Select** action to preview that output. Choose **Hide preview** to return to
browsing the grid. Previews preserve the image's aspect ratio. Open an image fullscreen to inspect
it more closely or download it.

Choose **Compare two images**, then select another output in the library. The first image stays in
position A while subsequent selections replace position B. Choose **Exit comparison** to return to
a single image. Comparison works with existing outputs and does not generate new images.

## Favorites and collections

Use the heart button on a generation to add or remove it from **Favorites**. Create a collection in
the sidebar, then choose it from a generation's collection selector. A generation belongs to one
collection at a time; choose **No collection** to remove it from its collection.

Select a collection in the sidebar to browse its generations. Its menu lets you rename or delete
the collection. Deleting a collection preserves its images in **All generations**. Search, model
filters, and sorting work within the selected library view.

Favorites and collections are saved on this client for the connected environment. They are not
synchronized between devices. Clearing the site's local storage removes this organization but does
not delete images stored on the server. If local storage cannot save a change, ZImage displays an
error and keeps the last successfully saved organization.
