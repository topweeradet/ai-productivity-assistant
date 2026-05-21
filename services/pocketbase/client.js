// PocketBase REST client for all collections defined in SCHEMA.md.
// All write operations enforce soft-delete (deleted=false on create, deleted=true on remove).
// All reads automatically filter deleted=false except activity_log (permanent record).

const BASE_URL = process.env.POCKETBASE_URL || "http://localhost:8090";
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 300;

async function request(method, path, body, attempt = 1) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(`${BASE_URL}${path}`, opts);
    const data = await res.json();

    if (!res.ok) {
      // 4xx errors are not retryable
      if (res.status >= 400 && res.status < 500) {
        throw new Error(data.message || `PocketBase ${res.status}: ${path}`);
      }
      throw new Error(data.message || `PocketBase ${res.status}: ${path}`);
    }
    return data;
  } catch (err) {
    const retryable = err.name === "TypeError" || (err.message && err.message.includes("fetch"));
    if (retryable && attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_MS * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
      return request(method, path, body, attempt + 1);
    }
    throw err;
  }
}

function buildQuery(filter, sort, expand, page = 1, perPage = 200) {
  const params = new URLSearchParams({ page, perPage });
  if (filter) params.set("filter", filter);
  if (sort) params.set("sort", sort);
  if (expand) params.set("expand", expand);
  return params.toString();
}

function collection(name, { softDelete = true } = {}) {
  const base = `/api/collections/${name}/records`;
  const notDeleted = softDelete ? "deleted=false" : null;

  function and(extra) {
    if (!notDeleted) return extra || "";
    return extra ? `(${notDeleted}&&${extra})` : notDeleted;
  }

  return {
    list(filter, sort, expand) {
      return request("GET", `${base}?${buildQuery(and(filter), sort, expand)}`);
    },

    get(id, expand) {
      const qs = expand ? `?expand=${expand}` : "";
      return request("GET", `${base}/${id}${qs}`);
    },

    create(data) {
      const body = softDelete ? { deleted: false, ...data } : data;
      return request("POST", base, body);
    },

    update(id, data) {
      return request("PATCH", `${base}/${id}`, data);
    },

    remove(id) {
      if (!softDelete) throw new Error(`${name} does not support soft delete`);
      return request("PATCH", `${base}/${id}`, { deleted: true });
    },
  };
}

const goals = collection("goals");

const tasks = {
  ...collection("tasks"),

  async listBacklog(sort = "-ice_score") {
    const res = await request("GET", `/api/collections/tasks/records?${buildQuery("deleted=false", sort, "goal")}`);
    res.items = res.items.filter(t => t.status === "backlog");
    return res;
  },

  async listToday() {
    const res = await request("GET", `/api/collections/tasks/records?${buildQuery("deleted=false", "-ice_score", "goal")}`);
    res.items = res.items.filter(t => t.status === "today");
    return res;
  },

  async listRecurringDue(today) {
    const res = await request("GET", `/api/collections/tasks/records?${buildQuery("deleted=false", "next_due")}`);
    res.items = res.items.filter(t => t.type === "recurring" && t.next_due && t.next_due.slice(0, 10) <= today);
    return res;
  },

  async listUpcoming(today, daysAhead = 3) {
    const future = new Date(today);
    future.setDate(future.getDate() + daysAhead);
    const until = future.toISOString().split("T")[0];
    const res = await request("GET", `/api/collections/tasks/records?${buildQuery(`deleted=false&&due_date>='${today}'`, "due_date")}`);
    res.items = res.items.filter(t => t.status !== "done" && t.status !== "dropped" && t.due_date <= until);
    return res;
  },
};

const daily_plans = {
  ...collection("daily_plans", { softDelete: false }),

  listForDate(date, expand = "task") {
    return request(
      "GET",
      `/api/collections/daily_plans/records?${buildQuery(
        `date="${date}"`,
        "priority",
        expand
      )}`
    );
  },
};

// activity_log is permanent — no soft delete, no deleted field
const activity_log = collection("activity_log", { softDelete: false });

// skills — user-defined custom instructions added via /teach
const skills = collection("skills");

module.exports = { goals, tasks, daily_plans, activity_log, skills };
