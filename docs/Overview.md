# Octoparse MCP Server Overview

Octoparse MCP Server exposes Octoparse cloud extraction workflows to MCP-compatible AI clients. It is designed for users who want an assistant or agent to find a suitable Octoparse template, run a cloud task, and return structured results.

The core workflow is:

```text
search_templates -> execute_task -> export_data
```

## Endpoint

Hosted Streamable HTTP server:

```text
https://mcp.octoparse.com
```

Use the root URL as the MCP server URL. Do not configure it as a generic REST API endpoint.

## Prerequisites

- An Octoparse account.
- An MCP-compatible client.
- Either OAuth authorization or an API key, depending on client support.

## Authentication

### OAuth

OAuth is recommended for interactive clients that support browser-based authorization. Add the hosted endpoint to the client, then complete authorization when the client opens the browser flow.

### API Key

API key mode is useful for clients that can attach HTTP headers. Send:

```text
x-api-key: YOUR_API_KEY
```

Store keys in the client secret store, environment variables, or another secure location. Do not commit keys to Git.

If both OAuth and API key credentials are supplied, API key authentication is preferred for that request.

## Client Setup

See [Configuration](Configuration.md) for examples covering ChatGPT, Claude, Claude Code, Codex CLI, Cursor, VS Code, and Gemini CLI.

## Tool Selection

By default, the server exposes all public tools.

Expose only the core extraction workflow:

```text
https://mcp.octoparse.com?includeTools=search_templates,execute_task,export_data
```

Hide a specific tool:

```text
https://mcp.octoparse.com?excludeTools=redeem_coupon_code
```

Tool selection is applied during MCP initialization. Reconnect the client after changing these URL parameters.

## Recommended Tool Sets

| Scenario | Tools |
| --- | --- |
| New extraction workflow | `search_templates`, `execute_task`, `export_data` |
| Existing task lookup and export | `search_tasks`, `export_data` |
| Existing task control | `search_tasks`, `start_or_stop_task` |
| Coupon or resource code redemption | `redeem_coupon_code` |

## Available Tools

| Tool | Purpose |
| --- | --- |
| `search_templates` | Search templates by keyword, ID, or slug. |
| `execute_task` | Validate inputs, create a cloud task, and start extraction. |
| `export_data` | Export data from an existing task when results are ready. |
| `search_tasks` | Find existing tasks in the authorized account. |
| `start_or_stop_task` | Start or stop an existing cloud task. |
| `redeem_coupon_code` | Redeem a user-provided coupon or resource code. |

Detailed tool behavior is documented in [Tools](Tools.md).

## Runtime Notes

Cloud extraction is asynchronous. Some clients support MCP task progress; others receive a task ID and must call `export_data` later.

If `export_data` reports that a task is still collecting or an export is still being generated, wait briefly and retry with the same task ID and export format.

Scheduling, notifications, and recurring automation are outside the server itself. Use client features or external automation systems for those workflows.

## Limits

- Local-only templates require the Octoparse desktop app.
- Template execution depends on account permissions, quota, task availability, target-site availability, and cloud support.
- `targetMaxRows` is a best-effort stop request, not a hard row cap.
- Clients must reconnect after changing tool selection URL parameters.

## Security

- Do not expose API keys, OAuth tokens, cookies, or private task data in public reports.
- Prefer OAuth for interactive clients.
- Use API key headers only where the client can store them securely.
- See [Security](../SECURITY.md) for reporting and handling guidance.

## Support

- [Octoparse website](https://www.octoparse.com/)
- [Octoparse API Docs](https://openapi.octoparse.com/en-US)
- [Help Center](https://helpcenter.octoparse.com)
