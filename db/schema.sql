CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- identity
  title TEXT NOT NULL,
  description TEXT,

  -- status
  status TEXT NOT NULL DEFAULT 'inbox',

  -- planning
  task_type TEXT DEFAULT 'reminder',          -- reminder | time_block
  priority INTEGER NOT NULL DEFAULT 3,
  due_at TEXT,
  estimated_minutes INTEGER,

  -- scheduling
  scheduled_start TEXT,
  scheduled_end TEXT,

  -- learning
  actual_minutes INTEGER,

  -- recurring
  is_recurring INTEGER NOT NULL DEFAULT 0,  -- 0 | 1
  recur_pattern TEXT,                        -- daily | weekly | monthly

  -- metadata
  source TEXT DEFAULT 'manual',

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);