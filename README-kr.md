# Octoparse MCP Server

[![Octoparse](https://img.shields.io/badge/Octoparse-공식%20웹사이트-blue?logo=google-chrome)](https://www.octoparse.com/)
[![Docs](https://img.shields.io/badge/Docs-MCP%20가이드-green)](https://openapi.octoparse.com/octoparse-mcp-guide.html)
![MCP](https://img.shields.io/badge/MCP-호환-purple)

[![English](https://img.shields.io/badge/English-Click-blue)](README.md)
[![Deutsch](https://img.shields.io/badge/Deutsch-Klicken-yellow)](README-de.md)
[![Español](https://img.shields.io/badge/Espa%C3%B1ol-Clic-orange)](README-es.md)
[![Français](https://img.shields.io/badge/Fran%C3%A7ais-Cliquer-green)](README-fr.md)
[![Italiano](https://img.shields.io/badge/Italiano-Clicca-red)](README-it.md)
[![日本語](https://img.shields.io/badge/日本語-クリック-purple)](README-ja.md)
[![한국어](https://img.shields.io/badge/한국어-클릭-brightgreen)](README-ko.md)

**AI 어시스턴트에게 말하는 것만으로 어떤 웹사이트든 구조화된 데이터로 변환하세요.**

Octoparse MCP는 Claude, ChatGPT, Cursor 같은 AI 도구를 노코드 웹 스크래핑 플랫폼 [Octoparse](https://www.octoparse.com)에 연결합니다. 코딩 불필요. 자동화 스크립트 불필요. 원하는 데이터를 말로 설명하기만 하면 됩니다.

---

## 어떻게 활용할 수 있나요?

```
나:   "아마존에서 '무선 이어폰' 검색 결과 상위 100개를 스크래핑해서 CSV로 저장해줘"
AI:   작업 생성 및 시작... 완료. 100개 상품이 earbuds.csv로 내보내졌습니다
```

```
나:   "이번 주 매일 Best Buy에서 iPhone 16 가격을 추적해줘"
AI:   예약됨. 매일 작업을 실행하고 가격 변동이 있으면 알려드리겠습니다.
```

```
나:   "LinkedIn에서 최근 7일 내에 올라온 '데이터 분석가' 채용 공고를 모두 찾아줘"
AI:   템플릿 검색 중... 작업 실행 중... 340개 공고가 내보내졌습니다.
```

스크래핑 경험이 없어도 됩니다. 원하는 데이터를 설명할 수 있다면, Octoparse MCP가 가져다 드립니다.

---

## 주요 활용 사례

- 🛒 **이커머스** — 경쟁사 가격 모니터링, 재고 가용성 추적
- 📈 **시장 조사** — 리뷰, 평점, 상품 목록 대규모 수집
- 💼 **채용** — 여러 플랫폼의 채용 공고 통합 수집
- 📰 **미디어 모니터링** — 뉴스 기사 아카이브 및 토픽 추적
- 🏠 **부동산** — 매물, 가격, 위치 데이터 자동 수집

---

## 빠른 시작

**Cursor / VS Code / 기타 클라이언트**

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

서버 추가 후 브라우저에서 OAuth 인증을 완료하세요.

> ChatGPT 및 모든 클라이언트의 단계별 가이드는 [전체 설정 가이드](https://openapi.octoparse.com/octoparse-mcp-guide.html)를 참고하세요.

---

## 포함된 기능

| | |
|---|---|
| 🔍 템플릿 검색 | 인기 사이트용 즉시 사용 가능한 스크래핑 템플릿 |
| 📋 작업 생성 | 자연어로 새 스크래핑 작업 설정 |
| ▶️ 작업 제어 | 실행, 중지 및 진행 상황 모니터링 |
| 💾 데이터 내보내기 | JSON 또는 CSV로 결과 다운로드 |
| 👤 계정 정보 | 크레딧 및 구독 상태 확인 |

---

## 요구 사항

- [Octoparse 계정](https://www.octoparse.com) — 클라우드 실행을 위해 Standard 플랜 이상 필요 ([플랜 보기](https://www.octoparse.com/pricing))
- MCP 호환 AI 클라이언트 (Claude, ChatGPT Plus/Team/Enterprise, Cursor, Gemini CLI, VS Code 등)

---

## 리소스

- [전체 설정 가이드](https://openapi.octoparse.com/octoparse-mcp-guide.html)
- [Octoparse API 문서](https://openapi.octoparse.com/en-US)
- [고객 지원 센터](https://helpcenter.octoparse.com)
- [support@octoparse.com](mailto:support@octoparse.com)
