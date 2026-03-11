# Octoparse MCP Server

[![Octoparse](https://img.shields.io/badge/Octoparse-Sito%20Ufficiale-blue?logo=google-chrome)](https://www.octoparse.com/)
[![Docs](https://img.shields.io/badge/Docs-Guida%20MCP-green)](https://openapi.octoparse.com/octoparse-mcp-guide.html)
![MCP](https://img.shields.io/badge/MCP-Compatibile-purple)

[![English](https://img.shields.io/badge/English-Click-blue)](README.md)
[![Deutsch](https://img.shields.io/badge/Deutsch-Klicken-yellow)](README-de.md)
[![Español](https://img.shields.io/badge/Espa%C3%B1ol-Clic-orange)](README-es.md)
[![Français](https://img.shields.io/badge/Fran%C3%A7ais-Cliquer-green)](README-fr.md)
[![Italiano](https://img.shields.io/badge/Italiano-Clicca-red)](README-it.md)
[![日本語](https://img.shields.io/badge/日本語-クリック-purple)](README-ja.md)
[![한국어](https://img.shields.io/badge/한국어-클릭-brightgreen)](README-ko.md)

**Trasforma qualsiasi sito web in dati strutturati — basta chiederlo al tuo assistente IA.**

Octoparse MCP collega strumenti di IA come Claude, ChatGPT e Cursor a [Octoparse](https://www.octoparse.com), la piattaforma di web scraping senza codice. Nessuna programmazione. Nessuno script di automazione. Descrivi semplicemente ciò che vuoi.

---

## Cosa puoi fare con questo strumento?

```
Tu:  "Estrai i 100 migliori risultati di Amazon per 'cuffie wireless' e salva come CSV"
IA:  Attività creata e avviata... Completato. 100 prodotti esportati in earbuds.csv
```

```
Tu:  "Monitora il prezzo dell'iPhone 16 su Best Buy ogni giorno questa settimana"
IA:  Programmato. Eseguirò l'attività ogni giorno e ti avviserò di eventuali variazioni di prezzo.
```

```
Tu:  "Trova tutte le offerte di lavoro per 'analista di dati' su LinkedIn degli ultimi 7 giorni"
IA:  Ricerca modelli... Attività in esecuzione... 340 annunci esportati.
```

Non è richiesta alcuna esperienza di scraping. Se riesci a descrivere i dati che vuoi, Octoparse MCP può ottenerli.

---

## Casi d'uso comuni

- 🛒 **E-commerce** — Monitora i prezzi della concorrenza, tieni traccia della disponibilità
- 📈 **Ricerche di mercato** — Raccogli recensioni, valutazioni e listini prodotti su larga scala
- 💼 **Recruiting** — Aggrega offerte di lavoro da più piattaforme
- 📰 **Monitoraggio media** — Archivia articoli di notizie e segui argomenti nel tempo
- 🏠 **Immobiliare** — Estrai automaticamente annunci, prezzi e dati sulla posizione

---

## Avvio rapido

**Cursor / VS Code / Altri client**

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

Dopo aver aggiunto il server, completa l'autorizzazione OAuth nel browser quando richiesto.

> Per ChatGPT e guide passo passo per tutti i client, consulta la [Guida alla configurazione completa](https://openapi.octoparse.com/octoparse-mcp-guide.html).

---

## Funzionalità incluse

| | |
|---|---|
| 🔍 Cerca modelli | Modelli di scraping pronti all'uso per i siti più popolari |
| 📋 Crea attività | Configura nuovi job di scraping tramite linguaggio naturale |
| ▶️ Controlla attività | Avvia, interrompi e monitora l'esecuzione |
| 💾 Esporta dati | Scarica i risultati in formato JSON o CSV |
| 👤 Info account | Controlla crediti e stato dell'abbonamento |

---

## Requisiti

- Un [account Octoparse](https://www.octoparse.com) — Piano Standard o superiore richiesto per l'esecuzione cloud ([vedi piani](https://www.octoparse.com/pricing))
- Un client IA compatibile con MCP (Claude, ChatGPT Plus/Team/Enterprise, Cursor, Gemini CLI, VS Code, ecc.)

---

## Risorse

- [Guida alla configurazione completa](https://openapi.octoparse.com/octoparse-mcp-guide.html)
- [Documentazione API Octoparse](https://openapi.octoparse.com/en-US)
- [Centro assistenza](https://helpcenter.octoparse.com)
- [support@octoparse.com](mailto:support@octoparse.com)
