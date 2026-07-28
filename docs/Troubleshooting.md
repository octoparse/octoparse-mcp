# Troubleshooting

This page covers common user-facing setup, authentication, task, and export issues.

## Authentication Fails

Symptoms may include unauthorized errors, missing credentials, or failed tool initialization.

Check:

- OAuth authorization completed in the browser.
- The MCP client is sending the latest authorization state.
- API key mode uses the `x-api-key` header.
- The key has not been deleted, regenerated, or pasted with extra whitespace.
- The client was restarted after configuration changes.

Do not share API keys, OAuth tokens, cookies, or full request logs in public issues.

## API Key Works in a Terminal but Not in the Client

Some clients do not inherit environment variables from your shell.

Check the client's own configuration, secret store, or launch environment. Restart the client after changing environment variables.

## Tools Do Not Appear

Check:

- The server URL is `https://mcp.octoparse.com`.
- The client is configured for HTTP MCP or Streamable HTTP MCP.
- OAuth or API key authorization completed.
- `includeTools` and `excludeTools` URL parameters do not hide the expected tools.

Reconnect the MCP server after changing configuration.

## No Suitable Template Is Found

Try a more specific prompt that includes:

- Target website.
- Data type.
- Region or market.
- Product category or business use case.

Some templates are local-only and cannot run through the hosted cloud MCP server. Use the Octoparse desktop app for local-only workflows.

## `execute_task` Needs More Parameters

Use `search_templates` exact lookup or call `execute_task` with `validateOnly=true` first. Then fill parameters using the field names returned in the template input schema.

For source-backed fields, use the selected option key. For multi-value fields, pass an array.

## Task Is Still Running

Cloud extraction is asynchronous. If the task is still collecting data, wait briefly and check again.

If the client supports MCP task progress, follow the task status in the client. Otherwise, call `export_data` later with the same task ID.

## Export Is Not Ready

If `export_data` returns `collecting` or `exporting`, wait and retry with the same `taskId` and `exportFileType`.

If it returns `no_data`, the task completed but no exportable records were available for that run.

## Task Not Found

Check:

- The task ID was copied correctly.
- The authenticated Octoparse account has access to the task.
- The task has not been deleted.
- You are using the expected account or workspace.

Use `search_tasks` to find accessible tasks before exporting or controlling them.

## Session Not Found

Reconnect the MCP server in your client. If the client supports session recovery, it still needs to send fresh credentials with the new request.

## Rate Limits or Temporary Failures

If a request is rate-limited or fails transiently:

- Wait before retrying.
- Avoid rapid repeated tool calls.
- Retry export or task status checks with the same task ID.

If the issue continues, include a sanitized report with the MCP client name, tool name, task ID if safe to share, and the exact error message with credentials removed.
