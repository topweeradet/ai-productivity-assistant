# Product Requirements Document
# AI Personal Productivity Assistant — V3

**Version:** 3.0  
**Author:** Tom  
**Date:** April 2026  
**Status:** Draft  

---

## 1. Overview

### 1.1 Product Vision
A self-hosted personal productivity system that captures, plans, and executes tasks intelligently — across all devices — with minimal AI cost and maximum reliability.

### 1.2 Problem Statement
- Tasks are scattered across chat, memory, and notes with no single capture point
- Planning is manual and inconsistent — no structured daily or weekly rhythm
- Time estimates are rarely tracked, so no learning loop exists
- Calendar and task tools are disconnected — time blocking is manual
- Previous approach (Claude Desktop + MCP) consumed too many tokens for daily use

### 1.3 Goals for V3
- Enable task capture from any device via Telegram
- Automate integration between tasks and Google Calendar / Google Tasks
- Introduce structured planning rhythm (daily + weekly)
- Keep AI cost within 5 AUD/month total
- Build on V2 without replacing it

---

## 2. Users

| Attribute | Detail |
|---|---|
| User | Single user (Tom) |
| Primary device | Desktop (Claude Desktop + Telegram) |
| Secondary device | Mobile (Telegram + Claude Mobile read-only) |
| Technical level | Developer — comfortable with self-hosted infra |

---

## 3. Architecture

### 3.1 System Overview

```
Mobile / Any Device
    ↓ Telegram
n8n (workflow engine — VPS)
    ├── Telegram webhook routing
    ├── Scheduled triggers (morning, evening, weekly)
    ├── Gemini API (natural language parse)
    ├── Google Calendar API (time block write)
    ├── Google Tasks API (reminder write)
    ├── Google Drive API (artifact sync)
    └── Backend Service API
            ├── Task Service (CRUD + decideTaskType)
            └── Planning Engine (MIT, daily load, weekly summary)
                    ↓
                 SQLite
                    ↓ /sync command
             Artifact JSON → iCloud / Google Drive
                                  ↓ read-only
                             Claude Mobile / Web
```

**Separation of concerns:**
- **n8n** — integration plumbing, routing, scheduling, external API calls
- **Backend Service** — business logic only (task rules, planning engine, data validation)

### 3.2 Build Strategy
V3 builds on top of V2. V2 local stack (Claude Desktop + MCP + local SQLite) remains operational.

V3 adds:
- VPS-hosted backend service (business logic only)
- n8n as workflow/integration layer (replaces custom Telegram handler, cron, and API glue code)
- Telegram Bot interface (via n8n webhook)
- Google Calendar + Google Tasks integration (via n8n nodes)
- Planning engine (in backend service)
- LLM parse layer (Gemini via n8n)

### 3.3 Hosting
| Component | Location |
|---|---|
| n8n (workflow engine) | Oracle Cloud VPS (Docker) |
| Backend Service | Oracle Cloud VPS (Docker) |
| SQLite | VPS (persistent volume) |
| MCP Server (V2) | Local machine (Docker, SSE mode) |
| Artifact JSON | iCloud / Google Drive |
| Telegram Bot webhook | n8n on VPS |

### 3.4 Infrastructure Constraints
- Total cost must not exceed **5 AUD/month**
- Oracle Cloud Free Tier preferred — upgrade only if Ollama is required
- Docker used on both local (V2) and VPS (V3)

---

## 4. Integrations

> All external API integrations are handled by n8n. Backend service is not responsible for OAuth or external API calls directly.

### 4.1 Google Calendar
- **Purpose:** Create and manage time block events for `time_block` tasks
- **Access:** Read + Write
- **Handled by:** n8n Google Calendar node
- **Trigger:** Backend emits event → n8n workflow picks up → creates/updates/deletes calendar event
- **Behaviour:**
  - Create calendar event with task title, scheduled_start, scheduled_end
  - Store `calendar_event_id` on task record
  - Update or delete event when task is rescheduled or cancelled
- **Designed as:** Optional integration (can be disabled in n8n)

### 4.2 Google Tasks
- **Purpose:** Create reminders for `reminder` tasks
- **Access:** Read + Write
- **Handled by:** n8n Google Tasks node
- **Trigger:** Backend emits event → n8n workflow picks up → creates/updates Google Task
- **Behaviour:**
  - Create Google Task with title and due_at
  - Replaces previous approach of creating all-day calendar events for reminders
  - Marks complete when task is done
- **Designed as:** Optional integration (can be disabled in n8n)

---

## 5. n8n Workflows

n8n runs on VPS (Docker) and acts as the integration and automation layer. Backend service exposes a simple HTTP API that n8n calls — it does not connect to external services directly.

### 5.1 Workflows

| Workflow | Trigger | Actions |
|---|---|---|
| **Task Capture** | Telegram message (non-command) | Parse via Gemini → POST to backend → reply confirmation |
| **Command Router** | Telegram command (`/tasks`, `/inbox`, `/done`, `/plan`, `/week`, `/sync`) | Route to appropriate backend endpoint → format reply |
| **Morning Planning** | Scheduled (e.g. 8:00 AM) | Call backend planning engine → send daily plan via Telegram |
| **Evening Shutdown** | Scheduled (e.g. 9:00 PM) | Call backend for open tasks → prompt shutdown via Telegram |
| **Weekly Review** | Scheduled (Sunday 7:00 PM) | Call backend for weekly summary → send via Telegram |
| **Calendar Sync** | Backend webhook (task scheduled) | Create/update/delete Google Calendar event |
| **Google Tasks Sync** | Backend webhook (reminder task created/updated) | Create/update/complete Google Task |
| **Artifact Export** | `/sync` command or manual trigger | Query backend → format JSON → upload to Google Drive |
| **Overdue Alert** | Scheduled (daily 8:00 AM) | Query overdue tasks from backend → send alert via Telegram |

### 5.2 n8n Design Rules
- n8n handles **all** external API calls (Telegram, Google, Gemini)
- n8n does **not** contain business logic — only routing, formatting, and API calls
- Each workflow should be independent and re-runnable
- Credentials stored in n8n credential store (not in code)

### 5.3 What n8n Does NOT Do
- Task classification (`decideTaskType`) — backend only
- Planning load calculation — backend only
- MIT selection — backend only
- Database reads/writes — always via backend API, never direct SQLite access

---

## 6. LLM Strategy

### 6.1 Scope of LLM Usage
LLM is used **only** for natural language parsing. All other logic is rule-based.

| Task | Handled By |
|---|---|
| Parse "remind me to call John tmr 3pm" → structured JSON | LLM |
| Classify task type (reminder / time_block) | Rule-based (`decideTaskType()`) |
| Select MIT | Rule-based (priority + due_at) |
| Daily planning load calculation | Rule-based |
| Weekly summary generation | Rule-based (V3.2), LLM optional (V3.5) |

### 6.2 Provider Strategy

| Priority | Provider | Cost | Condition |
|---|---|---|---|
| 1 | Gemini 2.0 Flash | Free tier | Default |
| 2 | Ollama (self-hosted) | VPS cost only | If Gemini rate limits become blocking |
| ❌ | Claude API | Unpredictable | Never |
| ❌ | OpenAI API | Unpredictable | Never |

### 6.3 Provider-Agnostic Design
LLM call is made inside an n8n workflow — swapping providers means updating the n8n node, not the backend code. Backend always receives structured JSON regardless of which provider was used.

```
Telegram message
    ↓
n8n: HTTP Request → Gemini API (or Ollama)
    ↓
Structured JSON
    ↓
Backend Service: create task
```

### 6.4 Budget Guard
- Monitor token usage per month
- If Gemini free tier is exhausted → fallback to Ollama
- Hard rule: no paid LLM API unless total infra cost stays under 5 AUD/month

---

## 7. Database Schema

### 7.1 Tasks Table

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- identity
  title TEXT NOT NULL,
  description TEXT,

  -- status: inbox | today | in_progress | done | cancelled
  status TEXT NOT NULL DEFAULT 'inbox',

  -- planning
  -- task_type: reminder | time_block
  task_type TEXT DEFAULT 'reminder',
  -- priority: high | medium | low
  priority TEXT NOT NULL DEFAULT 'medium',
  -- energy_level: deep | shallow
  energy_level TEXT DEFAULT 'shallow',
  due_at TEXT,
  estimated_minutes INTEGER,

  -- context
  context_tags TEXT,                   -- JSON array e.g. ["@work", "@home"]

  -- scheduling
  scheduled_start TEXT,
  scheduled_end TEXT,

  -- learning
  actual_minutes INTEGER,
  completed_at TEXT,

  -- integrations
  calendar_event_id TEXT,              -- Google Calendar event ID
  google_task_id TEXT,                 -- Google Tasks ID

  -- metadata
  source TEXT DEFAULT 'manual',        -- manual | telegram | api
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Changes from V2 schema:**
- `priority` changed from INTEGER → TEXT (high/medium/low)
- `energy_level` added (deep/shallow)
- `context_tags` added (JSON array)
- `completed_at` added
- `google_task_id` added
- `status` values explicitly defined
- `is_recurring` and `recur_pattern` removed (deferred)

### 7.2 Planning Sessions Table

```sql
CREATE TABLE IF NOT EXISTS planning_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- session_type: daily | weekly
  session_type TEXT NOT NULL,
  -- daily: "2026-04-12" | weekly: "2026-W15"
  session_date TEXT NOT NULL,

  -- planning input
  available_minutes INTEGER,           -- calculated from calendar
  planned_minutes INTEGER,             -- sum of estimated_minutes for selected tasks
  intentions TEXT,                     -- JSON array of strings (weekly only)
  mit_task_id INTEGER REFERENCES tasks(id),  -- daily only

  -- shutdown / review output
  completed_tasks INTEGER,
  shutdown_note TEXT,                  -- end of day note
  review_note TEXT,                    -- weekly review summary

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS session_tasks (
  session_id INTEGER REFERENCES planning_sessions(id),
  task_id INTEGER REFERENCES tasks(id),
  PRIMARY KEY (session_id, task_id)
);
```

---

## 8. Features

### 8.1 Task Capture (Telegram)
- User sends natural language message to Telegram bot
- LLM parses message → structured task fields
- Backend stores task with `source = telegram`
- Bot confirms with task summary
- Capture works without specifying all fields (defaults apply)

**Example:**
```
User: "remind me to call John tomorrow 3pm"
Bot:  "✅ Added: Call John
       Due: Tomorrow 3:00 PM
       Type: Reminder → will add to Google Tasks"
```

### 8.2 Task Management (Telegram Commands)
| Command | Action |
|---|---|
| `/tasks` | List today's tasks (status = today) |
| `/inbox` | List unreviewed tasks (status = inbox) |
| `/done [id]` | Mark task complete + prompt for actual_minutes |
| `/plan` | Start daily planning session |
| `/week` | Start weekly review session |
| `/sync` | Export Artifact JSON to cloud storage |

### 8.3 Daily Planning Engine
- Triggered by `/plan` command or scheduled morning message
- Steps:
  1. Fetch available time from Google Calendar
  2. Calculate 60-70% of available time as planning budget
  3. Pull tasks: overdue + due today + high priority inbox
  4. Suggest task list that fits within budget (by estimated_minutes)
  5. Prompt user to confirm or adjust
  6. Set confirmed tasks to `status = today`
  7. Select MIT (highest priority + earliest due)
  8. Create planning_session record

### 8.4 Daily Shutdown
- Triggered by scheduled evening message or `/shutdown` command
- Steps:
  1. Show tasks with `status = today` that are not done
  2. Prompt: complete, reschedule, or cancel each
  3. Prompt for actual_minutes on completed tasks
  4. Prompt for shutdown note + MIT for tomorrow
  5. Update planning_session with shutdown data

### 8.5 Weekly Review
- Triggered by `/week` command (recommended: Sunday evening)
- Shows:
  - Tasks completed vs planned this week
  - Actual vs estimated minutes (total + by energy_level)
  - Overdue tasks → reschedule or drop
  - Upcoming deadlines next 2 weeks
  - Calendar load next week
- Prompts user to set 3 intentions for next week
- Creates weekly planning_session record

### 8.6 Google Calendar Integration (Time Block)
- Automatic: when `task_type = time_block` and `scheduled_start` is set
- Creates calendar event
- Updates event when task is rescheduled
- Deletes event when task is cancelled

### 8.7 Google Tasks Integration (Reminder)
- Automatic: when `task_type = reminder` and `due_at` is set
- Creates Google Task with due date
- Updates when task due_at changes
- Marks complete when task is done

---

## 9. Planning Strategy Requirements

| Strategy Element | Requirement | V3 Milestone |
|---|---|---|
| Capture from any device | Telegram bot | V3.0 |
| Quick capture (no full detail) | inbox default status | V3.0 |
| Daily planning with time budget | 60-70% rule, calendar-aware | V3.1 |
| MIT selection | Rule-based: priority + due_at | V3.1 |
| Shutdown routine | Evening prompt, actual_minutes | V3.0 |
| Weekly review | Summary + intentions | V3.2 |
| Actual vs estimated tracking | completed_at + actual_minutes | V3.2 |
| Energy-based scheduling | energy_level + time of day | V3.1 |
| AI MIT suggestion | LLM-assisted | V3.4 |
| Pattern analysis | Estimate accuracy by type | V3.5 |

---

## 10. Non-Functional Requirements

| Requirement | Detail |
|---|---|
| Cost | Total infra ≤ 5 AUD/month |
| Availability | VPS always-on, no dependency on local machine for V3 features |
| Data safety | SQLite on VPS + Artifact backup on cloud storage |
| LLM availability | Graceful fallback if Gemini rate limited |
| Security | API not publicly exposed; Telegram bot token secured |
| Single user | No auth system required |

---

## 11. Out of Scope (V3)

- Multi-user support
- Web UI / dashboard
- Voice input
- Complex recurring task rules
- Autonomous agent behaviour
- Claude API / OpenAI API usage
- Google Calendar read for availability on mobile (V2 Artifact covers this)

---

## 12. Rollout Plan

| Milestone | Features |
|---|---|
| **V3.0** | VPS setup, n8n + Backend (Docker), Telegram webhook, quick capture, `/tasks` `/inbox` `/done` `/sync`, shutdown reminder |
| **V3.1** | Daily planning engine, MIT selection, energy-level scheduling, 60-70% time rule, morning trigger |
| **V3.2** | Weekly review, actual vs estimated report, planning_sessions table, weekly trigger |
| **V3.3** | Google Calendar integration (time block), Google Tasks integration (reminder) via n8n |
| **V3.4** | AI-powered MIT suggestion (Gemini via n8n) |
| **V3.5** | Pattern analysis, coaching insights, estimate accuracy by task type |

---

## 13. What Carries Over from Previous Versions

| Component | Status | Notes |
|---|---|---|
| SQLite schema (tasks) | ✅ Migrate | Apply schema changes in section 6.1 |
| `decideTaskType()` logic | ✅ Move to backend | No change to logic |
| Docker setup | ✅ Reuse | Local (V2 MCP) + VPS (V3 backend) |
| V2 MCP Server | ✅ Keep | Claude Desktop workflow unchanged |
| Express HTTP API (V1.1) | 🗑️ Retired | Replaced by backend service + n8n |
| n8n | ✅ New | Integration + automation layer on VPS |
| Artifact JSON sync | ✅ Keep | `/sync` command via Telegram or Claude Desktop |
| Security fix (open port) | ⚠️ Required before V3.0 deploy | Noted from initial review |
