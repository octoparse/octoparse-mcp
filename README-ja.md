# Octoparse MCP Server

[![Octoparse](https://img.shields.io/badge/Octoparse-公式サイト-blue?logo=google-chrome)](https://www.octoparse.com/)
[![Docs](https://img.shields.io/badge/Docs-MCPガイド-green)](https://openapi.octoparse.com/octoparse-mcp-guide.html)
![MCP](https://img.shields.io/badge/MCP-対応-purple)

[English](README.md) | [日本語](README-ja.md)

**AIアシスタントに話しかけるだけで、あらゆるWebサイトを構造化データに変換。**

Octoparse MCPは、Claude・ChatGPT・CursorなどのAIツールをノーコードWebスクレイピングプラットフォーム[Octoparse](https://www.octoparse.com)に接続します。コード不要。自動化スクリプト不要。欲しいデータを言葉で伝えるだけです。

---

## 何ができるの？

```
あなた：「Amazonで『ワイヤレスイヤホン』の検索上位100件をスクレイピングしてCSVで保存して」
AI：    タスクを作成・開始しました... 完了。100件の商品をearbuds.csvにエクスポートしました
```

```
あなた：「Best BuyのiPhone 16価格を取得できるテンプレートを探して、結果をCSVでエクスポートして」
AI：    テンプレートを検索中... タスクを開始しました... 結果をCSVでエクスポートしました。
```

```
あなた：「LinkedInで過去7日間に投稿された『データアナリスト』の求人をすべて見つけて」
AI：    テンプレートを検索中... タスク実行中... 340件をエクスポートしました。
```

スクレイピングの経験は不要です。欲しいデータを言葉で説明できれば、Octoparse MCPが取得します。

---

## よくある活用シーン

- 🛒 **EC・小売** — 競合価格の監視、在庫状況の追跡
- 📈 **市場調査** — レビュー・評価・商品リストを大規模に収集
- 💼 **採用・人材** — 複数プラットフォームの求人情報を集約
- 📰 **メディア監視** — ニュース記事のアーカイブとトピック追跡
- 🏠 **不動産** — 物件情報・価格・位置データを自動収集

---

## クイックスタート

**Cursor / VS Code / その他のクライアント**

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
claude mcp add --transport http octoparse https://mcp.octoparse.com
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

サーバー追加後、必要に応じてブラウザでOAuth認証を完了してください。

> スケジュール実行、通知、外部自動化はMCPクライアントまたは別の自動化システム側で処理します。このMCPサーバー自体は独立したスケジューラーを提供しません。

> ChatGPTや各クライアントのステップバイステップガイドは[完全セットアップガイド](https://openapi.octoparse.com/octoparse-mcp-guide.html)をご覧ください。

---

## 利用可能な機能

| | |
|---|---|
| 🔍 テンプレート検索 | 人気サイト向けの使い込みやすいスクレイピングテンプレート |
| 📋 タスク作成 | 自然言語で新しいスクレイピングジョブを設定 |
| ▶️ タスク操作 | 開始・停止・実行状況の監視 |
| 💾 データエクスポート | 結果をJSONまたはCSVでダウンロード |
| 👤 アカウント情報 | クレジット残高とサブスクリプション状態を確認 |

---

## 必要な環境

- [Octoparseアカウント](https://www.octoparse.com) — クラウド実行にはStandardプラン以上が必要です（[プランを確認](https://www.octoparse.com/pricing)）
- MCP対応AIクライアント（Claude、ChatGPT Plus/Team/Enterprise、Cursor、Gemini CLI、VS Codeなど）

---

## リソース

- [完全セットアップガイド](https://openapi.octoparse.com/octoparse-mcp-guide.html)
- [Overview](docs/Overview.md)
- [Tools](docs/Tools.md)
- [Configuration](docs/Configuration.md)
- [Troubleshooting](docs/Troubleshooting.md)
- [Octoparse APIドキュメント](https://openapi.octoparse.com/en-US)
- [ヘルプセンター](https://helpcenter.octoparse.com)
- [support@octoparse.com](mailto:support@octoparse.com)
