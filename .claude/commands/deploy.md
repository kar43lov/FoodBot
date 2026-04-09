---
description: "Deploy FoodBot to VPS via SSH"
---

# Deploy FoodBot

Deploy the bot to VPS server by running deploy.sh via SSH.

## Arguments

`$ARGUMENTS` — optional branch name (default: main). Examples: `/deploy`, `/deploy develop`

## Configuration

SSH connection details (update these for your server):
- **Host:** foodbot-server (use SSH config alias) or direct IP
- **User:** root (or your deploy user)
- **Path:** /opt/foodbot

## Steps

1. Parse branch from arguments. If `$ARGUMENTS` is empty, use `main`.

2. Run the deploy via SSH:

```bash
ssh foodbot-server "cd /opt/foodbot && ./deploy.sh --branch <branch>"
```

3. If SSH fails, show the user:
   - Check VPN connection
   - Check SSH config (`~/.ssh/config` should have `foodbot-server` alias)
   - Manual alternative: `ssh user@ip "cd /opt/foodbot && ./deploy.sh"`

4. Show the deploy output to the user. The deploy.sh script outputs:
   - Branch deployed
   - Commit hash and message
   - Deploy duration
   - Container status

5. If deploy fails (non-zero exit), suggest:
   - Check logs: `ssh foodbot-server "cd /opt/foodbot && docker compose logs app --tail 50"`
   - Rollback: `ssh foodbot-server "cd /opt/foodbot && git reset --hard HEAD~1 && docker compose up -d --build"`
