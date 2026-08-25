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

## Workspace tools

The direct driver exposes workspace tools to models that support OpenRouter function calling:

- `list_files` searches the current workspace paths.
- `read_file` reads a UTF-8 text file relative to the workspace.
- `write_file` writes a UTF-8 file relative to the workspace.

Tool calls are executed by the server and their results are sent back to OpenRouter so the model
can continue the same turn. Paths are checked against the current workspace root and cannot escape
it. File writes are rejected when the session is in approval-required mode.

The direct driver still does not expose ACP approval requests, image attachments, or source-control
text-generation helpers. Those operations report an explicit unsupported error rather than
pretending they succeeded.

If the provider is shown with a warning, check that an API key is configured for that instance and
that the server can reach the configured endpoint. A 401 means the key was rejected, 402 means the
OpenRouter account needs credits, and 429 means the account is rate-limited.
