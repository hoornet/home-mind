#!/bin/bash
# Home Mind Deployment Script
# Deploys ha-bridge and shodh using Docker Compose

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

# Check for Shodh binary
SHODH_BINARY="$PROJECT_DIR/docker/shodh/shodh-memory-server"
if [ ! -f "$SHODH_BINARY" ]; then
    echo "Shodh binary not found at: $SHODH_BINARY"
    echo ""
    
    # Check if it exists in home directory
    if [ -f "$HOME/shodh-memory-server" ]; then
        echo "Found Shodh binary at ~/shodh-memory-server"
        echo "Copying to docker/shodh/..."
        cp "$HOME/shodh-memory-server" "$SHODH_BINARY"
        chmod +x "$SHODH_BINARY"
    else
        echo "ERROR: Cannot find Shodh binary"
        echo "Please place shodh-memory-server in docker/shodh/"
        exit 1
    fi
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
