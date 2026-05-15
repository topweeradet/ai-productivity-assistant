#!/usr/bin/env node
// Creates all 6 PocketBase collections per SCHEMA.md.
// Run once after PocketBase first starts:
//   PB_ADMIN_EMAIL=admin@example.com PB_ADMIN_PASSWORD=yourpass node scripts/pb-setup.js

const BASE_URL = process.env.POCKETBASE_URL || "http://localhost:8090";

async function request(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = token;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} → ${JSON.stringify(data)}`);
  return data;
}

async function getAdminToken() {
  const data = await request("POST", "/api/collections/_superusers/auth-with-password", {
    identity: process.env.PB_ADMIN_EMAIL,
    password: process.env.PB_ADMIN_PASSWORD,
  });
  return data.token;
}

const OPEN_RULES = { listRule: "", viewRule: "", createRule: "", updateRule: "", deleteRule: "" };

async function upsertCollection(schema, token) {
  let existing = null;
  try {
    existing = await request("GET", `/api/collections/${schema.name}`, null, token);
  } catch (_) {}

  if (existing) {
    const result = await request("PATCH", `/api/collections/${existing.id}`, { ...schema, ...OPEN_RULES }, token);
    console.log(`✓ Updated collection: ${schema.name}`);
    return result;
  }

  const result = await request("POST", "/api/collections", { ...schema, ...OPEN_RULES }, token);
  console.log(`✓ Created collection: ${schema.name} (${result.id})`);
  return result;
}

async function main() {
  if (!process.env.PB_ADMIN_EMAIL || !process.env.PB_ADMIN_PASSWORD) {
    console.error("Set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD environment variables");
    process.exit(1);
  }

  console.log(`Connecting to PocketBase at ${BASE_URL}...`);
  const token = await getAdminToken();
  console.log("Authenticated as admin\n");

  // 1. goals — no dependencies
  const goals = await upsertCollection(
    {
      name: "goals",
      type: "base",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "type", type: "select", required: true, values: ["long-term", "short-term"], maxSelect: 1 },
        { name: "measure", type: "text" },
        { name: "deadline", type: "date" },
        { name: "status", type: "select", required: true, values: ["active", "paused", "done"], maxSelect: 1 },
        { name: "deleted", type: "bool" },
      ],
    },
    token
  );

  // 2. projects — depends on goals
  const projects = await upsertCollection(
    {
      name: "projects",
      type: "base",
      fields: [
        { name: "goal", type: "relation", collectionId: goals.id, cascadeDelete: false, maxSelect: 1 },
        { name: "title", type: "text", required: true },
        { name: "status", type: "select", required: true, values: ["backlog", "active", "done", "dropped"], maxSelect: 1 },
        { name: "due_date", type: "date" },
        { name: "deleted", type: "bool" },
      ],
    },
    token
  );

  // 3. tasks — depends on goals + projects
  const tasks = await upsertCollection(
    {
      name: "tasks",
      type: "base",
      fields: [
        { name: "project", type: "relation", collectionId: projects.id, cascadeDelete: false, maxSelect: 1 },
        { name: "goal", type: "relation", collectionId: goals.id, cascadeDelete: false, maxSelect: 1 },
        { name: "title", type: "text", required: true },
        { name: "type", type: "select", required: true, values: ["task", "recurring", "idea"], maxSelect: 1 },
        { name: "status", type: "select", required: true, values: ["backlog", "today", "done", "dropped"], maxSelect: 1 },
        { name: "impact", type: "number" },
        { name: "confidence", type: "number" },
        { name: "ease", type: "number" },
        { name: "ice_score", type: "number" },
        { name: "due_date", type: "date" },
        { name: "recurrence", type: "select", values: ["daily", "weekly", "monthly", "none"], maxSelect: 1 },
        { name: "next_due", type: "date" },
        { name: "deleted", type: "bool" },
      ],
    },
    token
  );

  // 4. subtasks — depends on tasks
  await upsertCollection(
    {
      name: "subtasks",
      type: "base",
      fields: [
        { name: "task", type: "relation", required: true, collectionId: tasks.id, cascadeDelete: false, maxSelect: 1 },
        { name: "title", type: "text", required: true },
        { name: "status", type: "select", required: true, values: ["todo", "done"], maxSelect: 1 },
        { name: "order", type: "number" },
        { name: "deleted", type: "bool" },
      ],
    },
    token
  );

  // 5. daily_plans — depends on tasks
  await upsertCollection(
    {
      name: "daily_plans",
      type: "base",
      fields: [
        { name: "date", type: "date", required: true },
        { name: "task", type: "relation", required: true, collectionId: tasks.id, cascadeDelete: false, maxSelect: 1 },
        { name: "priority", type: "number", required: true },
        { name: "note", type: "text" },
      ],
    },
    token
  );

  // 6. activity_log — depends on tasks (never soft-deleted)
  await upsertCollection(
    {
      name: "activity_log",
      type: "base",
      fields: [
        { name: "date", type: "date", required: true },
        { name: "task", type: "relation", required: true, collectionId: tasks.id, cascadeDelete: false, maxSelect: 1 },
        { name: "action", type: "select", required: true, values: ["started", "completed", "blocked", "deferred", "dropped"], maxSelect: 1 },
        { name: "completed_at", type: "date" },
        { name: "block_reason", type: "text" },
        { name: "note", type: "text" },
      ],
    },
    token
  );

  // 7. skills — user-defined custom instructions added via /teach
  await upsertCollection(
    {
      name: "skills",
      type: "base",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "description", type: "text", required: true },
        { name: "deleted", type: "bool" },
      ],
    },
    token
  );

  console.log("\nAll 7 collections ready. PocketBase is set up.");
}

main().catch((err) => {
  console.error("\nSetup failed:", err.message);
  process.exit(1);
});
