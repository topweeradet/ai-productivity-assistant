# Deployment Notes

## Current deployable unit
- API backend only
- Dockerized with docker-compose
- SQLite persisted via mounted volume

## Main commands

### Build and run
```bash
docker compose up --build -d
```

### Stop
```bash
docker compose down
```

### Check logs
```bash
docker compose logs -f
```

## Health check
```bash
curl http://localhost:3000/health
```

## Task list
```bash
curl http://localhost:3000/tasks
```

## Notes
- Database file is stored in `./db/app.db`
- Current system does not yet include OpenClaw, Ollama, or Telegram on VPS
- Backend API is the first deployment target