// PocketBase REST client for all 6 collections defined in SCHEMA.md.
// All write operations enforce soft-delete (deleted=false on create, deleted=true on remove).
// All reads automatically filter deleted=false except activity_log (permanent record).

const BASE_URL = process.env.POCKETBASE_URL || "http://localhost:8090";

async function request(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || `PocketBase ${res.status}: ${path}`);
  }
  return data;
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

    // Soft delete: sets deleted=true instead of destroying the record
    remove(id) {
      if (!softDelete) throw new Error(`${name} does not support soft delete`);
      return request("PATCH", `${base}/${id}`, { deleted: true });
    },
  };
}

const goals = collection("goals");

const projects = collection("projects");

const tasks = {
  ...collection("tasks"),

  listBacklog(sort = "-ice_score") {
    return request(
      "GET",
      `/api/collections/tasks/records?${buildQuery(
        '(deleted=false&&status="backlog")',
        sort,
        "project,goal"
      )}`
    );
  },

  listToday() {
    return request(
      "GET",
      `/api/collections/tasks/records?${buildQuery(
        '(deleted=false&&status="today")',
        "-ice_score",
        "project,goal"
      )}`
    );
  },

  listRecurringDue(today) {
    return request(
      "GET",
      `/api/collections/tasks/records?${buildQuery(
        `(deleted=false&&type="recurring"&&next_due<="${today}")`,
        "next_due"
      )}`
    );
  },

  listUpcoming(today, daysAhead = 3) {
    const future = new Date(today);
    future.setDate(future.getDate() + daysAhead);
    const until = future.toISOString().split("T")[0];
    return request(
      "GET",
      `/api/collections/tasks/records?${buildQuery(
        `(deleted=false&&status!="done"&&status!="dropped"&&due_date>="${today}"&&due_date<="${until}")`,
        "due_date"
      )}`
    );
  },
};

const subtasks = collection("subtasks");

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

module.exports = { goals, projects, tasks, subtasks, daily_plans, activity_log };
