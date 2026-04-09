# /sync-calendar

Sync Google Calendar events into the Claude task artifact at `~/claude-task-artifact.json`.

**Calendar wins over Artifact** — any field present in a Calendar event overwrites the artifact.

---

## Steps

### 1. Read current artifact

Read the file at `~/claude-task-artifact.json`.
- If it doesn't exist, start with an empty artifact:
```json
{
  "version": "2",
  "last_synced_at": null,
  "sync_status": "never",
  "tasks": []
}
```

### 2. Fetch Calendar events

Call `gcal_list_events` with:
- `calendarId`: `primary`
- `timeMin`: 3 days ago (ISO format, no timezone suffix)
- `timeMax`: 7 days from now (ISO format, no timezone suffix)
- `timeZone`: `Australia/Melbourne`
- `condenseEventDetails`: `false`

### 3. Parse and reconcile

For **each** calendar event returned:

a. Check if description contains a `[task]` block. If not — skip (not a task event).

b. Parse the `[task]` block:
```
[task]
id: <number>
priority: <1-5>
status: <inbox|scheduled|done>
estimated_minutes: <number>
source: <string>
is_recurring: <0|1>
```

c. Detect completion: if title starts with `[done]` → set `status: done`.

d. Strip `[done]` from the display title.

e. Find the matching task in artifact by `calendar_event_id` (preferred) or by `id` from metadata.

f. **Merge** — Calendar wins on all fields:
```
title       ← calendar event summary (stripped of [done])
status      ← done if [done] prefix, else metadata status
priority    ← metadata priority
estimated_minutes ← metadata estimated_minutes
due_at      ← event start.date or start.dateTime
calendar_event_id ← event id
updated_at  ← now
```

g. If task **not found** in artifact → add it as a new entry.

### 4. Preserve local-only tasks

Tasks in the artifact that have **no** `calendar_event_id` and no matching Calendar event → keep unchanged. These are desktop-created tasks not yet pushed to Calendar.

### 5. Filter active tasks

Remove tasks with `status: done` or `status: archived` from the active list — move them to a `completed` array (or just drop them if not needed).

### 6. Write updated artifact

Update the artifact file with:
- `last_synced_at`: current ISO timestamp
- `sync_status`: `"clean"`
- `tasks`: merged active task list

### 7. Report

Print a summary:
- How many tasks synced
- How many newly added from Calendar
- How many marked done
- How many local-only tasks preserved
