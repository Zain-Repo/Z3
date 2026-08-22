# OpenRouter

Z3 includes an OpenRouter provider that talks to OpenRouter's OpenAI-compatible API directly. It
does not require an OpenRouter CLI or a local agent process.

## Configure it

In Settings, add an **OpenRouter** provider instance. Keep the default API endpoint unless you use
an OpenRouter-compatible gateway:

```text
API key: sk-or-v1-...
API endpoint: https://openrouter.ai/api/v1
Default model: openai/gpt-4o-mini
```

Enter the key in the API key field. Z3 stores it as a sensitive provider secret and does not send
the saved value back to the client. Existing setups can still provide `OPENROUTER_API_KEY` through
the instance's sensitive Environment variables section.

OpenRouter model IDs use the `provider/model` form, such as `openai/gpt-4o-mini` or
`anthropic/claude-3.7-sonnet`. Z3 refreshes the model list from OpenRouter and also keeps the
configured default model available when the account cannot be probed yet.

## Current boundary

The direct driver supports text chat turns and canonical runtime event delivery through the normal
Z3 session path. It does not currently expose workspace tools, ACP approval requests, image
attachments, or source-control text-generation helpers. Those operations report an explicit
unsupported error rather than pretending they succeeded.

If the provider is shown with a warning, check that an API key is configured for that instance and
that the server can reach the configured endpoint. A 401 means the key was rejected, 402 means the
OpenRouter account needs credits, and 429 means the account is rate-limited.
