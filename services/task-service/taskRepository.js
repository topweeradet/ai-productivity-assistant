const { db } = require("./db");

function createTaskV2(taskData, callback) {
  const {
    title,
    description = "",
    status = "inbox",
    task_type = "reminder",
    priority = 3,
    due_at = null,
    estimated_minutes = null,
    source = "manual",
    scheduled_start = null,
    scheduled_end = null,
  } = taskData;

  const sql = `
    INSERT INTO tasks (
      title,
      description,
      status,
      task_type,
      priority,
      due_at,
      estimated_minutes,
      source,
      scheduled_start,
      scheduled_end
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(
    sql,
    [
      title,
      description,
      status,
      task_type,
      priority,
      due_at,
      estimated_minutes,
      source,
      scheduled_start,
      scheduled_end,
    ],
    function (err) {
      if (err) {
        callback(err);
        return;
      }

      callback(null, this.lastID);
    }
  );
}

function listTasks(callback) {
  db.all(
    "SELECT id, title, status, task_type, priority, due_at FROM tasks ORDER BY id ASC;",
    [],
    (queryErr, rows) => {
      if (queryErr) {
        callback(queryErr);
        return;
      }

      callback(null, rows);
    }
  );
}

function getTaskById(id, callback) {
  const sql = `SELECT * FROM tasks WHERE id = ?`;

  db.get(sql, [id], (err, row) => {
    if (err) {
      callback(err);
      return;
    }

    callback(null, row);
  });
}

function completeTask(id, actualMinutes, callback) {
  const sql = `
    UPDATE tasks
    SET status = 'done',
        actual_minutes = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.run(sql, [actualMinutes, id], function (err) {
    if (err) {
      callback(err);
      return;
    }

    callback(null, this.changes);
  });
}

// Returns tasks relevant for artifact sync:
// - not complete, due within past 3 days or future 7 days
// - OR recurring (regardless of due date) to prevent duplicate creation
function getTasksForArtifactSync(callback) {
  const sql = `
    SELECT *
    FROM tasks
    WHERE status NOT IN ('done', 'archived')
      AND (
        is_recurring = 1
        OR due_at IS NULL
        OR (
          due_at >= datetime('now', '-3 days')
          AND due_at <= datetime('now', '+7 days')
        )
      )
    ORDER BY due_at ASC, priority DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      callback(err);
      return;
    }

    callback(null, rows);
  });
}

function updateTaskStatus(id, status, callback) {
  const sql = `
    UPDATE tasks
    SET status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.run(sql, [status, id], function (err) {
    if (err) {
      callback(err);
      return;
    }

    callback(null, this.changes);
  });
}

// Patch arbitrary fields on a task (whitelist enforced)
const PATCHABLE_FIELDS = [
  "title", "description", "status", "task_type", "priority",
  "due_at", "estimated_minutes", "scheduled_start", "scheduled_end",
  "is_recurring", "recur_pattern", "calendar_event_id", "actual_minutes",
];

function patchTask(id, fields, callback) {
  const allowed = Object.keys(fields).filter((k) => PATCHABLE_FIELDS.includes(k));

  if (allowed.length === 0) {
    return callback(new Error("No valid fields to update"));
  }

  const setClauses = allowed.map((k) => `${k} = ?`).join(", ");
  const values = allowed.map((k) => fields[k]);

  const sql = `
    UPDATE tasks
    SET ${setClauses}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.run(sql, [...values, id], function (err) {
    if (err) {
      callback(err);
      return;
    }

    callback(null, this.changes);
  });
}

function archiveTask(id, callback) {
  const sql = `
    UPDATE tasks
    SET status = 'archived',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.run(sql, [id], function (err) {
    if (err) {
      callback(err);
      return;
    }

    callback(null, this.changes);
  });
}

module.exports = {
  createTaskV2,
  listTasks,
  getTaskById,
  getTasksForArtifactSync,
  completeTask,
  updateTaskStatus,
  patchTask,
  archiveTask,
};