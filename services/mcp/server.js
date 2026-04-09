const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const { createMcpExpressApp } = require("@modelcontextprotocol/sdk/server/express.js");
const { z } = require("zod");

const API_BASE = process.env.TASK_API_URL || "http://localhost:3000";
const MCP_PORT = process.env.MCP_PORT;  // if set → SSE mode, otherwise → stdio

async function apiRequest(method, path, body) {
    const options = { method, headers: { "Content-Type": "application/json" } };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, options);
    return res.json();
}

function createServer() {
    const server = new McpServer({ name: "task-api", version: "1.0.0" });

    server.tool(
        "list_tasks",
        "List all tasks. Returns id, title, status, task_type, priority, and due_at for each task.",
        {},
        async () => {
            const data = await apiRequest("GET", "/tasks");
            if (!data.success) throw new Error(data.error);
            return { content: [{ type: "text", text: JSON.stringify(data.tasks, null, 2) }] };
        }
    );

    server.tool(
        "get_tasks_for_sync",
        "Get tasks for artifact sync: non-complete tasks due in the past 3 days or next 7 days, plus all recurring tasks. Use this instead of list_tasks when building or refreshing the Claude task artifact.",
        {},
        async () => {
            const data = await apiRequest("GET", "/tasks/for-sync");
            if (!data.success) throw new Error(data.error);
            return { content: [{ type: "text", text: JSON.stringify(data.tasks, null, 2) }] };
        }
    );

    server.tool(
        "get_task",
        "Get full details of a specific task by its numeric ID.",
        { id: z.number().int().positive().describe("Task ID") },
        async ({ id }) => {
            const data = await apiRequest("GET", `/tasks/${id}`);
            if (!data.success) throw new Error(data.error);
            return { content: [{ type: "text", text: JSON.stringify(data.task, null, 2) }] };
        }
    );

    server.tool(
        "create_task",
        "Create a new task. If estimated_minutes > 0, the task becomes a time_block; otherwise it is a reminder.",
        {
            title: z.string().describe("Task title (required)"),
            description: z.string().optional().describe("Task description"),
            priority: z.number().int().min(1).max(5).optional().describe("Priority 1–5 (default 3)"),
            due_at: z.string().optional().describe("Due date as ISO datetime string"),
            estimated_minutes: z.number().int().nonnegative().optional().describe("Estimated duration in minutes"),
        },
        async ({ title, description, priority, due_at, estimated_minutes }) => {
            const data = await apiRequest("POST", "/tasks/smart-create", {
                title, description, priority, due_at, estimated_minutes, source: "mcp",
            });
            if (!data.success) throw new Error(data.error);
            return { content: [{ type: "text", text: `Task created with ID ${data.taskId}` }] };
        }
    );

    server.tool(
        "complete_task",
        "Mark a task as done. Optionally record how many minutes it actually took.",
        {
            id: z.number().int().positive().describe("Task ID"),
            actual_minutes: z.number().int().nonnegative().optional().describe("Actual time spent in minutes"),
        },
        async ({ id, actual_minutes }) => {
            const data = await apiRequest("POST", `/tasks/${id}/complete`, { actual_minutes: actual_minutes ?? null });
            if (!data.success) throw new Error(data.error);
            return { content: [{ type: "text", text: `Task ${id} marked complete` + (actual_minutes != null ? ` (${actual_minutes} min)` : "") }] };
        }
    );

    server.tool(
        "archive_task",
        "Archive a task (e.g. duplicate or cancelled). Archived tasks are excluded from artifact sync and daily focus.",
        { id: z.number().int().positive().describe("Task ID") },
        async ({ id }) => {
            const data = await apiRequest("POST", `/tasks/${id}/archive`);
            if (!data.success) throw new Error(data.error);
            return { content: [{ type: "text", text: `Task ${id} archived` }] };
        }
    );

    return server;
}

async function startStdio() {
    const transport = new StdioServerTransport();
    await createServer().connect(transport);
}

function startSSE(port) {
    const app = createMcpExpressApp({ enforceHostHeader: false });
    const transports = {};

    app.get("/mcp", async (req, res) => {
        const transport = new SSEServerTransport("/messages", res);
        transports[transport.sessionId] = transport;
        transport.onclose = () => delete transports[transport.sessionId];
        await createServer().connect(transport);
    });

    app.post("/messages", async (req, res) => {
        const transport = transports[req.query.sessionId];
        if (!transport) { res.status(404).send("Session not found"); return; }
        await transport.handlePostMessage(req, res, req.body);
    });

    app.listen(port, () => {
        console.log(`MCP server (SSE) on http://localhost:${port}/mcp — API: ${API_BASE}`);
    });
}

if (MCP_PORT) {
    startSSE(Number(MCP_PORT));
} else {
    startStdio().catch((err) => { console.error(err); process.exit(1); });
}
