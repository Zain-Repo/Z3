# ZImage

Open the workspace switcher and choose **ZImage** to browse and create images with your configured
OpenRouter image models. ZImage is available in the desktop and web clients.

## Create an image

Write a prompt, then choose a model, aspect ratio, and image count. These choices follow the selected
model's capabilities. Expand the settings to adjust quality, output format, references, and other
supported options. The JSON view remains available for importing reusable generation settings.

The prompt stays below the image canvas in wide windows. In narrow windows it appears above the
library so it remains easy to reach. Choose **Generate** to start and **Stop generation** to cancel
the current request. Generation requires a configured image provider.

## Inspect and compare

Use an image's **Select** action to bring it onto the canvas. Previews preserve the image's aspect
ratio. Open an image fullscreen to inspect it more closely or download it.

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
