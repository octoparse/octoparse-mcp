# Octoparse MCP Server

[![Octoparse](https://img.shields.io/badge/Octoparse-Sitio%20Oficial-blue?logo=google-chrome)](https://www.octoparse.com/)
[![Docs](https://img.shields.io/badge/Docs-Guía%20MCP-green)](https://openapi.octoparse.com/octoparse-mcp-guide.html)
![MCP](https://img.shields.io/badge/MCP-Compatible-purple)

[![English](https://img.shields.io/badge/English-Click-blue)](README.md)
[![Deutsch](https://img.shields.io/badge/Deutsch-Klicken-yellow)](README-de.md)
[![Español](https://img.shields.io/badge/Espa%C3%B1ol-Clic-orange)](README-es.md)
[![Français](https://img.shields.io/badge/Fran%C3%A7ais-Cliquer-green)](README-fr.md)
[![Italiano](https://img.shields.io/badge/Italiano-Clicca-red)](README-it.md)
[![日本語](https://img.shields.io/badge/日本語-クリック-purple)](README-ja.md)
[![한국어](https://img.shields.io/badge/한국어-클릭-brightgreen)](README-ko.md)

**Convierte cualquier sitio web en datos estructurados — solo pidiéndoselo a tu asistente de IA.**

Octoparse MCP conecta herramientas de IA como Claude, ChatGPT y Cursor con [Octoparse](https://www.octoparse.com), la plataforma de web scraping sin código. Sin programación. Sin scripts de automatización. Solo describe lo que necesitas.

---

## ¿Qué puedes hacer con esto?

```
Tú:  "Extrae los 100 primeros resultados de Amazon para 'auriculares inalámbricos' y guárdalos en CSV"
IA:  Tarea creada e iniciada... Listo. 100 productos exportados a earbuds.csv
```

```
Tú:  "Monitoriza el precio del iPhone 16 en Best Buy cada día esta semana"
IA:  Programado. Ejecutaré la tarea diariamente y te avisaré de cualquier cambio de precio.
```

```
Tú:  "Encuentra todas las ofertas de trabajo de 'analista de datos' en LinkedIn de los últimos 7 días"
IA:  Buscando plantillas... Tarea en ejecución... 340 listados exportados.
```

No se necesita experiencia en scraping. Si puedes describir los datos que quieres, Octoparse MCP puede obtenerlos.

---

## Casos de uso habituales

- 🛒 **E-commerce** — Monitoriza precios de la competencia, controla la disponibilidad de stock
- 📈 **Investigación de mercado** — Recopila reseñas, valoraciones y listados de productos a gran escala
- 💼 **Reclutamiento** — Agrega ofertas de trabajo de múltiples plataformas
- 📰 **Monitorización de medios** — Archiva artículos de noticias y sigue temas a lo largo del tiempo
- 🏠 **Inmobiliaria** — Extrae listados, precios y datos de ubicación automáticamente

---

## Inicio rápido

**Cursor / VS Code / Otros clientes**

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

Tras añadir el servidor, completa la autorización OAuth en tu navegador cuando se te solicite.

> Para ChatGPT y guías paso a paso para todos los clientes, consulta la [Guía de configuración completa](https://openapi.octoparse.com/octoparse-mcp-guide.html).

---

## Qué incluye

| | |
|---|---|
| 🔍 Buscar plantillas | Plantillas de scraping listas para usar en sitios populares |
| 📋 Crear tareas | Configura nuevos trabajos de scraping en lenguaje natural |
| ▶️ Controlar tareas | Iniciar, detener y monitorizar la ejecución |
| 💾 Exportar datos | Descarga resultados en JSON o CSV |
| 👤 Info de cuenta | Consulta créditos y estado de suscripción |

---

## Requisitos

- Una [cuenta de Octoparse](https://www.octoparse.com) — Se requiere plan Standard o superior para ejecución en la nube ([ver planes](https://www.octoparse.com/pricing))
- Un cliente de IA compatible con MCP (Claude, ChatGPT Plus/Team/Enterprise, Cursor, Gemini CLI, VS Code, etc.)

---

## Recursos

- [Guía de configuración completa](https://openapi.octoparse.com/octoparse-mcp-guide.html)
- [Documentación de la API de Octoparse](https://openapi.octoparse.com/en-US)
- [Centro de ayuda](https://helpcenter.octoparse.com)
- [support@octoparse.com](mailto:support@octoparse.com)
