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

function listTasks(callback) {
  db.all("SELECT * FROM tasks ORDER BY id ASC;", [], (queryErr, rows) => {
    if (queryErr) {
      callback(queryErr);
      return;
    }

    callback(null, rows);
  });
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

function completeTask(id, callback) {
  updateTaskStatus(id, "done", callback);
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
  listTasks,
  getTaskById,
  completeTask,
  updateTaskStatus,
};