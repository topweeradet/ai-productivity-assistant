const { createTaskV2 } = require("./taskRepository");

function createReminderTask(input, callback) {
    const taskData = {
        title: input.title,
        description: input.description || "",
        status: "inbox",
        task_type: "reminder",
        priority: input.priority ?? 3,
        due_at: input.due_at || null,
        estimated_minutes: input.estimated_minutes ?? null,
        source: input.source || "manual",
    };

    createTaskV2(taskData, callback);
}

function createTimeBlockTask(input, callback) {
    const taskData = {
        title: input.title,
        description: input.description || "",
        status: "inbox",
        task_type: "time_block",
        priority: input.priority ?? 3,
        due_at: input.due_at || null,
        estimated_minutes: input.estimated_minutes ?? null,
        source: input.source || "manual",
        scheduled_start: input.scheduled_start || null,
        scheduled_end: input.scheduled_end || null,
    };

    createTaskV2(taskData, callback);
}

function decideTaskType(input) {
    if (input.task_type) {
        return input.task_type;
    }

    if (input.estimated_minutes && Number(input.estimated_minutes) > 0) {
        return "time_block";
    }

    return "reminder";
}

function createSmartTask(input, callback) {
  const decidedTaskType = decideTaskType(input);

  if (decidedTaskType === "time_block") {
    createTimeBlockTask(
      {
        ...input,
        task_type: "time_block",
      },
      callback
    );
    return;
  }

  createReminderTask(
    {
      ...input,
      task_type: "reminder",
    },
    callback
  );
}

module.exports = {
    createReminderTask,
    createTimeBlockTask,
    decideTaskType,
    createSmartTask,
};