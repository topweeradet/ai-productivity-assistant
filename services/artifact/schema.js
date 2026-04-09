// Claude Task Artifact schema and helpers
// Artifact lives at ~/claude-task-artifact.json

const ARTIFACT_PATH = require("os").homedir() + "/claude-task-artifact.json";
const ARTIFACT_VERSION = "2";

function emptyArtifact() {
    return {
        version: ARTIFACT_VERSION,
        last_synced_at: null,
        sync_status: "never",
        tasks: [],
    };
}

// Parse [task] metadata block from a Google Calendar event description
// Returns null if no [task] block found
function parseTaskMetadata(description) {
    if (!description) return null;

    const match = description.match(/\[task\]([\s\S]*?)(?=\n\n|$)/);
    if (!match) return null;

    const meta = {};
    match[1].trim().split("\n").forEach((line) => {
        const [key, ...rest] = line.split(":").map((s) => s.trim());
        if (key && rest.length) meta[key] = rest.join(":").trim();
    });

    return {
        id: meta.id ? Number(meta.id) : null,
        priority: meta.priority ? Number(meta.priority) : 3,
        status: meta.status || "inbox",
        estimated_minutes: meta.estimated_minutes ? Number(meta.estimated_minutes) : null,
        source: meta.source || "manual",
        is_recurring: meta.is_recurring === "1" || meta.is_recurring === "true",
        recur_pattern: meta.recur_pattern || null,
    };
}

// Serialize task metadata into [task] description block
function serializeTaskMetadata(task) {
    return [
        "[task]",
        `id: ${task.id}`,
        `priority: ${task.priority ?? 3}`,
        `status: ${task.status}`,
        `estimated_minutes: ${task.estimated_minutes ?? 0}`,
        `source: ${task.source || "mcp"}`,
        `is_recurring: ${task.is_recurring ? 1 : 0}`,
        task.recur_pattern ? `recur_pattern: ${task.recur_pattern}` : null,
    ]
        .filter(Boolean)
        .join("\n");
}

// Build a Google Calendar event object from a task
function taskToCalendarEvent(task, timeZone = "Australia/Melbourne") {
    const isDone = task.status === "done" || task.status === "archived";
    const title = isDone ? `[done] ${task.title}` : task.title;
    const description = serializeTaskMetadata(task);
    const isTimeBlock = task.estimated_minutes && task.estimated_minutes > 0;

    const event = {
        summary: title,
        description,
    };

    if (isTimeBlock && task.scheduled_start) {
        event.start = { dateTime: task.scheduled_start, timeZone };
        event.end = { dateTime: task.scheduled_end || task.scheduled_start, timeZone };
    } else if (task.due_at) {
        // All-day event: date only (YYYY-MM-DD)
        const date = task.due_at.split("T")[0];
        event.start = { date };
        // Calendar all-day end is exclusive (next day)
        const next = new Date(date);
        next.setDate(next.getDate() + 1);
        event.end = { date: next.toISOString().split("T")[0] };
    } else {
        // No date — all-day event for today as fallback
        const today = new Date().toISOString().split("T")[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
        event.start = { date: today };
        event.end = { date: tomorrow };
    }

    if (task.is_recurring && task.recur_pattern) {
        const rruleMap = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY" };
        const freq = rruleMap[task.recur_pattern];
        if (freq) event.recurrence = [`RRULE:FREQ=${freq}`];
    }

    return event;
}

// Merge a calendar event into an artifact task (Calendar wins)
function mergeCalendarEventIntoTask(existingTask, calendarEvent, meta) {
    const isDone = calendarEvent.summary?.startsWith("[done]");
    const title = isDone
        ? calendarEvent.summary.replace(/^\[done\]\s*/, "").trim()
        : calendarEvent.summary;

    return {
        ...existingTask,
        title,
        status: isDone ? "done" : (meta.status || existingTask?.status || "inbox"),
        priority: meta.priority ?? existingTask?.priority ?? 3,
        estimated_minutes: meta.estimated_minutes ?? existingTask?.estimated_minutes ?? null,
        is_recurring: meta.is_recurring ?? existingTask?.is_recurring ?? false,
        recur_pattern: meta.recur_pattern ?? existingTask?.recur_pattern ?? null,
        due_at: calendarEvent.start?.date || calendarEvent.start?.dateTime || existingTask?.due_at || null,
        calendar_event_id: calendarEvent.id,
        updated_at: new Date().toISOString(),
    };
}

module.exports = {
    ARTIFACT_PATH,
    emptyArtifact,
    parseTaskMetadata,
    serializeTaskMetadata,
    taskToCalendarEvent,
    mergeCalendarEventIntoTask,
};
