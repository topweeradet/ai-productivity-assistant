# /create-task

Guide the user through creating a complete task, ask for any missing information, then save to DB and Google Calendar.

---

## Step 1: Collect information

Ask for any fields not already provided. Work through this list conversationally — do not ask all questions at once. Ask only what is missing.

### Required
- **title** — what is the task?

### Ask if not provided
- **due date / time** — when does this need to happen? (accept natural language like "tomorrow", "next Friday 2pm")
- **estimated time** — how long will this take? (if none or very short → becomes a reminder, if has duration → becomes a time block on Calendar)
- **priority** — how urgent is this? (1=critical, 2=high, 3=normal, 4=low, 5=someday) — default 3 if skipped
- **recurring?** — does this repeat? If yes: daily / weekly / monthly

### Optional (ask only if relevant)
- **description** — any extra notes?

---

## Step 2: Confirm before saving

Show a summary and ask for confirmation:

```
Ready to create task:
  Title:     <title>
  Type:      reminder | time block (<N> min)
  Due:       <date> or none
  Priority:  <1-5>
  Recurring: yes (<pattern>) | no

Create this task? (yes / edit)
```

If user wants to edit → go back to the relevant field and re-confirm.

---

## Step 3: Save to DB

Call `create_task` MCP tool with all collected fields:
- `title`
- `description` (if provided)
- `priority`
- `due_at` (ISO format)
- `estimated_minutes` (0 or null if reminder)

Note the returned `taskId`.

---

## Step 4: Create Google Calendar event

**If reminder** (`estimated_minutes` is null or 0):
- Create all-day event using `gcal_create_event`
- `start.date` and `end.date` = due date (end = next day)

**If time block** (`estimated_minutes` > 0):
- Create timed event
- `start.dateTime` = due_at
- `end.dateTime` = due_at + estimated_minutes
- `timeZone` = `Australia/Melbourne`

Event description must include the `[task]` metadata block:
```
[task]
id: <taskId>
priority: <priority>
status: inbox
estimated_minutes: <value>
source: mcp
is_recurring: <0|1>
recur_pattern: <value or omit>
```

**If recurring** → add recurrence rule:
- daily → `RRULE:FREQ=DAILY`
- weekly → `RRULE:FREQ=WEEKLY`
- monthly → `RRULE:FREQ=MONTHLY`

Note the returned `calendar_event_id`.

---

## Step 5: Link Calendar event back to DB

Call the API directly:
```
PATCH /tasks/<taskId>
{ "calendar_event_id": "<calendar_event_id>" }
```

If the PATCH endpoint does not exist yet — note the `calendar_event_id` in the confirmation message and remind the user to run `/sync-calendar` to keep the artifact up to date.

---

## Step 6: Confirm

Show final confirmation:
```
✓ Task created
  ID:       <taskId>
  Calendar: <event title> on <date>
  Sync:     run /sync-calendar to update the artifact
```
