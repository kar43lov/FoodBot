#!/usr/bin/env bash
set -euo pipefail

# FoodBot deploy script
# Usage: ./deploy.sh [--branch <branch>]

BRANCH="main"
HEALTH_URL="http://localhost:3000/health"
HEALTH_TIMEOUT=60
START_TIME=$(date +%s)

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --branch|-b)
      BRANCH="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: ./deploy.sh [--branch <branch>]"
      exit 1
      ;;
  esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $1"; }
err() { echo -e "${RED}[deploy]${NC} $1"; }

# Step 1: Preflight checks
log "Preflight checks..."

if [ ! -f .env ]; then
  err ".env file not found. Copy from .env.production.example and fill in values."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  err "Docker daemon is not running."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  err "Docker Compose is not installed."
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  err "Not a git repository or no remote 'origin'."
  exit 1
fi

log "Preflight OK."

# Step 2: Update code
log "Pulling branch: $BRANCH"
git fetch origin
git reset --hard "origin/$BRANCH"

COMMIT_HASH=$(git rev-parse --short HEAD)
COMMIT_MSG=$(git log -1 --pretty=%s)
log "Code updated to: $COMMIT_HASH — $COMMIT_MSG"

# Step 3: Build and restart
log "Building and restarting containers..."
docker compose up -d --build --remove-orphans

# Step 4: Healthcheck
log "Waiting for healthcheck ($HEALTH_TIMEOUT seconds max)..."
ELAPSED=0
while [ $ELAPSED -lt $HEALTH_TIMEOUT ]; do
  if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
    log "Healthcheck passed."
    break
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

if [ $ELAPSED -ge $HEALTH_TIMEOUT ]; then
  err "Healthcheck FAILED after ${HEALTH_TIMEOUT}s."
  warn "Check logs: docker compose logs app --tail 50"
  exit 1
fi

# Step 5: Report
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
log "========== Deploy complete =========="
log "Branch:    $BRANCH"
log "Commit:    $COMMIT_HASH — $COMMIT_MSG"
log "Duration:  ${DURATION}s"
echo ""
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""
log "====================================="
