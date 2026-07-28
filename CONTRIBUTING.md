# Contributing to Octoparse MCP Server

Thank you for helping improve Octoparse MCP Server.

## Before You Start

- Do not commit `.env`, API keys, OAuth tokens, cookies, private task data, customer information, or internal URLs.
- Use `.env.example` for local configuration examples.
- Keep public documentation focused on supported MCP behavior and user-operable troubleshooting.

## Local Development

Install dependencies:

```bash
npm install
```

Build the project:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Start locally after building:

```bash
npm start
```

## Documentation Changes

When changing public behavior, update the relevant docs:

- `README.md` for the repository entry point.
- `docs/Overview.md` for setup and workflow overview.
- `docs/Configuration.md` for client configuration examples.
- `docs/Tools.md` for tool behavior.
- `docs/Troubleshooting.md` for user-facing recovery guidance.

The Japanese README is retained as the only non-English README. If the English README changes substantially, note what needs Japanese follow-up instead of adding unmanaged translations.

## Issues

For bugs, include:

- MCP client name and version, if available.
- Operating system.
- Tool name.
- What you expected to happen.
- What actually happened.
- Sanitized error message.

Remove secrets, personal data, customer data, task outputs, internal URLs, and full credential-bearing logs before posting.

## Feature Requests

Please describe:

- The workflow you want to support.
- Which MCP client you use.
- Whether the request needs a new tool, a documentation update, or clearer configuration.

## Security

Do not report vulnerabilities in public issues. Follow [SECURITY.md](SECURITY.md).

## Support

For general product questions, use the [Help Center](https://helpcenter.octoparse.com) or the published Octoparse support channel.
