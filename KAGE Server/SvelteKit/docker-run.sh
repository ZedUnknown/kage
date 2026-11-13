#!/usr/bin/env bash
set -euo pipefail

# Run on Linux: bash ./docker-run.sh [action]
# Actions: start (default), update, status, logs, stop, check.
# Compose reads .env beside this script.
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if [[ ! -f .env ]]; then
  printf '%s\n' 'Missing .env. Copy .env.example to .env and set its values first.' >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  printf '%s\n' 'Docker is not available. Install or start Docker and try again.' >&2
  exit 1
fi

action=${1:-start}
case "$action" in
  check)
    # Validate Compose and required .env values without starting containers.
    docker compose config --quiet
    printf '%s\n' 'Docker Compose configuration is valid.'
    ;;
  start)
    # Build the image, run migrations, and start web and worker.
    docker compose config --quiet
    docker compose up --build -d
    docker compose ps -a
    ;;
  update)
    # Build the updated image and apply migrations before recreating services.
    docker compose build migrate
    docker compose run --rm migrate
    docker compose up -d
    docker compose ps -a
    ;;
  status)
    # Include the completed one-shot migration container.
    docker compose ps -a
    ;;
  logs)
    # Ctrl+C stops viewing logs; containers keep running.
    docker compose logs -f migrate web worker
    ;;
  stop)
    # Stop containers; PostgreSQL on the host is unaffected.
    docker compose down
    ;;
  *)
    printf 'Usage: %s [start|update|status|logs|stop|check]\n' "$0" >&2
    exit 2
    ;;
esac
