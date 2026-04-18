#!/bin/bash
# Home Mind Deployment Script
# Deploys home-mind-server and shodh using Docker Compose

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Home Mind Deployment"
echo "===================="

# Check for .env file
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo "ERROR: .env file not found"
    echo "Copy .env.example to .env and configure your settings:"
    echo "  cp .env.example .env"
    exit 1
fi

# Auto-generate SHODH_API_KEY if not set
SHODH_API_KEY=$(grep "^SHODH_API_KEY=" "$PROJECT_DIR/.env" 2>/dev/null | cut -d'=' -f2-)
if [ -z "$SHODH_API_KEY" ] || [ "$SHODH_API_KEY" = "your-shodh-api-key" ]; then
    GENERATED_KEY=$(openssl rand -hex 32)
    if grep -q "^SHODH_API_KEY=" "$PROJECT_DIR/.env"; then
        sed -i "s|^SHODH_API_KEY=.*|SHODH_API_KEY=$GENERATED_KEY|" "$PROJECT_DIR/.env"
    else
        echo "SHODH_API_KEY=$GENERATED_KEY" >> "$PROJECT_DIR/.env"
    fi
    echo "Generated SHODH_API_KEY automatically"
fi

# Optional: HomeMind App source (sibling directory). When present, the PWA
# frontend is built and started alongside the server via the `app` compose
# profile. When missing, deployment proceeds with Shodh + server only.
APP_DIR="$(dirname "$PROJECT_DIR")/home-mind-app"
if [ -d "$APP_DIR/.git" ]; then
    echo "Updating home-mind-app..."
    git -C "$APP_DIR" pull
    export COMPOSE_PROFILES="app"
elif [ -d "$APP_DIR" ]; then
    echo "Using existing home-mind-app directory"
    export COMPOSE_PROFILES="app"
else
    echo "home-mind-app not found at $APP_DIR (optional) — deploying server only"
fi

echo "Building and starting containers..."
cd "$PROJECT_DIR"

# Build and start
docker compose build
docker compose up -d

echo ""
echo "Waiting for services to be healthy..."
sleep 5

# Check health
echo ""
echo "Service Status:"
docker compose ps

echo ""
echo "Testing API..."
if curl -s http://localhost:3100/api/health | grep -q "ok"; then
    echo "✓ Home Mind API is healthy"
else
    echo "✗ API health check failed"
    echo "Check logs with: docker compose logs"
    exit 1
fi

echo ""
echo "Deployment complete!"
echo "API available at: http://localhost:3100"
