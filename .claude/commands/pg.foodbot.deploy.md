---
description: "Deploy FoodBot to VPS via SSH"
---

# Deploy FoodBot

Deploy the bot to VPS server `karvpn` (systemd + Node.js + SQLite, no Docker).

## Arguments

`$ARGUMENTS` — optional branch name (default: main). Examples: `/pg.deploy`, `/pg.deploy develop`

## Server details

- **SSH:** `karvpn` (alias in ~/.ssh/config, host karvpn.isgood.host)
- **Path:** `/opt/foodbot`
- **Service:** `foodbot` (systemd)
- **Domain:** `cheatmealday.karlov.dev`
- **Runtime:** Node.js 20, SQLite, nginx reverse proxy
- **RAM:** 1 GB (shared with VPN + psychologist-bot). NEVER run Docker build on this server.

## Steps

1. Parse branch from `$ARGUMENTS`. Default: `main`.

2. Check server is reachable:
```bash
ssh -o ConnectTimeout=10 karvpn "echo OK"
```

3. Deploy:
```bash
ssh karvpn "cd /opt/foodbot && git fetch origin <branch> && git reset --hard origin/<branch>"
```

4. Rebuild only if `package.json` or `prisma/` changed:
```bash
ssh karvpn "cd /opt/foodbot && npm ci && npx prisma generate && npx prisma db push && npm run build && cd src/web && npm ci && npm run build"
```
If only `src/` files changed (no package.json/prisma changes), skip npm ci and prisma, only run:
```bash
ssh karvpn "cd /opt/foodbot && npm run build && cd src/web && npm run build"
```

5. Restart service:
```bash
ssh karvpn "systemctl restart foodbot"
```

6. Verify (wait 3 seconds):
```bash
ssh karvpn "sleep 3 && systemctl is-active foodbot && curl -s http://localhost:3000/health && echo '' && journalctl -u foodbot --no-pager -n 5"
```

7. Report to user:
   - Branch and commit deployed
   - Service status (active/failed)
   - Health check result
   - Last 5 log lines

## If deploy fails

- Check logs: `ssh karvpn "journalctl -u foodbot --no-pager -n 30"`
- Rollback: `ssh karvpn "cd /opt/foodbot && git reset --hard HEAD~1 && npm run build && systemctl restart foodbot"`
- Check memory: `ssh karvpn "free -h"` (if low RAM — something else may be eating it)

## Important

- Server has only 1 GB RAM. Do NOT run `npm ci` with dev dependencies — always use `npm ci --omit=dev` or clean up after build.
- Do NOT install or run Docker on this server.
- VPN (X-Ray + nginx) must keep working. Do NOT touch `/etc/nginx/stream-enabled/`, `/etc/nginx/sites-enabled/karvpn*`, or `/etc/nginx/sites-enabled/subkarvpn*`.
