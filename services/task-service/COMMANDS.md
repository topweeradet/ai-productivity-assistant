# Task Service Command Contract

## Purpose
CLI service for managing tasks in SQLite database.

---

## Commands

### List tasks
```bash
node services/task-service/index.js list
node services/task-service/index.js list --json
```

### Get one task
```bash
node services/task-service/index.js get <id>
node services/task-service/index.js get <id> --json
```

### Create reminder task
```bash
node services/task-service/index.js create "title" "description" 3 "2026-04-05 20:00:00"
node services/task-service/index.js create-reminder "title" "description" 3 "2026-04-05 20:00:00"
```

Notes:
- `create` and `create-reminder` currently behave the same
- default task type = `reminder`

### Create time block task
```bash
node services/task-service/index.js create-time-block "title" "description" 3 "2026-04-05 20:00:00" 60
```

Arguments:
1. `title`
2. `description`
3. `priority`
4. `dueAt`
5. `estimatedMinutes`

Default task type = `time_block`

### Complete task
```bash
node services/task-service/index.js complete <id>
node services/task-service/index.js complete <id> --json
```

### Update task status
```bash
node services/task-service/index.js update-status <id> <status>
node services/task-service/index.js update-status <id> <status> --json
```

Allowed statuses:
- `inbox`
- `in_progress`
- `done`
- `cancelled`

---

## Key fields in schema v2

- `task_type`
- `estimated_minutes`
- `actual_minutes`
- `scheduled_start`
- `scheduled_end`
- `source`

---

## Notes

- JSON mode is preferred for integrations
- `create-v2` is transitional and may be removed later
- Backend/service logic should live outside CLI parsing where possible