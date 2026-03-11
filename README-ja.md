# Octoparse MCP Server

[![Octoparse](https://img.shields.io/badge/Octoparse-公式サイト-blue?logo=google-chrome)](https://www.octoparse.com/)
[![Docs](https://img.shields.io/badge/Docs-MCPガイド-green)](https://openapi.octoparse.com/octoparse-mcp-guide.html)
![MCP](https://img.shields.io/badge/MCP-対応-purple)

[![English](https://img.shields.io/badge/English-Click-blue)](README.md)
[![Deutsch](https://img.shields.io/badge/Deutsch-Klicken-yellow)](README-de.md)
[![Español](https://img.shields.io/badge/Espa%C3%B1ol-Clic-orange)](README-es.md)
[![Français](https://img.shields.io/badge/Fran%C3%A7ais-Cliquer-green)](README-fr.md)
[![Italiano](https://img.shields.io/badge/Italiano-Clicca-red)](README-it.md)
[![日本語](https://img.shields.io/badge/日本語-クリック-purple)](README-ja.md)
[![한국어](https://img.shields.io/badge/한국어-클릭-brightgreen)](README-ko.md)

**AIアシスタントに話しかけるだけで、あらゆるWebサイトを構造化データに変換。**

Octoparse MCPは、Claude・ChatGPT・CursorなどのAIツールをノーコードWebスクレイピングプラットフォーム[Octoparse](https://www.octoparse.com)に接続します。コード不要。自動化スクリプト不要。欲しいデータを言葉で伝えるだけです。

---

## 何ができるの？

```
あなた：「Amazonで『ワイヤレスイヤホン』の検索上位100件をスクレイピングしてCSVで保存して」
AI：    タスクを作成・開始しました... 完了。100件の商品をearbuds.csvにエクスポートしました
```

```
あなた：「今週毎日、Best BuyのiPhone 16の価格を追跡して」
AI：    スケジュール済み。毎日タスクを実行し、価格変動があればお知らせします。
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

サーバー追加後、ブラウザでOAuth認証を完了してください。

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
- [Octoparse APIドキュメント](https://openapi.octoparse.com/en-US)
- [ヘルプセンター](https://helpcenter.octoparse.com)
- [support@octoparse.com](mailto:support@octoparse.com)
