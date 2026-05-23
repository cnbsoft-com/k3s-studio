#!/bin/bash

# mpk3s Integrated Development Script 🦖

PROJECT_ROOT=$(pwd)
API_DIR="$PROJECT_ROOT/apps/mpk3s-api"
UI_DIR="$PROJECT_ROOT/apps/mpk3s-ui"
DB_COMPOSE="$PROJECT_ROOT/containers/docker-compose.yml"

function show_usage() {
    echo "Usage: ./dev.sh [command]"
    echo ""
    echo "Commands:"
    echo "  db       Start PostgreSQL container"
    echo "  api      Start Spring Boot API server"
    echo "  ui       Start Next.js UI server"
    echo "  all      Start everything (DB, API, UI)"
    echo "  stop     Stop all services (including DB)"
    echo "  status   Show status of services"
}

function start_db() {
    echo "🚀 Starting Database..."
    docker compose -f "$DB_COMPOSE" up -d
}

function start_api() {
    echo "🚀 Starting Backend API (Port 9090)..."
    cd "$API_DIR" && ./gradlew bootRun
}

function start_ui() {
    echo "🚀 Starting Frontend UI (Port 3000)..."
    cd "$UI_DIR" && pnpm dev
}

function stop_all() {
    echo "🛑 Stopping Database..."
    docker compose -f "$DB_COMPOSE" down
    echo "🛑 Stopping API & UI (if running in background)..."
    pkill -f "mpk3s-api"
    pkill -f "next-server"
}

case "$1" in
    db)
        start_db
        ;;
    api)
        start_api
        ;;
    ui)
        start_ui
        ;;
    all)
        start_db
        echo "Waiting for DB to be ready..."
        sleep 3
        # Start API and UI in separate tabs or background if needed.
        # Here we'll just show how to run them.
        echo "💡 To run API and UI, it is recommended to use separate terminal tabs:"
        echo "Tab 1: ./dev.sh api"
        echo "Tab 2: ./dev.sh ui"
        ;;
    stop)
        stop_all
        ;;
    status)
        docker compose -f "$DB_COMPOSE" ps
        ;;
    *)
        show_usage
        ;;
esac
