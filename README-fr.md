# Octoparse MCP Server

[![Octoparse](https://img.shields.io/badge/Octoparse-Site%20Officiel-blue?logo=google-chrome)](https://www.octoparse.com/)
[![Docs](https://img.shields.io/badge/Docs-Guide%20MCP-green)](https://openapi.octoparse.com/octoparse-mcp-guide.html)
![MCP](https://img.shields.io/badge/MCP-Compatible-purple)

[![English](https://img.shields.io/badge/English-Click-blue)](README.md)
[![Deutsch](https://img.shields.io/badge/Deutsch-Klicken-yellow)](README-de.md)
[![Español](https://img.shields.io/badge/Espa%C3%B1ol-Clic-orange)](README-es.md)
[![Français](https://img.shields.io/badge/Fran%C3%A7ais-Cliquer-green)](README-fr.md)
[![Italiano](https://img.shields.io/badge/Italiano-Clicca-red)](README-it.md)
[![日本語](https://img.shields.io/badge/日本語-クリック-purple)](README-ja.md)
[![한국어](https://img.shields.io/badge/한국어-클릭-brightgreen)](README-ko.md)

**Transformez n'importe quel site web en données structurées — en demandant simplement à votre assistant IA.**

Octoparse MCP connecte des outils d'IA comme Claude, ChatGPT et Cursor à [Octoparse](https://www.octoparse.com), la plateforme de web scraping sans code. Pas de programmation. Pas de scripts d'automatisation. Décrivez simplement ce que vous voulez.

---

## Que pouvez-vous faire avec ?

```
Vous : « Extrais les 100 premiers résultats Amazon pour 'écouteurs sans fil' et enregistre en CSV »
IA :   Tâche créée et démarrée... Terminé. 100 produits exportés vers earbuds.csv
```

```
Vous : « Surveille le prix de l'iPhone 16 sur Best Buy chaque jour cette semaine »
IA :   Planifié. J'exécuterai la tâche quotidiennement et vous avertirai de tout changement de prix.
```

```
Vous : « Trouve toutes les offres d'emploi 'analyste de données' sur LinkedIn des 7 derniers jours »
IA :   Recherche de modèles... Tâche en cours... 340 annonces exportées.
```

Aucune expérience en scraping requise. Si vous pouvez décrire les données souhaitées, Octoparse MCP peut les obtenir.

---

## Cas d'usage courants

- 🛒 **E-commerce** — Surveiller les prix concurrents, suivre la disponibilité des stocks
- 📈 **Études de marché** — Collecter avis, notes et listes de produits à grande échelle
- 💼 **Recrutement** — Agréger les offres d'emploi de plusieurs plateformes
- 📰 **Veille médiatique** — Archiver des articles d'actualité et suivre des sujets dans le temps
- 🏠 **Immobilier** — Extraire automatiquement annonces, prix et données de localisation

---

## Démarrage rapide

**Cursor / VS Code / Autres clients**

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

Après avoir ajouté le serveur, complétez l'autorisation OAuth dans votre navigateur lorsque vous y êtes invité.

> Pour ChatGPT et les guides pas à pas pour tous les clients, consultez le [Guide de configuration complet](https://openapi.octoparse.com/octoparse-mcp-guide.html).

---

## Fonctionnalités incluses

| | |
|---|---|
| 🔍 Rechercher des modèles | Modèles de scraping prêts à l'emploi pour les sites populaires |
| 📋 Créer des tâches | Configurer de nouveaux jobs de scraping en langage naturel |
| ▶️ Contrôler les tâches | Démarrer, arrêter et surveiller l'exécution |
| 💾 Exporter les données | Télécharger les résultats en JSON ou CSV |
| 👤 Infos du compte | Vérifier les crédits et le statut d'abonnement |

---

## Prérequis

- Un [compte Octoparse](https://www.octoparse.com) — Plan Standard ou supérieur requis pour l'exécution cloud ([voir les plans](https://www.octoparse.com/pricing))
- Un client IA compatible MCP (Claude, ChatGPT Plus/Team/Enterprise, Cursor, Gemini CLI, VS Code, etc.)

---

## Ressources

- [Guide de configuration complet](https://openapi.octoparse.com/octoparse-mcp-guide.html)
- [Documentation API Octoparse](https://openapi.octoparse.com/en-US)
- [Centre d'aide](https://helpcenter.octoparse.com)
- [support@octoparse.com](mailto:support@octoparse.com)
