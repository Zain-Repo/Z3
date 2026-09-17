# fal media integration

Z3 calls the fal queue REST API from the server. No fal SDK or browser credential is required.
The `fal` provider instance stores `FAL_KEY` as a sensitive environment variable through the
existing settings/secret store. It is excluded from the coding-provider registry.

## Reviewed endpoint mappings

| Z3 model | Text endpoint | References / frames |
| --- | --- | --- |
| `fal/flux-2` | `fal-ai/flux-2` | `fal-ai/flux-2/edit` (`image_urls`, maximum four) |
| `fal/flux-2-pro` | `fal-ai/flux-2-pro` | `fal-ai/flux-2-pro/edit` (`image_urls`, maximum four) |
| `fal/nano-banana-2` | `fal-ai/nano-banana-2` | `fal-ai/nano-banana-2/edit` (`image_urls`, Z3 cap of four) |
| `fal/nano-banana-pro` | `fal-ai/nano-banana-pro` | `fal-ai/nano-banana-pro/edit` (`image_urls`, Z3 cap of four) |
| `fal/seedream-4` | `fal-ai/bytedance/seedream/v4/text-to-image` | `fal-ai/bytedance/seedream/v4/edit` (`image_urls`, Z3 cap of four) |
| `fal/qwen-image` | `fal-ai/qwen-image` | Unsupported |
| `fal/flux-lora` | `fal-ai/flux-lora` | Civitai Flux.1 D/S LoRAs (`path`/`scale`, max 4) |
| `fal/flux-krea-lora` | `fal-ai/flux-krea-lora` | Civitai Flux.1 Krea LoRAs (`path`/`scale`, max 4) |
| `fal/flux-2-lora` | `fal-ai/flux-2/lora` | Civitai Flux.2 D LoRAs (`path`/`scale`, max 3) |
| `fal/z-image-turbo-lora` | `fal-ai/z-image/turbo/lora` | Civitai ZImageTurbo LoRAs (`model_name`/`weight`, max 3) |
| `fal/hidream-i1-full` | `fal-ai/hidream-i1-full` | Civitai HiDream-O1 LoRAs (`path`/`scale`, max 3) |
| `fal/wan-2.6-text-to-video` | `wan/v2.6/text-to-video` | Unsupported |
| `fal/wan-2.6-image-to-video` | Requires a first frame | `wan/v2.6/image-to-video` (`image_url`) |
| `fal/kling-3-pro-text-to-video` | `fal-ai/kling-video/v3/pro/text-to-video` | Unsupported |
| `fal/kling-3-pro-image-to-video` | Requires a first frame | `start_image_url`; optional last frame as `end_image_url` |
| `fal/seedance-2-text-to-video` | `bytedance/seedance-2.0/text-to-video` | Unsupported |
| `fal/seedance-2-image-to-video` | Requires a first frame | `image_url`; optional last frame as `end_image_url` |

Descriptors and request validation are defined in `FalModels.ts` and `FalApi.ts`. These are a
reviewed subset, not a dynamic list of every fal endpoint. Image data URLs and HTTPS references
are forwarded without changing bytes or order. FLUX models use `image_size`; Nano Banana models
use `aspect_ratio` and `resolution`. Video durations are serialized as strings. Wan
image-to-video does not accept an aspect-ratio override or a last frame. Kling and Seedance
image-to-video accept an optional last frame. Arbitrary provider options and Kling element
packs are not exposed.

FLUX.2, Seedream 4, Qwen Image, Wan, and the LoRA endpoints send `enable_safety_checker: false`.
FLUX.2 Pro also sends `safety_tolerance: "5"`, its most permissive documented value. fal honors a
disabled checker only for accounts authorized to disable it; this is a requested API setting, not
a guarantee that provider moderation is disabled. Nano Banana 2 and Nano Banana Pro send
`safety_tolerance: "6"`. Lower numbers are stricter. Unsupported safety fields are never sent to
a different model family. Kling 3 Pro and Seedance 2.0 have no documented checker toggle.

LoRA-capable fal models expose Civitai resource search on the image card. Fal does not accept
Civitai AIR identifiers. Z3 uses the configured Civitai API key to follow
`GET /api/download/models/{versionId}` (Bearer token, no file body) and sends the redirected
HTTPS storage URL as `loras[].path`/`scale`, or `loras[].model_name`/`weight` on Z-Image Turbo.
Checkpoints are not supported on these endpoints. The storage URL is short-lived; generate soon
after selecting the LoRA.

Submissions are never automatically retried. Images wait on the queue with a ten-minute deadline
and best-effort cancellation if interrupted. Videos persist the supplied `status_url` in the
existing `polling_url` column, then resume polling after restart. A completed status supplies the
result URL; the server validates the queue origin before attaching credentials. No queue URL
is reconstructed from endpoint subpaths. Video status/result/download reads use the existing
bounded retry policy. Media downloads send no API key and accept HTTPS `fal.media` hosts only,
without redirects. Images are limited to 20 MB and MP4 videos to 250 MB, then stored in the
environment's existing asset tables. No database migration is required.

`GET /api/images/models?providerInstanceId=fal` and
`GET /api/videos/models?providerInstanceId=fal` return the configured catalog. Generation uses
the existing image/video POST contracts with a `fal/` model ID and optional `providerInstanceId`.
Omitting the instance uses `fal`. Web and desktop share ZImage; the native mobile client does
not currently have a ZImage workspace. Remote clients use the authenticated environment API.

## API sources

Reviewed against official API pages and their linked OpenAPI schemas on 2026-09-17:

- [Queue lifecycle, authentication, and result URLs](https://fal.ai/docs/documentation/model-apis/inference/queue)
- [FLUX.2](https://fal.ai/models/fal-ai/flux-2/api) and [editing](https://fal.ai/models/fal-ai/flux-2/edit/api)
- [FLUX.2 Pro](https://fal.ai/models/fal-ai/flux-2-pro/api) and [editing](https://fal.ai/models/fal-ai/flux-2-pro/edit/api)
- [Nano Banana 2](https://fal.ai/models/fal-ai/nano-banana-2/api) and [editing](https://fal.ai/models/fal-ai/nano-banana-2/edit/api)
- [Nano Banana Pro](https://fal.ai/models/fal-ai/nano-banana-pro/api) and [editing](https://fal.ai/models/fal-ai/nano-banana-pro/edit/api)
- [Seedream 4.0](https://fal.ai/models/fal-ai/bytedance/seedream/v4/text-to-image/api) and [editing](https://fal.ai/models/fal-ai/bytedance/seedream/v4/edit/api)
- [Qwen Image](https://fal.ai/models/fal-ai/qwen-image/api)
- [FLUX.1 [dev] LoRA](https://fal.ai/models/fal-ai/flux-lora/api)
- [FLUX.1 Krea LoRA](https://fal.ai/models/fal-ai/flux-krea-lora/api)
- [FLUX.2 [dev] LoRA](https://fal.ai/models/fal-ai/flux-2/lora/api)
- [Z-Image Turbo LoRA](https://fal.ai/models/fal-ai/z-image/turbo/lora/api)
- [HiDream-I1 Full](https://fal.ai/models/fal-ai/hidream-i1-full/api)
- [Wan text-to-video](https://fal.ai/models/wan/v2.6/text-to-video/api) and [image-to-video](https://fal.ai/models/wan/v2.6/image-to-video/api)
- [Kling 3 Pro text-to-video](https://fal.ai/models/fal-ai/kling-video/v3/pro/text-to-video/api) and [image-to-video](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api)
- [Seedance 2.0 text-to-video](https://fal.ai/models/bytedance/seedance-2.0/text-to-video/api) and [image-to-video](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/api)
