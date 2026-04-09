const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const dbPath = path.resolve(__dirname, "../../db/app.db");
const schemaPath = path.resolve(__dirname, "../../db/schema.sql");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Failed to connect to database:", err.message);
    return;
  }

  console.log("Connected to SQLite database");
});

const MIGRATIONS = [
  `ALTER TABLE tasks ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tasks ADD COLUMN recur_pattern TEXT`,
];

function runMigrations(callback) {
  let pending = MIGRATIONS.length;
  if (pending === 0) return callback(null);

  MIGRATIONS.forEach((sql) => {
    db.run(sql, (err) => {
      // "duplicate column" means migration already applied — safe to ignore
      if (err && !err.message.includes("duplicate column")) {
        return callback(err);
      }
      pending--;
      if (pending === 0) callback(null);
    });
  });
}

function initializeDatabase(callback) {
  fs.readFile(schemaPath, "utf8", (readErr, schemaSql) => {
    if (readErr) {
      callback(readErr);
      return;
    }

    db.exec(schemaSql, (execErr) => {
      if (execErr) {
        callback(execErr);
        return;
      }

      runMigrations(callback);
    });
  });
}


module.exports = {
  db,
  initializeDatabase,
};