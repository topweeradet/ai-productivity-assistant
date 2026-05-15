// Builds the LLM prompt context for each conversation turn.
// Injects today's date (fixes the "Claude doesn't know the date" problem) and
// fetches live goals + backlog from PocketBase for Phase 2 context building.

const pb = require("../pocketbase/client");

function todayISO() {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

// Returns structured context to feed into the LLM system prompt.
// All PocketBase fetches are parallelised to minimise latency.
async function buildContext() {
  const today = todayISO();

  const [goalsRes, tasksRes] = await Promise.all([
    pb.goals.list(),
    pb.tasks.list(),
  ]);

  const goals = (goalsRes.items ?? []).filter(g => g.status === "active" && !g.deleted);
  const allTasks = (tasksRes.items ?? []).filter(t => !t.deleted);

  const backlog = allTasks
    .filter(t => t.status === "backlog")
    .sort((a, b) => (b.ice_score ?? 0) - (a.ice_score ?? 0));

  const todayTasks = allTasks
    .filter(t => t.status === "today")
    .sort((a, b) => (b.ice_score ?? 0) - (a.ice_score ?? 0));

  const upcoming = allTasks.filter(t => {
    if (!t.due_date || t.status === "done" || t.status === "dropped") return false;
    const future = new Date(today);
    future.setDate(future.getDate() + 3);
    return t.due_date >= today && t.due_date <= future.toISOString().split("T")[0];
  });

  const recurringDue = allTasks.filter(t =>
    t.type === "recurring" && t.next_due && t.next_due <= today
  );

  return { today, goals, backlog, todayTasks, upcoming, recurringDue };
}

// Serialises context into a plain-text block to append to the system prompt.
function formatContextBlock(ctx) {
  const lines = [`Today is ${ctx.today}.`];

  if (ctx.goals.length) {
    lines.push("\n## Active Goals");
    ctx.goals.forEach((g) => lines.push(`- [${g.id}] ${g.title} (${g.type})`));
  }

  if (ctx.todayTasks.length) {
    lines.push("\n## Today's Tasks");
    ctx.todayTasks.forEach((t) => lines.push(`- [${t.id}] ${t.title} (ice: ${t.ice_score ?? "?"})`));
  }

  if (ctx.backlog.length) {
    lines.push("\n## Backlog (top by ICE score)");
    ctx.backlog.slice(0, 10).forEach((t) =>
      lines.push(`- [${t.id}] ${t.title} (ice: ${t.ice_score ?? "?"})`)
    );
  }

  if (ctx.upcoming.length) {
    lines.push("\n## Upcoming Deadlines");
    ctx.upcoming.forEach((t) => lines.push(`- [${t.id}] ${t.title} due ${t.due_date}`));
  }

  if (ctx.recurringDue.length) {
    lines.push("\n## Recurring Tasks Due Today");
    ctx.recurringDue.forEach((t) => lines.push(`- [${t.id}] ${t.title}`));
  }

  return lines.join("\n");
}

module.exports = { buildContext, formatContextBlock, todayISO };
