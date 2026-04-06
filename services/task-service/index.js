const {
    db,
    initializeDatabase
} = require("./db");
const {
    createTask,
    listTasks,
    getTaskById,
    completeTask,
    updateTaskStatus,
} = require("./taskRepository");
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

    if (command === "create") {
        const title = args[1];
        const description = args[2] || "";
        const priority = Number(args[3] || 3);
        const dueAt = args[4] || null;

        if (!title) {
            console.log(
                formatError(
                    'Missing title. Usage: node services/task-service/index.js create "title" "description" 3 "2026-04-05 20:00:00"',
                    outputMode
                )
            );
            db.close();
            return;
        }

        handleCreateTask(title, description, "inbox", priority, dueAt, outputMode);
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

        if (!id) {
            console.log(
                formatError("Missing or invalid task id. Usage: complete <id>", outputMode)
            );
            db.close();
            return;
        }

        handleCompleteTask(id, outputMode);
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

function handleCreateTask(title, description, status, priority, dueAt, outputMode) {
    createTask(title, description, status, priority, dueAt, (err, taskId) => {
        if (err) {
            console.log(formatError(`Failed to create task: ${err.message}`, outputMode));
            db.close();
            return;
        }

        console.log(formatTaskCreated(taskId, outputMode));
        db.close();
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

function handleCompleteTask(id, outputMode) {
    completeTask(id, (err, changes) => {
        if (err) {
            console.log(formatError(`Failed to complete task: ${err.message}`, outputMode));
            db.close();
            return;
        }

        console.log(formatTaskCompleted(id, changes, outputMode));
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