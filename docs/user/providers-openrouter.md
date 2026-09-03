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
`anthropic/claude-3.7-sonnet`. Z3 refreshes the model list from OpenRouter and records each model's
supported parameters, reasoning support, and modalities. Local tools are disabled until the model
catalog confirms function-tool support, so a stale or incomplete catalog falls back safely.

## Image attachments

Image attachments are sent as base64 `image_url` content parts. They work when the selected
OpenRouter model advertises `image` in its input modalities. For example, OpenRouter's
`deepseek/deepseek-v4-flash-vision-exp` model supports image understanding; the regular DeepSeek
V4 Flash and V4 Pro models are text-only.

Z3 accepts PNG, JPEG, WEBP, and GIF attachments for this provider. Selecting a text-only model
produces a validation message before a request is sent. If OpenRouter rejects a request, Z3 now
surfaces the provider's response detail instead of showing only a generic runtime error.

## Video generation

Z3Image can generate videos through OpenRouter. Choose an OpenRouter video model and enter a
prompt. You can also provide optional frames or references, duration, resolution, aspect ratio,
audio, a seed, and any provider-specific options that the selected model advertises.

Video jobs run asynchronously. Z3 polls the job, resumes polling after a restart, downloads all
outputs, stores them locally, and serves them to web, desktop, and remote clients. Jobs show
**pending**, **rendering**, or **error** states. Terminal provider failures remain visible with
their error; preview-loading failures offer **Retry**.

OpenRouter video generation is not eligible for Zero Data Retention (ZDR), and the provider may
charge OpenRouter credits for these requests.

## Workspace tools

The direct driver exposes workspace tools to models that support OpenRouter function calling:

- `list_files` searches the current workspace paths.
- `read_file` reads a UTF-8 text file relative to the workspace.
- `write_file` writes a UTF-8 file relative to the workspace.
- `search_files` searches text content in workspace files.
- `apply_patch` applies one strict, single-file unified diff.
- `run_command` runs a structured executable and argument list in the workspace.

OpenRouter server tools are also available:

- `openrouter:web_search` searches the web and returns citation annotations.
- `openrouter:web_fetch` fetches a specific page or documentation URL.

Web search is model-directed: Z3 includes OpenRouter's `openrouter:web_search` server tool on
every direct OpenRouter chat request, and OpenRouter decides whether a current-information lookup
is needed. Search work is capped at five server-tool calls per turn on compatible routes. The GLM
5.3 Flash BaseTen compatibility route omits that optional cap because the upstream route rejects
it. When OpenRouter performs a search, Z3 records a **Web search** activity in the thread and
keeps the returned citation metadata with the provider event stream.

Tool calls are executed by the server and their results are sent back to OpenRouter so the model
can continue the same turn. Paths are checked against the current workspace root, including the
shared workspace filesystem's symlink and binary-file protections. File edits and commands are
bounded; command output and execution time are capped, and commands never receive implicit shell
interpolation.

Approval behavior follows the session runtime mode:

- `approval-required`: ask before file edits and commands.
- `auto-accept-edits`: approve edits automatically, but ask before commands.
- `full-access`: execute both without prompts.
- `auto`: use supervised approval for edits and commands because OpenRouter has no native Z3
  reviewer integration.

Reads, searches, and listing never require approval. Accept-for-session decisions suppress later
prompts for that tool in the same session. Declined or cancelled calls return structured tool
errors to the model, and interrupted sessions clear pending approvals safely.

OpenRouter's local function tools and `tool_choice` parameter are sent only when the selected model
advertises them. The OpenRouter-managed web-search and web-fetch server tools are independent of
that model capability check and remain available for any model supported by OpenRouter. Requests
containing local tools require provider routing to honor those parameters. The OpenRouter
server-side `apply_patch` tool is not used because it is limited to the Responses API; Z3's local
`apply_patch` tool provides workspace editing instead.

The direct driver still does not expose source-control text-generation helpers. Those operations
report an explicit unsupported error rather than pretending they succeeded.

If the provider is shown with a warning, check that an API key is configured for that instance and
that the server can reach the configured endpoint. A 401 means the key was rejected, 402 means the
OpenRouter account needs credits, and 429 means the account is rate-limited.
