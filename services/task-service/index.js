const {
    db,
    initializeDatabase
} = require("./db");
const {
    listTasks,
    getTaskById,
    completeTask,
    updateTaskStatus,
} = require("./taskRepository");
const {
    createReminderTask,
    createTimeBlockTask,
    createSmartTask,
} = require("./taskService");
const {
    formatTaskList,
    formatTaskCreated,
    formatError,
    formatSingleTask,
    formatTaskCompleted,
    formatTaskStatusUpdated,
} = require("./taskFormatter");

initializeDatabase((initErr) => {
    if (initErr) {
        console.log(
            formatError(`Failed to initialize database: ${initErr.message}`, "text")
        );
        db.close();
        process.exit(1);
    }

    runCommand();
});

function runCommand() {
    const rawArgs = process.argv.slice(2);
    const outputMode = rawArgs.includes("--json") ? "json" : "text";
    const args = rawArgs.filter((arg) => arg !== "--json");

    const command = args[0];

    if (command === "list") {
        handleListTasks(outputMode);
        return;
    }

    if (command === "create" || command === "create-reminder") {
        const taskInput = parseBasicCreateArgs(args);

        if (!taskInput.title) {
            console.log(
                formatError(
                    'Missing title. Usage: node services/task-service/index.js create "title" "description" 3 "2026-04-05 20:00:00"',
                    outputMode
                )
            );
            db.close();
            return;
        }

        handleCreateReminderTask(
            {
                ...taskInput,
                status: "inbox",
                task_type: "reminder", // default
                estimated_minutes: null,
                source: "manual",
            },
            outputMode
        );
        return;
    }

    if (command === "create-time-block") {
        const taskInput = parseTimeBlockCreateArgs(args);

        if (!taskInput.title) {
            console.log(
                formatError(
                    'Missing title. Usage: node services/task-service/index.js create-time-block "title" "description" 3 "2026-04-05 20:00:00" 60',
                    outputMode
                )
            );
            db.close();
            return;
        }

        handleCreateTimeBlockTask(
            {
                ...taskInput,
                source: "manual",
            },
            outputMode
        );
        return;
    }

    if (command === "smart-create") {
        const taskInput = parseSmartCreateArgs(args);

        if (!taskInput.title) {
            console.log(
                formatError(
                    'Missing title. Usage: node services/task-service/index.js smart-create "title" "description" 3 "2026-04-05 20:00:00" [estimatedMinutes]',
                    outputMode
                )
            );
            db.close();
            return;
        }

        handleCreateSmartTask(taskInput, outputMode);
        return;
    }

    if (command === "get") {
        const id = Number(args[1]);

        if (!id) {
            console.log(
                formatError("Missing or invalid task id. Usage: get <id>", outputMode)
            );
            db.close();
            return;
        }

        handleGetTask(id, outputMode);
        return;
    }

    if (command === "complete") {
        const id = Number(args[1]);
        const actualMinutes = args[2] ? Number(args[2]) : null;

        if (!id) {
            console.log(
                formatError(
                    "Missing or invalid task id. Usage: complete <id> [actualMinutes]",
                    outputMode
                )
            );
            db.close();
            return;
        }

        handleCompleteTask(id, actualMinutes, outputMode);
        return;
    }

    if (command === "update-status") {
        const id = Number(args[1]);
        const status = args[2];

        if (!id || !status) {
            console.log(
                formatError(
                    "Missing arguments. Usage: update-status <id> <status>",
                    outputMode
                )
            );
            db.close();
            return;
        }

        handleUpdateTaskStatus(id, status, outputMode);
        return;
    }

    console.log(formatError('Unknown command. Use "list" or "create".', outputMode));
    db.close();
}

function parseBasicCreateArgs(args) {
    return {
        title: args[1],
        description: args[2] || "",
        priority: Number(args[3] || 3),
        due_at: args[4] || null,
    };
}

function parseTimeBlockCreateArgs(args) {
    return {
        title: args[1],
        description: args[2] || "",
        priority: Number(args[3] || 3),
        due_at: args[4] || null,
        estimated_minutes: args[5] ? Number(args[5]) : null,
        scheduled_start: args[6] || null,
        scheduled_end: args[7] || null,
    };
}

function parseSmartCreateArgs(args) {
    return {
        title: args[1],
        description: args[2] || "",
        priority: Number(args[3] || 3),
        due_at: args[4] || null,
        estimated_minutes: args[5] ? Number(args[5]) : null,
        source: "manual",
    };
}

function handleCreateReminderTask(taskData, outputMode) {
    createReminderTask(taskData, (err, taskId) => {
        handleCreateResult(err, taskId, outputMode);
    });
}

function handleCreateTimeBlockTask(taskData, outputMode) {
    createTimeBlockTask(taskData, (err, taskId) => {
        handleCreateResult(err, taskId, outputMode);
    });
}

function handleCreateSmartTask(taskData, outputMode) {
    createSmartTask(taskData, (err, taskId) => {
        handleCreateResult(err, taskId, outputMode);
    });
}

function handleListTasks(outputMode) {
    listTasks((err, rows) => {
        if (err) {
            console.log(formatError(`Failed to fetch tasks: ${err.message}`, outputMode));
            db.close();
            return;
        }

        console.log(formatTaskList(rows, outputMode));
        db.close();
    });
}

function handleGetTask(id, outputMode) {
    getTaskById(id, (err, task) => {
        if (err) {
            console.log(formatError(`Failed to fetch task: ${err.message}`, outputMode));
            db.close();
            return;
        }

        console.log(formatSingleTask(task, outputMode));
        db.close();
    });
}

function handleCompleteTask(id, actualMinutes, outputMode) {
    completeTask(id, actualMinutes, (err, changes) => {
        if (err) {
            console.log(formatError(`Failed to complete task: ${err.message}`, outputMode));
            db.close();
            return;
        }

        console.log(formatTaskCompleted(id, changes, actualMinutes, outputMode));
        db.close();
    });
}

function handleUpdateTaskStatus(id, status, outputMode) {
    updateTaskStatus(id, status, (err, changes) => {
        if (err) {
            console.log(
                formatError(`Failed to update task status: ${err.message}`, outputMode)
            );
            db.close();
            return;
        }

        console.log(formatTaskStatusUpdated(id, status, changes, outputMode));
        db.close();
    });
}

function handleCreateResult(err, taskId, outputMode) {
    if (err) {
        console.log(formatError(`Failed to create task: ${err.message}`, outputMode));
        db.close();
        return;
    }

    console.log(formatTaskCreated(taskId, outputMode));
    db.close();
}