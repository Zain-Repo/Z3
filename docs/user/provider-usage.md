# Provider usage

Open **Settings → Providers → Usage summary** on web or desktop, or **Settings → Usage summary** on mobile. Enabled, authenticated connections appear separately. Mobile also labels the environment for each connection.

Use **Refresh usage** to request updated data from the connected server. On web or desktop, **Refresh provider status** also updates usage. The checked time shows when the provider was last probed. Usage is a snapshot, not a live billing ledger.

- **Codex:** subscription quota used and reset times reported by Codex. Separate quota buckets appear separately. API-key accounts and older CLI versions may not provide this information. These percentages are not OpenAI API spending.
- **OpenRouter:** spending for the connected API key for the current UTC day, week, month, and all time, plus any remaining key allowance and monthly BYOK usage. A key allowance is not the account credit balance. BYOK usage is shown separately rather than added to spending.
- **DeepSeek:** the account balance in its reported currency.
- **Other connections:** an unavailable message appears when usage reporting is not integrated. Unavailable data does not mean zero usage.

Reported values can include activity outside Z3. Different connections may share the same account or key, so their figures should not be added together. Credentials stay on the connected server. Failed usage lookups do not prevent using the provider.

Provider references: [Codex app-server](https://developers.openai.com/codex/app-server), [OpenRouter key usage](https://openrouter.ai/docs/api_reference/limits), and [DeepSeek balance](https://api-docs.deepseek.com/api/get-user-balance/).
