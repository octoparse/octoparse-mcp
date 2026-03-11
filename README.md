# Octoparse MCP Server

Use AI assistants to manage and automate Octoparse web scraping tasks via the Model Context Protocol (MCP).

[![English](https://img.shields.io/badge/English-Click-blue)](README.md)
[![Deutsch](https://img.shields.io/badge/Deutsch-Klicken-yellow)](README-de.md)
[![Español](https://img.shields.io/badge/Espa%C3%B1ol-Clic-orange)](README-es.md)
[![Français](https://img.shields.io/badge/Fran%C3%A7ais-Cliquer-green)](README-fr.md)
[![Italiano](https://img.shields.io/badge/Italiano-Clicca-red)](README-it.md)
[![日本語](https://img.shields.io/badge/日本語-クリック-purple)](README-ja.md)
[![한국어](https://img.shields.io/badge/한국어-클릭-brightgreen)](README-ko.md)

---

# Overview

Octoparse MCP enables AI assistants like ChatGPT, Claude, Cursor, and VS Code to interact with Octoparse and automate web scraping workflows.

Using the Model Context Protocol (MCP), AI tools can:

- Start and manage scraping tasks
- Extract structured web data
- Automate research workflows
- Monitor websites automatically

---

# Quick Start

Add the Octoparse MCP server to your MCP client configuration:

```json
{
  "mcpServers": {
    "Octoparse": {
      "url": "https://mcp.octoparse.com"
    }
  }
}
