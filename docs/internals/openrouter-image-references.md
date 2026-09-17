# OpenRouter image references

Audited the public [image catalog](https://openrouter.ai/api/v1/images/models) and each model endpoint record on 2026-09-17. These are a test snapshot; runtime limits continue to come from OpenRouter, not this table.

All models use the dedicated `POST /api/v1/images` request with `input_references: [{ type: "image_url", image_url: { url } }]`, as documented in [OpenRouter image generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation). Uploaded references and upstream generated assets reach this API as base64 data URLs; public HTTP(S) references retain their URLs. The backend preserves their order and content.

References must satisfy every allowed endpoint. Base provider slugs include regional and tier variants. Unsupported or out-of-range references fail explicitly instead of being dropped. If endpoint discovery fails or yields no records, the existing pass-through behavior leaves validation to OpenRouter.

| Model | Reference count |
| --- | --- |
| `openai/gpt-image-2.5-sunburst` | 0–16 |
| `openai/gpt-image-2.5-flare` | 0–16 |
| `microsoft/mai-image-2.6` | 0–5 |
| `microsoft/mai-image-2.6-flash` | 0–5 |
| `meta/muse-image` | Unknown: no endpoint metadata |
| `recraft/recraft-v4-styles-pro` | 1–10 |
| `recraft/recraft-v4-styles-vector` | 1–10 |
| `recraft/recraft-v4-styles-pro-vector` | 1–10 |
| `recraft/recraft-v4-styles` | 1–10 |
| `bytedance-seed/seedream-5-0-lite` | 0–14 |
| `bytedance-seed/seedream-5-0-pro` | 0–14 |
| `x-ai/grok-imagine-image-2.0` | 0–3 |
| `qwen/qwen-image-3-pro` | 0–4 |
| `qwen/qwen-image-3` | 0–4 |
| `microsoft/mai-image-2.5-pro` | 0–1 |
| `krea/krea-2-large` | 0–1 |
| `krea/krea-2-medium` | 0–1 |
| `krea/krea-2-medium-turbo` | 0–1 |
| `google/gemini-3.1-flash-lite-image` | 0–14 |
| `openai/gpt-image-2` | 0–16 |
| `openai/gpt-image-1-mini` | 0–16 |
| `openai/gpt-image-1` | 0–16 |
| `google/gemini-3.1-flash-image` | 0–14 |
| `google/gemini-3-pro-image` | 0–14 |
| `sourceful/riverflow-v2.5-pro` | 0–10 |
| `sourceful/riverflow-v2.5-fast` | 0–4 |
| `microsoft/mai-image-2.5` | 0–1 |
| `x-ai/grok-imagine-image-quality` | 0–3 |
| `recraft/recraft-v4.1-pro-vector` | 0–1 |
| `recraft/recraft-v4.1-vector` | 0–1 |
| `recraft/recraft-v4.1-utility-pro` | 0–1 |
| `recraft/recraft-v4.1-utility` | 0–1 |
| `recraft/recraft-v4.1-pro` | 0–1 |
| `recraft/recraft-v4.1` | 0–1 |
| `recraft/recraft-v4-pro-vector` | 0–1 |
| `recraft/recraft-v4-vector` | 0–1 |
| `recraft/recraft-v4-pro` | 0–1 |
| `recraft/recraft-v4` | 0–1 |
| `recraft/recraft-v3` | 0–1 |
| `openai/gpt-5.4-image-2` | 0–16 |
| `google/gemini-3.1-flash-image-preview` | 0–14 |
| `sourceful/riverflow-v2-pro` | 0–10 |
| `sourceful/riverflow-v2-fast` | 0–4 |
| `black-forest-labs/flux.2-klein-4b` | 0–4 |
| `bytedance-seed/seedream-4.5` | 0–14 |
| `black-forest-labs/flux.2-max` | 0–8 |
| `black-forest-labs/flux.2-flex` | 0–8 |
| `black-forest-labs/flux.2-pro` | 0–8 |
| `google/gemini-3-pro-image-preview` | 0–14 |
| `openai/gpt-5-image-mini` | 0–16 |
| `openai/gpt-5-image` | 0–16 |
| `google/gemini-2.5-flash-image` | 0–3 |

The offline fixture and request tests cover all 52 listed models. Muse pass-through coverage verifies serialization only; its reference support is not confirmed by the catalog.
