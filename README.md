# Octoparse MCP Server

[![Octoparse](https://img.shields.io/badge/Octoparse-Official%20Website-blue?logo=google-chrome)](https://www.octoparse.com/)
[![Docs](https://img.shields.io/badge/Docs-MCP%20Guide-green)](https://openapi.octoparse.com/octoparse-mcp-guide.html)
![MCP](https://img.shields.io/badge/MCP-Compatible-purple)

[English](README.md) | [日本語](README-ja.md)

Octoparse MCP Server connects MCP-compatible AI clients to Octoparse so users can discover scraping templates, create cloud tasks from Octoparse preset templates, manage existing tasks, and export structured data.

## Hosted Server

Use the hosted Streamable HTTP endpoint:

```text
https://mcp.octoparse.com
```

Configure this as an MCP server endpoint, not as a REST API tool.

## Authentication

The hosted server officially supports both OAuth and API key authentication:

- OAuth: the default option when the MCP client can open a browser authorization flow.
- API key: an optional authentication method for clients that can send custom HTTP headers.

For API key mode, send the key in the `x-api-key` header. Do not place real keys in source control, issue reports, screenshots, or shared logs.

## Quick Start

Generic HTTP MCP configuration:

```json
{
  "mcpServers": {
    "octoparse": {
      "type": "http",
      "url": "https://mcp.octoparse.com"
    }
  }
}
```

Claude OAuth / default authentication:

```bash
claude mcp add --transport http octoparse https://mcp.octoparse.com
```

Claude with API key:

```bash
claude mcp add --transport http octoparse https://mcp.octoparse.com --header "x-api-key: YOUR_API_KEY"
```

Codex CLI:

```bash
codex mcp add octoparse --url https://mcp.octoparse.com
```

Gemini CLI example configuration:

```json
{
  "mcpServers": {
    "octoparse": {
      "httpUrl": "https://mcp.octoparse.com",
      "oauth": {
        "clientId": "Octoparse",
        "enabled": true
      }
    }
  }
}
```

After adding the server, complete authorization in the browser if your client prompts for OAuth.

More client examples are in [Configuration](docs/Configuration.md).

## Tools

| Tool | Purpose |
| --- | --- |
| `search_templates` | Find Octoparse templates by keyword, template ID, or slug. |
| `execute_task` | Validate parameters, create a cloud task from an Octoparse preset template, and start extraction. |
| `export_data` | Export task results as JSON, CSV, Excel, HTML, or XML when data is ready. |
| `search_tasks` | Search existing tasks in the authenticated account. |
| `start_or_stop_task` | Start or stop an existing cloud task by task ID. |
| `redeem_coupon_code` | Redeem a promotion, coupon, or resource code supplied by the user. |

See [Tools](docs/Tools.md) for inputs, examples, and common failure cases.

## Typical Workflow

```text
search_templates -> execute_task -> export_data
```

Example user prompt:

```text
Find a cloud-capable Octoparse template for Amazon product listings, run it for wireless earbuds, and export the result as CSV.
```

For an existing task, use:

```text
search_tasks -> export_data
```

Scheduling, notifications, recurring jobs, and external automations are handled by the MCP client or another automation system. The MCP server exposes task and export tools; it does not provide a standalone scheduler.

## Scope

Octoparse MCP Server can:

- Search the Octoparse template library.
- Create and run cloud-capable tasks from Octoparse preset templates.
- Validate template parameters before execution.
- Export collected data when a task has data available.
- Search, start, stop, monitor, and export existing cloud-supported tasks, including existing cloud-supported custom tasks.

It does not:

- Run local-only desktop tasks through the hosted server.
- Create fully custom scraping tasks.
- Create or edit custom task configuration details such as custom fields, pagination rules, loop logic, browser workflow, or extraction steps.
- Upload private templates.
- Provide billing or account administration tools.
- Schedule recurring runs by itself.

## Common Limits

- Some templates are local-only and must be run in the Octoparse desktop app.
- Cloud execution depends on account permissions, available credits or quota, target-site availability, and template support.
- Long-running tasks may need follow-up calls. If data is still collecting or exporting, wait and call `export_data` again.
- Tool availability can be narrowed with `includeTools` or `excludeTools` URL parameters. See [Overview](docs/Overview.md).

## Security

- Keep API keys and OAuth tokens out of Git, logs, screenshots, and public issues.
- Use OAuth when possible for interactive clients.
- Use `x-api-key` only with clients that store headers securely.
- Report vulnerabilities privately. See [Security](SECURITY.md).

## Documentation

- [Overview](docs/Overview.md)
- [Configuration](docs/Configuration.md)
- [Tools](docs/Tools.md)
- [Troubleshooting](docs/Troubleshooting.md)
- [Octoparse API Docs](https://openapi.octoparse.com/en-US)
- [Help Center](https://helpcenter.octoparse.com)
- [Available on Smithery](https://smithery.ai/servers/octoparse/octoparse-mcp-server)

## Development

```bash
npm install
npm run build
npm test
```

For local environment variables, copy `.env.example` to `.env` and fill only values needed for your environment. Never commit `.env`.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening issues or pull requests.

## License

MIT. See [LICENSE.md](LICENSE.md).
