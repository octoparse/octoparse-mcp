# Configuration

Use the hosted Streamable HTTP endpoint:

```text
https://mcp.octoparse.com
```

The examples below show common MCP client configuration patterns. Client UIs and file locations may change, so treat client-specific snippets as example configuration unless your client documents the same format.

OAuth and API key authentication are both officially supported. API key authentication is optional and is useful for clients that can store and send custom HTTP headers securely.

## Generic HTTP MCP

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

With API key header:

```json
{
  "mcpServers": {
    "octoparse": {
      "type": "http",
      "url": "https://mcp.octoparse.com",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      }
    }
  }
}
```

## ChatGPT

Example setup:

1. Open ChatGPT settings for connectors or apps.
2. Create a custom MCP app or connector.
3. Set the MCP server URL to `https://mcp.octoparse.com`.
4. Leave OAuth client credentials empty if the UI supports dynamic OAuth.
5. Save and complete the browser authorization flow.

## Claude

Example setup:

1. Open Claude connector or integration settings.
2. Add a custom connector.
3. Enter `https://mcp.octoparse.com`.
4. Connect and complete browser authorization.

## Claude Code

OAuth / default authentication:

```bash
claude mcp add --transport http octoparse https://mcp.octoparse.com
```

API key:

```bash
claude mcp add --transport http octoparse https://mcp.octoparse.com --header "x-api-key: YOUR_API_KEY"
```

## Codex CLI

OAuth:

```bash
codex mcp add octoparse --url https://mcp.octoparse.com
```

API key example using an environment variable:

```toml
[mcp_servers.octoparse]
url = "https://mcp.octoparse.com"

[mcp_servers.octoparse.env_http_headers]
"x-api-key" = "OCTOPARSE_API_KEY"
```

Set the environment variable before starting the client:

```bash
export OCTOPARSE_API_KEY="YOUR_API_KEY"
```

## Cursor

Example configuration:

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

With API key:

```json
{
  "mcpServers": {
    "octoparse": {
      "type": "http",
      "url": "https://mcp.octoparse.com",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      }
    }
  }
}
```

## VS Code

Example workspace configuration:

```json
{
  "servers": {
    "octoparse": {
      "type": "http",
      "url": "https://mcp.octoparse.com"
    }
  }
}
```

With API key:

```json
{
  "servers": {
    "octoparse": {
      "type": "http",
      "url": "https://mcp.octoparse.com",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      }
    }
  }
}
```

## Gemini CLI

Example `~/.gemini/settings.json` configuration:

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

## Tool Selection

Expose only selected tools:

```text
https://mcp.octoparse.com?includeTools=search_templates,execute_task,export_data
```

Hide selected tools:

```text
https://mcp.octoparse.com?excludeTools=redeem_coupon_code
```

Reconnect the MCP client after changing tool selection parameters.
