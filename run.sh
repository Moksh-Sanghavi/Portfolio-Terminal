#!/usr/bin/env bash
#
# Starts or stops the Portfolio Terminal backend (FastAPI) and frontend
# (Vite/React) dev servers.
#
# Usage:
#   ./run.sh start   Launch both services in the background
#   ./run.sh stop    Stop both services

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PORT=8010
FRONTEND_PORT=5180
BACKEND_PID_FILE="$ROOT_DIR/.backend.pid"
FRONTEND_PID_FILE="$ROOT_DIR/.frontend.pid"
BACKEND_LOG="$ROOT_DIR/backend.log"
FRONTEND_LOG="$ROOT_DIR/frontend.log"

resolve_python() {
    if [ -x "$BACKEND_DIR/venv/bin/python" ]; then
        echo "$BACKEND_DIR/venv/bin/python"
    elif [ -x "$BACKEND_DIR/venv/Scripts/python.exe" ]; then
        echo "$BACKEND_DIR/venv/Scripts/python.exe"
    else
        echo ""
    fi
}

start() {
    local python_bin
    python_bin="$(resolve_python)"
    if [ -z "$python_bin" ]; then
        echo "Error: backend virtual environment not found at $BACKEND_DIR/venv"
        echo "Set it up first with:"
        echo "  cd backend && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
        exit 1
    fi

    echo "Starting backend on port $BACKEND_PORT..."
    (
        cd "$BACKEND_DIR"
        nohup "$python_bin" -m uvicorn api:app --port "$BACKEND_PORT" > "$BACKEND_LOG" 2>&1 &
        echo $! > "$BACKEND_PID_FILE"
    )

    echo "Starting frontend on port $FRONTEND_PORT..."
    (
        cd "$FRONTEND_DIR"
        nohup npm run dev -- --port "$FRONTEND_PORT" > "$FRONTEND_LOG" 2>&1 &
        echo $! > "$FRONTEND_PID_FILE"
    )

    echo ""
    echo "Portfolio Terminal is running:"
    echo "  Backend:  http://localhost:$BACKEND_PORT"
    echo "  Frontend: http://localhost:$FRONTEND_PORT"
    echo ""
    echo "Logs: $BACKEND_LOG, $FRONTEND_LOG"
    echo "Stop with: ./run.sh stop"
}

stop_pid_file() {
    local pid_file="$1"
    local label="$2"
    if [ ! -f "$pid_file" ]; then
        echo "$label: not running (no pid file)."
        return
    fi
    local pid
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null
        echo "$label: stopped (PID $pid)."
    else
        echo "$label: process $pid not running."
    fi
    rm -f "$pid_file"
}

stop() {
    stop_pid_file "$BACKEND_PID_FILE" "Backend"
    stop_pid_file "$FRONTEND_PID_FILE" "Frontend"
}

case "${1:-}" in
    start) start ;;
    stop) stop ;;
    *)
        echo "Usage: $0 {start|stop}"
        exit 1
        ;;
esac
