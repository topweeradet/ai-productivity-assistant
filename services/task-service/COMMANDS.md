# Task Service Command Contract

## Purpose
CLI service for managing tasks in SQLite database.

---

## Commands

### 1. List tasks

```bash
node services/task-service/index.js list
```

#### JSON mode
```bash
node services/task-service/index.js list --json
```

#### Expected behavior
- Returns all tasks ordered by `id ASC`
- In text mode, prints a readable task list
- In json mode, returns:

```json
{
  "success": true,
  "tasks": []
}
```

---

### 2. Create task

```bash
node services/task-service/index.js create "title" "description" 3 "2026-04-05 20:00:00"
```

#### JSON mode
```bash
node services/task-service/index.js create "title" "description" 3 "2026-04-05 20:00:00" --json
```

#### Arguments
1. `title` (required)
2. `description` (optional, default: empty string)
3. `priority` (optional, default: 3)
4. `dueAt` (optional, default: null)

#### Expected behavior
- Creates a task with status = `inbox`
- In text mode, returns success message
- In json mode, returns:

```json
{
  "success": true,
  "message": "Task created successfully",
  "taskId": 1
}
```

---

## Error behavior

### Missing title

Example:
```bash
node services/task-service/index.js create --json
```

Returns:

```json
{
  "success": false,
  "error": "Missing title. Usage: ..."
}
```

---

### Unknown command

Returns error in text or json mode depending on flag.

---

## Notes

- `--json` is treated as an option, not task data
- Current supported commands: `list`, `create`
- Database: `db/app.db`