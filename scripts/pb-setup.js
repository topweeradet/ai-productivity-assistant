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
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} → ${JSON.stringify(data)}`);
  return data;
}

async function getAdminToken() {
  const data = await request("POST", "/api/admins/auth-with-password", {
    identity: process.env.PB_ADMIN_EMAIL,
    password: process.env.PB_ADMIN_PASSWORD,
  });
  return data.token;
}

async function createCollection(schema, token) {
  try {
    const result = await request("POST", "/api/collections", schema, token);
    console.log(`✓ Created collection: ${schema.name} (${result.id})`);
    return result;
  } catch (err) {
    if (err.message.includes("already exists")) {
      console.log(`⚠ Collection already exists: ${schema.name} — skipping`);
      const list = await request("GET", `/api/collections/${schema.name}`, null, token);
      return list;
    }
    throw err;
  }
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
  const goals = await createCollection(
    {
      name: "goals",
      type: "base",
      schema: [
        { name: "title", type: "text", required: true },
        {
          name: "type",
          type: "select",
          required: true,
          options: { values: ["long-term", "short-term"] },
        },
        { name: "measure", type: "text" },
        { name: "deadline", type: "date" },
        {
          name: "status",
          type: "select",
          required: true,
          options: { values: ["active", "paused", "done"] },
        },
        { name: "deleted", type: "bool", required: true },
      ],
    },
    token
  );

  // 2. projects — depends on goals
  const projects = await createCollection(
    {
      name: "projects",
      type: "base",
      schema: [
        {
          name: "goal",
          type: "relation",
          options: { collectionId: goals.id, cascadeDelete: false, maxSelect: 1 },
        },
        { name: "title", type: "text", required: true },
        {
          name: "status",
          type: "select",
          required: true,
          options: { values: ["active", "done", "dropped"] },
        },
        { name: "due_date", type: "date" },
        { name: "deleted", type: "bool", required: true },
      ],
    },
    token
  );

  // 3. tasks — depends on goals + projects
  const tasks = await createCollection(
    {
      name: "tasks",
      type: "base",
      schema: [
        {
          name: "project",
          type: "relation",
          options: { collectionId: projects.id, cascadeDelete: false, maxSelect: 1 },
        },
        {
          name: "goal",
          type: "relation",
          options: { collectionId: goals.id, cascadeDelete: false, maxSelect: 1 },
        },
        { name: "title", type: "text", required: true },
        {
          name: "type",
          type: "select",
          required: true,
          options: { values: ["task", "recurring", "idea"] },
        },
        {
          name: "status",
          type: "select",
          required: true,
          options: { values: ["backlog", "today", "done", "dropped"] },
        },
        { name: "impact", type: "number" },
        { name: "confidence", type: "number" },
        { name: "ease", type: "number" },
        { name: "ice_score", type: "number" },
        { name: "due_date", type: "date" },
        {
          name: "recurrence",
          type: "select",
          options: { values: ["daily", "weekly", "monthly", "none"] },
        },
        { name: "next_due", type: "date" },
        { name: "deleted", type: "bool", required: true },
      ],
    },
    token
  );

  // 4. subtasks — depends on tasks
  await createCollection(
    {
      name: "subtasks",
      type: "base",
      schema: [
        {
          name: "task",
          type: "relation",
          required: true,
          options: { collectionId: tasks.id, cascadeDelete: false, maxSelect: 1 },
        },
        { name: "title", type: "text", required: true },
        {
          name: "status",
          type: "select",
          required: true,
          options: { values: ["todo", "done"] },
        },
        { name: "order", type: "number" },
        { name: "deleted", type: "bool", required: true },
      ],
    },
    token
  );

  // 5. daily_plans — depends on tasks
  await createCollection(
    {
      name: "daily_plans",
      type: "base",
      schema: [
        { name: "date", type: "date", required: true },
        {
          name: "task",
          type: "relation",
          required: true,
          options: { collectionId: tasks.id, cascadeDelete: false, maxSelect: 1 },
        },
        { name: "priority", type: "number", required: true },
        { name: "note", type: "text" },
      ],
    },
    token
  );

  // 6. activity_log — depends on tasks (never soft-deleted)
  await createCollection(
    {
      name: "activity_log",
      type: "base",
      schema: [
        { name: "date", type: "date", required: true },
        {
          name: "task",
          type: "relation",
          required: true,
          options: { collectionId: tasks.id, cascadeDelete: false, maxSelect: 1 },
        },
        {
          name: "action",
          type: "select",
          required: true,
          options: { values: ["started", "completed", "blocked", "deferred", "dropped"] },
        },
        { name: "completed_at", type: "date" },
        { name: "block_reason", type: "text" },
        { name: "note", type: "text" },
      ],
    },
    token
  );

  console.log("\nAll 6 collections ready. PocketBase is set up for Phase 1.");
}

main().catch((err) => {
  console.error("\nSetup failed:", err.message);
  process.exit(1);
});
