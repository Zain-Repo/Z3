# DeepSeek

Z3 includes a DeepSeek provider that talks directly to DeepSeek's OpenAI-compatible API. It does
not require a DeepSeek CLI or a local agent process.

## Configure it

In Settings, add a **DeepSeek** provider instance:

```text
API key: sk-...
API endpoint: https://api.deepseek.com
Default model: deepseek-v4-flash
```

Z3 stores the API key as a sensitive provider secret and does not send the saved value back to the
client. Existing setups can provide `DEEPSEEK_API_KEY` through the instance's sensitive
Environment variables section.

Z3 refreshes the model list from DeepSeek. The current API exposes `deepseek-v4-flash` and
`deepseek-v4-pro`; you can also enter a custom model ID when using a compatible endpoint.

## Current boundary

The direct driver supports text chat turns and canonical runtime event delivery through the normal
Z3 session path. It does not currently expose workspace tools, ACP approval requests, image
attachments, or source-control text-generation helpers. Those operations report an explicit
unsupported error rather than pretending they succeeded.

If the provider is shown with a warning, check the instance API key and endpoint. A 401 means the
key was rejected, and 429 means the account is rate-limited.
