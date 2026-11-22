#!/usr/bin/env bash
# Updates SciProspect on the server: pull, install, build, restart, check.
# Run on the server from anywhere:   bash ~/researcher_tool/deploy/update.sh
# Rollback: git -C ~/researcher_tool checkout <previous-commit> && bash deploy/update.sh --no-pull
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="${BRANCH:-main}"
cd "$APP_DIR"

if [ "${1:-}" != "--no-pull" ]; then
  echo "==> Pulling $BRANCH"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi
echo "==> Now at $(git log --oneline -1)"

[ -f backend/.env ] || { echo "Missing backend/.env (database, SMTP, SCIPROSPECT_APP_URL). Copy it from your PC, never from git."; exit 1; }

echo "==> Python packages"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt

echo "==> Frontend build"
cd frontend
npm ci --no-audit --no-fund
npm run build
cd ..

echo "==> Restarting services (database migrations run when the backend starts)"
sudo systemctl restart sciprospect-backend
sudo systemctl restart sciprospect-frontend

echo "==> Checking"
for i in $(seq 1 30); do
  curl -fsS -o /dev/null http://127.0.0.1:8000/api/public/plans && break
  sleep 2
done
curl -fsS -o /dev/null http://127.0.0.1:8000/api/public/plans && echo "backend  OK" || { echo "backend  FAILED: sudo journalctl -u sciprospect-backend -n 80"; exit 1; }
for i in $(seq 1 30); do
  curl -fsS -o /dev/null http://127.0.0.1:3000/ && break
  sleep 2
done
curl -fsS -o /dev/null http://127.0.0.1:3000/ && echo "frontend OK" || { echo "frontend FAILED: sudo journalctl -u sciprospect-frontend -n 80"; exit 1; }
echo "==> Deployed $(git log --oneline -1)"
