# AI Personal Assistant - V2 Scope

## 1. Goal
Build a personal AI assistant that captures tasks via chat, syncs with Google Calendar, and helps plan daily work with time blocking — without any self-hosted VPS.

## 2. Primary User
Single user only.

## 3. Architecture

### Interfaces
- **Desktop**: Claude Desktop talks to SQLite DB directly via MCP tools
- **Mobile**: Claude mobile creates a JSON artifact (temp storage), synced to DB on schedule or on-demand command

### Data Sources (3 parties)
1. **DB** (SQLite, local) — analytics and learning loop, never updated directly
2. **Claude Task Artifact** (JSON) — intermediate state, source of intent
3. **Google Calendar** — primary UX layer for all tasks and time blocks

### Data Flow
```
Chat (Desktop)  →  MCP tools  →  DB + Google Calendar
Chat (Mobile)   →  JSON Artifact  →  DB + Google Calendar (scheduled or manual sync)

Google Calendar update  →  Claude Connector  →  Artifact  →  DB
```

## 4. Google Calendar as Primary Layer

All tasks live in Google Calendar regardless of type:

| Task Type | Calendar Representation |
|-----------|------------------------|
| Reminder / quick task (`estimated_minutes = null or 0`) | All-day event |
| Time block (`estimated_minutes > 0`) | Timed event: `start` to `start + estimated_minutes` |
| Complete | `[done]` prefix added to event title |
| Recurring | Native Google Calendar recurrence (RRULE) |

### Metadata in Description
Task metadata is stored as structured text in the event description:

```
[task]
id: 42
priority: 2
status: scheduled
estimated_minutes: 60
source: mcp
is_recurring: 0
```

### Status Detection
- No prefix → active task
- `[done] title` → completed, filter out of artifact active list
- Archived tasks remain in DB only, not synced to Calendar

## 5. Conflict Resolution

### Source Priority (highest to lowest)
1. Google Calendar
2. Claude Task Artifact
3. DB

### Rules
- DB is never updated directly — only through artifact sync
- Artifact always wins over DB
- Google Calendar always wins over Artifact
- When Calendar event updated → Claude Connector triggers artifact update → DB sync follows
- Tiebreak between same-priority sources: most recent `updated_at` wins
- **No task deletion** — completed tasks get `[done]` prefix, archived tasks filtered from artifact focus

## 6. Claude Task Artifact

### Purpose
- Canonical working list for mobile Claude sessions
- Sync-safe structure that maps to DB schema and Google Calendar event format
- Tracks metadata for conflict resolution

### Schema
```json
{
  "version": "2",
  "last_synced_at": "2026-04-09T10:00:00Z",
  "sync_status": "clean",
  "tasks": [
    {
      "id": 42,
      "title": "Pay rent",
      "status": "inbox",
      "priority": 2,
      "due_at": "2026-04-15",
      "estimated_minutes": null,
      "is_recurring": false,
      "recur_pattern": null,
      "source": "mcp",
      "updated_at": "2026-04-09T10:00:00Z",
      "calendar_event_id": "google_event_id_here"
    }
  ]
}
```

### Skills Required
- `read-artifact`: parse and validate JSON artifact
- `write-artifact`: update artifact with new tasks or changes, preserving sync metadata
- `sync-artifact-to-db`: apply artifact changes to DB respecting priority rules
- `sync-calendar-to-artifact`: read Google Calendar via Connector, detect `[done]` prefix and metadata changes, update artifact

## 7. Calendar Integration

### Google Calendar (via Claude Connector)
- Read availability for planning suggestions
- Create all-day events for reminders
- Create timed events for time blocks
- Detect `[done]` prefix to mark tasks complete
- Read/write structured metadata from event description

### No Google Tasks
Google Tasks MCP connector is not available. Google Calendar handles all task tracking.

## 8. Features

### Core
- Capture task from chat (Desktop or Mobile)
- Store task in DB and Google Calendar
- Update task via chat — propagates to Calendar
- Mark complete via Calendar (`[done]` prefix) — syncs back to DB
- Suggest daily plan based on open tasks and calendar availability
- Create time blocks on Google Calendar
- Generate daily / weekly review

### Out of Scope for V2
- VPS / self-hosted deployment
- Multi-user support
- Direct DB writes (always go through artifact)
- Task deletion (use `[done]` prefix or archive status instead)
- Google Tasks integration

## 9. DB Role (Analytics & Learning Loop)

DB is no longer the primary store — it is the analytics layer:
- Stores `actual_minutes` vs `estimated_minutes` for learning
- Tracks which tasks consistently overrun, underrun, or never complete
- Powers future planning suggestions ("this type of task usually takes 2x estimate")

## 10. Definition of Success
V2 is successful if:
- I send a message on mobile → artifact created → syncs to DB and Calendar
- I send a message on desktop → DB and Calendar updated via MCP
- I mark a Calendar event `[done]` → artifact updated → DB reflects completion
- System suggests a daily plan based on open tasks and calendar availability
- Reminders appear as all-day events, time blocks appear as timed events

## 11. Constraints
- No VPS — local SQLite + Claude Desktop + Google Calendar
- No direct DB writes — all changes through artifact
- Conflict resolution: Calendar > Artifact > DB, tiebreak by timestamp
