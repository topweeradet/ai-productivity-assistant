const { db } = require("./db");

function createTask(title, description, status, priority, dueAt, callback) {
  const sql = `
    INSERT INTO tasks (title, description, status, priority, due_at)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(sql, [title, description, status, priority, dueAt], function (insertErr) {
    if (insertErr) {
      callback(insertErr);
      return;
    }

    callback(null, this.lastID);
  });
}

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

module.exports = {
  createTask,
  createTaskV2,
  listTasks,
  getTaskById,
  completeTask,
  updateTaskStatus,
};