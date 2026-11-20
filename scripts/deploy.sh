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

# Holds HA_TOKEN and the generated keys: readable by its owner only. A line
# appended to a file without a final newline would join its last line.
chmod 600 "$PROJECT_DIR/.env"
if [ -n "$(tail -c1 "$PROJECT_DIR/.env")" ]; then
    echo >> "$PROJECT_DIR/.env"
fi

# The value Docker Compose will see for a variable in .env: the last line that
# sets it, without surrounding spaces or quotes, so KEY="" counts as unset.
env_value() {
    grep "^$1=" "$PROJECT_DIR/.env" 2>/dev/null | tail -n1 | cut -d'=' -f2- \
        | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
              -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/" \
        | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

# 32 random bytes as hex; stops the deploy rather than save an empty secret.
generate_secret() {
    local secret
    secret=$(openssl rand -hex 32) || true
    if [ ${#secret} -ne 64 ]; then
        echo "ERROR: could not generate a random key. Is openssl installed?" >&2
        exit 1
    fi
    echo "$secret"
}

# Set a variable in .env, replacing any line that already sets it.
set_env_value() {
    if grep -q "^$1=" "$PROJECT_DIR/.env"; then
        sed -i "s|^$1=.*|$1=$2|" "$PROJECT_DIR/.env"
    else
        echo "$1=$2" >> "$PROJECT_DIR/.env"
    fi
}

# Auto-generate SHODH_API_KEY if not set
SHODH_API_KEY=$(env_value SHODH_API_KEY)
if [ -z "$SHODH_API_KEY" ] || [ "$SHODH_API_KEY" = "your-shodh-api-key" ]; then
    SECRET=$(generate_secret)
    set_env_value SHODH_API_KEY "$SECRET"
    echo "Generated SHODH_API_KEY automatically"
fi

# Generate an API token for the server unless one is set. The server requires
# it from the first request that carries it, so an integration set up without
# a token keeps working until it is given this one.
if [ -z "$(env_value API_TOKEN)" ] && [ -z "$(env_value API_TOKEN_AUTO)" ]; then
    SECRET=$(generate_secret)
    set_env_value API_TOKEN_AUTO "$SECRET"
    echo "Generated an API token (API_TOKEN_AUTO in .env). The API requires it from the first"
    echo "request that uses it. A Home Mind integration added without it keeps working until then;"
    echo "to protect the API, remove the integration in Home Assistant and add it again with this token."
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
