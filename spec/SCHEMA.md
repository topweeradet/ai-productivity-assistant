# Database Schema
version: 1.0.0

## Platform
PocketBase (SQLite under the hood)
Collections = Tables
PocketBase auto-generates UUID `id` field for every collection

## Critical Rules
1. Never hard delete — use soft delete (`deleted = true`)
2. Always filter `deleted = false` in all queries
3. Reference other collections by PocketBase `id` (UUID auto-generated — safe, no reuse)
4. All queries through PocketBase REST API

## Collections

### goals
Stores long-term and short-term goals.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | UUID | auto | PocketBase auto-generated |
| title | Text | ✅ | |
| type | Select | ✅ | long-term, short-term |
| measure | Text | | How to measure success |
| deadline | Date | | |
| status | Select | ✅ | active, paused, done |
| deleted | Bool | ✅ | default: false |
| created | DateTime | auto | PocketBase auto |

### projects
Groups of related tasks working toward a goal.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | UUID | auto | |
| goal | Relation → goals | | nullable — project may not link to a goal |
| title | Text | ✅ | |
| status | Select | ✅ | active, done, dropped |
| due_date | Date | | |
| deleted | Bool | ✅ | default: false |
| created | DateTime | auto | |

### tasks
Individual actionable items. Core of the system.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | UUID | auto | |
| project | Relation → projects | | nullable — standalone task |
| goal | Relation → goals | | nullable — direct goal link |
| title | Text | ✅ | |
| type | Select | ✅ | task, recurring, idea |
| status | Select | ✅ | backlog, today, done, dropped |
| impact | Number | | ICE score 1-10 |
| confidence | Number | | ICE score 1-10 |
| ease | Number | | ICE score 1-10 |
| ice_score | Number | | Calculated: (impact+confidence+ease)/3 |
| due_date | Date | | |
| recurrence | Select | | daily, weekly, monthly, none |
| next_due | Date | | For recurring tasks |
| deleted | Bool | ✅ | default: false |
| created | DateTime | auto | |

### subtasks
Steps within a task.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | UUID | auto | |
| task | Relation → tasks | ✅ | |
| title | Text | ✅ | |
| status | Select | ✅ | todo, done |
| order | Number | | Sort order |
| deleted | Bool | ✅ | default: false |
| created | DateTime | auto | |

### daily_plans
Records which tasks were planned for which day.
Separate from tasks so same task can be planned across multiple days.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | UUID | auto | |
| date | Date | ✅ | The planned date |
| task | Relation → tasks | ✅ | |
| priority | Number | ✅ | 1, 2, or 3 (max 3 per day) |
| note | Text | | Context for that day |
| created | DateTime | auto | |

### activity_log
Immutable history of all actions taken on tasks.
Never soft-deleted — permanent record.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | UUID | auto | |
| date | Date | ✅ | |
| task | Relation → tasks | ✅ | |
| action | Select | ✅ | started, completed, blocked, deferred, dropped |
| completed_at | DateTime | | When actually finished |
| block_reason | Text | | If blocked, why |
| note | Text | | |
| created | DateTime | auto | |

## Relationships

```
goals (1)
  └── projects (many) via project.goal
        └── tasks (many) via task.project
              ├── subtasks (many) via subtask.task
              ├── daily_plans (many) via daily_plan.task
              └── activity_log (many) via activity_log.task

goals (1)
  └── tasks (many) via task.goal
      (direct link — task without a project)
```

## Common Queries

```
# Today's plan
GET /api/collections/daily_plans/records
  ?filter=(date='2024-11-12' && task.deleted=false)
  &expand=task,task.project,task.goal
  &sort=priority

# Active backlog
GET /api/collections/tasks/records
  ?filter=(status='backlog' && deleted=false)
  &sort=-ice_score

# Upcoming deadlines (next 3 days)
GET /api/collections/tasks/records
  ?filter=(due_date<='2024-11-15' && deleted=false && status!='done')
  &sort=due_date

# Recurring tasks due today
GET /api/collections/tasks/records
  ?filter=(type='recurring' && next_due<='2024-11-12' && deleted=false)

# Goal progress
GET /api/collections/tasks/records
  ?filter=(goal='GOAL_ID' && deleted=false)
  → count done vs total

# Block patterns
GET /api/collections/activity_log/records
  ?filter=(action='blocked')
  &sort=-created
```

## Soft Delete Pattern

```javascript
// Never do this:
DELETE /api/collections/tasks/records/{id}

// Always do this:
PATCH /api/collections/tasks/records/{id}
body: { "deleted": true }

// Always filter in queries:
?filter=(deleted=false)
```
