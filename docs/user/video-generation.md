# Video generation in ZImage

Open ZImage and select **Video**. The model list comes from OpenRouter's current video catalog. Refresh the workspace to load catalog changes.

Enter a prompt and choose a model. Duration, resolution, aspect ratio, frame inputs, audio, seed, and upscaling controls depend on the selected model. Selecting a new model resets its settings and reference inputs. Pixel size overrides the resolution and aspect-ratio controls.

Use first and last frame images to control the endpoints of a clip, or reference assets to guide its content. Use one mode per generation. Editing and upscaling models need a source video URL; Avatar IV needs one portrait image. Audio and video references must be directly downloadable HTTPS URLs, and support varies by model. Provider options must use the selected model's allowed parameter names and the correct provider slug.

Jobs remain in the workspace while rendering. Temporary polling and download failures are retried without submitting another generation. Completed videos are saved on your environment. Restarting the environment resumes unfinished jobs and incomplete downloads; videos already saved remain available without contacting OpenRouter again.

OpenRouter credits, provider availability, content policies, and model-specific media requirements still apply. If submission fails, the workspace displays the provider's error when available. See [OpenRouter's video API documentation](https://openrouter.ai/docs/guides/overview/multimodal/video-generation) for provider behavior and pricing.
