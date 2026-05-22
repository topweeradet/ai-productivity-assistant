const pb = require("../pocketbase/client");

function todayISO() {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

// Returns structured context to feed into the LLM system prompt.
// All PocketBase fetches are parallelised to minimise latency.
async function buildContext() {
  const today = todayISO();

  const [goalsRes, tasksRes, activityRes] = await Promise.all([
    pb.goals.list(),
    pb.tasks.list(),
    pb.activity_log.list(`date>="${today}"`),
  ]);

  const goals = (goalsRes.items ?? []).filter(g => g.status === "active" && !g.deleted);
  const allTasks = (tasksRes.items ?? []).filter(t => !t.deleted);
  const todayActivity = activityRes.items ?? [];

  const projects = allTasks.filter(
    t => t.type === "project" && t.status !== "done" && t.status !== "dropped"
  );

  const backlog = allTasks
    .filter(t => t.status === "backlog" && t.type !== "project")
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
    t.type === "recurring" && t.next_due && t.next_due.slice(0, 10) <= today
  );

  return { today, goals, projects, backlog, todayTasks, upcoming, recurringDue, todayActivity };
}

// Serialises context into a plain-text block to append to the system prompt.
function formatContextBlock(ctx) {
  const lines = [`Today is ${ctx.today}.`];

  const projectById = Object.fromEntries(ctx.projects.map(p => [p.id, p.title]));
  const parentTag = (t) => {
    if (!t.parent) return "";
    const title = projectById[t.parent];
    return title ? ` 〈${title.slice(0, 10).trimEnd()}〉` : "";
  };

  if (ctx.goals.length) {
    lines.push("\n## Active Goals");
    ctx.goals.forEach((g) => lines.push(`- [${g.id}] ${g.title} (${g.type})`));
  }

  if (ctx.projects.length) {
    lines.push("\n## Active Projects");
    ctx.projects.forEach((p) => {
      const subtaskCount = ctx.backlog.filter(t => t.parent === p.id).length
        + ctx.todayTasks.filter(t => t.parent === p.id).length;
      lines.push(`- [${p.id}] ${p.title} (${subtaskCount} subtask${subtaskCount !== 1 ? "s" : ""})`);
    });
  }

  const formatDate = (iso) => {
    const [, m, d] = iso.slice(0, 10).split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[+m - 1]} ${+d}`;
  };

  const taskLine = (t, showDue = true) => {
    const due = showDue && t.due_date ? ` — due ${formatDate(t.due_date)}` : "";
    return `- [${t.id}] ${t.title} (ice: ${t.ice_score ?? "?"})${parentTag(t)}${due}`;
  };

  const addDays = (base, n) => {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
  };

  const tomorrow = addDays(ctx.today, 1);
  const weekEnd  = addDays(ctx.today, 8);

  const allActive = [...ctx.todayTasks, ...ctx.backlog];

  const todayBucket = allActive.filter(t =>
    t.status === "today" ||
    (t.due_date && t.due_date.slice(0, 10) === ctx.today)
  );
  const thisWeekBucket = allActive.filter(t =>
    t.status !== "today" &&
    t.due_date &&
    t.due_date.slice(0, 10) >= tomorrow &&
    t.due_date.slice(0, 10) <= weekEnd
  );
  const laterBucket = allActive.filter(t =>
    t.status !== "today" &&
    t.due_date &&
    t.due_date.slice(0, 10) > weekEnd
  );
  const backlogBucket = allActive.filter(t =>
    t.status !== "today" && !t.due_date
  );

  if (todayBucket.length) {
    lines.push("\n## TODAY");
    todayBucket.forEach(t => lines.push(taskLine(t)));
  }

  if (thisWeekBucket.length) {
    lines.push("\n## THIS WEEK");
    thisWeekBucket.forEach(t => lines.push(taskLine(t)));
  }

  if (laterBucket.length) {
    lines.push("\n## LATER");
    laterBucket.forEach(t => lines.push(taskLine(t)));
  }

  if (backlogBucket.length) {
    lines.push("\n## BACKLOG (no date)");
    backlogBucket.slice(0, 10).forEach(t => lines.push(taskLine(t, false)));
  }

  if (ctx.recurringDue.length) {
    lines.push("\n## Recurring Tasks Due Today");
    ctx.recurringDue.forEach((t) => lines.push(`- [${t.id}] ${t.title}`));
  }

  if (ctx.todayActivity.length) {
    lines.push("\n## Today's Activity Log");
    ctx.todayActivity.forEach((a) =>
      lines.push(`- [${a.task}] ${a.action}${a.note ? ": " + a.note : ""}`)
    );
  }

  return lines.join("\n");
}

module.exports = { buildContext, formatContextBlock, todayISO };
