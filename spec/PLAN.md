# Build Plan
version: 1.0.0

## Status Legend
- ✅ Done
- 🔄 In Progress
- ⬜ Not Started
- ❌ Blocked

---

## Phase 1 — Foundation
_Goal: Get PocketBase running and connected to existing bot_

### 1.1 PocketBase Setup
- ✅ Add PocketBase to Docker Compose
- ✅ Create all 6 collections per SCHEMA.md
- ✅ Verify REST API working with test CRUD calls
- ✅ Confirm soft delete pattern works

### 1.2 Connect Existing Node.js Bot to PocketBase
- ✅ Review existing project structure
- ✅ Add PocketBase client to Node.js project
- ✅ Write CRUD helper functions for each collection
- ✅ Test read/write from bot to PocketBase

### 1.3 Date Injection
- ✅ Add today's date to every LLM prompt automatically
- ✅ Test that LLM receives correct date in context

---

## Phase 2 — LLM Integration
_Goal: Bot understands commands and responds intelligently_

### 2.1 System Prompt
- ⬜ Hardcode SKILL.md as system prompt in bot
- ⬜ Build context builder:
  - Fetch goals from PocketBase
  - Fetch today's backlog from PocketBase
  - Fetch upcoming deadlines
  - Inject into prompt

### 2.2 Response Parsing
- ⬜ Implement structured JSON response format
- ⬜ Parse `reply` field → send to Telegram
- ⬜ Parse `actions` array → execute CRUD on PocketBase
- ⬜ Handle LLM response errors gracefully

### 2.3 Commands
- ⬜ /dump — brain dump flow
- ⬜ /plan — clarify + prioritize + create daily_plan records
- ⬜ /add — add single task mid-day
- ⬜ /recap — end of day review + update statuses
- ⬜ /goals — view and update goals
- ⬜ /overview — big picture 2-week view

---

## Phase 3 — Intelligence Layer
_Goal: Assistant feels smart, not just functional_

### 3.1 Clarify Layer
- ⬜ LLM correctly classifies Task vs Project vs Goal vs Idea
- ⬜ Projects auto-create subtasks
- ⬜ Goals saved to goals collection

### 3.2 ICE Scoring
- ⬜ LLM scores each task during /plan
- ⬜ ice_score calculated and saved to PocketBase
- ⬜ Daily plan sorted by ice_score + goal alignment

### 3.3 Recurring Tasks
- ⬜ Detect recurring tasks in /plan
- ⬜ Set recurrence field and next_due date
- ⬜ Auto-surface recurring tasks when next_due <= today

### 3.4 Activity Logging
- ⬜ Log to activity_log on: started, completed, blocked, deferred
- ⬜ /recap reads activity_log to surface patterns

---

## Phase 4 — Polish
_Goal: Reliable daily driver_

### 4.1 Error Handling
- ⬜ Graceful LLM timeout handling
- ⬜ PocketBase connection retry logic
- ⬜ User-friendly error messages in Telegram

### 4.2 Conversation Memory
- ⬜ Store conversation history in-memory per session
- ⬜ Clear history after /recap or session timeout

### 4.3 /teach Command
- ⬜ Allow user to add custom skills via chat
- ⬜ Persist custom skills (decide: PocketBase table or text file)

### 4.4 Security
- ⬜ Whitelist Telegram user IDs (personal use only)
- ⬜ PocketBase not exposed publicly
- ⬜ API keys in environment variables

---

## Decision Log

| Date | Decision | Reason | Alternatives Considered |
|------|----------|--------|------------------------|
| 2024-11-12 | PocketBase over Express.js | Zero code for CRUD, task logic lives in LLM | Express.js, Pure JS API |
| 2024-11-12 | PocketBase over Grist | Native UUID, no row limit when self-hosted | Grist Cloud (5k row limit) |
| 2024-11-12 | Telegram over WhatsApp | Free API, no message limits | WhatsApp (paid), LINE (500 msg limit) |
| 2024-11-12 | Claude Haiku over Sonnet | ~$0.10/month vs ~$0.50/month, smart enough | Sonnet, Deepseek V3, Local LLM |
| 2024-11-12 | Soft delete always | Prevent broken references, enable history | Hard delete |
| 2024-11-12 | Date injection in backend | Claude cannot know current date reliably | Ask user to type date |
| 2024-11-12 | Telegram Bot over Claude Artifact | No extra API cost, works natively on mobile | Artifact + Claude API key |

---

## Open Questions

- [ ] Which LLM to start with — Claude Haiku or Deepseek V3?
- [ ] Where to persist /teach custom skills — PocketBase table or flat file?
- [ ] Conversation history: how long to keep per session before clearing?
- [ ] Should /recap auto-run at a fixed time or only when triggered?

---

## For Claude Code

When starting a session with Claude Code, provide:
1. This PLAN.md
2. ARCHITECTURE.md
3. SCHEMA.md
4. The existing Node.js project files

Then say:
> "Review the existing project structure against ARCHITECTURE.md.
> Start with Phase 1. Do not proceed to Phase 2 until Phase 1 is complete and tested."
