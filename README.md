# Octoparse MCP Server

[![Octoparse](https://img.shields.io/badge/Octoparse-Official%20Website-blue?logo=google-chrome)](https://www.octoparse.com/)
[![Docs](https://img.shields.io/badge/Docs-MCP%20Guide-green)](https://openapi.octoparse.com/octoparse-mcp-guide.html)
![MCP](https://img.shields.io/badge/MCP-Compatible-purple)

[![English](https://img.shields.io/badge/English-Click-blue)](README.md)
[![Deutsch](https://img.shields.io/badge/Deutsch-Klicken-yellow)](README-de.md)
[![Español](https://img.shields.io/badge/Espa%C3%B1ol-Clic-orange)](README-es.md)
[![Français](https://img.shields.io/badge/Fran%C3%A7ais-Cliquer-green)](README-fr.md)
[![Italiano](https://img.shields.io/badge/Italiano-Clicca-red)](README-it.md)
[![日本語](https://img.shields.io/badge/日本語-クリック-purple)](README-ja.md)
[![한국어](https://img.shields.io/badge/한국어-클릭-brightgreen)](README-ko.md)

**Turn any website into structured data — just by asking your AI assistant.**

Octoparse MCP connects AI tools like Claude, ChatGPT, and Cursor to [Octoparse](https://www.octoparse.com), the no-code web scraping platform. No coding. No browser automation scripts. Just describe what you want.

---

## What can you do with it?

```
You:  "Scrape the top 100 Amazon search results for 'wireless earbuds' and save as CSV"
AI:   Task created and started... Done. 100 products exported to earbuds.csv
```

```
You:  "Track iPhone 16 prices on Best Buy every day this week"
AI:   Scheduled. I'll run the task daily and notify you of any price changes.
```

```
You:  "Find all job postings for 'data analyst' on LinkedIn posted in the last 7 days"
AI:   Searching templates... Task running... 340 listings exported.
```

No scraping experience needed. If you can describe the data you want, Octoparse MCP can get it.

---

## Common use cases

- 🛒 **E-commerce** — Monitor competitor prices, track stock availability
- 📈 **Market research** — Collect reviews, ratings, and product listings at scale
- 💼 **Recruiting** — Aggregate job postings from multiple platforms
- 📰 **Media monitoring** — Archive news articles and track topics over time
- 🏠 **Real estate** — Pull listings, prices, and location data automatically

---

## Quick Start

**Cursor / VS Code / Other clients**

```json
{
  "mcpServers": {
    "Octoparse": {
      "url": "https://mcp.octoparse.com"
    }
  }
}
```

**Claude Desktop**

```bash
claude mcp add octoparse -s user -t http https://mcp.octoparse.com
```

**Gemini CLI** (`~/.gemini/settings.json`)

```json
{
  "mcpServers": {
    "Octoparse": {
      "httpUrl": "https://mcp.octoparse.com",
      "oauth": { "clientId": "Octoparse", "enabled": true }
    }
  }
}
```

After adding the server, complete OAuth authorization in your browser when prompted.

> For ChatGPT and step-by-step guides for all clients, see the [Full Setup Guide](https://openapi.octoparse.com/octoparse-mcp-guide.html).

---

## What's included

| | |
|---|---|
| 🔍 Search Templates | 5,000+ ready-to-use scraping templates for popular sites |
| 📋 Create Tasks | Set up new scraping jobs via natural language |
| ▶️ Control Tasks | Start, stop, and monitor execution |
| 💾 Export Data | Download results as JSON or CSV |
| 👤 Account Info | Check credits and subscription status |

---

## Requirements

- An [Octoparse account](https://www.octoparse.com) (no credit card required to start)
- An MCP-compatible AI client (Claude, ChatGPT Plus/Team/Enterprise, Cursor, Gemini CLI, VS Code, etc.)

---

## Resources

- [Full Setup Guide](https://openapi.octoparse.com/octoparse-mcp-guide.html)
- [Octoparse API Docs](https://openapi.octoparse.com/en-US)
- [Help Center](https://helpcenter.octoparse.com)
- [support@octoparse.com](mailto:support@octoparse.com)
