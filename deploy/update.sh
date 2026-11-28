#!/usr/bin/env bash
# Updates SciProspect on the server: pull, install, build, restart, check.
# Run on the server from anywhere:   bash ~/researcher_tool/deploy/update.sh
# Rollback: git -C ~/researcher_tool checkout <previous-commit> && bash deploy/update.sh --no-pull
#
# The live site keeps running while this builds: the new build goes into frontend/.next-build and only replaces
# frontend/.next (a folder rename) after it succeeds, followed by a restart of a few seconds. A failed build changes nothing.
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BRANCH="${BRANCH:-main}"
FRONTEND="$APP_DIR/frontend"

pull() {
  echo "==> Pulling $BRANCH"
  # next-env.d.ts and tsconfig.json are rewritten by builds; the service file may carry an old hand edit. Dropping local changes to
  # these files only (never anything else) keeps "git pull" from stopping on them.
  git checkout -- deploy/sciprospect-backend.service frontend/next-env.d.ts frontend/tsconfig.json 2>/dev/null || true
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
}

lock_hash() { sha256sum "$FRONTEND/package-lock.json" | cut -d' ' -f1; }

# Packages: reinstalled only when package-lock.json changed since the last deploy.
# shortcut: a reinstall replaces node_modules under the running site, so that (rare) deploy can show errors for a minute; give the
# build its own node_modules copy if package changes become frequent.
install_packages() {
  local want have=""
  want="$(lock_hash)"
  [ -f "$FRONTEND/.deployed-lock-hash" ] && have="$(cat "$FRONTEND/.deployed-lock-hash")"
  if [ -d "$FRONTEND/node_modules" ] && [ "$want" = "$have" ]; then
    echo "==> Frontend packages unchanged, keeping node_modules"
  else
    echo "==> Frontend packages changed, installing"
    (cd "$FRONTEND" && npm ci --no-audit --no-fund)
  fi
}

# Build next to the live one; the live .next is not touched until the build has succeeded.
build() {
  echo "==> Frontend build (the live site keeps running)"
  rm -rf "$FRONTEND/.next-build"
  (cd "$FRONTEND" && NEXT_DIST_DIR=.next-build npm run build)
  [ -f "$FRONTEND/.next-build/BUILD_ID" ] || { echo "Build output is incomplete (no BUILD_ID); the live site was not changed."; exit 1; }
}

# Two renames on the same disk: the new build becomes .next, the previous one is kept as .next-old until the site answers.
swap() {
  rm -rf "$FRONTEND/.next-old"
  [ -d "$FRONTEND/.next" ] && mv "$FRONTEND/.next" "$FRONTEND/.next-old"
  mv "$FRONTEND/.next-build" "$FRONTEND/.next"
  lock_hash > "$FRONTEND/.deployed-lock-hash"
}

wait_for() {  # url name unit
  for _ in $(seq 1 30); do curl -fsS -o /dev/null "$1" && { echo "$2 OK"; return 0; }; sleep 2; done
  echo "$2 FAILED: sudo journalctl -u $3 -n 80"; return 1
}

main() {
  cd "$APP_DIR"
  if [ "${1:-}" != "--no-pull" ]; then pull; fi
  echo "==> Now at $(git log --oneline -1)"

  [ -f backend/.env ] || { echo "Missing backend/.env (database, SMTP, SCIPROSPECT_APP_URL). Copy it from your PC, never from git."; exit 1; }

  echo "==> Python packages"
  [ -d .venv ] || python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt

  install_packages
  build

  echo "==> Switching to the new build and restarting (database migrations run when the backend starts)"
  swap
  sudo systemctl restart sciprospect-backend
  sudo systemctl restart sciprospect-frontend

  echo "==> Checking"
  wait_for http://127.0.0.1:8000/api/public/plans "backend " sciprospect-backend
  if ! wait_for http://127.0.0.1:3000/ "frontend" sciprospect-frontend; then
    if [ -d "$FRONTEND/.next-old" ]; then
      echo "==> Putting the previous build back"
      rm -rf "$FRONTEND/.next" && mv "$FRONTEND/.next-old" "$FRONTEND/.next"
      sudo systemctl restart sciprospect-frontend
    fi
    exit 1
  fi
  rm -rf "$FRONTEND/.next-old"
  echo "==> Deployed $(git log --oneline -1)"
}

# Run when executed; when sourced (tests), only define the functions.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
