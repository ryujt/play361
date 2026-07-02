#!/usr/bin/env bash
# Launch all three local components: katago-server (Go), backend (Node), frontend (Vite).
# Everything runs on this machine — no AWS.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

pids=()
cleanup() {
  echo ""
  echo "shutting down..."
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

echo "[1/3] building & starting katago-server (:8789)"
( cd "$ROOT/katago-server" && go build -o katago-server . && ./katago-server ) &
pids+=($!)

echo "[2/3] starting backend (:8788)"
( cd "$ROOT/backend" && node server.js ) &
pids+=($!)

echo "[3/3] starting frontend (:5173)"
( cd "$ROOT/frontend" && npm run dev ) &
pids+=($!)

echo ""
echo "play361 running locally → open http://localhost:5173"
echo "press Ctrl+C to stop all components"
wait
