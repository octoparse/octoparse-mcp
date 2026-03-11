# Octoparse MCP Server

[![Octoparse](https://img.shields.io/badge/Octoparse-Offizielle%20Website-blue?logo=google-chrome)](https://www.octoparse.com/)
[![Docs](https://img.shields.io/badge/Docs-MCP%20Guide-green)](https://openapi.octoparse.com/octoparse-mcp-guide.html)
![MCP](https://img.shields.io/badge/MCP-Kompatibel-purple)

[![English](https://img.shields.io/badge/English-Click-blue)](README.md)
[![Deutsch](https://img.shields.io/badge/Deutsch-Klicken-yellow)](README-de.md)
[![Español](https://img.shields.io/badge/Espa%C3%B1ol-Clic-orange)](README-es.md)
[![Français](https://img.shields.io/badge/Fran%C3%A7ais-Cliquer-green)](README-fr.md)
[![Italiano](https://img.shields.io/badge/Italiano-Clicca-red)](README-it.md)
[![日本語](https://img.shields.io/badge/日本語-クリック-purple)](README-ja.md)
[![한국어](https://img.shields.io/badge/한국어-클릭-brightgreen)](README-ko.md)

**Jede Website in strukturierte Daten verwandeln – einfach per KI-Assistent.**

Octoparse MCP verbindet KI-Tools wie Claude, ChatGPT und Cursor mit [Octoparse](https://www.octoparse.com), der No-Code-Web-Scraping-Plattform. Kein Code. Keine Browser-Automatisierungsskripte. Einfach beschreiben, was Sie möchten.

---

## Was können Sie damit tun?

```
Sie:  „Scrappe die Top-100-Amazon-Suchergebnisse für 'kabellose Kopfhörer' und speichere als CSV"
KI:   Aufgabe erstellt und gestartet... Fertig. 100 Produkte exportiert nach earbuds.csv
```

```
Sie:  „Verfolge den iPhone-16-Preis auf Best Buy jeden Tag diese Woche"
KI:   Geplant. Ich führe die Aufgabe täglich aus und informiere Sie bei Preisänderungen.
```

```
Sie:  „Finde alle Stellenanzeigen für 'Data Analyst' auf LinkedIn der letzten 7 Tage"
KI:   Suche Templates... Aufgabe läuft... 340 Einträge exportiert.
```

Keine Scraping-Erfahrung notwendig. Wenn Sie die gewünschten Daten beschreiben können, kann Octoparse MCP sie beschaffen.

---

## Typische Anwendungsfälle

- 🛒 **E-Commerce** — Konkurrenzpreise überwachen, Lagerbestand verfolgen
- 📈 **Marktforschung** — Bewertungen, Ratings und Produktlisten in großem Maßstab sammeln
- 💼 **Recruiting** — Stellenanzeigen von mehreren Plattformen aggregieren
- 📰 **Medienbeobachtung** — Nachrichtenartikel archivieren und Themen verfolgen
- 🏠 **Immobilien** — Listings, Preise und Standortdaten automatisch abrufen

---

## Schnellstart

**Cursor / VS Code / Andere Clients**

```json
{
  "mcpServers": {
    "octoparse": {
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
    "octoparse": {
      "httpUrl": "https://mcp.octoparse.com",
      "oauth": { "clientId": "Octoparse", "enabled": true }
    }
  }
}
```

Nach dem Hinzufügen des Servers die OAuth-Autorisierung im Browser abschließen.

> Für ChatGPT und Schritt-für-Schritt-Anleitungen für alle Clients, siehe die [vollständige Einrichtungsanleitung](https://openapi.octoparse.com/octoparse-mcp-guide.html).

---

## Enthaltene Funktionen

| | |
|---|---|
| 🔍 Templates suchen | Gebrauchsfertige Scraping-Templates für beliebte Websites |
| 📋 Aufgaben erstellen | Neue Scraping-Jobs per natürlicher Sprache einrichten |
| ▶️ Aufgaben steuern | Starten, stoppen und Ausführung überwachen |
| 💾 Daten exportieren | Ergebnisse als JSON oder CSV herunterladen |
| 👤 Kontoinformationen | Credits und Abonnementstatus prüfen |

---

## Voraussetzungen

- Ein [Octoparse-Konto](https://www.octoparse.com) — Standard-Plan oder höher für Cloud-Ausführung erforderlich ([Pläne ansehen](https://www.octoparse.com/pricing))
- Ein MCP-kompatibler KI-Client (Claude, ChatGPT Plus/Team/Enterprise, Cursor, Gemini CLI, VS Code, etc.)

---

## Ressourcen

- [Vollständige Einrichtungsanleitung](https://openapi.octoparse.com/octoparse-mcp-guide.html)
- [Octoparse API-Dokumentation](https://openapi.octoparse.com/en-US)
- [Hilfezentrum](https://helpcenter.octoparse.com)
- [support@octoparse.com](mailto:support@octoparse.com)
