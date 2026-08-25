# Z3Chat

Z3Chat is a desktop-only workspace for conversations with your configured provider. Open the workspace switcher in the Z3 desktop app and choose **Z3Chat**.

Chats belong to the selected environment and do not require a project or worktree. Use the environment selector in the chat sidebar to switch where new chats are created. Z3Chat keeps provider actions behind approval-required runtime mode.

## File attachments

Use the **Add files or images** button, paste, or drag files into the composer. Z3Chat accepts up to eight attachments per message. Images can be up to 10 MB each; UTF-8 text and code files can be up to 2 MB each.

Text and code attachments work with every provider. Z3Chat sends them through a bounded text representation when the provider does not support native file input. Images continue to use each provider's image support and may be unavailable for text-only models.

Attached files remain available from the message history. Unsupported binary formats, invalid UTF-8 files, empty files, and oversized files are rejected before the message is sent.

Z3Chat is not available in the web or mobile clients. Those clients continue to show project-based Z3Code threads.
