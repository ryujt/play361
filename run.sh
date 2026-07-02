#!/usr/bin/env bash
# 원클릭 실행: 최초 1회 프론트엔드 의존성을 설치한 뒤 세 컴포넌트를 모두 띄운다.
# 실행 후 http://localhost:5173 (사용 중이면 5174) 접속해서 바로 대국.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "[setup] installing frontend dependencies..."
  ( cd "$ROOT/frontend" && npm install )
fi

exec bash "$ROOT/scripts/dev.sh"
