#!/usr/bin/env node
// One-time migration: flatten `projects` and `subtasks` into `tasks`.
//
// What it does:
//   1. Copy each `projects` record → `tasks` (type="project"), preserving its ID
//   2. For each `tasks` record with a `project` field → set `parent` to that project ID
//   3. Copy each `subtasks` record → `tasks` (type="task", parent=subtask.task)
//
// Run AFTER pb-setup.js has added the `parent` field to tasks:
//   PB_ADMIN_EMAIL=admin@example.com PB_ADMIN_PASSWORD=yourpass node scripts/migrate-flatten.js
//
// The old `projects` and `subtasks` collections are NOT deleted — verify first, then drop manually.

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

async function listAll(collection, token, filter = "") {
  const qs = filter ? `?perPage=500&filter=${encodeURIComponent(filter)}` : "?perPage=500";
  const data = await request("GET", `/api/collections/${collection}/records${qs}`, null, token);
  return data.items ?? [];
}

async function main() {
  if (!process.env.PB_ADMIN_EMAIL || !process.env.PB_ADMIN_PASSWORD) {
    console.error("Set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD environment variables");
    process.exit(1);
  }

  console.log(`Connecting to PocketBase at ${BASE_URL}...`);
  const token = await getAdminToken();
  console.log("Authenticated as admin\n");

  let migrated = 0;
  let errors = 0;

  // Step 1: Copy projects → tasks (type="project")
  console.log("Step 1: Migrating projects → tasks...");
  const projects = await listAll("projects", token);
  console.log(`  Found ${projects.length} project(s)`);

  for (const p of projects) {
    try {
      await request("POST", "/api/collections/tasks/records", {
        id: p.id,
        title: p.title,
        type: "project",
        status: p.status === "active" ? "backlog" : (p.status || "backlog"),
        goal: p.goal || null,
        due_date: p.due_date || null,
        deleted: p.deleted ?? false,
      }, token);
      console.log(`  ✓ Project → task: "${p.title}" (${p.id})`);
      migrated++;
    } catch (err) {
      if (err.message.includes("already exists") || err.message.includes("unique")) {
        console.log(`  ~ Skipped (already exists): "${p.title}" (${p.id})`);
      } else {
        console.error(`  ✗ Failed: "${p.title}" — ${err.message}`);
        errors++;
      }
    }
  }

  // Step 2: Update existing tasks that had a `project` field → set `parent`
  console.log("\nStep 2: Linking existing tasks to their project parent...");
  const allTasks = await listAll("tasks", token);
  const tasksWithProject = allTasks.filter(t => t.project);
  console.log(`  Found ${tasksWithProject.length} task(s) with a project field`);

  for (const t of tasksWithProject) {
    try {
      await request("PATCH", `/api/collections/tasks/records/${t.id}`, { parent: t.project }, token);
      console.log(`  ✓ Task "${t.title}" → parent ${t.project}`);
      migrated++;
    } catch (err) {
      console.error(`  ✗ Failed: "${t.title}" — ${err.message}`);
      errors++;
    }
  }

  // Step 3: Copy subtasks → tasks (type="task", parent=subtask.task)
  console.log("\nStep 3: Migrating subtasks → tasks...");
  const subtasks = await listAll("subtasks", token);
  console.log(`  Found ${subtasks.length} subtask(s)`);

  for (const s of subtasks) {
    try {
      await request("POST", "/api/collections/tasks/records", {
        title: s.title,
        type: "task",
        status: s.status === "done" ? "done" : "backlog",
        parent: s.task,
        order: s.order ?? 0,
        deleted: s.deleted ?? false,
      }, token);
      console.log(`  ✓ Subtask → task: "${s.title}" (parent: ${s.task})`);
      migrated++;
    } catch (err) {
      console.error(`  ✗ Failed: "${s.title}" — ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone. ${migrated} migrated, ${errors} error(s).`);
  if (errors > 0) {
    console.log("Fix errors above before dropping old collections.");
    process.exit(1);
  } else {
    console.log("Migration successful. You can now drop the `projects` and `subtasks` collections from the PocketBase admin UI.");
  }
}

main().catch((err) => {
  console.error("\nMigration failed:", err.message);
  process.exit(1);
});
