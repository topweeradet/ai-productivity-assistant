# Architecture
version: 1.0.0

## System Overview

```
Telegram (UI)
      ↓
Bot Backend — Node.js (existing project)
      ↓
LLM API — Claude Haiku or Deepseek V3
      ↓
PocketBase — Self-hosted on Oracle VPS
```

## Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Chat UI | Telegram Bot | Free API, mobile-first, button support |
| Backend | Node.js (existing) | Already built, continue from here |
| LLM | Claude Haiku / Deepseek V3 | Cheap, smart enough for task management |
| Database | PocketBase | Single binary, REST API auto-generated, no code needed |
| Hosting | Oracle Free VPS | Already available |
| Container | Docker Compose | Simple, reproducible |

## Docker Compose

```yaml
services:
  pocketbase:
    image: ghcr.io/muchobien/pocketbase:latest
    container_name: pocketbase
    restart: unless-stopped
    ports:
      - "8090:8090"
    volumes:
      - ./pb_data:/pb/pb_data

  bot:
    build: .
    container_name: telegram-bot
    restart: unless-stopped
    depends_on:
      - pocketbase
    environment:
      - TELEGRAM_TOKEN=xxx
      - LLM_API_KEY=xxx
      - POCKETBASE_URL=http://pocketbase:8090
```

## Data Flow

```
User sends message in Telegram
        ↓
Bot Backend receives via webhook
        ↓
Build prompt:
  - SKILL.md (system prompt, hardcoded)
  - Today's date (injected automatically ← fixes date problem)
  - User's goals (fetched from PocketBase)
  - User's backlog (fetched from PocketBase)
  - Conversation history (in-memory per session)
        ↓
Call LLM API
        ↓
Parse LLM response:
  - Extract any CRUD actions (structured JSON)
  - Extract reply text
        ↓
Execute CRUD on PocketBase (if any)
        ↓
Send reply to Telegram
```

## LLM Response Format

LLM must respond in this structure so backend can parse it:

```json
{
  "reply": "text to send to user",
  "actions": [
    {
      "type": "create" | "update" | "delete",
      "collection": "tasks" | "goals" | "projects" | "subtasks" | "daily_plans" | "activity_log",
      "data": {}
    }
  ]
}
```

## Key Design Decisions

### Why PocketBase over Express.js / Pure JS API
- Task management logic lives entirely in LLM, not backend
- Backend only needs simple CRUD — PocketBase handles this with zero code
- Express.js would add 200-400 lines of boilerplate with no benefit
- Single binary = minimal maintenance

### Why Not Grist
- Free tier limited to 5,000 rows
- Row ID reuse after deletion breaks references
- UUID strategy required workaround — PocketBase solves this natively

### Why Telegram over WhatsApp / LINE
- Telegram Bot API is free with no message limits
- WhatsApp Business API has per-message cost
- LINE free tier limited to 500 messages/month
- Telegram has native button/menu support

### Why Claude Haiku over Sonnet
- Personal use: ~60,000 tokens/month
- Haiku cost: ~$0.10/month vs Sonnet ~$0.50/month
- Haiku is smart enough for task classification and prioritization
- Can swap to Deepseek V3 (~$0.27/1M input) for even lower cost

### Why Not Claude.ai Artifact with API
- Requires separate Claude API key (not included in Claude.ai subscription)
- Telegram Bot achieves same result using existing subscription budget
- Bot approach works on mobile natively without browser

### Date Injection Strategy
- Claude.ai cannot know current date reliably → causes planning errors
- Bot backend injects today's date into every prompt automatically
- Eliminates the need for user to type date manually

### Soft Delete Strategy
- Never hard delete records
- All collections have `deleted` (Bool, default: false) field
- Queries always filter: `deleted = false`
- Prevents broken references in related collections

## What the Existing Node.js Project Has
- Telegram Bot setup and webhook handling
- Basic message routing
- Needs: LLM integration, PocketBase CRUD, SKILL.md system prompt

## Security Notes
- PocketBase port 8090 should NOT be public — internal Docker network only
- Add Nginx reverse proxy with HTTPS if Admin UI needs external access
- API keys stored in environment variables, never hardcoded
- PocketBase Admin UI: accessible at VPS_IP:8090/_/ (internal only)
