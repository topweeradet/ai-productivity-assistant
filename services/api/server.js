const express = require("express");
const { initializeDatabase } = require("../task-service/db");
const { createSmartTask } = require("../task-service/taskService");
const { listTasks, getTaskById, getTasksForArtifactSync, completeTask, archiveTask } = require("../task-service/taskRepository");

const app = express();
const PORT = 3000;

app.use(express.json());

initializeDatabase((initErr) => {
    if (initErr) {
        console.error("Failed to initialize database:", initErr.message);
        process.exit(1);
    }

    app.get("/health", (req, res) => {
        res.json({
            success: true,
            message: "AI Productivity Assistant API is running",
        });
    });

    app.get("/tasks", (req, res) => {
        listTasks((err, rows) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: err.message,
                });
            }

            return res.json({
                success: true,
                tasks: rows,
            });
        });
    });

    app.get("/tasks/for-sync", (req, res) => {
        getTasksForArtifactSync((err, rows) => {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }

            return res.json({ success: true, tasks: rows });
        });
    });

    app.get("/tasks/:id", (req, res) => {
        const id = Number(req.params.id);

        if (!id) {
            return res.status(400).json({
                success: false,
                error: "Invalid task id",
            });
        }

        getTaskById(id, (err, task) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: err.message,
                });
            }

            if (!task) {
                return res.status(404).json({
                    success: false,
                    error: "Task not found",
                });
            }

            return res.json({
                success: true,
                task,
            });
        });
    });

    app.post("/tasks/:id/archive", (req, res) => {
        const id = Number(req.params.id);

        if (!id) {
            return res.status(400).json({ success: false, error: "Invalid task id" });
        }

        archiveTask(id, (err, changes) => {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }

            if (changes === 0) {
                return res.status(404).json({ success: false, error: "Task not found" });
            }

            return res.json({ success: true, message: "Task archived", taskId: id });
        });
    });

    app.post("/tasks/smart-create", (req, res) => {
        const { title, description, priority, due_at, estimated_minutes, source } = req.body;

        if (!title) {
            return res.status(400).json({
                success: false,
                error: "Missing required field: title",
            });
        }

        createSmartTask(
            {
                title,
                description,
                priority,
                due_at,
                estimated_minutes,
                source: source || "api",
            },
            (err, taskId) => {
                if (err) {
                    return res.status(500).json({
                        success: false,
                        error: err.message,
                    });
                }

                return res.status(201).json({
                    success: true,
                    message: "Task created successfully",
                    taskId,
                });
            }
        );
    });

    app.post("/tasks/:id/complete", (req, res) => {
        const id = Number(req.params.id);
        const actualMinutes = req.body?.actual_minutes ?? null;

        if (!id) {
            return res.status(400).json({
                success: false,
                error: "Invalid task id",
            });
        }

        completeTask(id, actualMinutes, (err, changes) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    error: err.message,
                });
            }

            if (changes === 0) {
                return res.status(404).json({
                    success: false,
                    error: "Task not found",
                });
            }

            return res.json({
                success: true,
                message: "Task completed successfully",
                taskId: id,
                actualMinutes,
            });
        });
    });

    app.listen(PORT, () => {
        console.log(`API server running on http://localhost:${PORT}`);
    });
});