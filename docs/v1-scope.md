# AI Personal Assistant - V1 Scope

## 1. Goal
Build a personal AI assistant that can capture tasks from chat, store them, and help plan daily work with time blocking.

## 2. Primary User
Single user only (myself).

## 3. Core Features in V1
- Capture task from chat message
- Store task in database
- Update task status
- Support recurring tasks
- Read calendar availability
- Suggest daily plan
- Create time blocks on calendar
- Generate simple daily review
- Generate simple weekly review

## 4. Out of Scope for V1
- Multi-user support
- Team collaboration
- SaaS billing/authentication
- Voice input
- Complex dashboard UI
- Advanced autonomous desktop control

## 5. First Channel
Telegram

## 6. First Calendar Provider
Google Calendar

## 7. First Database
SQLite

## 8. Definition of Success
V1 is successful if:
- I can send a message like “Remind me to pay rent next Friday”
- The system stores it as a task correctly
- The system can show my open tasks
- The system can suggest a plan for today
- The system can create a calendar block for a selected task

## 9. Constraints
- Personal use only
- Self-hosted or personally controlled cloud deployment
- Keep implementation simple
- Prioritize reliability over fancy automation
- Must be able to run without my notebook staying on

## 10. Hosting Requirement
- The system must be deployable to cloud
- It should run without depending on my notebook being always on
- Cloud deployment should be simple for V1
- Prefer one personal always-on deployment, not multi-user SaaS