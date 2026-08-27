# Z3Chat

Z3Chat is a desktop-only workspace for conversations with your configured provider. Open the workspace switcher in the Z3 desktop app and choose **Z3Chat**.

Chats belong to the selected environment and do not require a project or worktree. Use the environment selector in the chat sidebar to switch where new chats are created. New chats use **Full access** by default, and the **Access** control in the composer lets you switch to supervised or automatic approval modes at any time.

## Conversation memory

When a new request is meaningfully similar to an earlier question, Z3 can give the provider a small set of completed question-and-answer rounds as background context. Recall is automatic, includes archived chats, and does not change the messages shown in chat history. In a Z3Chat project's settings, choose **Full memory** to search relevant conversations across all Z3Chat projects, or **Project Only** to limit recall to that project's chats. **Project Only** is the default for new and existing projects.

Memory is stored and searched by the selected environment's Z3 server. Recalled text is treated as untrusted historical evidence, so newer information and the current request take priority. Short or unrelated prompts intentionally receive no recalled context.

Z3Chat project membership is still stored in the desktop client. Consequently, project-scoped recall follows the projects currently known to that client and does not yet synchronize across devices.

## File attachments

Use the **Add files or images** button, paste, or drag files into the composer. Z3Chat accepts up to eight attachments per message. Images can be up to 10 MB each; UTF-8 text and code files can be up to 2 MB each.

Text and code attachments work with every provider. Z3Chat sends them through a bounded text representation when the provider does not support native file input. Images continue to use each provider's image support and may be unavailable for text-only models.

Attached files remain available from the message history. Unsupported binary formats, invalid UTF-8 files, empty files, and oversized files are rejected before the message is sent.

Z3Chat is not available in the web or mobile clients. Those clients continue to show project-based Z3Code threads.

## Project sources

Project sources remain in the desktop client’s local project storage. When an OpenRouter provider is
configured, Z3Chat also creates temporary in-memory embeddings for each source so it can be
re-indexed without uploading the file to OpenAI or another file-storage service. If indexing is
unavailable, the local source is kept and can be indexed again from its source actions. Source text
is included in the project context sent to every configured model provider.
