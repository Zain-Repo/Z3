# Image generation

ZImage and Z3Chat show an animated canvas while an image is being generated.
ZImage placeholders match the requested dimensions, including image batches.
Chat placeholders use dimensions supplied by the provider, with a square fallback
when none are available. The animation settles after a few cycles and respects
your system's reduced-motion setting.

OpenAI image models support PNG, JPEG, and WebP output. Compression applies only
to JPEG and WebP. PNG and requests using the default format omit compression.

GPT Image 2.5 Sunburst and Flare also support `xhigh` and `max` quality. Available
quality settings follow the selected model's capabilities.

If generation fails, the error message includes the reason returned by the image
generation service.
