---
description: "Release FoodBot: merge develop→main + push + deploy"
---

# Release FoodBot

Полный release flow: локальный `develop → main` (без PR), push `main`, деплой на `karvpn`.

## Arguments

`$ARGUMENTS` — пусто (релиз с develop). При другом source-branch — задай через AskUserQuestion.

## When to run

После того как `develop` стабилен и протестирован: фичи замёрджены, тесты зелёные, `/pg.review` чистый. **Запускать только по явной команде пользователя** — это удалённая операция (push + deploy).

## Steps

### 1. Sanity checks

Текущая ветка:
```bash
git branch --show-current
```

Working tree должен быть чистым:
```bash
git status --porcelain
```

Если есть uncommitted — СТОП:
> На рабочей ветке uncommitted-изменения. Закоммить или stash перед релизом.

`develop` синхронизирован с remote:
```bash
git fetch origin develop && git status -sb
```

Если локальный develop отстаёт — `git pull --ff-only origin develop`.

### 2. Проверка review-маркера (опционально)

```bash
test -f .claude/tmp/review-done && cat .claude/tmp/review-done || echo "NO_MARKER"
```

Если маркер `status: clean` — продолжаем. Если `NO_MARKER` или `status != clean` — спроси через AskUserQuestion:
- Запустить `/pg.review` перед релизом (реком.)
- Релизить без ревью
- Отменить

### 3. Подтверждение

Покажи дельту, которая поедет в main:
```bash
git fetch origin main
```
```bash
git log --oneline origin/main..develop
```

Спроси через AskUserQuestion:
- Релиз с этими коммитами (реком.)
- Отменить

### 4. Merge develop → main (локально)

```bash
git checkout main
```
```bash
git pull --ff-only origin main
```
```bash
git merge develop --no-ff -m "Merge branch 'develop'"
```

> ⚠️ `--no-ff` обязательно — сохраняет историю feature-merge'ей. Не использовать `--ff-only` на main.

### 5. Push main

```bash
git push origin main
```

Если auto-classifier режет (новый PR workflow в недавней сессии) — будет prompt пользователя. Это нормально.

### 6. Deploy на karvpn

```bash
ssh -o ConnectTimeout=10 karvpn "echo OK"
```
```bash
ssh karvpn "cd /opt/foodbot && git fetch origin main && git reset --hard origin/main"
```

Build — только при изменениях в `package.json` / `prisma/`:
```bash
ssh karvpn "cd /opt/foodbot && npm ci && npx prisma generate && npx prisma db push && npm run build && cd src/web && npm ci && npm run build"
```

Если только `src/` — короткий путь (экономия RAM):
```bash
ssh karvpn "cd /opt/foodbot && npm run build"
```

Web-билд пропускай, если `src/web/` не менялся.

### 7. Restart + verify

```bash
ssh karvpn "systemctl restart foodbot"
```
```bash
ssh karvpn "sleep 3 && systemctl is-active foodbot && curl -s http://localhost:3000/health && echo '' && journalctl -u foodbot --no-pager -n 10"
```

### 8. Возврат на develop

```bash
git checkout develop
```

### 9. Cleanup

```bash
rm -f .claude/tmp/review-done
```

### 10. Отчёт

```
## Release готов

- Merge: <merge_commit_hash> develop → main
- Deployed: main @ <commit_hash>
- Сервис: active
- Health: ok
- Текущая ветка: develop
```

## Rollback

```bash
ssh karvpn "cd /opt/foodbot && git reset --hard HEAD~1 && npm run build && systemctl restart foodbot"
```

## Important

- **Workflow проекта**: `develop` — рабочая ветка, `main` — production. PR делается **в develop**, не в main. Релиз = локальный merge develop→main без PR.
- Сервер `karvpn` имеет 1 GB RAM — не запускай Docker, не делай полный `npm ci` если не нужно.
- VPN (X-Ray + nginx) на этом же сервере — не трогай `/etc/nginx/stream-enabled/`, `/etc/nginx/sites-enabled/karvpn*`, `/etc/nginx/sites-enabled/subkarvpn*`.

## Ограничения

- **Разрешено**: Bash (git, ssh), AskUserQuestion, Read
- **Запрещено**: Edit, Write — релиз не правит код, только мерджит/деплоит готовое
