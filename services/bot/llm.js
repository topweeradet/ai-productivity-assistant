const Anthropic = require("@anthropic-ai/sdk");
const pb = require("../pocketbase/client");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const LLM_TIMEOUT_MS = 30_000;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// In-memory conversation history: chatId -> { messages: [], lastAt: timestamp }
const sessions = new Map();

function getSession(chatId) {
  const now = Date.now();
  const existing = sessions.get(chatId);
  if (existing && now - existing.lastAt < SESSION_TTL_MS) {
    existing.lastAt = now;
    return existing;
  }
  const session = { messages: [], lastAt: now };
  sessions.set(chatId, session);
  return session;
}

function clearSession(chatId) {
  sessions.delete(chatId);
}

const CORE_SYSTEM_PROMPT = `You are a personal productivity assistant embedded in Telegram. You help the user capture, clarify, and prioritize tasks so they always know what to do next.

## Classification Rules (apply during /dump and /plan)

Classify every item the user mentions as exactly one of:
- **Task** — single, completable action (save with type_field="task")
- **Project** — multi-step outcome (save with type_field="project" and a _temp_key, then list each step as a create_task with parent_id pointing to that key)
- **Goal** — a longer-horizon aspiration (save via create_goal, type="short-term" or "long-term")
- **Idea** — not actionable yet (save with type_field="idea", status="backlog")
- **Recurring** — happens on a schedule (save with type_field="recurring", set recurrence + next_due)

For Projects, always emit one create_task (type_field="project", _temp_key="p1") followed by create_task actions for each step (parent_id="p1", type_field="task").

## Commands

**/dump** Brain dump
- Open with "What's on your mind? Tell me everything."
- After the user shares, prompt for more: yesterday's carryover? meetings? unanswered messages?
- Repeat until they're empty, then pass to /plan
- Never label your steps or phases in the reply — just talk naturally.

**/plan [date]** Clarify + prioritize
1. Classify each item using the rules above
2. ICE score every Task/Project: ask or infer Impact (1-10), Confidence (1-10), Ease (1-10)
3. ice_score = round((impact + confidence + ease) / 3, 1)
4. Flag tasks with no goal alignment → ask "worth your time?"
5. Output: top 3 tasks sorted by ice_score + goal alignment, with reason

**/add** Mid-day task
1. Clarify → classify → ICE score → compare to today's top 3
2. Recommend: do today / backlog / drop
3. Save to PocketBase

**/recap** End of day
1. What's done? What's blocked?
2. Log each status change via create_activity_log (status: started/completed/blocked/deferred)
3. Move incomplete → backlog
4. Note patterns from today's activity log → preview tomorrow's top 3

**/goals** Show active goals → update if needed

**/overview** Show backlog by week, flag due ≤3 days, recurring, no-date

**/teach** Save a custom skill or preference
1. Ask what behaviour the user wants to add
2. Save it via create_skill action
3. Confirm it's saved and will apply from now on

## Recurring Task Rules
- When a task has language like "every day/week/Monday/morning/Friday", classify as Recurring
- Set recurrence to one of: "daily", "weekly", "monthly", or a day name like "monday"
- Set next_due to the next occurrence date (YYYY-MM-DD)
- When a recurring task is marked completed, always emit an advance_recurring action to push next_due forward

## Rules
- Max 3 tasks/day in status="today"
- Clarify before prioritizing
- Never guess dates — ask
- Question tasks not tied to any goal
- When unsure → ask, never invent
- When displaying due dates, copy them exactly as they appear in the context (e.g. "Sun, 24 May"). Never recompute or alter the day name.

## Response Format
ALWAYS respond with valid JSON only. No markdown, no prose outside JSON.

{
  "reply": "the message to send to the user (markdown ok)",
  "actions": [
    { "type": "create_task", "title": "...", "status": "backlog", "type_field": "task", "impact": 7, "confidence": 8, "ease": 6, "due_date": "2026-05-20", "goal_id": "..." },
    { "type": "create_task", "title": "Big project name", "type_field": "project", "_temp_key": "p1", "status": "backlog", "goal_id": "..." },
    { "type": "create_task", "title": "Step 1", "type_field": "task", "parent_id": "p1", "order": 1 },
    { "type": "update_task", "id": "...", "status": "done" },
    { "type": "create_goal", "title": "...", "type": "short-term", "status": "active", "measure": "...", "deadline": "2026-06-01" },
    { "type": "create_daily_plan", "task_id": "...", "date": "2026-05-16", "priority": 1 },
    { "type": "create_activity_log", "task_id": "...", "status": "completed", "note": "..." },
    { "type": "advance_recurring", "id": "...", "recurrence": "weekly" },
    { "type": "create_skill", "name": "...", "description": "..." }
  ]
}

actions array may be empty. Omit fields you don't have values for.
For create_task with type_field="recurring", always include recurrence and next_due fields.`;

async function buildSystemPrompt() {
  try {
    const res = await pb.skills.list();
    const customSkills = (res.items ?? []).filter(s => !s.deleted);
    if (!customSkills.length) return CORE_SYSTEM_PROMPT;
    const skillsBlock = customSkills.map(s => `- **${s.name}**: ${s.description}`).join("\n");
    return `${CORE_SYSTEM_PROMPT}\n\n## Custom Skills (taught by the user)\n${skillsBlock}`;
  } catch {
    return CORE_SYSTEM_PROMPT;
  }
}

function advanceNextDue(current, recurrence) {
  const d = new Date(current || new Date());
  switch ((recurrence || "").toLowerCase()) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    default: {
      const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const target = days.indexOf(recurrence.toLowerCase());
      if (target !== -1) {
        d.setDate(d.getDate() + 1);
        while (d.getDay() !== target) d.setDate(d.getDate() + 1);
      } else {
        d.setDate(d.getDate() + 7);
      }
    }
  }
  return d.toISOString().split("T")[0];
}

async function executeActions(actions) {
  const taskIdMap = {};

  for (const action of actions) {
    try {
      if (action.type === "create_task") {
        const { impact, confidence, ease } = action;
        const ice_score =
          action.ice_score ??
          (impact != null && confidence != null && ease != null
            ? Math.round(((impact + confidence + ease) / 3) * 10) / 10
            : undefined);

        const parentId = action.parent_id
          ? (taskIdMap[action.parent_id] ?? action.parent_id)
          : undefined;

        const task = await pb.tasks.create({
          title: action.title,
          type: action.type_field || "task",
          status: action.status || "backlog",
          parent: parentId,
          order: action.order,
          impact,
          confidence,
          ease,
          ice_score,
          due_date: action.due_date,
          recurrence: action.recurrence,
          next_due: action.next_due,
          goal: action.goal_id,
        });

        if (action._temp_key) taskIdMap[action._temp_key] = task.id;

      } else if (action.type === "update_task") {
        const { type: _t, id, ...fields } = action;
        await pb.tasks.update(id, fields);

      } else if (action.type === "create_goal") {
        await pb.goals.create({
          title: action.title,
          type: action.type || "short-term",
          status: action.status || "active",
          measure: action.measure,
          deadline: action.deadline,
        });

      } else if (action.type === "create_daily_plan") {
        await pb.daily_plans.create({
          date: action.date,
          task: action.task_id,
          priority: action.priority,
          note: action.note,
        });

      } else if (action.type === "create_activity_log") {
        await pb.activity_log.create({
          date: new Date().toISOString().split("T")[0],
          task: action.task_id,
          action: action.status, // LLM sends "status" field; schema field is "action"
          note: action.note,
        });

      } else if (action.type === "advance_recurring") {
        const task = await pb.tasks.get(action.id);
        const next = advanceNextDue(task.next_due, action.recurrence || task.recurrence);
        await pb.tasks.update(action.id, { next_due: next, status: "backlog" });

      } else if (action.type === "create_skill") {
        await pb.skills.create({
          name: action.name,
          description: action.description,
        });
      }
    } catch (err) {
      console.error(`Action failed (${action.type}):`, err.message);
    }
  }
}

async function chat(command, userMessage, context, chatId) {
  const session = getSession(chatId);
  const systemPrompt = await buildSystemPrompt();

  const userContent = `Command: ${command}\n\nContext:\n${context}\n\nUser message: ${userMessage || "(none)"}`;
  session.messages.push({ role: "user", content: userContent });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  let raw;
  try {
    const response = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: session.messages,
      },
      { signal: controller.signal }
    );
    raw = response.content[0].text.trim();
  } finally {
    clearTimeout(timeout);
  }

  session.messages.push({ role: "assistant", content: raw });

  // Cap history at 20 turns to avoid unbounded growth
  if (session.messages.length > 40) {
    session.messages = session.messages.slice(-40);
  }

  let parsed;
  try {
    const jsonStr = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    try {
      parsed = match ? JSON.parse(match[0]) : null;
    } catch {
      parsed = null;
    }
    if (!parsed) return { reply: raw, actions: [] };
  }

  if (parsed.actions?.length) {
    await executeActions(parsed.actions);
  }

  // Clear session after /recap — the day is done
  if (command === "/recap") {
    clearSession(chatId);
  }

  return parsed;
}

module.exports = { chat, clearSession };
