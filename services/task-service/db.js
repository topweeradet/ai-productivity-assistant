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

      callback(null);
    });
  });
}


module.exports = {
  db,
  initializeDatabase,
};