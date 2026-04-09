# AI Personal Assistant - V2 Scope

## 1. Goal
Build a personal AI assistant that captures tasks via chat, syncs across Google Calendar and Google Tasks, and helps plan daily work with time blocking — without any self-hosted VPS.

## 2. Primary User
Single user only.

## 3. Architecture

### Interfaces
- **Desktop**: Claude Desktop talks to SQLite DB directly via MCP tools
- **Mobile**: Claude mobile creates a JSON artifact (temp storage), synced to DB on schedule or on-demand command

### Data Sources (3 parties)
1. **DB** (SQLite, local) — persistent store, never updated directly
2. **Claude Task Artifact** (JSON) — intermediate state, source of intent
3. **Google Calendar / Google Tasks** — external calendar and reminder source

### Data Flow
```
Chat (Desktop)  →  MCP tools  →  DB
Chat (Mobile)   →  JSON Artifact  →  DB (scheduled or manual sync)

Google Calendar/Tasks update  →  Claude Connector  →  Artifact  →  DB
```

## 4. Conflict Resolution

### Source Priority (highest to lowest)
1. Google Calendar / Google Tasks
2. Claude Task Artifact
3. DB

### Rules
- DB is never updated directly — only through artifact sync
- Artifact always wins over DB
- Google Calendar / Google Tasks always win over Artifact
- When Google services update, Claude Connector triggers artifact update, then DB sync follows
- Tiebreak between same-priority sources: most recent timestamp wins
- **No task deletion** — completed tasks are filtered out of artifact focus, not deleted from DB

## 5. Claude Task Artifact

### Purpose
- Serves as the canonical "working list" for mobile Claude sessions
- Must have a sync-safe structure that maps cleanly to DB schema
- Must track metadata for conflict resolution (source, updated_at per field or per task)

### Requirements
- Defined schema with version field
- Each task carries: `id`, `title`, `status`, `priority`, `due_at`, `estimated_minutes`, `source`, `updated_at`
- Artifact has a `last_synced_at` and `sync_status` field
- Completed tasks excluded from active focus (present in DB, absent from artifact active list)

### Skill / Agent Required
- `read-artifact`: parse and validate JSON artifact
- `write-artifact`: update artifact with new tasks or changes, preserving sync metadata
- `sync-artifact-to-db`: apply artifact changes to DB respecting priority rules
- `sync-google-to-artifact`: pull Google Calendar / Tasks changes into artifact via Claude Connector

## 6. Calendar & Task Integration

### Google Calendar
- Read availability for time blocking suggestions
- Create time blocks from tasks
- When calendar event updated → trigger artifact update via Claude Connector

### Google Tasks
- Sync task status (open / complete)
- When Google Task marked complete → artifact updated → DB updated
- Used as notification/reminder layer

### Integration Method
- Claude Connector (no self-hosted integration)

## 7. Features

### Core
- Capture task from chat (Desktop or Mobile)
- Store task in DB via artifact
- Update task via chat or Google Tasks check
- Suggest daily plan with time blocking
- Create calendar blocks for tasks
- Generate daily / weekly review

### Out of Scope for V2
- VPS / self-hosted deployment
- Multi-user support
- Direct DB writes (no bypassing artifact)
- Task deletion (use status filtering instead)
- Apple Reminders

## 8. Definition of Success
V2 is successful if:
- I send a message on mobile → JSON artifact created → syncs to DB
- I send a message on desktop → DB updated via MCP directly
- Google Task marked complete → artifact updated → DB reflects completion
- System suggests a daily plan based on open tasks and calendar availability
- Time blocks created on Google Calendar from tasks

## 9. Constraints
- No VPS — runs entirely local (desktop) + cloud Claude services
- SQLite as local DB
- No direct DB writes — all changes go through artifact
- Conflict resolution is source-priority + timestamp based
