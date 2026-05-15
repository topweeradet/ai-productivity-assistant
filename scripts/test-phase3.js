#!/usr/bin/env node
// Integration test for Phase 3 features.
// Requires PocketBase running at POCKETBASE_URL (default: http://localhost:8090).
// Does NOT require Telegram or ANTHROPIC_API_KEY.
//
// Usage: node scripts/test-phase3.js

require("dotenv").config();

const pb = require("../services/pocketbase/client");
const { buildContext, formatContextBlock } = require("../services/bot/context");

let passed = 0;
let failed = 0;
const cleanup = [];

function ok(label) {
  console.log(`  ✅ ${label}`);
  passed++;
}

function fail(label, err) {
  console.log(`  ❌ ${label}: ${err?.message || err}`);
  failed++;
}

async function test(label, fn) {
  process.stdout.write(`\n▶ ${label}\n`);
  try {
    await fn();
  } catch (err) {
    fail(label, err);
  }
}

async function main() {
  // ─── 3.1 Clarify Layer ──────────────────────────────────────────────────────

  await test("3.1 — create_project saves to projects collection", async () => {
    const p = await pb.projects.create({ title: "Test project [integration]", status: "backlog" });
    cleanup.push(() => pb.projects.remove(p.id));
    if (!p.id) throw new Error("no id returned");
    ok(`project created: ${p.id}`);
  });

  await test("3.1 — create_subtask links to a task", async () => {
    const task = await pb.tasks.create({ title: "Parent task [integration]", type: "task", status: "backlog" });
    cleanup.push(() => pb.tasks.remove(task.id));

    const sub = await pb.subtasks.create({ task: task.id, title: "Step 1 [integration]", status: "todo", order: 1 });
    cleanup.push(() => pb.subtasks.remove(sub.id));

    if (sub.task !== task.id) throw new Error(`task field mismatch: got ${sub.task}`);
    ok(`subtask created: ${sub.id}, linked to task ${task.id}`);
  });

  // ─── 3.2 ICE Scoring ────────────────────────────────────────────────────────

  await test("3.2 — ice_score persists on task", async () => {
    const impact = 8, confidence = 7, ease = 6;
    const ice_score = Math.round(((impact + confidence + ease) / 3) * 10) / 10;

    const task = await pb.tasks.create({
      title: "ICE test task [integration]",
      type: "task",
      status: "backlog",
      impact, confidence, ease, ice_score,
    });
    cleanup.push(() => pb.tasks.remove(task.id));

    if (task.ice_score !== ice_score) throw new Error(`expected ${ice_score}, got ${task.ice_score}`);
    ok(`ice_score = ${task.ice_score} saved correctly`);
  });

  await test("3.2 — context backlog sorted by ice_score desc", async () => {
    const t1 = await pb.tasks.create({ title: "Low ICE [integration]", type: "task", status: "backlog", ice_score: 3 });
    const t2 = await pb.tasks.create({ title: "High ICE [integration]", type: "task", status: "backlog", ice_score: 9 });
    cleanup.push(() => pb.tasks.remove(t1.id), () => pb.tasks.remove(t2.id));

    const ctx = await buildContext();
    const block = formatContextBlock(ctx);

    const hiIdx = block.indexOf("High ICE");
    const loIdx = block.indexOf("Low ICE");
    if (hiIdx === -1 || loIdx === -1) throw new Error("tasks not found in context block");
    if (hiIdx > loIdx) throw new Error("high-ICE task appears after low-ICE task");
    ok("high-ICE task appears before low-ICE task in context");
  });

  // ─── 3.3 Recurring Tasks ────────────────────────────────────────────────────

  await test("3.3 — recurring task saved with recurrence + next_due", async () => {
    const today = new Date().toISOString().split("T")[0];
    const task = await pb.tasks.create({
      title: "Daily standup [integration]",
      type: "recurring",
      status: "backlog",
      recurrence: "daily",
      next_due: today,
    });
    cleanup.push(() => pb.tasks.remove(task.id));

    if (task.type !== "recurring") throw new Error("type not recurring");
    if (!task.next_due) throw new Error("next_due missing");
    ok(`recurring task created, next_due: ${task.next_due}`);
  });

  await test("3.3 — recurring tasks due today appear in context", async () => {
    const today = new Date().toISOString().split("T")[0];
    const task = await pb.tasks.create({
      title: "Weekly review [integration]",
      type: "recurring",
      status: "backlog",
      recurrence: "weekly",
      next_due: today,
    });
    cleanup.push(() => pb.tasks.remove(task.id));

    const ctx = await buildContext();
    const found = ctx.recurringDue.some(t => t.id === task.id);
    if (!found) throw new Error("task not in recurringDue");
    ok("recurring task appears in context.recurringDue");
  });

  await test("3.3 — advance_recurring pushes next_due forward (weekly)", async () => {
    const today = new Date().toISOString().split("T")[0];
    const task = await pb.tasks.create({
      title: "Recurring advance test [integration]",
      type: "recurring",
      status: "backlog",
      recurrence: "weekly",
      next_due: today,
    });
    cleanup.push(() => pb.tasks.remove(task.id));

    const fetched = await pb.tasks.get(task.id);
    const d = new Date(fetched.next_due);
    d.setDate(d.getDate() + 7);
    const next = d.toISOString().split("T")[0];
    await pb.tasks.update(task.id, { next_due: next, status: "backlog" });

    const updated = await pb.tasks.get(task.id);
    if (updated.next_due <= today) throw new Error(`next_due not advanced: ${updated.next_due}`);
    ok(`next_due advanced to ${updated.next_due}`);
  });

  // ─── 3.4 Activity Logging ───────────────────────────────────────────────────

  await test("3.4 — activity_log entry created with correct fields", async () => {
    const today = new Date().toISOString().split("T")[0];
    const task = await pb.tasks.create({ title: "Activity log test task [integration]", type: "task", status: "backlog" });
    cleanup.push(() => pb.tasks.remove(task.id));

    const log = await pb.activity_log.create({
      date: today,
      task: task.id,
      action: "completed",
      note: "Integration test log entry",
    });
    if (log.action !== "completed") throw new Error(`action field mismatch: got ${log.action}`);
    if (log.date.slice(0, 10) !== today) throw new Error(`date mismatch: got ${log.date}`);
    ok(`activity_log entry created: ${log.id}, action=${log.action}`);
  });

  await test("3.4 — today's activity log appears in context block", async () => {
    const today = new Date().toISOString().split("T")[0];
    const task = await pb.tasks.create({ title: "Context log test [integration]", type: "task", status: "backlog" });
    cleanup.push(() => pb.tasks.remove(task.id));

    await pb.activity_log.create({ date: today, task: task.id, action: "started", note: "context test" });

    const ctx = await buildContext();
    const block = formatContextBlock(ctx);
    if (!block.includes("Today's Activity Log")) throw new Error("activity log section missing from context");
    if (!block.includes("started")) throw new Error("activity log entry not in context");
    ok("today's activity log appears in context block");
  });

  // ─── Cleanup & Summary ──────────────────────────────────────────────────────

  console.log("\n⏳ Cleaning up test records...");
  for (const fn of cleanup.reverse()) {
    try { await fn(); } catch (_) {}
  }

  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\nFatal:", err.message);
  process.exit(1);
});
