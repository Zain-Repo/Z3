# Cline

Z3 includes a Cline provider that drives the Cline CLI in its native Agent Client Protocol
(ACP) mode (cline --acp over stdio). It requires the Cline CLI v2.0 or newer.

## Install it

```text
npm install -g cline
```

## Configure it

In Settings, add a **Cline** provider instance:

```text
Binary path: cline
Authentication method: Cline
Data directory: (optional) isolated Cline state directory
```

Z3 runs `cline --acp` for each session and reuses Cline's own authentication. Credentials
saved by `cline auth` are reused automatically; you can also set `CLINE_API_KEY` in the
instance's sensitive Environment variables section to bypass interactive sign-in.

## What works

- Plan/Act modes map to Z3's interaction-mode toggle.
- Model and provider selection from Cline's catalog, exposed as a model picker.
- Permission prompts for file edits and commands through Z3's approval UI.
- Session resume across restarts via ACP session/load.
- Image attachments for vision-capable models.

## Current boundary

Cline user questions that are not routed through ACP elicitation surface as plain text.
Cline's provider, organization, and auto-approve session options are configured through Z3
settings rather than surfaced as model-picker options.
