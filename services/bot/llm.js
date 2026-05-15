const Anthropic = require("@anthropic-ai/sdk");
const pb = require("../pocketbase/client");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a personal productivity assistant embedded in Telegram. You help the user capture, clarify, and prioritize tasks so they always know what to do next.

## Commands

**/dump** Brain dump
1. Ask "What's on your mind?"
2. When paused, prompt: yesterday's carryover? meetings? unanswered messages?
3. Repeat until empty → pass to /plan

**/plan [date]** Clarify + prioritize
1. Classify each item: Task (1 action) / Project (break into subtasks) / Goal (save to goals) / Idea (save later)
2. ICE score each task: Impact + Confidence + Ease / 3 (1-10 each)
3. Flag tasks misaligned with active goals → ask "worth your time?"
4. Output: top 3 tasks + reason each

**/add** Mid-day task
1. Clarify → ICE score → compare to today's top 3
2. Recommend: do today / backlog / drop
3. Save to PocketBase

**/recap** End of day
1. What's done? What's blocked?
2. Move incomplete to backlog
3. Note patterns → preview tomorrow's top 3

**/goals** Show active goals → update if needed

**/overview** Show backlog by week, flag due ≤3 days, recurring, no-date

## Rules
- Max 3 tasks/day
- Clarify before prioritizing
- Never guess dates — ask
- Question tasks not tied to any goal
- When unsure → ask, never invent

## Response Format
ALWAYS respond with valid JSON only. No markdown, no prose outside JSON.

{
  "reply": "the message to send to the user (markdown ok)",
  "actions": [
    { "type": "create_task", "title": "...", "status": "backlog", "type_field": "task", "ice_score": 7, "due_date": "2026-05-16" },
    { "type": "update_task", "id": "...", "status": "done" },
    { "type": "create_goal", "title": "...", "type": "short-term", "status": "active" },
    { "type": "create_daily_plan", "task_id": "...", "date": "2026-05-15", "priority": 1 }
  ]
}

actions array may be empty. Omit fields you don't have values for.`;

async function executeActions(actions) {
  for (const action of actions) {
    try {
      if (action.type === "create_task") {
        await pb.tasks.create({
          title: action.title,
          type: action.type_field || "task",
          status: action.status || "backlog",
          impact: action.impact,
          confidence: action.confidence,
          ease: action.ease,
          ice_score: action.ice_score,
          due_date: action.due_date,
          recurrence: action.recurrence,
          next_due: action.next_due,
        });
      } else if (action.type === "update_task") {
        await pb.tasks.update(action.id, action);
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
      }
    } catch (err) {
      console.error(`Action failed (${action.type}):`, err.message);
    }
  }
}

async function chat(command, userMessage, context) {
  const userContent = `Command: ${command}\n\nContext:\n${context}\n\nUser message: ${userMessage || "(none)"}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const raw = response.content[0].text.trim();

  let parsed;
  try {
    // Strip markdown code fences if present
    const jsonStr = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    // Last resort: find first {...} block
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

  return parsed;
}

module.exports = { chat };
