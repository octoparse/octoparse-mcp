# Security Policy

## Reporting a Vulnerability

Please do not open public issues for vulnerabilities or credential exposure. Contact Octoparse support through the Help Center or the published support channel, and include a concise, sanitized description of the issue.

## Sensitive Data

Do not commit, paste, screenshot, or attach:

- API keys.
- OAuth tokens.
- Cookies or session identifiers.
- Private task data.
- Customer or account information.
- Full request or response logs containing credentials.

Use `.env.example` as the public template for local configuration. Keep real `.env` files local.

## Authentication Guidance

- Prefer OAuth for interactive clients that support browser authorization.
- Use `x-api-key` only with clients that can store headers securely.
- Rotate keys immediately if they are exposed.
- Remove credentials from issue reports before sharing logs.

## Public Issue Reports

When opening a public issue, include:

- MCP client name and version, if available.
- Operating system.
- Tool name.
- Sanitized error message.
- Whether the same task works in Octoparse directly.

Do not include secrets, internal URLs, private task outputs, or account identifiers.
