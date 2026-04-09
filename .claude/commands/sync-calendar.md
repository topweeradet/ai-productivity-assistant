# /sync-calendar

Sync Google Calendar events into the task artifact for this project.

**Calendar wins over Artifact** — any field present in a Calendar event overwrites the artifact.

---

## Step 1: Locate or create the artifact

Look in the current Claude project (AI-Productivity-Assistant) for a file or artifact named **`tasks-artifact`**.

**If it does NOT exist** → create it as a new artifact with this structure and proceed to Step 2:
```json
{
  "version": "2",
  "last_synced_at": null,
  "sync_status": "never",
  "tasks": []
}
```

**If it DOES exist** → read its contents and proceed to Step 2.

---

## Step 2: Fetch Calendar events

Call `gcal_list_events` with:
- `calendarId`: `primary`
- `timeMin`: 3 days ago (ISO format, no timezone suffix)
- `timeMax`: 7 days from now (ISO format, no timezone suffix)
- `timeZone`: `Australia/Melbourne`
- `condenseEventDetails`: `false`

---

## Step 3: Parse and reconcile

For **each** calendar event returned:

**a.** Check if description contains a `[task]` block. If not — skip (not a task event).

**b.** Parse the `[task]` block:
```
[task]
id: <number>
priority: <1-5>
status: <inbox|scheduled|done>
estimated_minutes: <number>
source: <string>
is_recurring: <0|1>
recur_pattern: <daily|weekly|monthly> (optional)
```

**c.** Detect completion: if title starts with `[done]` → force `status: done`.

**d.** Strip `[done]` prefix from the display title.

**e.** Find matching task in artifact by `calendar_event_id` (preferred) or `id` from metadata.

**f.** Merge — Calendar wins on all fields:
```
title             ← event summary (stripped of [done])
status            ← done if [done] prefix, else metadata.status
priority          ← metadata.priority
estimated_minutes ← metadata.estimated_minutes
is_recurring      ← metadata.is_recurring
recur_pattern     ← metadata.recur_pattern
due_at            ← event start.date or start.dateTime (date part only)
calendar_event_id ← event id
updated_at        ← now (ISO timestamp)
```

**g.** If task not found in artifact → append as new task entry.

---

## Step 4: Preserve local-only tasks

Tasks in the artifact with **no** `calendar_event_id` and no match in Calendar → keep unchanged. These are tasks created locally but not yet pushed to Calendar.

---

## Step 5: Separate active from completed

- Active tasks: `status` is NOT `done` or `archived` → stays in `tasks` array
- Completed tasks: `status` is `done` or `archived` → move to `completed` array

---

## Step 6: Write updated artifact

Update the artifact in the Claude project with:
```json
{
  "version": "2",
  "last_synced_at": "<current ISO timestamp>",
  "sync_status": "clean",
  "tasks": [ ...active tasks... ],
  "completed": [ ...done/archived tasks... ]
}
```

Save this as the **`tasks-artifact`** file in the AI-Productivity-Assistant project.

---

## Step 7: Report

Show a summary table:
| | Count |
|---|---|
| Active tasks in artifact | N |
| Newly added from Calendar | N |
| Marked done | N |
| Local-only tasks preserved | N |
| Last synced | timestamp |
