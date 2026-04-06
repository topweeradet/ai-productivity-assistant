function formatTaskList(rows, outputMode = "text") {
  if (outputMode === "json") {
    return JSON.stringify(
      {
        success: true,
        tasks: rows,
      },
      null,
      2
    );
  }

  if (rows.length === 0) {
    return "No tasks found.";
  }

  const lines = ["Task list:"];

  rows.forEach((task) => {
    lines.push(
      `- [${task.id}] ${task.title} | status=${task.status} | priority=${task.priority} | due=${task.due_at || "none"}`
    );
  });

  return lines.join("\n");
}

function formatTaskCreated(taskId, outputMode = "text") {
  if (outputMode === "json") {
    return JSON.stringify(
      {
        success: true,
        message: "Task created successfully",
        taskId,
      },
      null,
      2
    );
  }

  return `Task created successfully (id: ${taskId})`;
}

function formatError(message, outputMode = "text") {
  if (outputMode === "json") {
    return JSON.stringify(
      {
        success: false,
        error: message,
      },
      null,
      2
    );
  }

  return message;
}

function formatSingleTask(task, outputMode = "text") {
  if (outputMode === "json") {
    return JSON.stringify(
      {
        success: true,
        task: task || null,
      },
      null,
      2
    );
  }

  if (!task) {
    return "Task not found.";
  }

  return `Task:
- id: ${task.id}
- title: ${task.title}
- status: ${task.status}
- priority: ${task.priority}
- due: ${task.due_at || "none"}`;
}

function formatTaskCompleted(taskId, changes, outputMode = "text") {
  if (outputMode === "json") {
    return JSON.stringify(
      {
        success: changes > 0,
        message: changes > 0 ? "Task completed successfully" : "Task not found",
        taskId,
      },
      null,
      2
    );
  }

  if (changes === 0) {
    return "Task not found.";
  }

  return `Task completed successfully (id: ${taskId})`;
}

function formatTaskStatusUpdated(taskId, status, changes, outputMode = "text") {
  if (outputMode === "json") {
    return JSON.stringify(
      {
        success: changes > 0,
        message:
          changes > 0
            ? "Task status updated successfully"
            : "Task not found",
        taskId,
        status,
      },
      null,
      2
    );
  }

  if (changes === 0) {
    return "Task not found.";
  }

  return `Task status updated (id: ${taskId}, status: ${status})`;
}

module.exports = {
  formatTaskList,
  formatTaskCreated,
  formatError,
  formatSingleTask,
  formatTaskCompleted,
  formatTaskStatusUpdated,
};